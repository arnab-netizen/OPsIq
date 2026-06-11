/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Founder Recovery — metric snapshot service.
 *
 * Persists validated real metric snapshots for a business. Enforces workspace
 * ownership and deliberate duplicate-period handling (unique business+period).
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError } from "@/infra/errors";
import type { MetricSnapshotZodInput } from "@/domain/founder-recovery/validation";
import { getBusiness } from "./business.service";

const SNAPSHOT_NUMERIC_FIELDS = [
  "revenue", "totalCosts", "grossProfit", "netProfit", "orderCount", "kgProcessed",
  "piecesProcessed", "b2cRevenue", "b2bRevenue", "newCustomers", "repeatCustomers",
  "dormantContacted", "averageOrderValue", "discountAmount", "refundAmount", "rewashCount",
  "complaintCount", "receivables", "staffCost", "rentCost", "utilitiesCost", "materialCost",
  "deliveryCost", "marketingSpend", "campaignConversions", "averageTurnaroundHours",
  "staffProductivity",
] as const;

export async function createSnapshot(
  businessId: string,
  input: MetricSnapshotZodInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // workspace ownership + existence

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const existing = await db.ownerMetricSnapshot.findFirst({
    where: { businessId, periodStart, periodEnd },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      "A metric snapshot for this business and reporting period already exists. Edit it instead of creating a duplicate."
    );
  }

  const numericData: Record<string, number | null> = {};
  for (const field of SNAPSHOT_NUMERIC_FIELDS) {
    const v = (input as Record<string, unknown>)[field];
    numericData[field] = typeof v === "number" ? v : null;
  }

  const snapshot = await db.ownerMetricSnapshot.create({
    data: {
      id: randomUUID(),
      businessId,
      workspaceId,
      periodStart,
      periodEnd,
      currency: input.currency,
      notes: input.notes ?? null,
      createdBy: actorId,
      ...numericData,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_METRIC_SNAPSHOT_RECORDED,
    actorId,
    workspaceId,
    entityType: "OwnerMetricSnapshot",
    entityId: snapshot.id,
    payload: { businessId, periodStart: input.periodStart, periodEnd: input.periodEnd },
  });

  return snapshot;
}

export async function listSnapshots(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerMetricSnapshot.findMany({
    where: { businessId, workspaceId },
    orderBy: { periodEnd: "desc" },
  });
}

export async function getSnapshot(snapshotId: string, workspaceId: string) {
  const snapshot = await db.ownerMetricSnapshot.findFirst({
    where: { id: snapshotId, workspaceId },
  });
  if (!snapshot) throw new NotFoundError("OwnerMetricSnapshot", snapshotId);
  return snapshot;
}

/** Convert a persisted snapshot row into the pure-logic MetricSnapshotInput shape. */
export function toMetricInput(row: any): import("@/domain/founder-recovery/types").MetricSnapshotInput {
  const out: Record<string, unknown> = {
    periodStart: row.periodStart instanceof Date ? row.periodStart.toISOString() : row.periodStart,
    periodEnd: row.periodEnd instanceof Date ? row.periodEnd.toISOString() : row.periodEnd,
    currency: row.currency,
    notes: row.notes ?? undefined,
  };
  for (const field of SNAPSHOT_NUMERIC_FIELDS) {
    if (row[field] !== null && row[field] !== undefined) out[field] = row[field];
  }
  return out as unknown as import("@/domain/founder-recovery/types").MetricSnapshotInput;
}
