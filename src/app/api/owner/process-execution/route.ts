/**
 * Owner process-execution affordances (PASS 22).
 *
 * GET  /api/owner/process-execution — list the workspace's persisted ProcessExecutionTask rows (view).
 * POST /api/owner/process-execution — apply a governed interactive action to one task
 *   (start / approve / reject / delegate / submit_evidence / complete / request_reassessment /
 *    mark_blocked / request_missing_data).
 *
 * Server-authoritative and fail-closed: workspace + actor come from the verified session; OWNER_MANAGE is
 * required; the pure service enforces every guardrail (owner-only material decisions, evidence-gated
 * completion, no unsafe delegate, terminal/impossible transitions rejected) and writes an audit event on
 * every transition. This route NEVER contacts a customer, submits a tender, spends, signs, or touches payroll.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { applyProcessExecutionAction, getPersistedProcessTasks, persistProcessExecutionRoutes } from "@/services/owner-mode/process-execution-bridge.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  taskKey: z.string().trim().min(1).max(400),
  action: z.enum([
    "START", "APPROVE", "REJECT", "DELEGATE", "SUBMIT_EVIDENCE", "COMPLETE",
    "REQUEST_REASSESSMENT", "MARK_BLOCKED", "REQUEST_MISSING_DATA",
  ]),
  businessId: z.string().trim().uuid().nullish(),
  evidenceRefs: z.array(z.string().trim().min(1).max(2000)).max(20).optional(),
  reason: z.string().trim().max(2000).nullish(),
  delegateToRole: z.enum(["MANAGER", "STAFF"]).nullish(),
  outcomeNotes: z.string().trim().max(2000).nullish(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const tasks = await getPersistedProcessTasks(ctx.verifiedWorkspaceId);
    return canonicalJson({ tasks }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const actorRole = (ctx.verifiedSessionSnapshot as { role?: string } | undefined)?.role ?? null;
    // Server-authoritative materialisation: re-derive the bridge routes on the server and persist them
    // (idempotent) so the task the owner is acting on is the SERVER's governed route — the client never
    // supplies route fields, so a crafted request can't downgrade an approval level or bypass a guardrail.
    const view = await getOwnerNowView(ctx.verifiedWorkspaceId, input.businessId ?? null);
    if (view.processExecution && view.processExecution.routes.length > 0) {
      await persistProcessExecutionRoutes(ctx.verifiedWorkspaceId, view.processExecution, ctx.verifiedActorId);
    }
    const r = await applyProcessExecutionAction({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      actorRole,
      taskKey: input.taskKey,
      action: input.action,
      businessId: input.businessId ?? null,
      evidenceRefs: input.evidenceRefs,
      reason: input.reason ?? null,
      delegateToRole: input.delegateToRole ?? null,
      outcomeNotes: input.outcomeNotes ?? null,
    });
    if (!r.ok) return canonicalJson({ error: r.reason }, { status: 400 });
    return canonicalJson({ taskId: r.taskId, status: r.status, reassessmentId: r.reassessmentId ?? null }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
