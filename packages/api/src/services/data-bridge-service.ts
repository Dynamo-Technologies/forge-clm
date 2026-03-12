/**
 * Data Bridge Service — bridges document data from AWS (DynamoDB + S3)
 * into the Forge PostgreSQL database.
 *
 * Reads the DynamoDB document registry, downloads JSON "digital twins"
 * from S3, parses SharePoint folder hierarchies, classifies document
 * and folder categories, and upserts records into PostgreSQL.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import type { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ScanCommand } from "@aws-sdk/client-dynamodb";
import type { Logger } from "pino";

import {
  contractFolders,
  ingestedDocuments,
} from "../db/schema-documents.js";

// ─── Interfaces ─────────────────────────────────────────────────────

export interface RegistryItem {
  s3_source_key: string;
  sp_item_id: string;
  sp_path: string;
  sp_library: string;
  sp_last_modified: string;
  file_type: string;
  size_bytes: number;
  extraction_status: string;
  s3_twin_key: string;
  ingested_at: string;
  updated_at: string;
}

export interface JsonTwin {
  schema_version: string;
  document_id: string;
  source_s3_key: string;
  filename: string;
  file_type: string;
  content_type: string;
  metadata: {
    sp_library: string;
    sp_path: string;
    sp_item_id: string;
    sp_last_modified: string;
    size_bytes: number;
  };
  extracted_text: string;
  pages: Array<{ page_number: number; text: string }>;
  tables: Array<{ table_index: number; rows: string[][] }>;
  extraction_metadata: {
    method: string;
    timestamp: string;
    page_count: number;
  };
}

export interface ParsedSharePointPath {
  libraryName: string;
  contractFolderName: string;
  subfolderName: string | null;
  fullFolderPath: string;
}

type FolderCategory =
  | "ACTIVE"
  | "ARCHIVED"
  | "VEHICLE"
  | "NDA"
  | "TEAMING"
  | "CPAR"
  | "GENERAL";

type DocumentCategory =
  | "PROPOSAL"
  | "AWARD"
  | "MODIFICATION"
  | "FUNDING"
  | "PURCHASE_ORDER"
  | "SUBCONTRACT"
  | "COMMUNICATION"
  | "CPAR"
  | "DELIVERABLE"
  | "NDA"
  | "TEAMING_AGREEMENT"
  | "PWS"
  | "DD254"
  | "CDRL"
  | "OTHER";

type ExtractionStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface DataBridgeConfig {
  db: PostgresJsDatabase<any>;
  s3Client: S3Client;
  dynamoClient: DynamoDBClient;
  logger: Logger;
}

interface SyncStats {
  scanned: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const S3_BUCKET = process.env["S3_BUCKET"] ?? "dynamo-contracts";
const CONTRACTS_REGISTRY_TABLE =
  process.env["CONTRACTS_REGISTRY_TABLE"] ?? "contracts-document-registry";
/** Maximum items to process per DynamoDB scan page. */
const DYNAMO_SCAN_LIMIT = 100;

// ─── Folder category mapping (library name -> enum) ─────────────────

const LIBRARY_CATEGORY_MAP: ReadonlyArray<{
  pattern: RegExp;
  category: FolderCategory;
}> = [
  { pattern: /CM04-Active Contracts/i, category: "ACTIVE" },
  { pattern: /CM03-GWACs\/BPAs\/IDIQs/i, category: "VEHICLE" },
  { pattern: /CM07-NDAs/i, category: "NDA" },
  { pattern: /CM08-Teaming Agreements/i, category: "TEAMING" },
  { pattern: /CM14-CPARS Evaluations/i, category: "CPAR" },
  { pattern: /Archive/i, category: "ARCHIVED" },
];

// ─── Document category mapping (subfolder name -> enum) ─────────────

