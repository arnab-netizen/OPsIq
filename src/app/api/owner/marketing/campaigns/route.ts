import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createCampaign, listCampaigns, createCampaignSchema } from "@/services/owner-marketing-campaigns/campaign.service";
import { z } from "zod/v4";

const listQuerySchema = z.object({
  businessId: z.string().uuid(),
  status: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const parsed = listQuerySchema.safeParse({
      businessId: url.searchParams.get("businessId"),
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    if (!parsed.success) {
      return canonicalJson({ error: "businessId query parameter is required" }, { status: 400 });
    }
    const campaigns = await listCampaigns(ctx.verifiedWorkspaceId, parsed.data.businessId, {
      status: parsed.data.status,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return canonicalJson({ campaigns, total: campaigns.length }, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, createCampaignSchema);
    const campaign = await createCampaign(body, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(campaign, { status: 201 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] }
);
