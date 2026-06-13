/** GET /api/owner/portfolio/dashboard — full multi-business portfolio view (OWNER_VIEW) */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getPortfolio } from "@/services/owner-portfolio/portfolio.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    return getPortfolio(ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