const SUBFOLDER_CATEGORY_MAP: ReadonlyArray<{
  pattern: RegExp;
  category: DocumentCategory;
}> = [
  { pattern: /^01\.\s*PROPOSAL/i, category: "PROPOSAL" },
  { pattern: /PROPOSAL/i, category: "PROPOSAL" },
  { pattern: /^02\.\s*CONTRACT SETUP/i, category: "AWARD" },
  { pattern: /^03\.\s*AWARDS\s*&\s*MODS/i, category: "MODIFICATION" },
  { pattern: /^04\.\s*FUNDING/i, category: "FUNDING" },
  { pattern: /^05\.\s*PO TO DYNAMO/i, category: "PURCHASE_ORDER" },
  { pattern: /^06\.\s*SUBS\s*&\s*CONSULTANTS/i, category: "SUBCONTRACT" },
  { pattern: /^07\.\s*COMMUNICATIONS/i, category: "COMMUNICATION" },
  { pattern: /^08\.\s*CPARs/i, category: "CPAR" },
  { pattern: /PWS/i, category: "PWS" },
  { pattern: /DD254/i, category: "DD254" },
  { pattern: /CDRL/i, category: "CDRL" },
  { pattern: /NDA/i, category: "NDA" },
  { pattern: /TEAMING/i, category: "TEAMING_AGREEMENT" },
  { pattern: /DELIVERABLE/i, category: "DELIVERABLE" },
];

// ─── Service ────────────────────────────────────────────────────────

export class DataBridgeService {
  private readonly db: PostgresJsDatabase<any>;
  private readonly s3: S3Client;
  private readonly dynamo: DynamoDBClient;
  private readonly log: Logger;

  constructor(config: DataBridgeConfig) {
    this.db = config.db;
    this.s3 = config.s3Client;
    this.dynamo = config.dynamoClient;
    this.log = config.logger.child({ service: "DataBridgeService" });
  }

  // ─── Public API ───────────────────────────────────────────────────

  /**
   * Full sync: scans every item in the DynamoDB document registry
   * and upserts each into PostgreSQL. Errors are logged per-document
   * and do not halt the overall sync.
   */
  async syncAll(): Promise<SyncStats> {
    const stats: SyncStats = {
      scanned: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };

    this.log.info("Starting full sync from DynamoDB registry");

    let exclusiveStartKey: Record<string, any> | undefined;

    do {
      const command = new ScanCommand({
        TableName: CONTRACTS_REGISTRY_TABLE,
        Limit: DYNAMO_SCAN_LIMIT,
        ExclusiveStartKey: exclusiveStartKey,
      });

      const response = await this.dynamo.send(command);

      const items = response.Items ?? [];
      stats.scanned += items.length;

      for (const rawItem of items) {
        const registryItem = this.unmarshalRegistryItem(rawItem);
        if (!registryItem) {
          this.log.warn(
            { rawItem },
            "Skipping malformed registry item — missing required fields",
          );
          stats.skipped++;
          continue;
        }

        stats.processed++;
        try {
          await this.syncDocument(registryItem);
          stats.succeeded++;
        } catch (err) {
          stats.failed++;
          this.log.error(
            { err, s3SourceKey: registryItem.s3_source_key },
            "Failed to sync document",
          );
        }
      }

      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);

    this.log.info(
      stats,
      `Sync complete — scanned ${stats.scanned}, succeeded ${stats.succeeded}, failed ${stats.failed}`,
    );

    return stats;
  }

