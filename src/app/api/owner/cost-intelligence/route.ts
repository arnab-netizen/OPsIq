/**
 * Phase 4 — Cost Intelligence route.
 *
 * GET /api/owner/cost-intelligence — build and return the workspace cost intelligence view
 *   (burn rate, category breakdown, objective attribution, unattributed cost).
 *
 * Read-only. Workspace isolation enforced via canonical auth. OWNER_MANAGE required.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { buildWorkspaceCostIntelligence } from "@/services/owner-mode/cost-attribution.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const intelligence = await buildWorkspaceCostIntelligence(ctx.verifiedWorkspaceId);
    return canonicalJson({ intelligence }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
