import { relations } from "drizzle-orm";
import {
  contracts,
  contractOptions,
  modifications,
  clins,
  deliverables,
  subcontracts,
  parties,
  ndas,
  mous,
  mouParties,
  contractClauses,
  flowdownRequirements,
  complianceMilestones,
  governmentProperty,
  smallBusinessPlans,
  contractRequests,
  approvalQueue,
  communicationsLog,
} from "./schema.js";
import {
  contractFolders,
  ingestedDocuments,
  documentExtractedFields,
  contractVehicles,
  purchaseOrders,
  keyPersonnel,
} from "./schema-documents.js";

// ─── contracts ───────────────────────────────────────────────────────

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  options: many(contractOptions),
  modifications: many(modifications),
  clins: many(clins),
  deliverables: many(deliverables),
  subcontracts: many(subcontracts),
  clauses: many(contractClauses),
  complianceMilestones: many(complianceMilestones),
  governmentProperty: many(governmentProperty),
  smallBusinessPlans: many(smallBusinessPlans),
  approvalQueueItems: many(approvalQueue),
  communicationsLog: many(communicationsLog),
  contractFolders: many(contractFolders),
  ingestedDocuments: many(ingestedDocuments),
  purchaseOrders: many(purchaseOrders),
  keyPersonnel: many(keyPersonnel),
  vehicle: one(contractVehicles, {
    fields: [contracts.contractVehicleId],
    references: [contractVehicles.id],
  }),
}));

// ─── contract_options ────────────────────────────────────────────────

export const contractOptionsRelations = relations(contractOptions, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractOptions.contractId],
    references: [contracts.id],
  }),
}));

// ─── modifications ───────────────────────────────────────────────────

export const modificationsRelations = relations(modifications, ({ one, many }) => ({
  contract: one(contracts, {
    fields: [modifications.contractId],
    references: [contracts.id],
  }),
  approvalQueueItems: many(approvalQueue),
  communicationsLog: many(communicationsLog),
}));

// ─── clins ───────────────────────────────────────────────────────────

export const clinsRelations = relations(clins, ({ one, many }) => ({
  contract: one(contracts, {
    fields: [clins.contractId],
    references: [contracts.id],
  }),
  deliverables: many(deliverables),
}));

// ─── deliverables ────────────────────────────────────────────────────

export const deliverablesRelations = relations(deliverables, ({ one }) => ({
  contract: one(contracts, {
    fields: [deliverables.contractId],
    references: [contracts.id],
  }),
  clin: one(clins, {
    fields: [deliverables.clinId],
    references: [clins.id],
  }),
}));

// ─── subcontracts ────────────────────────────────────────────────────

export const subcontractsRelations = relations(subcontracts, ({ one, many }) => ({
  primeContract: one(contracts, {
    fields: [subcontracts.primeContractId],
    references: [contracts.id],
  }),
  flowdownRequirements: many(flowdownRequirements),
}));

// ─── parties ─────────────────────────────────────────────────────────

export const partiesRelations = relations(parties, ({ many }) => ({
  ndasAsPartyA: many(ndas, { relationName: "partyA" }),
  ndasAsPartyB: many(ndas, { relationName: "partyB" }),
  mouParties: many(mouParties),
}));

// ─── ndas ────────────────────────────────────────────────────────────

export const ndasRelations = relations(ndas, ({ one }) => ({
  partyA: one(parties, {
    fields: [ndas.partyAId],
    references: [parties.id],
    relationName: "partyA",
  }),
  partyB: one(parties, {
    fields: [ndas.partyBId],
    references: [parties.id],
    relationName: "partyB",
  }),
}));

// ─── mous ────────────────────────────────────────────────────────────

export const mousRelations = relations(mous, ({ many }) => ({
  mouParties: many(mouParties),
}));

// ─── mou_parties ─────────────────────────────────────────────────────

export const mouPartiesRelations = relations(mouParties, ({ one }) => ({
  mou: one(mous, {
    fields: [mouParties.mouId],
    references: [mous.id],
  }),
  party: one(parties, {
    fields: [mouParties.partyId],
    references: [parties.id],
  }),
}));

// ─── contract_clauses ────────────────────────────────────────────────

