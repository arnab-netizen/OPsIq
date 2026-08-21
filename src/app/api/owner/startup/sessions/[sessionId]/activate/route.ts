/**
 * POST /api/owner/startup/sessions/[sessionId]/activate — F-STARTUP-NO-HANDOFF.
 * Hands off a validated, execution-planned Startup session to a real,
 * operating OwnerBusiness and transitions the session to ACTIVE. Idempotent:
 * repeat calls after a successful handoff return the same businessId.
 * All inputs derive from the session's own canonical state (approved idea,
 * GO decision, execution plan) -- no request body.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { handOffStartupSessionToBusiness } from "@/services/owner-strategy/startup-handoff.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const result = await handOffStartupSessionToBusiness(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      ctx.verifiedActorId
    );
    return canonicalJson(result, { status: result.alreadyHandedOff ? 200 : 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
