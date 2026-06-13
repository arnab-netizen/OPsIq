/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Sales (Module 3) — sales snapshot service.
 *
 * Persists a validated sales snapshot for a business (workspace-scoped, unique
 * reporting period). Computes data-confidence + missing-critical-data
 * deterministically at persist time (never invented). Reuses Module 1's
 * OwnerBusiness ownership guard.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError } from "@/infra/errors";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { calculateDataConfidence } from "@/domain/owner-sales/data-confidence";
import type { SalesSnapshotInput } from "@/domain/owner-sales/types";
import type { SalesSnapshotCreateInput } from "@/domain/owner-sales/validation";

/** Map the validated API input to the engine input shape. */
export function toSalesInput(input: SalesSnapshotCreateInput): SalesSnapshotInput {
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
    businessModel: input.businessModel,
    industryTemplate: input.industryTemplate,
    leads: input.leads,
    qualifiedLeads: input.qualifiedLeads,
    orders: input.orders,
    revenue: input.revenue,
    averageOrderValue: input.averageOrderValue,
    newCustomers: input.newCustomers,
    repeatCustomers: input.repeatCustomers,
    lostCustomers: input.lostCustomers,
    b2bProspects: input.b2bProspects,
    b2bPipelineValue: input.b2bPipelineValue,
    b2bRevenue: input.b2bRevenue,
    b2cRevenue: input.b2cRevenue,
    complaints: input.complaints,
    discountAmount: input.discountAmount,
    refundAmount: input.refundAmount,
    staffCount: input.staffCount,
    notes: input.notes,
  };
}

/** Map a persisted snapshot row back to the engine input shape. */
export function rowToSalesInput(row: any): SalesSnapshotInput {
  return {
    periodStart: row.periodStart instanceof Date ? row.periodStart.toISOString() : row.periodStart,
    periodEnd: row.periodEnd instanceof Date ? row.periodEnd.toISOString() : row.periodEnd,
    currency: row.currency,
    businessModel: row.businessModelType ?? undefined,
    industryTemplate: row.industryTemplate ?? undefined,
    leads: row.leads ?? undefined,
    qualifiedLeads: row.qualifiedLeads ?? undefined,
    orders: row.orders ?? undefined,
    revenue: row.revenue ?? undefined,
    averageOrderValue: row.averageOrderValue ?? undefined,
    newCustomers: row.newCustomers ?? undefined,
    repeatCustomers: row.repeatCustomers ?? undefined,
    lostCustomers: row.lostCustomers ?? undefined,
    b2bProspects: row.b2bProspects ?? undefined,
    b2bPipelineValue: row.b2bPipelineValue ?? undefined,
    b2bRevenue: row.b2bRevenue ?? undefined,
    b2cRevenue: row.b2cRevenue ?? undefined,
    complaints: row.complaints ?? undefined,
    discountAmount: row.discountAmount ?? undefined,
    refundAmount: row.refundAmount ?? undefined,
    staffCount: row.staffCount ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export async function createSalesSnapshot(
  businessId: string,
  input: SalesSnapshotCreateInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // workspace ownership + existence

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const existing = await db.ownerSalesSnapshot.findFirst({
    where: { businessId, periodStart, periodEnd },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      "A sales snapshot for this business and reporting period already exists. Edit it instead of creating a duplicate."
    );
  }

  const engineInput = toSalesInput(input);
  const confidence = calculateDataConfidence(engineInput);

  const snapshot = await db.ownerSalesSnapshot.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId,
      periodStart,
      periodEnd,
      currency: input.currency,
      businessModelType: input.businessModel ?? null,
      industryTemplate: input.industryTemplate ?? null,
      leads: input.leads ?? null,
      qualifiedLeads: input.qualifiedLeads ?? null,
      orders: input.orders ?? null,
      revenue: input.revenue ?? null,
      averageOrderValue: input.averageOrderValue ?? null,
      newCustomers: input.newCustomers ?? null,
      repeatCustomers: input.repeatCustomers ?? null,
      lostCustomers: input.lostCustomers ?? null,
      b2bProspects: input.b2bProspects ?? null,
      b2bPipelineValue: input.b2bPipelineValue ?? null,
      b2bRevenue: input.b2bRevenue ?? null,
      b2cRevenue: input.b2cRevenue ?? null,
      complaints: input.complaints ?? null,
      discountAmount: input.discountAmount ?? null,
      refundAmount: input.refundAmount ?? null,
      staffCount: input.staffCount ?? null,
      notes: input.notes ?? null,
      dataConfidenceScore: confidence.dataConfidenceScore,
      missingCriticalData: confidence.missingCritical,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_SALES_SNAPSHOT_RECORDED,
    actorId,
    workspaceId,
    entityType: "OwnerSalesSnapshot",
    entityId: snapshot.id,
    payload: { businessId, periodStart: input.periodStart, periodEnd: input.periodEnd },
  });

  return snapshot;
}

export async function getSalesSnapshot(snapshotId: string, workspaceId: string) {
  const snapshot = await db.ownerSalesSnapshot.findFirst({
    where: { id: snapshotId, workspaceId },
  });
  if (!snapshot) throw new NotFoundError("OwnerSalesSnapshot", snapshotId);
  return snapshot;
}

export async function listSalesSnapshots(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerSalesSnapshot.findMany({
    where: { businessId, workspaceId },
    orderBy: { periodEnd: "desc" },
  });
}
