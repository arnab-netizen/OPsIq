/**
 * GET   /api/owner/finance/actions/[actionId] — finance action detail (OWNER_VIEW)
 * PATCH /api/owner/finance/actions/[actionId] — status update / assignment /
 *        completion (OWNER_MANAGE). body: { status?, assignedTo?, completionNotes?,
 *        completionEvidence? }
 *
 * (Mirrors Module 1's recovery actions route, which uses PATCH for the status
 * update write; reuses the shared recovery action status machine.)
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { financeActionUpdateSchema } from "@/domain/owner-finance/validation";
import { getFinanceAction, updateFinanceAction } from "@/services/owner-finance/action.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    return getFinanceAction(params.actionId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, financeActionUpdateSchema);
    return updateFinanceAction(params.actionId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