  /**
   * Sync a single document from the registry into PostgreSQL.
   *
   * 1. Parse the SharePoint path to determine folder hierarchy
   * 2. Classify the folder and document categories
   * 3. Upsert the contract_folders record
   * 4. Download and parse the JSON twin from S3 (if available)
   * 5. Upsert the ingested_documents record
   */
  async syncDocument(registryItem: RegistryItem): Promise<void> {
    const { s3_source_key, sp_path, sp_library } = registryItem;

    this.log.debug({ s3_source_key }, "Syncing document");

    // 1. Parse the SharePoint path
    const parsed = this.parseSharePointPath(sp_path);

    // 2. Classify
    const folderCategory = this.classifyFolderCategory(sp_library || parsed.libraryName);
    const documentCategory = this.classifyDocumentCategory(
      parsed.subfolderName ?? "",
      this.extractFilename(s3_source_key),
    );

    // 3. Upsert the folder
    const folderId = await this.getOrCreateFolder(
      sp_library || parsed.libraryName,
      parsed.fullFolderPath,
      parsed.contractFolderName,
      folderCategory,
    );

    // 4. Download JSON twin (if extraction completed and twin key exists)
    let jsonTwin: JsonTwin | null = null;
    if (
      registryItem.s3_twin_key &&
      registryItem.extraction_status === "COMPLETED"
    ) {
      try {
        jsonTwin = await this.downloadJsonTwin(registryItem.s3_twin_key);
      } catch (err) {
        this.log.warn(
          { err, s3TwinKey: registryItem.s3_twin_key },
          "Failed to download JSON twin — proceeding without extracted data",
        );
      }
    }

    // 5. Upsert the document
    const extractionStatus = this.mapExtractionStatus(registryItem.extraction_status);
    const filename = jsonTwin?.filename ?? this.extractFilename(s3_source_key);

    const documentValues = {
      folderId,
      s3SourceKey: registryItem.s3_source_key,
      s3TwinKey: registryItem.s3_twin_key || null,
      spItemId: registryItem.sp_item_id || null,
      spPath: registryItem.sp_path || null,
      spLibrary: registryItem.sp_library || null,
      filename,
      fileType: registryItem.file_type || jsonTwin?.file_type || null,
      documentCategory,
      sizeBytes: registryItem.size_bytes ?? jsonTwin?.metadata?.size_bytes ?? null,
      pageCount: jsonTwin?.extraction_metadata?.page_count ?? null,
      extractionStatus,
      extractionMethod: jsonTwin?.extraction_metadata?.method ?? null,
      extractedText: jsonTwin?.extracted_text ?? null,
      extractedAt: jsonTwin?.extraction_metadata?.timestamp
        ? new Date(jsonTwin.extraction_metadata.timestamp)
        : null,
      spLastModified: registryItem.sp_last_modified
        ? new Date(registryItem.sp_last_modified)
        : null,
      ingestedAt: registryItem.ingested_at
        ? new Date(registryItem.ingested_at)
        : new Date(),
      updatedAt: new Date(),
    };

    const [upsertedDoc] = await this.db
      .insert(ingestedDocuments)
      .values(documentValues)
      .onConflictDoUpdate({
        target: ingestedDocuments.s3SourceKey,
        set: {
          folderId: documentValues.folderId,
          s3TwinKey: documentValues.s3TwinKey,
          spItemId: documentValues.spItemId,
          spPath: documentValues.spPath,
          spLibrary: documentValues.spLibrary,
          filename: documentValues.filename,
          fileType: documentValues.fileType,
          documentCategory: documentValues.documentCategory,
          sizeBytes: documentValues.sizeBytes,
          pageCount: documentValues.pageCount,
          extractionStatus: documentValues.extractionStatus,
          extractionMethod: documentValues.extractionMethod,
          extractedText: documentValues.extractedText,
          extractedAt: documentValues.extractedAt,
          spLastModified: documentValues.spLastModified,
          ingestedAt: documentValues.ingestedAt,
          updatedAt: documentValues.updatedAt,
        },
      })
      .returning({ id: ingestedDocuments.id });

    // Update folder stats
    await this.updateFolderStats(folderId);

    this.log.debug(
      { s3_source_key, documentId: upsertedDoc?.id },
      "Document synced successfully",
    );
  }

  // ─── Path Parsing ─────────────────────────────────────────────────

