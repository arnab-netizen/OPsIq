/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Operations (Module 4) — operations snapshot service.
 *
 * Persists a validated operations snapshot for a business (workspace-scoped,
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
import { calculateDataConfidence } from "@/domain/owner-operations/data-confidence";
import type { OperationsSnapshotInput } from "@/domain/owner-operations/types";
import type { OperationsSnapshotCreateInput } from "@/domain/owner-operations/validation";

/** Map the validated API input to the engine input shape. */
export function toOperationsInput(input: OperationsSnapshotCreateInput): OperationsSnapshotInput {
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
    businessModel: input.businessModel,
    industryTemplate: input.industryTemplate,
    ordersReceived: input.ordersReceived,
    ordersCompleted: input.ordersCompleted,
    ordersDelayed: input.ordersDelayed,
    reworkCount: input.reworkCount,
    complaints: input.complaints,
    staffHours: input.staffHours,
    machineCapacityUnits: input.machineCapacityUnits,
    idleHours: input.idleHours,
    deliveryAttempts: input.deliveryAttempts,
    deliveryFailures: input.deliveryFailures,
    inventoryShortages: input.inventoryShortages,
    sopChecks: input.sopChecks,
    sopMisses: input.sopMisses,
    notes: input.notes,
  };
}

/** Map a persisted snapshot row back to the engine input shape. */
export function rowToOperationsInput(row: any): OperationsSnapshotInput {
  return {
    periodStart: row.periodStart instanceof Date ? row.periodStart.toISOString() : row.periodStart,
    periodEnd: row.periodEnd instanceof Date ? row.periodEnd.toISOString() : row.periodEnd,
    currency: row.currency,
    businessModel: row.businessModelType ?? undefined,
    industryTemplate: row.industryTemplate ?? undefined,
    ordersReceived: row.ordersReceived ?? undefined,
    ordersCompleted: row.ordersCompleted ?? undefined,
    ordersDelayed: row.ordersDelayed ?? undefined,
    reworkCount: row.reworkCount ?? undefined,
    complaints: row.complaints ?? undefined,
    staffHours: row.staffHours ?? undefined,
    machineCapacityUnits: row.machineCapacityUnits ?? undefined,
    idleHours: row.idleHours ?? undefined,
    deliveryAttempts: row.deliveryAttempts ?? undefined,
    deliveryFailures: row.deliveryFailures ?? undefined,
    inventoryShortages: row.inventoryShortages ?? undefined,
    sopChecks: row.sopChecks ?? undefined,
    sopMisses: row.sopMisses ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export async function createOperationsSnapshot(
  businessId: string,
  input: OperationsSnapshotCreateInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // workspace ownership + existence

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const existing = await db.ownerOperationsSnapshot.findFirst({
    where: { businessId, periodStart, periodEnd },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      "An operations snapshot for this business and reporting period already exists. Edit it instead of creating a duplicate."
    );
  }

  const engineInput = toOperationsInput(input);
  const confidence = calculateDataConfidence(engineInput);

  const snapshot = await db.ownerOperationsSnapshot.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId,
      periodStart,
      periodEnd,
      currency: input.currency,
      businessModelType: input.businessModel ?? null,
      industryTemplate: input.industryTemplate ?? null,
      ordersReceived: input.ordersReceived ?? null,
      ordersCompleted: input.ordersCompleted ?? null,
      ordersDelayed: input.ordersDelayed ?? null,
      reworkCount: input.reworkCount ?? null,
      complaints: input.complaints ?? null,
      staffHours: input.staffHours ?? null,
      machineCapacityUnits: input.machineCapacityUnits ?? null,
      idleHours: input.idleHours ?? null,
      deliveryAttempts: input.deliveryAttempts ?? null,
      deliveryFailures: input.deliveryFailures ?? null,
      inventoryShortages: input.inventoryShortages ?? null,
      sopChecks: input.sopChecks ?? null,
      sopMisses: input.sopMisses ?? null,
      notes: input.notes ?? null,
      dataConfidenceScore: confidence.dataConfidenceScore,
      missingCriticalData: confidence.missingCritical,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_OPERATIONS_SNAPSHOT_RECORDED,
    actorId,
    workspaceId,
    entityType: "OwnerOperationsSnapshot",
    entityId: snapshot.id,
    payload: { businessId, periodStart: input.periodStart, periodEnd: input.periodEnd },
  });

  return snapshot;
}

export async function getOperationsSnapshot(snapshotId: string, workspaceId: string) {
  const snapshot = await db.ownerOperationsSnapshot.findFirst({
    where: { id: snapshotId, workspaceId },
  });
  if (!snapshot) throw new NotFoundError("OwnerOperationsSnapshot", snapshotId);
  return snapshot;
}

export async function listOperationsSnapshots(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerOperationsSnapshot.findMany({
    where: { businessId, workspaceId },
    orderBy: { periodEnd: "desc" },
  });
}
