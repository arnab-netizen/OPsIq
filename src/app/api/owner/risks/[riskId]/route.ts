/**
 * GET /api/owner/risks/[riskId] — fetch a single business risk with task links.
 * OWNER_VIEW capability required. Workspace isolation enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getBusinessRisk } from "@/services/owner-mode/business-risk.service";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { riskId } = params;
    try {
      const risk = await getBusinessRisk(ctx.verifiedWorkspaceId, riskId);
      return canonicalJson({ risk }, { status: 200 });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return canonicalJson({ error: "Risk not found" }, { status: 404 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
