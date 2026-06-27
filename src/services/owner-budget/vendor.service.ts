/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy rows are untyped at the persistence boundary */
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
}

export async function createVendor(businessId: string, input: CreateVendorInput, actorId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  const vendor = await db.vendorRecord.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      name: input.name, bankAccountRef: input.bankAccountRef ?? null,
      bankVerified: false, relatedParty: input.relatedParty ?? false,
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
