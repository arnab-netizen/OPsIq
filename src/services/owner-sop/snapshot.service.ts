/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner SOP & Execution Accountability (Module 7) — execution snapshot service.
 *
 * Persists a validated execution snapshot for a business (workspace-scoped,
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
import { calculateDataConfidence } from "@/domain/owner-sop/data-confidence";
import type { SopSnapshotInput } from "@/domain/owner-sop/types";
import type { SopSnapshotCreateInput } from "@/domain/owner-sop/validation";

/** Map the validated API input to the engine input shape. */
export function toSopInput(input: SopSnapshotCreateInput): SopSnapshotInput {
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
    businessModel: input.businessModel,
    industryTemplate: input.industryTemplate,
    actionsAssigned: input.actionsAssigned,
    actionsCompleted: input.actionsCompleted,
    actionsVerified: input.actionsVerified,
    actionsOverdue: input.actionsOverdue,
    actionsDisputed: input.actionsDisputed,
    actionsReassigned: input.actionsReassigned,
    repeatedFailures: input.repeatedFailures,
    proofRequired: input.proofRequired,
    proofProvided: input.proofProvided,
    recurringProcesses: input.recurringProcesses,
    documentedSops: input.documentedSops,
    notes: input.notes,
  };
}

/** Map a persisted snapshot row back to the engine input shape. */
export function rowToSopInput(row: any): SopSnapshotInput {
  return {
    periodStart: row.periodStart instanceof Date ? row.periodStart.toISOString() : row.periodStart,
    periodEnd: row.periodEnd instanceof Date ? row.periodEnd.toISOString() : row.periodEnd,
    currency: row.currency,
    businessModel: row.businessModelType ?? undefined,
    industryTemplate: row.industryTemplate ?? undefined,
    actionsAssigned: row.actionsAssigned ?? undefined,
    actionsCompleted: row.actionsCompleted ?? undefined,
    actionsVerified: row.actionsVerified ?? undefined,
    actionsOverdue: row.actionsOverdue ?? undefined,
    actionsDisputed: row.actionsDisputed ?? undefined,
    actionsReassigned: row.actionsReassigned ?? undefined,
    repeatedFailures: row.repeatedFailures ?? undefined,
    proofRequired: row.proofRequired ?? undefined,
    proofProvided: row.proofProvided ?? undefined,
    recurringProcesses: row.recurringProcesses ?? undefined,
    documentedSops: row.documentedSops ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export async function createSopSnapshot(
  businessId: string,
  input: SopSnapshotCreateInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // workspace ownership + existence

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const existing = await db.ownerSopSnapshot.findFirst({
    where: { businessId, periodStart, periodEnd },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      "An execution snapshot for this business and reporting period already exists. Edit it instead of creating a duplicate."
    );
  }

  const engineInput = toSopInput(input);
  const confidence = calculateDataConfidence(engineInput);

  const snapshot = await db.ownerSopSnapshot.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId,
      periodStart,
      periodEnd,
      currency: input.currency,
      businessModelType: input.businessModel ?? null,
      industryTemplate: input.industryTemplate ?? null,
      actionsAssigned: input.actionsAssigned ?? null,
      actionsCompleted: input.actionsCompleted ?? null,
      actionsVerified: input.actionsVerified ?? null,
      actionsOverdue: input.actionsOverdue ?? null,
      actionsDisputed: input.actionsDisputed ?? null,
      actionsReassigned: input.actionsReassigned ?? null,
      repeatedFailures: input.repeatedFailures ?? null,
      proofRequired: input.proofRequired ?? null,
      proofProvided: input.proofProvided ?? null,
      recurringProcesses: input.recurringProcesses ?? null,
      documentedSops: input.documentedSops ?? null,
      notes: input.notes ?? null,
      dataConfidenceScore: confidence.dataConfidenceScore,
      missingCriticalData: confidence.missingCritical,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_SOP_SNAPSHOT_RECORDED,
    actorId,
    workspaceId,
    entityType: "OwnerSopSnapshot",
    entityId: snapshot.id,
    payload: { businessId, periodStart: input.periodStart, periodEnd: input.periodEnd },
  });

  return snapshot;
}

export async function getSopSnapshot(snapshotId: string, workspaceId: string) {
  const snapshot = await db.ownerSopSnapshot.findFirst({
    where: { id: snapshotId, workspaceId },
  });
  if (!snapshot) throw new NotFoundError("OwnerSopSnapshot", snapshotId);
  return snapshot;
}

export async function listSopSnapshots(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerSopSnapshot.findMany({
    where: { businessId, workspaceId },
    orderBy: { periodEnd: "desc" },
  });
}
