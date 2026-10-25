/**
 * POST /api/owner/integrations/quickbooks/sync — "Refresh now" (OWNER_MANAGE). Body: { businessId }.
 * Enqueues the normal read-only `qbo-sync` task (idempotent per 5-minute bucket, so repeated clicks collapse) and runs it after
 * the response through the same scheduler. It never runs a diagnosis: refreshed figures mark the existing analysis out of date
 * and the owner re-runs the analysis deliberately.
 */
import { after } from "next/server";
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { NotFoundError } from "@/infra/errors";
import { db } from "@/lib/db";
import { parseRequestBody } from "@/lib/validation";
import { processQboSyncChain, requestQboSyncNow } from "@/services/quickbooks/qbo-sync-background";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** The after-response sync accelerator (qbo-sync-background) stays inside a 50 s budget; the cron drain finishes anything left. */
export const maxDuration = 60;

const bodySchema = z.strictObject({ businessId: z.guid() });

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, bodySchema);
    const conn = await db.qboConnection.findFirst({
      where: { workspaceId: ctx.verifiedWorkspaceId, businessId: body.businessId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!conn) throw new NotFoundError("QboConnection", body.businessId);
    const task = await requestQboSyncNow({ workspaceId: ctx.verifiedWorkspaceId, connectionId: conn.id });
    after(() => processQboSyncChain({ workspaceId: ctx.verifiedWorkspaceId, connectionId: conn.id, taskId: task.taskId }));
    return canonicalJson({ queued: true, alreadyRequested: !task.created }, { status: 202, headers: { "cache-control": "no-store" } });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true, requireActorType: "user" },
);
