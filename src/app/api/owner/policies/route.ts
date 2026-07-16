/**
 * GET /api/owner/policies — list all operating policies for the workspace.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { listPolicies } from "@/services/governance/operating-policy.service";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const policies = await listPolicies(ctx.verifiedWorkspaceId);
    return canonicalJson({ policies }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
