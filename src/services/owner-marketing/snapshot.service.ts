/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Marketing & Growth (Module 6) — marketing snapshot service.
 *
 * Persists a validated marketing snapshot for a business (workspace-scoped,
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
import { calculateDataConfidence } from "@/domain/owner-marketing/data-confidence";
import type { MarketingSnapshotInput } from "@/domain/owner-marketing/types";
import type { MarketingSnapshotCreateInput } from "@/domain/owner-marketing/validation";

/** Map the validated API input to the engine input shape. */
export function toMarketingInput(input: MarketingSnapshotCreateInput): MarketingSnapshotInput {
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
    businessModel: input.businessModel,
    industryTemplate: input.industryTemplate,
    marketingSpend: input.marketingSpend,
    revenue: input.revenue,
    leads: input.leads,
    inquiries: input.inquiries,
    orders: input.orders,
    newCustomers: input.newCustomers,
    paidLeads: input.paidLeads,
    organicLeads: input.organicLeads,
    campaignsRun: input.campaignsRun,
    campaignsWithFollowup: input.campaignsWithFollowup,
    contentPosted: input.contentPosted,
    couponsRedeemed: input.couponsRedeemed,
    referrals: input.referrals,
    walkIns: input.walkIns,
    notes: input.notes,
  };
}

/** Map a persisted snapshot row back to the engine input shape. */
export function rowToMarketingInput(row: any): MarketingSnapshotInput {
  return {
    periodStart: row.periodStart instanceof Date ? row.periodStart.toISOString() : row.periodStart,
    periodEnd: row.periodEnd instanceof Date ? row.periodEnd.toISOString() : row.periodEnd,
    currency: row.currency,
    businessModel: row.businessModelType ?? undefined,
    industryTemplate: row.industryTemplate ?? undefined,
    marketingSpend: row.marketingSpend ?? undefined,
    revenue: row.revenue ?? undefined,
    leads: row.leads ?? undefined,
    inquiries: row.inquiries ?? undefined,
    orders: row.orders ?? undefined,
    newCustomers: row.newCustomers ?? undefined,
    paidLeads: row.paidLeads ?? undefined,
    organicLeads: row.organicLeads ?? undefined,
    campaignsRun: row.campaignsRun ?? undefined,
    campaignsWithFollowup: row.campaignsWithFollowup ?? undefined,
    contentPosted: row.contentPosted ?? undefined,
    couponsRedeemed: row.couponsRedeemed ?? undefined,
    referrals: row.referrals ?? undefined,
    walkIns: row.walkIns ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export async function createMarketingSnapshot(
  businessId: string,
  input: MarketingSnapshotCreateInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // workspace ownership + existence

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const existing = await db.ownerMarketingSnapshot.findFirst({
    where: { businessId, periodStart, periodEnd },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      "A marketing snapshot for this business and reporting period already exists. Edit it instead of creating a duplicate."
    );
  }

  const engineInput = toMarketingInput(input);
  const confidence = calculateDataConfidence(engineInput);

  const snapshot = await db.ownerMarketingSnapshot.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId,
      periodStart,
      periodEnd,
      currency: input.currency,
      businessModelType: input.businessModel ?? null,
      industryTemplate: input.industryTemplate ?? null,
      marketingSpend: input.marketingSpend ?? null,
      revenue: input.revenue ?? null,
      leads: input.leads ?? null,
      inquiries: input.inquiries ?? null,
      orders: input.orders ?? null,
      newCustomers: input.newCustomers ?? null,
      paidLeads: input.paidLeads ?? null,
      organicLeads: input.organicLeads ?? null,
      campaignsRun: input.campaignsRun ?? null,
      campaignsWithFollowup: input.campaignsWithFollowup ?? null,
      contentPosted: input.contentPosted ?? null,
      couponsRedeemed: input.couponsRedeemed ?? null,
      referrals: input.referrals ?? null,
      walkIns: input.walkIns ?? null,
      notes: input.notes ?? null,
      dataConfidenceScore: confidence.dataConfidenceScore,
      missingCriticalData: confidence.missingCritical,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_MARKETING_SNAPSHOT_RECORDED,
    actorId,
    workspaceId,
    entityType: "OwnerMarketingSnapshot",
    entityId: snapshot.id,
    payload: { businessId, periodStart: input.periodStart, periodEnd: input.periodEnd },
  });

  return snapshot;
}

export async function getMarketingSnapshot(snapshotId: string, workspaceId: string) {
  const snapshot = await db.ownerMarketingSnapshot.findFirst({
    where: { id: snapshotId, workspaceId },
  });
  if (!snapshot) throw new NotFoundError("OwnerMarketingSnapshot", snapshotId);
  return snapshot;
}

export async function listMarketingSnapshots(businessId: string, workspaceId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerMarketingSnapshot.findMany({
    where: { businessId, workspaceId },
    orderBy: { periodEnd: "desc" },
  });
}
