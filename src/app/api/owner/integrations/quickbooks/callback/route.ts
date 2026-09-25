/**
 * QuickBooks Online — OAuth 2.0 redirect target.
 *
 * GET /api/owner/integrations/quickbooks/callback?code&state&realmId  (or ?error=access_denied)
 *
 * This is a top-level browser navigation back from Intuit, so it carries the
 * owner's session cookie (SameSite=Lax) and runs under the same canonical
 * session + workspace + capability enforcement as every owner route. The
 * workspace and actor are therefore server-derived; `state` must match the
 * one-time hashed state that SAME actor created in that SAME workspace
 * (consumed by compare-and-set in completeQuickBooksConnect), so a replayed,
 * foreign, expired or cross-user callback cannot bind a company. realmId is
 * never treated as authorization — it is only recorded after the state and
 * the authorization-code exchange both succeed.
 *
 * Always answers with a redirect to the owner Integrations page carrying a
 * non-sensitive outcome code; provider/exception details are never reflected.
 */
import { after } from "next/server";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalRedirect } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { completeQuickBooksConnect } from "@/services/quickbooks/qbo-connection.service";
import { requestQuickBooksSync } from "@/services/quickbooks/qbo-sync.service";
import { drainQuickBooksSyncTask } from "@/services/quickbooks/qbo-sync-dispatch.service";
import { classifyQuickBooksConnectError } from "@/domain/quickbooks/qbo-connect-outcome";
import { logger } from "@/infra/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const INTEGRATIONS_PATH = "/owner/integrations";

function redirectTo(request: Request, query: Record<string, string>) {
  return canonicalRedirect(request.url, INTEGRATIONS_PATH, query);
}

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const request = ctx.request!;
    const url = new URL(request.url);
    const providerError = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const realmId = url.searchParams.get("realmId");

    if (providerError) {
      return redirectTo(request, { quickbooks_error: providerError === "access_denied" ? "access_denied" : "unknown" });
    }
    if (!code || !state || !realmId) {
      return redirectTo(request, { quickbooks_error: "invalid_state" });
    }

    try {
      await completeQuickBooksConnect({
        workspaceId: ctx.verifiedWorkspaceId,
        actorId: ctx.verifiedActorId,
        code,
        state,
        realmId,
      });
    } catch (err) {
      const outcome = classifyQuickBooksConnectError(err);
      logger.warn("QuickBooks OAuth callback rejected", { outcome, errorName: err instanceof Error ? err.name : "unknown" });
      return redirectTo(request, { quickbooks_error: outcome });
    }

    try {
      const { taskId } = await requestQuickBooksSync({
        workspaceId: ctx.verifiedWorkspaceId,
        actorId: ctx.verifiedActorId,
        trigger: "INITIAL",
      });
      after(() => drainQuickBooksSyncTask(taskId));
    } catch (err) {
      // Connection succeeded; the daily scheduler producer and Sync Now both
      // still pick the connector up, so a failed enqueue is logged, not fatal.
      logger.error("QuickBooks initial sync enqueue failed after connect", err);
    }

    return redirectTo(request, { quickbooks: "connected" });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
