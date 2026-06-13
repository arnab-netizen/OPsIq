/**
 * GET /api/owner/trust/explanations?domain=&cycleId= — credible explanations for a
 * diagnosis cycle's findings/actions (the §18 fields) (OWNER_VIEW). Read-only.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow } from "@/lib/validation";
import { explanationsQuerySchema } from "@/domain/owner-trust";
import { getCycleExplanations } from "@/services/owner-trust/trust.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const { domain, cycleId } = parseOrThrow(explanationsQuerySchema, {
      domain: url.searchParams.get("domain"),
      cycleId: url.searchParams.get("cycleId"),
    });
    return getCycleExplanations(domain, cycleId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
