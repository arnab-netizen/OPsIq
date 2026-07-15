/**
 * Owner Budget vendor master + funded-initiative outcome persistence (Sections 20, 44).
 * Workspace-scoped. Vendor bank changes are held until independently verified; funded
 * initiatives are closed with a learning-safe outcome classification.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { classifyInitiativeOutcome, type InitiativeCloseInput } from "@/domain/owner-budget";
import { NotFoundError } from "@/infra/errors";

export interface CreateVendorInput {
  name: string;
  bankAccountRef?: string | null;
  relatedParty?: boolean;
  paymentTermsDays?: number | null;
  switchingCostEstimate?: number | null;
  replacementLeadTimeDays?: number | null;
}

export async function createVendor(businessId: string, input: CreateVendorInput, actorId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  const vendor = await db.vendorRecord.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      name: input.name, bankAccountRef: input.bankAccountRef ?? null,
      bankVerified: false, relatedParty: input.relatedParty ?? false,
      paymentTermsDays: input.paymentTermsDays ?? null,
      switchingCostEstimate: input.switchingCostEstimate ?? null,
      replacementLeadTimeDays: input.replacementLeadTimeDays ?? null,
      createdBy: actorId, updatedAt: new Date(),
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_VENDOR_CREATED,
    actorId, workspaceId, entityType: "VendorRecord", entityId: vendor.id,
    payload: { businessId, name: input.name },
  });
  return vendor;
}

/** Record a vendor bank-detail change (resets verification, sets a hold marker). */
export async function recordVendorBankChange(businessId: string, vendorId: string, newBankRef: string, actorId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  const vendor = await db.vendorRecord.findFirst({ where: { id: vendorId, workspaceId, businessId } });
  if (!vendor) throw new NotFoundError("VendorRecord", vendorId);
  return db.vendorRecord.update({
    where: { id: vendorId },
    data: { bankAccountRef: newBankRef, bankVerified: false, bankChangedAt: new Date(), updatedAt: new Date() },
  });
}

/** Independently verify a vendor's bank details — clears the payment hold. */
export async function verifyVendorBank(businessId: string, vendorId: string, actorId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  const vendor = await db.vendorRecord.findFirst({ where: { id: vendorId, workspaceId, businessId } });
  if (!vendor) throw new NotFoundError("VendorRecord", vendorId);
  const updated = await db.vendorRecord.update({
    where: { id: vendorId },
    data: { bankVerified: true, updatedAt: new Date() },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_VENDOR_BANK_VERIFIED,
    actorId, workspaceId, entityType: "VendorRecord", entityId: vendorId,
    payload: { businessId },
  });
  return updated;
}

export async function getVendors(workspaceId: string, businessId: string) {
  await getBusiness(businessId, workspaceId);
  return db.vendorRecord.findMany({ where: { workspaceId, businessId }, orderBy: { updatedAt: "desc" } });
}

// ---------------------------------------------------------------------------
// Funded-initiative outcome persistence (Section 44)
// ---------------------------------------------------------------------------

export async function closeFundedInitiative(
  businessId: string,
  initiativeLabel: string,
  outcome: InitiativeCloseInput & { note?: string },
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const result = classifyInitiativeOutcome(outcome);
  const row = await db.fundedInitiativeOutcome.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      initiativeLabel,
      outcome: result.outcome, nextStep: result.nextStep, safeForLearning: result.safeForLearning,
      expectedImpact: outcome.expectedImpact ?? null, actualImpact: outcome.actualImpact ?? null,
      note: outcome.note ?? null, createdBy: actorId, updatedAt: new Date(),
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_INITIATIVE_CLOSED,
    actorId, workspaceId, entityType: "FundedInitiativeOutcome", entityId: row.id,
    payload: { businessId, outcome: result.outcome, safeForLearning: result.safeForLearning },
  });
  return { record: row, classification: result };
}

export async function getInitiativeOutcomes(workspaceId: string, businessId: string) {
  await getBusiness(businessId, workspaceId);
  return db.fundedInitiativeOutcome.findMany({ where: { workspaceId, businessId }, orderBy: { createdAt: "desc" } });
}

// ---------------------------------------------------------------------------
// Approved-vendor controls
// ---------------------------------------------------------------------------

/** Approve a vendor for use (sets approvalStatus = APPROVED). */
export async function approveVendor(workspaceId: string, vendorId: string, actorId: string) {
  const vendor = await db.vendorRecord.findFirst({ where: { id: vendorId, workspaceId } });
  if (!vendor) throw new NotFoundError("VendorRecord", vendorId);
  const updated = await db.vendorRecord.update({
    where: { id: vendorId },
    data: { approvalStatus: "APPROVED", updatedAt: new Date() },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_VENDOR_APPROVED,
    actorId, workspaceId, entityType: "VendorRecord", entityId: vendorId,
    payload: { name: vendor.name },
  });
  return updated;
}

