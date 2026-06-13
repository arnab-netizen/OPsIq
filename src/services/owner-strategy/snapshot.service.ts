/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Strategy & Scenario Planning (Module 8) — scenario snapshot service.
 *
 * Persists a validated scenario option for a business (workspace-scoped, unique
 * assessment period). Computes data-confidence + missing-critical-data
 * deterministically at persist time (never invented). Reuses Module 1's
 * OwnerBusiness ownership guard.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError } from "@/infra/errors";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { calculateDataConfidence } from "@/domain/owner-strategy/data-confidence";
import type { StrategySnapshotInput } from "@/domain/owner-strategy/types";
import type { StrategySnapshotCreateInput } from "@/domain/owner-strategy/validation";

/** Map the validated API input to the engine input shape. */
export function toStrategyInput(input: StrategySnapshotCreateInput): StrategySnapshotInput {
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
    businessModel: input.businessModel,
    industryTemplate: input.industryTemplate,
    optionName: input.optionName,
    currentRevenue: input.currentRevenue,
    expectedRevenueChange: input.expectedRevenueChange,
    costChange: input.costChange,
    investmentRequired: input.investmentRequired,
    timeToImpactMonths: input.timeToImpactMonths,
    riskLevel: input.riskLevel,
    cashAvailable: input.cashAvailable,
    capacityImpactPct: input.capacityImpactPct,
    staffImpact: input.staffImpact,
    notes: input.notes,
  };
}

/** Map a persisted snapshot row back to the engine input shape. */
export function rowToStrategyInput(row: any): StrategySnapshotInput {
  return {
    periodStart: row.periodStart instanceof Date ? row.periodStart.toISOString() : row.periodStart,
    periodEnd: row.periodEnd instanceof Date ? row.periodEnd.toISOString() : row.periodEnd,
    currency: row.currency,
    businessModel: row.businessModelType ?? undefined,
    industryTemplate: row.industryTemplate ?? undefined,
    optionName: row.optionName ?? undefined,
    currentRevenue: row.currentRevenue ?? undefined,
    expectedRevenueChange: row.expectedRevenueChange ?? undefined,
    costChange: row.costChange ?? undefined,
    investmentRequired: row.investmentRequired ?? undefined,
    timeToImpactMonths: row.timeToImpactMonths ?? undefined,
    riskLevel: row.riskLevel ?? undefined,
    cashAvailable: row.cashAvailable ?? undefined,
    capacityImpactPct: row.capacityImpactPct ?? undefined,
    staffImpact: row.staffImpact ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export async function createStrategySnapshot(
  businessId: string,
  input: StrategySnapshotCreateInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // workspace ownership + existence

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const existing = await db.ownerStrategySnapshot.findFirst({
    where: { businessId, periodStart, periodEnd },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      "A strategy scenario for this business and assessment period already exists. Edit it instead of creating a duplicate."
    );
  }

  const engineInput = toStrategyInput(input);
  const confidence = calculateDataConfidence(engineInput);

  const snapshot = await db.ownerStrategySnapshot.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId,
      periodStart,
      periodEnd,
      currency: input.currency,
      businessModelType: input.businessModel ?? null,
      industryTemplate: input.industryTemplate ?? null,
      optionName: input.optionName ?? null,
      currentRevenue: input.currentRevenue ?? null,
      expectedRevenueChange: input.expectedRevenueChange ?? null,
      costChange: input.costChange ?? null,
      investmentRequired: input.investmentRequired ?? null,
      timeToImpactMonths: input.timeToImpactMonths ?? null,
      riskLevel: input.riskLevel ?? null,
      cashAvailable: input.cashAvailable ?? null,
      capacityImpactPct: input.capacityImpactPct ?? null,
      staffImpact: input.staffImpact ?? null,
      notes: input.notes ?? null,
      dataConfidenceScore: confidence.dataConfidenceScore,
      missingCriticalData: confidence.missingCritical,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_STRATEGY_SNAPSHOT_RECORDED,
    actorId,
    workspaceId,
    entityType: "OwnerStrategySnapshot",
    entityId: snapshot.id,
    payload: { businessId, periodStart: input.periodStart, periodEnd: input.periodEnd, optionName: input.optionName ?? null },
  });

  return snapshot;
}

export async function getStrategySnapshot(snapshotId: string, workspaceId: string) {
  const snapshot = await db.ownerStrategySnapshot.findFirst({
    where: { id: snapshotId, workspaceId },
  });
  if (!snapshot) throw new NotFoundError("OwnerStrategySnapshot", snapshotId);
  return snapshot;
}

export async function listStrategySnapshots(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerStrategySnapshot.findMany({
    where: { businessId, workspaceId },
    orderBy: { periodEnd: "desc" },
  });
}
