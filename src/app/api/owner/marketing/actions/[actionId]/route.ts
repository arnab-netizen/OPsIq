/**
 * GET   /api/owner/marketing/actions/[actionId] — action detail (OWNER_VIEW)
 * PATCH /api/owner/marketing/actions/[actionId] — status update / assignment /
 *        completion (OWNER_MANAGE).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { marketingActionUpdateSchema } from "@/domain/owner-marketing/validation";
import { getMarketingAction, updateMarketingAction } from "@/services/owner-marketing/action.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    return getMarketingAction(params.actionId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, marketingActionUpdateSchema);
    return updateMarketingAction(params.actionId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