/** Suspend a vendor — blocks use until reviewed. */
export async function suspendVendor(workspaceId: string, vendorId: string, actorId: string, reason: string) {
  const vendor = await db.vendorRecord.findFirst({ where: { id: vendorId, workspaceId } });
  if (!vendor) throw new NotFoundError("VendorRecord", vendorId);
  const updated = await db.vendorRecord.update({
    where: { id: vendorId },
    data: { approvalStatus: "SUSPENDED", updatedAt: new Date() },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_VENDOR_SUSPENDED,
    actorId, workspaceId, entityType: "VendorRecord", entityId: vendorId,
    payload: { name: vendor.name, reason },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Contract and price history
// ---------------------------------------------------------------------------

export interface RecordVendorContractInput {
  vendorId: string;
  businessId: string;
  contractRef?: string | null;
  startDate: Date;
  endDate?: Date | null;
  pricePerUnit?: number | null;
  currency?: string;
  termsDaysNet?: number | null;
  scope?: string | null;
  notes?: string | null;
}

/** Record a new contract version for a vendor (append-only). */
export async function recordVendorContract(workspaceId: string, actorId: string, input: RecordVendorContractInput) {
  const vendor = await db.vendorRecord.findFirst({ where: { id: input.vendorId, workspaceId } });
  if (!vendor) throw new NotFoundError("VendorRecord", input.vendorId);
  const row = await db.vendorContract.create({
    data: {
      id: randomUUID(), workspaceId,
      vendorId: input.vendorId, businessId: input.businessId,
      contractRef: input.contractRef ?? null,
      startDate: input.startDate, endDate: input.endDate ?? null,
      pricePerUnit: input.pricePerUnit ?? null,
      currency: input.currency ?? "USD",
      termsDaysNet: input.termsDaysNet ?? null,
      scope: input.scope ?? null, notes: input.notes ?? null,
      createdBy: actorId,
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_VENDOR_CONTRACT_RECORDED,
    actorId, workspaceId, entityType: "VendorContract", entityId: row.id,
    payload: { vendorId: input.vendorId, contractRef: input.contractRef ?? null },
  });
  return row;
}

export async function listVendorContracts(workspaceId: string, vendorId: string) {
  const vendor = await db.vendorRecord.findFirst({ where: { id: vendorId, workspaceId } });
  if (!vendor) throw new NotFoundError("VendorRecord", vendorId);
  return db.vendorContract.findMany({
    where: { workspaceId, vendorId },
    orderBy: { startDate: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Delivery performance tracking
// ---------------------------------------------------------------------------

export interface RecordVendorDeliveryInput {
  vendorId: string;
  businessId: string;
  expectedDate: Date;
  actualDate?: Date | null;
  onTime?: boolean | null;
  qualityAccepted?: boolean | null;
  notes?: string | null;
}

/** Record a single delivery outcome for a vendor. */
export async function recordVendorDelivery(workspaceId: string, actorId: string, input: RecordVendorDeliveryInput) {
  const vendor = await db.vendorRecord.findFirst({ where: { id: input.vendorId, workspaceId } });
  if (!vendor) throw new NotFoundError("VendorRecord", input.vendorId);
  const row = await db.vendorDeliveryRecord.create({
    data: {
      id: randomUUID(), workspaceId,
      vendorId: input.vendorId, businessId: input.businessId,
      expectedDate: input.expectedDate,
      actualDate: input.actualDate ?? null,
      onTime: input.onTime ?? null,
      qualityAccepted: input.qualityAccepted ?? null,
      notes: input.notes ?? null,
      createdBy: actorId,
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_VENDOR_DELIVERY_RECORDED,
    actorId, workspaceId, entityType: "VendorDeliveryRecord", entityId: row.id,
    payload: { vendorId: input.vendorId, onTime: input.onTime ?? null },
  });
  return row;
}

export interface VendorPerformanceSummary {
  vendorId: string;
  totalDeliveries: number;
  onTimeCount: number;
  lateCount: number;
  onTimeRate: number | null;
  qualityAcceptedCount: number;
  qualityRejectedCount: number;
  qualityRate: number | null;
}

/** Compute on-time delivery rate and quality acceptance rate from persisted records. */
export async function getVendorPerformanceSummary(workspaceId: string, vendorId: string): Promise<VendorPerformanceSummary> {
  const vendor = await db.vendorRecord.findFirst({ where: { id: vendorId, workspaceId } });
  if (!vendor) throw new NotFoundError("VendorRecord", vendorId);
  type DeliveryRow = { onTime: boolean | null; qualityAccepted: boolean | null };
  const records = (await db.vendorDeliveryRecord.findMany({ where: { workspaceId, vendorId } })) as DeliveryRow[];
  const resolved = records.filter((r) => r.onTime !== null);
  const onTimeCount = resolved.filter((r) => r.onTime === true).length;
  const lateCount = resolved.filter((r) => r.onTime === false).length;
  const qualityResolved = records.filter((r) => r.qualityAccepted !== null);
  const qualityAcceptedCount = qualityResolved.filter((r) => r.qualityAccepted === true).length;
  const qualityRejectedCount = qualityResolved.filter((r) => r.qualityAccepted === false).length;
  return {
    vendorId,
    totalDeliveries: records.length,
    onTimeCount,
    lateCount,
    onTimeRate: resolved.length > 0 ? onTimeCount / resolved.length : null,
    qualityAcceptedCount,
    qualityRejectedCount,
    qualityRate: qualityResolved.length > 0 ? qualityAcceptedCount / qualityResolved.length : null,
  };
}
