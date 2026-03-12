import {
  pgEnum,
  uuid,
  varchar,
  text,
  date,
  numeric,
  integer,
  bigint,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { contractsSchema, contracts } from "./schema.js";

// ─── Enums ───────────────────────────────────────────────────────────

export const folderCategoryEnum = contractsSchema.enum("folder_category", [
  "ACTIVE",
  "ARCHIVED",
  "VEHICLE",
  "NDA",
  "TEAMING",
  "CPAR",
  "GENERAL",
]);

export const documentCategoryEnum = contractsSchema.enum("document_category", [
  "PROPOSAL",
  "AWARD",
  "MODIFICATION",
  "FUNDING",
  "PURCHASE_ORDER",
  "SUBCONTRACT",
  "COMMUNICATION",
  "CPAR",
  "DELIVERABLE",
  "NDA",
  "TEAMING_AGREEMENT",
  "PWS",
  "DD254",
  "CDRL",
  "OTHER",
]);

export const extractionStatusEnum = contractsSchema.enum("extraction_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export const primeOrSubEnum = contractsSchema.enum("prime_or_sub", [
  "PRIME",
  "SUBCONTRACT",
]);

export const setAsideTypeEnum = contractsSchema.enum("set_aside_type", [
  "FULL_OPEN",
  "SMALL_BUSINESS",
  "8A",
  "HUBZONE",
  "SDVOSB",
  "WOSB",
  "EDWOSB",
  "SOLE_SOURCE",
]);

export const vehicleTypeEnum = contractsSchema.enum("vehicle_type", [
  "GWAC",
  "BPA",
  "IDIQ",
  "MAC",
  "GSA_SCHEDULE",
]);

export const vehicleStatusEnum = contractsSchema.enum("vehicle_status", [
  "ACTIVE",
  "EXPIRED",
  "PENDING",
]);

export const poStatusEnum = contractsSchema.enum("po_status", [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);

export const personnelRoleEnum = contractsSchema.enum("personnel_role", [
  "PM",
  "COR",
  "CO",
  "COTR",
  "TPOC",
  "KP",
]);

// ─── 1. contract_folders ─────────────────────────────────────────────

export const contractFolders = contractsSchema.table(
  "contract_folders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    libraryName: varchar("library_name", { length: 255 }).notNull(),
    folderPath: varchar("folder_path", { length: 1000 }).notNull(),
    folderName: varchar("folder_name", { length: 500 }).notNull(),
    folderCategory: folderCategoryEnum("folder_category").notNull().default("GENERAL"),
    documentCount: integer("document_count").notNull().default(0),
    totalSizeBytes: bigint("total_size_bytes", { mode: "number" }).notNull().default(0),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_contract_folders_contract_id").on(table.contractId),
    index("idx_contract_folders_library_name").on(table.libraryName),
    uniqueIndex("idx_contract_folders_library_path").on(table.libraryName, table.folderPath),
  ],
);

// ─── 2. ingested_documents ───────────────────────────────────────────

export const ingestedDocuments = contractsSchema.table(
  "ingested_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    folderId: uuid("folder_id").references(() => contractFolders.id, { onDelete: "set null" }),
    contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    s3SourceKey: varchar("s3_source_key", { length: 1000 }).notNull().unique(),
    s3TwinKey: varchar("s3_twin_key", { length: 1000 }),
    spItemId: varchar("sp_item_id", { length: 255 }),
    spPath: varchar("sp_path", { length: 1000 }),
    spLibrary: varchar("sp_library", { length: 255 }),
    filename: varchar("filename", { length: 500 }).notNull(),
    fileType: varchar("file_type", { length: 20 }),
    documentCategory: documentCategoryEnum("document_category").notNull().default("OTHER"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    pageCount: integer("page_count"),
    extractionStatus: extractionStatusEnum("extraction_status").notNull().default("PENDING"),
    extractionMethod: varchar("extraction_method", { length: 50 }),
    extractedText: text("extracted_text"),
    extractedAt: timestamp("extracted_at"),
    spLastModified: timestamp("sp_last_modified"),
    ingestedAt: timestamp("ingested_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_docs_contract_id").on(table.contractId),
    index("idx_docs_folder_id").on(table.folderId),
    index("idx_docs_extraction_status").on(table.extractionStatus),
    index("idx_docs_document_category").on(table.documentCategory),
    index("idx_docs_sp_library").on(table.spLibrary),
    index("idx_docs_file_type").on(table.fileType),
  ],
);

// ─── 3. document_extracted_fields ────────────────────────────────────

export const documentExtractedFields = contractsSchema.table(
  "document_extracted_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => ingestedDocuments.id, { onDelete: "cascade" }),
    fieldName: varchar("field_name", { length: 100 }).notNull(),
    fieldValue: text("field_value"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    sourcePage: integer("source_page"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_extracted_fields_document_id").on(table.documentId),
    index("idx_extracted_fields_doc_field").on(table.documentId, table.fieldName),
  ],
);

// ─── 4. contract_vehicles ────────────────────────────────────────────

export const contractVehicles = contractsSchema.table(
  "contract_vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vehicleName: varchar("vehicle_name", { length: 255 }).notNull(),
    vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
    vehicleNumber: varchar("vehicle_number", { length: 100 }),
    orderingAgency: varchar("ordering_agency", { length: 500 }),
    ceilingValue: numeric("ceiling_value", { precision: 15, scale: 2 }),
    popStart: date("pop_start"),
    popEnd: date("pop_end"),
    status: vehicleStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_contract_vehicles_status").on(table.status),
    index("idx_contract_vehicles_vehicle_type").on(table.vehicleType),
  ],
);

// ─── 5. purchase_orders ──────────────────────────────────────────────

export const purchaseOrders = contractsSchema.table(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    poNumber: varchar("po_number", { length: 100 }).notNull().unique(),
    vendor: varchar("vendor", { length: 500 }),
    amount: numeric("amount", { precision: 15, scale: 2 }),
    issuedDate: date("issued_date"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    s3DocumentKey: varchar("s3_document_key", { length: 1000 }),
    status: poStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_purchase_orders_contract_id").on(table.contractId),
    index("idx_purchase_orders_status").on(table.status),
  ],
);

// ─── 6. key_personnel ────────────────────────────────────────────────

export const keyPersonnel = contractsSchema.table(
  "key_personnel",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    role: personnelRoleEnum("role").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    organization: varchar("organization", { length: 500 }),
    isGovernment: boolean("is_government").notNull().default(false),
    effectiveDate: date("effective_date"),
    endDate: date("end_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_key_personnel_contract_id").on(table.contractId),
    index("idx_key_personnel_role").on(table.role),
  ],
);