  /**
   * Parse a SharePoint path into its component parts.
   *
   * SharePoint paths follow the pattern:
   *   /sites/<site>/<library>/<contractFolder>/<subfolder>/...
   *   or just: <library>/<contractFolder>/<subfolder>/...
   *
   * The method extracts the library name, the top-level contract folder,
   * and the immediate subfolder (used for document classification).
   */
  parseSharePointPath(spPath: string): ParsedSharePointPath {
    // Normalize: strip leading/trailing slashes, collapse multiples
    const cleaned = spPath.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
    const segments = cleaned.split("/").filter(Boolean);

    // If the path starts with "sites/<name>", skip those segments
    let offset = 0;
    if (
      segments.length >= 2 &&
      segments[0]!.toLowerCase() === "sites"
    ) {
      offset = 2; // skip "sites" and the site name
    }

    const remaining = segments.slice(offset);

    const libraryName = remaining[0] ?? "";
    const contractFolderName = remaining[1] ?? "";
    const subfolderName = remaining[2] ?? null;

    // The full folder path includes library through the deepest non-file segment
    // We include everything except the filename (last segment if it has an extension)
    const lastSegment = remaining[remaining.length - 1] ?? "";
    const hasExtension = /\.\w{1,5}$/.test(lastSegment);
    const folderSegments = hasExtension
      ? remaining.slice(0, -1)
      : remaining;

    const fullFolderPath = folderSegments.join("/");

    return {
      libraryName,
      contractFolderName,
      subfolderName,
      fullFolderPath,
    };
  }

  // ─── Classification ───────────────────────────────────────────────

  /**
   * Classify a folder based on its SharePoint library name.
   */
  classifyFolderCategory(libraryName: string): FolderCategory {
    for (const { pattern, category } of LIBRARY_CATEGORY_MAP) {
      if (pattern.test(libraryName)) {
        return category;
      }
    }
    return "GENERAL";
  }

  /**
   * Classify a document based on its subfolder name and filename.
   *
   * The subfolder name is checked first. For the "03. AWARDS & MODS"
   * subfolder, the filename is inspected to distinguish AWARD from
   * MODIFICATION.
   */
  classifyDocumentCategory(
    subfolderName: string,
    filename: string,
  ): DocumentCategory {
    if (!subfolderName && !filename) {
      return "OTHER";
    }

    // Special case: "03. AWARDS & MODS" — look at filename to distinguish
    if (/^03\.\s*AWARDS\s*&\s*MODS/i.test(subfolderName)) {
      const fnUpper = filename.toUpperCase();
      if (fnUpper.includes("AWARD") && !fnUpper.includes("MOD")) {
        return "AWARD";
      }
      return "MODIFICATION";
    }

    // Walk through the ordered subfolder category map
    for (const { pattern, category } of SUBFOLDER_CATEGORY_MAP) {
      if (pattern.test(subfolderName)) {
        return category;
      }
    }

    // Fall back to filename-based classification
    const fnUpper = filename.toUpperCase();
    if (fnUpper.includes("PROPOSAL")) return "PROPOSAL";
    if (fnUpper.includes("AWARD")) return "AWARD";
    if (fnUpper.includes("MOD")) return "MODIFICATION";
    if (fnUpper.includes("FUND")) return "FUNDING";
    if (fnUpper.includes("PWS")) return "PWS";
    if (fnUpper.includes("DD254")) return "DD254";
    if (fnUpper.includes("CDRL")) return "CDRL";
    if (fnUpper.includes("NDA")) return "NDA";
    if (fnUpper.includes("TEAMING")) return "TEAMING_AGREEMENT";
    if (fnUpper.includes("DELIVERABLE")) return "DELIVERABLE";
    if (fnUpper.includes("CPAR")) return "CPAR";
    if (fnUpper.includes("PO")) return "PURCHASE_ORDER";
    if (fnUpper.includes("SUBCONTRACT") || fnUpper.includes("SUB_")) return "SUBCONTRACT";

    return "OTHER";
  }

