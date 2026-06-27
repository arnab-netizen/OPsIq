/**
 * GET /api/owner/budget/actions?businessId=... — persisted budget execution tasks
 *     (real owner action records linked from generated budget advisory actions).
 *     OWNER_VIEW, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { listBudgetActions } from "@/services/owner-budget/action-link.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    if (!businessId) return { error: "businessId is required" };
    return listBudgetActions(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
