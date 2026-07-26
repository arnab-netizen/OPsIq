import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getCampaign, updateCampaign, updateCampaignSchema } from "@/services/owner-marketing-campaigns/campaign.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.campaignId);
    const campaign = await getCampaign(ctx.verifiedWorkspaceId, params.campaignId);
    if (!campaign) return canonicalJson({ error: "Campaign not found" }, { status: 404 });
    return canonicalJson(campaign, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.campaignId);
    const body = await parseRequestBody(ctx.request!, updateCampaignSchema);
    const campaign = await updateCampaign(ctx.verifiedWorkspaceId, params.campaignId, body, ctx.verifiedActorId);
    if (!campaign) return canonicalJson({ error: "Campaign not found" }, { status: 404 });
    return canonicalJson(campaign, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] }
);
