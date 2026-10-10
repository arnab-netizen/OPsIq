/**
 * POST /api/owner/integrations/quickbooks/sync — start a READ-ONLY QuickBooks synchronization (OWNER_MANAGE, human).
 *
 * Body: { businessId, connectionId, requestId? } and nothing else (strict). Workspace and actor come ONLY from the
 * canonical session context. There is no field for tokens, realm, environment, base URL, workspace or actor: those are
 * server-controlled, and an extra key is rejected. The connection must belong to the session's workspace AND the stated
 * business; anything else reads as "not found". The sync issues GET requests to QuickBooks only — it makes zero write
 * requests to QuickBooks. A concurrent run returns 409 BUSY; repeating a requestId replays the same run.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { QboManualSyncRequestSchema } from "@/domain/quickbooks/qbo-sync-model";
import { mapSyncOutcome } from "@/domain/quickbooks/qbo-sync-outcomes";
import { runQboReadSync } from "@/services/quickbooks/qbo-sync.service";
import { QBO_SCHEDULED_EXECUTION_DEADLINE_MS, enqueueQboSyncContinuation } from "@/infra/scheduler-handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, QboManualSyncRequestSchema);
    const outcome = await runQboReadSync(
      {
        workspaceId: ctx.verifiedWorkspaceId, businessId: body.businessId, connectionId: body.connectionId,
        trigger: "MANUAL", actorId: ctx.verifiedActorId, requestId: body.requestId ?? null,
      },
      { env: process.env, deadlineMs: QBO_SCHEDULED_EXECUTION_DEADLINE_MS },
    );
    // A large sync stops at a durable checkpoint inside this request; the rest runs as scheduled follow-up executions.
    if (outcome.status === "CONTINUING") {
      // Progress is already durable: a failure to queue the follow-up must not turn this accepted response into a 500 (the daily
      // producer re-queues the checkpoint under a day-scoped key).
      await enqueueQboSyncContinuation({ workspaceId: ctx.verifiedWorkspaceId, connectionId: body.connectionId, continuationKey: outcome.continuationKey }).catch(() => undefined);
    }
    const mapped = mapSyncOutcome(outcome);
    return canonicalJson(mapped.body, { status: mapped.httpStatus, headers: { "cache-control": "no-store" } });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true, requireActorType: "user" },
);
