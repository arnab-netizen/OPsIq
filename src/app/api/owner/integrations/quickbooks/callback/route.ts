/**
 * GET /api/owner/integrations/quickbooks/callback — Intuit's redirect target (OWNER_MANAGE, signed-in owner).
 *
 * Every query parameter is untrusted. Workspace and actor come ONLY from the canonical session; the business comes
 * from the consumed one-time state record; the environment from server configuration. The result is a small, fixed,
 * non-cacheable JSON completion document (the canonical wrapper does not issue redirects, so there is no return URL
 * to abuse). A request without a valid session never reaches this handler, so no code is exchanged for it.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { mapConnectFailure } from "@/domain/quickbooks/qbo-connect-outcomes";
import { completeQboCallback } from "@/services/quickbooks/qbo-connect-callback.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const result = await completeQboCallback(
      { workspaceId: ctx.verifiedWorkspaceId, actorId: ctx.verifiedActorId, query: new URL(ctx.request!.url).searchParams },
      { env: process.env },
    );
    if (!result.ok) {
      const failure = mapConnectFailure(result.code);
      return canonicalJson(failure.body, { status: failure.httpStatus, headers: { "cache-control": "no-store" } });
    }
    return canonicalJson(
      { status: "CONNECTED", businessId: result.businessId, environment: result.environment, reconnected: result.reconnected, next: result.next },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true, requireActorType: "user" },
);
