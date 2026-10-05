/**
 * Owner Cashflow (Module 5) — cashflow snapshot service.
 *
 * Persists a validated cashflow snapshot for a business (workspace-scoped,
 * unique reporting period). Computes data-confidence + missing-critical-data
 * deterministically at persist time (never invented). Reuses Module 1's
 * OwnerBusiness ownership guard.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError } from "@/infra/errors";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { calculateDataConfidence } from "@/domain/owner-cashflow/data-confidence";
import type { CashflowSnapshotInput } from "@/domain/owner-cashflow/types";
import type { CashflowSnapshotCreateInput } from "@/domain/owner-cashflow/validation";

/** Map the validated API input to the engine input shape. */
export function toCashflowInput(input: CashflowSnapshotCreateInput): CashflowSnapshotInput {
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
    businessModel: input.businessModel,
    industryTemplate: input.industryTemplate,
    cashInHand: input.cashInHand,
    bankBalance: input.bankBalance,
    dailyCollections: input.dailyCollections,
    receivables: input.receivables,
    receivablesOverdue: input.receivablesOverdue,
    payables: input.payables,
    payablesOverdue: input.payablesOverdue,
    upcomingEmi: input.upcomingEmi,
    rentDue: input.rentDue,
    salaryDue: input.salaryDue,
    vendorDue: input.vendorDue,
    taxDue: input.taxDue,
    ownerWithdrawal: input.ownerWithdrawal,
    notes: input.notes,
  };
}

export { rowToCashflowInput } from "@/domain/owner-cashflow/row-input";

export async function createCashflowSnapshot(
  businessId: string,
  input: CashflowSnapshotCreateInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // workspace ownership + existence

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const existing = await db.ownerCashflowSnapshot.findFirst({
    where: { businessId, periodStart, periodEnd },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      "A cashflow snapshot for this business and reporting period already exists. Edit it instead of creating a duplicate."
    );
  }

  const engineInput = toCashflowInput(input);
  const confidence = calculateDataConfidence(engineInput);

  const snapshot = await db.ownerCashflowSnapshot.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId,
      periodStart,
      periodEnd,
      currency: input.currency,
      businessModelType: input.businessModel ?? null,
      industryTemplate: input.industryTemplate ?? null,
      cashInHand: input.cashInHand ?? null,
      bankBalance: input.bankBalance ?? null,
      dailyCollections: input.dailyCollections ?? null,
      receivables: input.receivables ?? null,
      receivablesOverdue: input.receivablesOverdue ?? null,
      payables: input.payables ?? null,
      payablesOverdue: input.payablesOverdue ?? null,
      upcomingEmi: input.upcomingEmi ?? null,
      rentDue: input.rentDue ?? null,
      salaryDue: input.salaryDue ?? null,
      vendorDue: input.vendorDue ?? null,
      taxDue: input.taxDue ?? null,
      ownerWithdrawal: input.ownerWithdrawal ?? null,
      notes: input.notes ?? null,
      dataConfidenceScore: confidence.dataConfidenceScore,
      missingCriticalData: confidence.missingCritical,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_CASHFLOW_SNAPSHOT_RECORDED,
    actorId,
    workspaceId,
    entityType: "OwnerCashflowSnapshot",
    entityId: snapshot.id,
    payload: { businessId, periodStart: input.periodStart, periodEnd: input.periodEnd },
  });

  return snapshot;
}

export async function getCashflowSnapshot(snapshotId: string, workspaceId: string) {
  const snapshot = await db.ownerCashflowSnapshot.findFirst({
    where: { id: snapshotId, workspaceId },
  });
  if (!snapshot) throw new NotFoundError("OwnerCashflowSnapshot", snapshotId);
  return snapshot;
}

export async function listCashflowSnapshots(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerCashflowSnapshot.findMany({
    where: { businessId, workspaceId },
    orderBy: { periodEnd: "desc" },
  });
}