  // ─── Folder Upsert ────────────────────────────────────────────────

  /**
   * Upsert a contract_folders record. Conflicts on the unique index
   * (library_name, folder_path) trigger an update.
   *
   * Returns the folder UUID.
   */
  async getOrCreateFolder(
    libraryName: string,
    folderPath: string,
    folderName: string,
    category: FolderCategory,
  ): Promise<string> {
    const [row] = await this.db
      .insert(contractFolders)
      .values({
        libraryName,
        folderPath,
        folderName,
        folderCategory: category,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [contractFolders.libraryName, contractFolders.folderPath],
        set: {
          folderName,
          folderCategory: category,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning({ id: contractFolders.id });

    return row!.id;
  }

  // ─── S3 Twin Download ─────────────────────────────────────────────

  /**
   * Download and parse a JSON "digital twin" from S3.
   */
  async downloadJsonTwin(s3TwinKey: string): Promise<JsonTwin> {
    this.log.debug({ s3TwinKey }, "Downloading JSON twin from S3");

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3TwinKey,
    });

    const response = await this.s3.send(command);

    if (!response.Body) {
      throw new Error(`Empty response body for S3 key: ${s3TwinKey}`);
    }

    const bodyString = await response.Body.transformToString("utf-8");
    const parsed: JsonTwin = JSON.parse(bodyString);

    return parsed;
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  /**
   * Unmarshall a raw DynamoDB item (AttributeValue map) into a
   * typed RegistryItem. Returns null if required fields are missing.
   */
  private unmarshalRegistryItem(
    raw: Record<string, any>,
  ): RegistryItem | null {
    const s3SourceKey = raw["s3_source_key"]?.S;
    if (!s3SourceKey) return null;

    return {
      s3_source_key: s3SourceKey,
      sp_item_id: raw["sp_item_id"]?.S ?? "",
      sp_path: raw["sp_path"]?.S ?? "",
      sp_library: raw["sp_library"]?.S ?? "",
      sp_last_modified: raw["sp_last_modified"]?.S ?? "",
      file_type: raw["file_type"]?.S ?? "",
      size_bytes: raw["size_bytes"]?.N ? Number(raw["size_bytes"].N) : 0,
      extraction_status: raw["extraction_status"]?.S ?? "PENDING",
      s3_twin_key: raw["s3_twin_key"]?.S ?? "",
      ingested_at: raw["ingested_at"]?.S ?? "",
      updated_at: raw["updated_at"]?.S ?? "",
    };
  }

  /**
   * Extract the filename from an S3 key or path.
   */
  private extractFilename(key: string): string {
    const parts = key.split("/");
    return parts[parts.length - 1] ?? key;
  }

  /**
   * Map a registry extraction status string to the enum type.
   */
  private mapExtractionStatus(status: string): ExtractionStatus {
    const upper = status.toUpperCase();
    switch (upper) {
      case "COMPLETED":
        return "COMPLETED";
      case "PROCESSING":
        return "PROCESSING";
      case "FAILED":
        return "FAILED";
      default:
        return "PENDING";
    }
  }

  /**
   * Update the aggregate document_count and total_size_bytes
   * for a folder after upserting a document.
   */
  private async updateFolderStats(folderId: string): Promise<void> {
    await this.db
      .update(contractFolders)
      .set({
        documentCount: sql`(
          SELECT COUNT(*)::int
          FROM ${ingestedDocuments}
          WHERE ${ingestedDocuments.folderId} = ${folderId}
        )`,
        totalSizeBytes: sql`(
          SELECT COALESCE(SUM(${ingestedDocuments.sizeBytes}), 0)
          FROM ${ingestedDocuments}
          WHERE ${ingestedDocuments.folderId} = ${folderId}
        )`,
        updatedAt: new Date(),
      })
      .where(eq(contractFolders.id, folderId));
  }
}
