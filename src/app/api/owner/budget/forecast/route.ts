/**
 * GET /api/owner/budget/forecast?businessId=... — rolling 13-week cash forecast
 *     (base / downside / cash-stress scenarios). OWNER_VIEW, workspace-scoped, enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getBudgetForecast } from "@/services/owner-budget/budget.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    if (!businessId) return { error: "businessId is required" };
    return getBudgetForecast(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
