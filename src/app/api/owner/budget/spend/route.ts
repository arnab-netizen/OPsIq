/**
 * POST /api/owner/budget/spend — record a spend entry (runs spend governance and
 *      triggers reassessment). OWNER_MANAGE, workspace-scoped, validated, enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { budgetSpendCreateSchema } from "@/domain/owner-budget/validation";
import { recordSpendEntry } from "@/services/owner-budget/budget.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { businessId, ...input } = await parseRequestBody(ctx.request!, budgetSpendCreateSchema);
    const result = await recordSpendEntry(businessId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
