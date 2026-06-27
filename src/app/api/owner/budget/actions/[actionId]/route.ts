/**
 * PATCH /api/owner/budget/actions/[actionId] — status update / assignment /
 *        completion of a persisted budget execution task (OWNER_MANAGE).
 *        body: { status?, assignedTo?, completionNotes?, completionEvidence? }
 *
 * Reuses the SHARED owner action status machine via the linkage service; completion
 * requires evidence and feeds the budget learning/outcome recorder. No parallel
 * action engine — this is the same lifecycle Module 1 / owner-finance use.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { budgetActionUpdateSchema } from "@/domain/owner-budget/validation";
import { updateBudgetAction } from "@/services/owner-budget/action-link.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, budgetActionUpdateSchema);
    return updateBudgetAction(params.actionId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
