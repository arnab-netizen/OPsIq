/** GET /api/owner/portfolio/actions — today's top-3 priorities + each business's canonical main target (OWNER_VIEW) */
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
      top3Priorities: view.top3Priorities,
      actionQueue: view.businesses.map((b) => ({
        businessId: b.businessId,
        name: b.name,
        mainTarget: b.mainTarget,
      })),
      generatedAt: view.generatedAt,
    };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
