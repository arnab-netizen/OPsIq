/**
 * DELETE /api/owner/policies/:policyId/overrides/:overrideId — revoke an active policy override.
 *
 * Idempotent: revoking an already-revoked override returns 200 without error.
 * Requires OWNER_MANAGE capability.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { revokeOverride } from "@/services/governance/operating-policy.service";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const DELETE = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    await revokeOverride(params.overrideId, ctx.verifiedWorkspaceId, ctx.verifiedActorId);
    return canonicalJson({ revoked: true }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
