/**
 * QuickBooks Online — owner integration surface.
 *
 * GET  /api/owner/integrations/quickbooks
 *      → { quickbooks: QuickBooksStatusDTO }   (OWNER_VIEW)
 * POST /api/owner/integrations/quickbooks     (OWNER_MANAGE)
 *      { action: "connect", businessId }      → { authorizeUrl }
 *      { action: "sync" }                     → { taskId, deduplicated }
 *      { action: "disconnect", confirm: true } → { quickbooks: QuickBooksStatusDTO }
 *
 * Workspace and actor come ONLY from the verified session (withCanonicalEnforcement);
 * businessId is verified to belong to that workspace inside the service. All
 * lifecycle decisions live in src/services/quickbooks/*; this route only
 * validates input and dispatches. No token material ever appears in a response.
 */
import { after } from "next/server";
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  getQuickBooksStatus,
  startQuickBooksConnect,
  disconnectQuickBooks,
} from "@/services/quickbooks/qbo-connection.service";
import { requestQuickBooksSync } from "@/services/quickbooks/qbo-sync.service";
import { drainQuickBooksSyncTask } from "@/services/quickbooks/qbo-sync-dispatch.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), businessId: z.string().uuid() }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("disconnect"), confirm: z.literal(true) }),
]);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const quickbooks = await getQuickBooksStatus({ workspaceId: ctx.verifiedWorkspaceId });
    return canonicalJson({ quickbooks }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, actionSchema);
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    if (input.action === "connect") {
      const { authorizeUrl } = await startQuickBooksConnect({ workspaceId, actorId, businessId: input.businessId });
      return canonicalJson({ authorizeUrl }, { status: 200 });
    }

    if (input.action === "sync") {
      const { taskId, deduplicated } = await requestQuickBooksSync({ workspaceId, actorId, trigger: "MANUAL" });
      after(() => drainQuickBooksSyncTask(taskId));
      return canonicalJson({ taskId, deduplicated }, { status: 202 });
    }

    await disconnectQuickBooks({ workspaceId, actorId });
    const quickbooks = await getQuickBooksStatus({ workspaceId });
    return canonicalJson({ quickbooks }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
