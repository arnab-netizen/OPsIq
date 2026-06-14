/**
 * GET /api/owner/home?businessId= — the §19 owner-home summary (business health;
 *     cash/sales/operations/execution danger; top-3 risks; top-3 opportunities;
 *     today's required actions; last verified improvement). OWNER_VIEW,
 *     workspace-scoped, canonically enforced. Read-only.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerHome } from "@/services/owner-home/home.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    return getOwnerHome(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
