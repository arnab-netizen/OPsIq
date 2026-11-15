/**
 * GET /api/owner/integrations/quickbooks/callback — the session-authenticated callback API (OWNER_MANAGE, signed-in owner).
 *
 * Browser flow: Intuit redirects the owner to the PAGE /owner/integrations/quickbooks/callback (the registered redirect URI),
 * which forwards the query string here and then sends the owner on to My Business with one closed outcome token. The browser is
 * therefore never left on this JSON document. (The canonical wrapper deliberately cannot issue redirects, so the hop is made by
 * the page, not by relaxing the wrapper.)
 *
 * Every query parameter is untrusted. Workspace and actor come ONLY from the canonical session; the business comes from the
 * consumed one-time state record; the environment from server configuration. The result is a small, fixed, non-cacheable JSON
 * completion document. A request without a valid session never reaches this handler, so no code is exchanged for it.
 */
import { after } from "next/server";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { mapConnectFailure } from "@/domain/quickbooks/qbo-connect-outcomes";
import { completeQboCallback } from "@/services/quickbooks/qbo-connect-callback.service";
import { getFirstRunContext } from "@/services/owner-first-run/first-run.service";
import { landingForFirstRunState } from "@/domain/owner-first-run/first-run-source";
import { processQboSyncChain, requestQboSyncNow } from "@/services/quickbooks/qbo-sync-background";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** The after-response sync accelerator (qbo-sync-background) stays inside a 50 s budget; the cron drain finishes anything left. */
export const maxDuration = 60;

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
    // Start the first (or refreshed) import now rather than at tomorrow's cron: enqueue durably, run after the response.
    try {
      const task = await requestQboSyncNow({ workspaceId: ctx.verifiedWorkspaceId, connectionId: result.connectionId });
      after(() => processQboSyncChain({ workspaceId: ctx.verifiedWorkspaceId, connectionId: result.connectionId, taskId: task.taskId }));
    } catch {
      /* the connection is saved; the daily cron picks it up. Never fail a completed connection for an accelerator. */
    }
    // Where the browser returns is decided from persisted first-run facts: an owner still waiting for a first read goes back to
    // first-run (which shows the import and starts the read itself); anyone else keeps the My Business landing. A failure to
    // decide is never a failure of the (already saved) connection.
    let landing: "first_run" | "data" = "data";
    try {
      landing = landingForFirstRunState((await getFirstRunContext(ctx.verifiedWorkspaceId, result.businessId)).state);
    } catch {
      /* default landing: a business first-run does not serve (e.g. a sandbox test business) keeps My Business */
    }
    return canonicalJson(
      { status: "CONNECTED", businessId: result.businessId, environment: result.environment, reconnected: result.reconnected, next: result.next, landing },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true, requireActorType: "user" },
);
