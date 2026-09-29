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
import { applyProcessExecutionAction, getPersistedProcessTasks, persistProcessExecutionRoutes, retireResolvedDataGapTasks, isBusinessInWorkspace } from "@/services/owner-mode/process-execution-bridge.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { parseBusinessIdFromTaskKey } from "@/domain/owner-mode/process-execution-bridge";

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

const businessIdQuerySchema = z.string().trim().uuid().nullish();

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // D1 fix: business-scope the list when a businessId is supplied — matches the POST schema's
    // own businessId validation (line 35 below) so a malformed query param fails closed (400)
    // rather than reaching the DB as an invalid uuid. ctx.request is optional on
    // CanonicalAuthContext (some non-request-bound / test contexts omit it) — treat a missing
    // request as "no businessId supplied" rather than throwing.
    const businessIdParam = ctx.request ? new URL(ctx.request.url).searchParams.get("businessId") : null;
    const parsedBusinessId = businessIdQuerySchema.safeParse(businessIdParam);
    if (!parsedBusinessId.success) {
      return canonicalJson({ error: "Invalid businessId query parameter", code: "MISSING_INPUT" }, { status: 400 });
    }
    const tasks = await getPersistedProcessTasks(ctx.verifiedWorkspaceId, undefined, parsedBusinessId.data ?? null);
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
    //
    // ROOT-CAUSE FIX (fresh cockpit priority never materialised): most actions
    // (START/APPROVE/REJECT/DELEGATE/SUBMIT_EVIDENCE/COMPLETE/MARK_BLOCKED/REQUEST_MISSING_DATA/
    // ACKNOWLEDGE/RECORD_PROGRESS) never carry `input.businessId` — by design, see cockpit/page.tsx's
    // onAction doc comment: the actual task lookup below is taskKey+workspaceId only, so it doesn't
    // need one. But re-deriving with `input.businessId ?? null` for THIS materialisation step meant a
    // freshly-surfaced (never-before-persisted) PROCESS_CORRECTION/CASH_PROFIT route was recomputed for
    // businessId=null instead of whichever business the cockpit actually read it under — producing a
    // DIFFERENT, non-business-prefixed taskKey than the one the owner is acting on (these two families
    // embed businessId directly in the key; see bridgeCorrection/bridgeCashSignal). The exact task the
    // cockpit showed was therefore never created, and the lookup below always failed
    // NOT_FOUND_OR_FORBIDDEN — until some later action that DOES send businessId (e.g.
    // REQUEST_REASSESSMENT) happened to materialise it first.
    //
    // taskKey already canonically encodes the businessId these two families were computed for;
    // parseBusinessIdFromTaskKey recovers it so this step re-derives the SAME view the cockpit's own
    // read produced, without trusting a business the client didn't send. This changes ONLY which
    // routes get recomputed/persisted here — the taskKey lookup and businessId handling below (and
    // every existing guardrail: cross-workspace, defense-in-depth isolation, RECORD_OUTCOME/
    // VERIFY_OUTCOME/REQUEST_REASSESSMENT's own explicit businessId requirement) are unchanged.
    //
    // HOSTILE SAFETY CORRECTION: the embedded businessId is AUTHORITATIVE for a pc:/cp: taskKey — a
    // client-supplied businessId may match it or be absent, but must never override it. Letting the
    // client value win here (as an earlier version of this fix did) let a crafted request
    // (taskKey scoped to business A, businessId claiming business B) re-derive and PERSIST business
    // B's own execution routes via getOwnerNowView/persistProcessExecutionRoutes as a side effect —
    // cash/profit protection always emits MISSING_UNIT_ECONOMICS/PROFIT_DATA_INSUFFICIENT data-gap
    // routes for a business even with zero real financial data, so this is a real, persisted
    // cross-business materialisation, not just a wasted read. This happens BEFORE
    // applyProcessExecutionAction's own later taskKey lookup and defense-in-depth isolation check
    // (which already rejects this same mismatch — just too late to prevent the materialisation side
    // effect). Reject up front with that SAME NOT_FOUND_OR_FORBIDDEN code/message: not a new trust
    // boundary or a new public error shape, only moving the existing rejection earlier so it also
    // guards materialisation, not just the later lookup.
    const embeddedBusinessId = parseBusinessIdFromTaskKey(input.taskKey);
    if (embeddedBusinessId && input.businessId && input.businessId.toLowerCase() !== embeddedBusinessId.toLowerCase()) {
      return canonicalJson({ error: "Task not found in this workspace.", code: "NOT_FOUND_OR_FORBIDDEN" }, { status: 400 });
    }
    const materialisationBusinessId = embeddedBusinessId ?? input.businessId ?? null;
    // A businessId RECOVERED FROM THE TASKKEY must belong to THIS workspace before it can compute/
    // persist routes — closes the same class of gap for a taskKey crafted with a foreign
    // (different-workspace or nonexistent) business UUID. Scoped to embeddedBusinessId only (never a
    // purely client-supplied one with no taskKey embedding): a non-embedding family's explicit
    // businessId already gets its own, more specific WRONG_WORKSPACE/403 check downstream in
    // applyProcessExecutionAction — duplicating that here with this route's less-specific
    // NOT_FOUND_OR_FORBIDDEN/400 would regress that existing, more informative contract for no gain
    // (a foreign businessId is never authoritative for materialisation unless the taskKey itself
    // embeds it).
    if (embeddedBusinessId && !(await isBusinessInWorkspace(ctx.verifiedWorkspaceId, embeddedBusinessId))) {
      return canonicalJson({ error: "Task not found in this workspace.", code: "NOT_FOUND_OR_FORBIDDEN" }, { status: 400 });
    }
    const view = await getOwnerNowView(ctx.verifiedWorkspaceId, materialisationBusinessId);
    if (view.processExecution && view.processExecution.routes.length > 0) {
      await persistProcessExecutionRoutes(ctx.verifiedWorkspaceId, view.processExecution, ctx.verifiedActorId);
    }
    // Same authoritative view: retire this business's generated data-gap tasks it no longer emits (PROPOSED only).
    if (materialisationBusinessId) {
      await retireResolvedDataGapTasks(ctx.verifiedWorkspaceId, materialisationBusinessId, view.processExecution, {
        cashProfitEvaluated: view.cashProfitProtection !== null, triggeredByUserId: ctx.verifiedActorId,
      });
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
      // PR G: only ever present (and only ever true) for a VERIFY_OUTCOME response where
      // the verifying actor completed the task themselves AND no other eligible
      // independent verifier existed in the workspace. Never true for an ordinary
      // independent verification.
      selfVerified: r.selfVerified ?? null,
    }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
