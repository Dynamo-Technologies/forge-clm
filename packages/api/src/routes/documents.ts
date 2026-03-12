import type { FastifyInstance } from "fastify";
import { eq, desc, asc, count, and, sum, max, sql, type Column, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  contractFolders,
  ingestedDocuments,
  documentExtractedFields,
} from "../db/schema-documents.js";
import { contracts } from "../db/schema.js";
import { uuidParam } from "../schemas/common.schema.js";
import { paginationSchema, buildPaginatedResponse, parseSortParam, parseFilterParam } from "../lib/pagination.js";
import { requireRole } from "../middleware/auth.js";
import { notFound } from "../lib/errors.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PostgresJsDatabase<any>;

interface RouteOptions {
  db: AnyDb;
  s3Client: S3Client;
}

// ─── Query param schemas ──────────────────────────────────────────

const documentQuerySchema = paginationSchema.extend({
  library: z.string().optional(),
  category: z.string().optional(),
  contractId: z.string().uuid().optional(),
  status: z.string().optional(),
  fileType: z.string().optional(),
  search: z.string().optional(),
});

const folderQuerySchema = z.object({
  library: z.string().optional(),
  category: z.string().optional(),
});

const searchBodySchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export default async function documentRoutes(app: FastifyInstance, opts: RouteOptions) {
  const { db, s3Client } = opts;

  const S3_BUCKET = process.env["S3_BUCKET"] ?? "dynamo-contracts";

  const DOCUMENT_COLUMN_MAP: Record<string, Column> = {
    filename: ingestedDocuments.filename,
    fileType: ingestedDocuments.fileType,
    documentCategory: ingestedDocuments.documentCategory,
    extractionStatus: ingestedDocuments.extractionStatus,
    sizeBytes: ingestedDocuments.sizeBytes,
    ingestedAt: ingestedDocuments.ingestedAt,
    createdAt: ingestedDocuments.createdAt,
  };

  // ─── GET /documents ───────────────────────────────────────────────

  app.get("/documents", async (request) => {
    const params = documentQuerySchema.parse(request.query);
    const offset = (params.page - 1) * params.limit;

    const conditions: SQL[] = [];

    if (params.library) {
      conditions.push(sql`${ingestedDocuments.spLibrary} = ${params.library}`);
    }
    if (params.category) {
      conditions.push(sql`${ingestedDocuments.documentCategory} = ${params.category}`);
    }
    if (params.contractId) {
      conditions.push(eq(ingestedDocuments.contractId, params.contractId));
    }
    if (params.status) {
      conditions.push(sql`${ingestedDocuments.extractionStatus} = ${params.status}`);
    }
    if (params.fileType) {
      conditions.push(sql`${ingestedDocuments.fileType} = ${params.fileType}`);
    }
    if (params.search) {
      conditions.push(sql`${ingestedDocuments.filename} ILIKE ${"%" + params.search + "%"}`);
    }

    const sortOrder = parseSortParam(params.sort, DOCUMENT_COLUMN_MAP, desc(ingestedDocuments.createdAt));
    const filters = parseFilterParam(params.filter, DOCUMENT_COLUMN_MAP);
    const allConditions = [...conditions, ...filters];
    const where = allConditions.length > 0 ? and(...allConditions) : undefined;

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(ingestedDocuments)
        .where(where)
        .orderBy(sortOrder)
        .limit(params.limit)
        .offset(offset),
      db.select({ total: count() }).from(ingestedDocuments).where(where),
    ]);

    return buildPaginatedResponse(data, countResult[0]!.total, params);
  });

  // ─── GET /documents/:id ───────────────────────────────────────────

  app.get("/documents/:id", async (request) => {
    const { id } = uuidParam.parse(request.params);

    const [document] = await db
      .select()
      .from(ingestedDocuments)
      .where(eq(ingestedDocuments.id, id));

    if (!document) throw notFound("Document", id);

    const extractedFields = await db
      .select()
      .from(documentExtractedFields)
      .where(eq(documentExtractedFields.documentId, id));

    return { ...document, extractedFields };
  });

  // ─── GET /documents/:id/text ──────────────────────────────────────

  app.get("/documents/:id/text", async (request) => {
    const { id } = uuidParam.parse(request.params);

    const [document] = await db
      .select({
        id: ingestedDocuments.id,
        filename: ingestedDocuments.filename,
        extractedText: ingestedDocuments.extractedText,
      })
      .from(ingestedDocuments)
      .where(eq(ingestedDocuments.id, id));

    if (!document) throw notFound("Document", id);

    return document;
  });

  // ─── GET /documents/:id/download ─────────────────────────────────

  app.get("/documents/:id/download", async (request) => {
    const { id } = uuidParam.parse(request.params);

    const [document] = await db
      .select({
        id: ingestedDocuments.id,
        filename: ingestedDocuments.filename,
        s3SourceKey: ingestedDocuments.s3SourceKey,
      })
      .from(ingestedDocuments)
      .where(eq(ingestedDocuments.id, id));

    if (!document) throw notFound("Document", id);

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: document.s3SourceKey,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return { url, filename: document.filename, expiresIn: 3600 };
  });

  // ─── GET /folders ─────────────────────────────────────────────────

  app.get("/folders", async (request) => {
    const params = folderQuerySchema.parse(request.query);

    const conditions: SQL[] = [];

    if (params.library) {
      conditions.push(sql`${contractFolders.libraryName} = ${params.library}`);
    }
    if (params.category) {
      conditions.push(sql`${contractFolders.folderCategory} = ${params.category}`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(contractFolders)
      .where(where)
      .orderBy(asc(contractFolders.libraryName), asc(contractFolders.folderName));

    return { data };
  });

  // ─── GET /folders/:id/documents ───────────────────────────────────

  app.get("/folders/:id/documents", async (request) => {
    const { id } = uuidParam.parse(request.params);
    const params = paginationSchema.parse(request.query);
    const offset = (params.page - 1) * params.limit;

    const where = eq(ingestedDocuments.folderId, id);

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(ingestedDocuments)
        .where(where)
        .orderBy(desc(ingestedDocuments.createdAt))
        .limit(params.limit)
        .offset(offset),
      db.select({ total: count() }).from(ingestedDocuments).where(where),
    ]);

    return buildPaginatedResponse(data, countResult[0]!.total, params);
  });

  // ─── GET /contracts/:id/documents ─────────────────────────────────

  app.get("/contracts/:id/documents", async (request) => {
    const { id } = uuidParam.parse(request.params);
    const params = paginationSchema.parse(request.query);
    const offset = (params.page - 1) * params.limit;

    const where = eq(ingestedDocuments.contractId, id);

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(ingestedDocuments)
        .where(where)
        .orderBy(asc(ingestedDocuments.documentCategory), asc(ingestedDocuments.filename))
        .limit(params.limit)
        .offset(offset),
      db.select({ total: count() }).from(ingestedDocuments).where(where),
    ]);

    return buildPaginatedResponse(data, countResult[0]!.total, params);
  });

  // ─── POST /documents/search ───────────────────────────────────────

  app.post("/documents/search", async (request) => {
    const { query, limit } = searchBodySchema.parse(request.body);

    const results = await db
      .select({
        id: ingestedDocuments.id,
        filename: ingestedDocuments.filename,
        fileType: ingestedDocuments.fileType,
        documentCategory: ingestedDocuments.documentCategory,
        contractId: ingestedDocuments.contractId,
        folderId: ingestedDocuments.folderId,
        extractionStatus: ingestedDocuments.extractionStatus,
        sizeBytes: ingestedDocuments.sizeBytes,
        pageCount: ingestedDocuments.pageCount,
        ingestedAt: ingestedDocuments.ingestedAt,
        rank: sql<number>`ts_rank(to_tsvector('english', ${ingestedDocuments.extractedText}), plainto_tsquery('english', ${query}))`.as("rank"),
      })
      .from(ingestedDocuments)
      .where(
        sql`to_tsvector('english', ${ingestedDocuments.extractedText}) @@ plainto_tsquery('english', ${query})`,
      )
      .orderBy(sql`rank DESC`)
      .limit(limit);

    return { data: results };
  });

  // ─── GET /dashboard/ingestion-stats ───────────────────────────────

  app.get("/dashboard/ingestion-stats", async () => {
    const [
      [totalResult],
      byLibrary,
      byStatus,
      byCategory,
      byFileType,
      [sizeResult],
      [lastSyncResult],
    ] = await Promise.all([
      db.select({ total: count() }).from(ingestedDocuments),
      db
        .select({
          library: ingestedDocuments.spLibrary,
          count: count(),
        })
        .from(ingestedDocuments)
        .groupBy(ingestedDocuments.spLibrary),
      db
        .select({
          status: ingestedDocuments.extractionStatus,
          count: count(),
        })
        .from(ingestedDocuments)
        .groupBy(ingestedDocuments.extractionStatus),
      db
        .select({
          category: ingestedDocuments.documentCategory,
          count: count(),
        })
        .from(ingestedDocuments)
        .groupBy(ingestedDocuments.documentCategory),
      db
        .select({
          fileType: ingestedDocuments.fileType,
          count: count(),
        })
        .from(ingestedDocuments)
        .groupBy(ingestedDocuments.fileType),
      db
        .select({
          totalSizeBytes: sum(ingestedDocuments.sizeBytes),
        })
        .from(ingestedDocuments),
      db
        .select({
          lastSyncAt: max(ingestedDocuments.ingestedAt),
        })
        .from(ingestedDocuments),
    ]);

    // Convert grouped results to Record<string, number>
    const libraryMap: Record<string, number> = {};
    for (const row of byLibrary) {
      if (row.library) libraryMap[row.library] = row.count;
    }

    const statusMap: Record<string, number> = {};
    for (const row of byStatus) {
      statusMap[row.status] = row.count;
    }

    const categoryMap: Record<string, number> = {};
    for (const row of byCategory) {
      categoryMap[row.category] = row.count;
    }

    const fileTypeMap: Record<string, number> = {};
    for (const row of byFileType) {
      if (row.fileType) fileTypeMap[row.fileType] = row.count;
    }

    return {
      totalDocuments: totalResult!.total,
      byLibrary: libraryMap,
      byStatus: statusMap,
      byCategory: categoryMap,
      byFileType: fileTypeMap,
      totalSizeBytes: Number(sizeResult!.totalSizeBytes ?? 0),
      lastSyncAt: lastSyncResult!.lastSyncAt?.toISOString() ?? null,
    };
  });
}
