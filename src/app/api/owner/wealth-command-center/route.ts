/**
 * GET /api/owner/wealth-command-center?businessId=... — the owner's composed
 *     wealth-loop decision view: wealth path + BMQ, risk-adjusted score,
 *     opportunity cost, financial governor, next best move, Work Package, owner
 *     workload transfer, and proof requirement. OWNER_VIEW, workspace-scoped,
 *     canonically enforced. Read-only.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getWealthCommandCenter } from "@/services/owner-strategy/command-center.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    return getWealthCommandCenter(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
