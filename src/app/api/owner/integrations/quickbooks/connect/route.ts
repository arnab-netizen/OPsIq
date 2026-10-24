/**
 * POST /api/owner/integrations/quickbooks/connect — start a QuickBooks Online authorization (OWNER_MANAGE).
 *
 * Body: { businessId, environment }. Workspace and actor come ONLY from the canonical session context; redirect URI,
 * client id, scope and Intuit host are server configuration and cannot be supplied. The response carries just the
 * Intuit authorization URL (which necessarily embeds the one-time state) and its expiry, with caching disabled.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { mapConnectFailure } from "@/domain/quickbooks/qbo-connect-outcomes";
import { startQboConnect } from "@/services/quickbooks/qbo-connect-callback.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.strictObject({
  businessId: z.string().uuid(),
  environment: z.enum(["sandbox", "production"]),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, bodySchema);
    const result = await startQboConnect(
      { workspaceId: ctx.verifiedWorkspaceId, actorId: ctx.verifiedActorId, businessId: body.businessId, environment: body.environment },
      { env: process.env },
    );
    if (!result.ok) {
      const failure = mapConnectFailure(result.code);
      return canonicalJson(failure.body, { status: failure.httpStatus, headers: { "cache-control": "no-store" } });
    }
    return canonicalJson(
      { authorizationUrl: result.authorizationUrl, stateExpiresAt: result.stateExpiresAt.toISOString() },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true, requireActorType: "user" },
);
