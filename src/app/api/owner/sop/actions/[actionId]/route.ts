/**
 * GET   /api/owner/sop/actions/[actionId] — action detail (OWNER_VIEW)
 * PATCH /api/owner/sop/actions/[actionId] — status update / assignment /
 *        completion (OWNER_MANAGE).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { sopActionUpdateSchema } from "@/domain/owner-sop/validation";
import { getSopAction, updateSopAction } from "@/services/owner-sop/action.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    return getSopAction(params.actionId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, sopActionUpdateSchema);
    return updateSopAction(params.actionId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
