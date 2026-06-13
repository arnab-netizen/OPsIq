/** GET /api/owner/operations/dashboard?businessId=... — aggregated dashboard (OWNER_VIEW) */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOperationsDashboard } from "@/services/owner-operations/dashboard.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    return getOperationsDashboard(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
