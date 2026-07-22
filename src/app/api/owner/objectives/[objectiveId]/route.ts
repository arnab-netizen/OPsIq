/**
 * GET /api/owner/objectives/[objectiveId] — fetch a single BusinessObjective by ID.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getObjective } from "@/services/owner-mode/business-objective.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const objective = await getObjective(ctx.verifiedWorkspaceId, params.objectiveId);
    return canonicalJson({ objective }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
