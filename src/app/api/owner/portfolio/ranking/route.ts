/** GET /api/owner/portfolio/ranking — cross-business ranking + per-business scores (OWNER_VIEW) */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getPortfolio } from "@/services/owner-portfolio/portfolio.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const view = await getPortfolio(ctx.verifiedWorkspaceId);
    return {
      hasData: view.hasData,
      businessCount: view.businessCount,
      portfolioHealthScore: view.portfolioHealthScore,
      ranking: view.ranking,
      businesses: view.businesses,
      generatedAt: view.generatedAt,
    };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