export const contractClausesRelations = relations(contractClauses, ({ one, many }) => ({
  contract: one(contracts, {
    fields: [contractClauses.contractId],
    references: [contracts.id],
  }),
  flowdownRequirements: many(flowdownRequirements),
}));

// ─── flowdown_requirements ───────────────────────────────────────────

export const flowdownRequirementsRelations = relations(flowdownRequirements, ({ one }) => ({
  primeClause: one(contractClauses, {
    fields: [flowdownRequirements.primeClauseId],
    references: [contractClauses.id],
  }),
  subContract: one(subcontracts, {
    fields: [flowdownRequirements.subContractId],
    references: [subcontracts.id],
  }),
}));

// ─── compliance_milestones ───────────────────────────────────────────

export const complianceMilestonesRelations = relations(complianceMilestones, ({ one }) => ({
  contract: one(contracts, {
    fields: [complianceMilestones.contractId],
    references: [contracts.id],
  }),
}));

// ─── government_property ─────────────────────────────────────────────

export const governmentPropertyRelations = relations(governmentProperty, ({ one }) => ({
  contract: one(contracts, {
    fields: [governmentProperty.contractId],
    references: [contracts.id],
  }),
}));

// ─── small_business_plans ────────────────────────────────────────────

export const smallBusinessPlansRelations = relations(smallBusinessPlans, ({ one }) => ({
  contract: one(contracts, {
    fields: [smallBusinessPlans.contractId],
    references: [contracts.id],
  }),
}));

// ─── contract_requests ───────────────────────────────────────────────

export const contractRequestsRelations = relations(contractRequests, ({ many }) => ({
  approvalQueueItems: many(approvalQueue),
}));

// ─── approval_queue ──────────────────────────────────────────────────

export const approvalQueueRelations = relations(approvalQueue, ({ one }) => ({
  request: one(contractRequests, {
    fields: [approvalQueue.requestId],
    references: [contractRequests.id],
  }),
  contract: one(contracts, {
    fields: [approvalQueue.contractId],
    references: [contracts.id],
  }),
  modification: one(modifications, {
    fields: [approvalQueue.modId],
    references: [modifications.id],
  }),
}));

// ─── communications_log ──────────────────────────────────────────────

export const communicationsLogRelations = relations(communicationsLog, ({ one }) => ({
  contract: one(contracts, {
    fields: [communicationsLog.contractId],
    references: [contracts.id],
  }),
  modification: one(modifications, {
    fields: [communicationsLog.modId],
    references: [modifications.id],
  }),
}));

// ─── contract_folders ───────────────────────────────────────────────

export const contractFoldersRelations = relations(contractFolders, ({ one, many }) => ({
  contract: one(contracts, {
    fields: [contractFolders.contractId],
    references: [contracts.id],
  }),
  documents: many(ingestedDocuments),
}));

// ─── ingested_documents ─────────────────────────────────────────────

export const ingestedDocumentsRelations = relations(ingestedDocuments, ({ one, many }) => ({
  folder: one(contractFolders, {
    fields: [ingestedDocuments.folderId],
    references: [contractFolders.id],
  }),
  contract: one(contracts, {
    fields: [ingestedDocuments.contractId],
    references: [contracts.id],
  }),
  extractedFields: many(documentExtractedFields),
}));

// ─── document_extracted_fields ──────────────────────────────────────

export const documentExtractedFieldsRelations = relations(documentExtractedFields, ({ one }) => ({
  document: one(ingestedDocuments, {
    fields: [documentExtractedFields.documentId],
    references: [ingestedDocuments.id],
  }),
}));

// ─── contract_vehicles ──────────────────────────────────────────────

export const contractVehiclesRelations = relations(contractVehicles, ({ many }) => ({
  contracts: many(contracts),
}));

// ─── purchase_orders ────────────────────────────────────────────────

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one }) => ({
  contract: one(contracts, {
    fields: [purchaseOrders.contractId],
    references: [contracts.id],
  }),
}));

// ─── key_personnel ──────────────────────────────────────────────────

export const keyPersonnelRelations = relations(keyPersonnel, ({ one }) => ({
  contract: one(contracts, {
    fields: [keyPersonnel.contractId],
    references: [contracts.id],
  }),
}));
