/**
 * GET   /api/owner/sales/actions/[actionId] — sales action detail (OWNER_VIEW)
 * PATCH /api/owner/sales/actions/[actionId] — status update / assignment /
 *        completion (OWNER_MANAGE). body: { status?, assignedTo?, completionNotes?,
 *        completionEvidence? }
 *
 * (Mirrors Module 1's recovery actions route, which uses PATCH for the status
 * update write; reuses the shared recovery action status machine.)
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { salesActionUpdateSchema } from "@/domain/owner-sales/validation";
import { getSalesAction, updateSalesAction } from "@/services/owner-sales/action.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    return getSalesAction(params.actionId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, salesActionUpdateSchema);
    return updateSalesAction(params.actionId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
