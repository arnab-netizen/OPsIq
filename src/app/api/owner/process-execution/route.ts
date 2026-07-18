/**
 * Owner process-execution affordances (PASS 22 / Phase 3).
 *
 * GET  /api/owner/process-execution — list the workspace's persisted ProcessExecutionTask rows (view).
 * POST /api/owner/process-execution — apply a governed interactive action to one task
 *   (start / approve / reject / delegate / submit_evidence / complete / request_reassessment /
 *    mark_blocked / request_missing_data /
 *    acknowledge / record_progress / record_outcome / verify_outcome).   ← Phase 3 additions
 *
 * Server-authoritative and fail-closed: workspace + actor come from the verified session; OWNER_MANAGE is
 * required; the pure service enforces every guardrail (owner-only material decisions, evidence-gated
 * completion, no unsafe delegate, terminal/impossible transitions rejected, separation of duty for
 * VERIFY_OUTCOME) and writes an audit event on every transition. This route NEVER contacts a customer,
 * submits a tender, spends, signs, or touches payroll.
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
    // Phase 3 additions
    "ACKNOWLEDGE", "RECORD_PROGRESS", "RECORD_OUTCOME", "VERIFY_OUTCOME",
  ]),
  businessId: z.string().trim().uuid().nullish(),
  evidenceRefs: z.array(z.string().trim().min(1).max(2000)).max(20).optional(),
  reason: z.string().trim().max(2000).nullish(),
  delegateToRole: z.enum(["MANAGER", "STAFF"]).nullish(),
  outcomeNotes: z.string().trim().max(2000).nullish(),
  // Phase 3 fields
  progressPct: z.number().int().min(0).max(100).nullish(),
  stage: z.string().trim().max(200).nullish(),
  outcomeStatus: z.enum([
    "worked", "partially_worked", "did_not_work", "made_worse",
    "not_measurable", "too_early_to_judge", "invalid_test",
    "executed_differently", "external_event_interference",
  ]).nullish(),
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
    // Server-authoritative role: this route is OWNER_MANAGE-gated (a non-owner-capable actor is already
    // rejected at the wrapper with 403), so an actor who reaches here holds owner-manage authority and acts as
    // the owner. Derive the role from the VERIFIED capability set — never from a client-supplied / phantom
    // snapshot field — so owner-only transitions (approve/complete) are authorized by proven capability. (PASS 25)
    const actorRole = ctx.verifiedCapabilities.has(CAPABILITIES.OWNER_MANAGE) ? "owner" : null;
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
      progressPct: input.progressPct ?? null,
      stage: input.stage ?? null,
      outcomeStatus: input.outcomeStatus ?? null,
    });
    // WRONG_WORKSPACE and UNAUTHORIZED map to 403; all other failures are 400.
    if (!r.ok) {
      const status = r.code === "WRONG_WORKSPACE" || r.code === "UNAUTHORIZED" ? 403 : 400;
      return canonicalJson({ error: r.reason, code: r.code }, { status });
    }
    return canonicalJson({
      taskId: r.taskId,
      status: r.status,
      reassessmentId: r.reassessmentId ?? null,
      outcomeId: r.outcomeId ?? null,
      progressRecordId: r.progressRecordId ?? null,
      verificationClassification: r.verificationClassification ?? null,
    }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
