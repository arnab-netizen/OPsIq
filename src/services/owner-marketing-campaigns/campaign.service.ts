import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { z } from "zod/v4";

export const createCampaignSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1).max(200),
  channel: z.string().min(1).max(100),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
  budget: z.number().min(0).nullable().optional(),
  spend: z.number().min(0).nullable().optional(),
  leads: z.number().int().min(0).nullable().optional(),
  conversions: z.number().int().min(0).nullable().optional(),
  revenue: z.number().min(0).nullable().optional(),
  startDate: z.iso.datetime().nullable().optional(),
  endDate: z.iso.datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema.omit({ businessId: true }).partial();
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export async function createCampaign(
  input: CreateCampaignInput,
  actorId: string,
  workspaceId: string,
) {
  const record = await db.marketingCampaign.create({
    data: {
      workspaceId,
      businessId: input.businessId,
      name: input.name,
      channel: input.channel,
      status: input.status ?? "DRAFT",
      budget: input.budget ?? null,
      spend: input.spend ?? 0,
      leads: input.leads ?? 0,
      conversions: input.conversions ?? 0,
      revenue: input.revenue ?? 0,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      notes: input.notes ?? null,
      createdBy: actorId,
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_MARKETING_CAMPAIGN_CREATED,
    actorId,
    workspaceId,
    entityType: "MarketingCampaign",
    entityId: record.id,
    payload: { name: record.name, channel: record.channel, businessId: record.businessId },
  });
  return record;
}

export async function listCampaigns(
  workspaceId: string,
  businessId: string,
  opts?: { status?: string; limit?: number; offset?: number },
) {
  const where: Record<string, unknown> = { workspaceId, businessId };
  if (opts?.status) where.status = opts.status;
  return db.marketingCampaign.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
  });
}

export async function getCampaign(workspaceId: string, campaignId: string) {
  return db.marketingCampaign.findFirst({ where: { workspaceId, id: campaignId } });
}

export async function updateCampaign(
  workspaceId: string,
  campaignId: string,
  input: UpdateCampaignInput,
  actorId: string,
) {
  const existing = await db.marketingCampaign.findFirst({ where: { workspaceId, id: campaignId } });
  if (!existing) return null;

  const record = await db.marketingCampaign.update({
    where: { id: campaignId, workspaceId },
    data: {
      ...(input.name != null && { name: input.name }),
      ...(input.channel != null && { channel: input.channel }),
      ...(input.status != null && { status: input.status }),
      ...(input.budget !== undefined && { budget: input.budget ?? null }),
      ...(input.spend !== undefined && { spend: input.spend ?? 0 }),
      ...(input.leads !== undefined && { leads: input.leads ?? 0 }),
      ...(input.conversions !== undefined && { conversions: input.conversions ?? 0 }),
      ...(input.revenue !== undefined && { revenue: input.revenue ?? 0 }),
      ...(input.startDate !== undefined && { startDate: input.startDate ? new Date(input.startDate) : null }),
      ...(input.endDate !== undefined && { endDate: input.endDate ? new Date(input.endDate) : null }),
      ...(input.notes !== undefined && { notes: input.notes ?? null }),
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_MARKETING_CAMPAIGN_UPDATED,
    actorId,
    workspaceId,
    entityType: "MarketingCampaign",
    entityId: record.id,
    payload: { campaignId, changes: Object.keys(input) },
  });
  return record;
}
