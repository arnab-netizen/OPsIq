/**
 * GET   /api/owner/cashflow/actions/[actionId] — cashflow action detail (OWNER_VIEW)
 * PATCH /api/owner/cashflow/actions/[actionId] — status update / assignment /
 *        completion (OWNER_MANAGE). body: { status?, assignedTo?, completionNotes?,
 *        completionEvidence? }
 *
 * (Mirrors Module 1's recovery actions route, which uses PATCH for the status
 * update write; reuses the shared recovery action status machine.)
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { cashflowActionUpdateSchema } from "@/domain/owner-cashflow/validation";
import { getCashflowAction, updateCashflowAction } from "@/services/owner-cashflow/action.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    return getCashflowAction(params.actionId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, cashflowActionUpdateSchema);
    return updateCashflowAction(params.actionId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
