"use client";

/**
 * Owner Cockpit (PASS 36) — the canonical minimum owner-visible surface for the proven governed execution
 * loop. It reads GET /api/owner/now-view (the server-computed payload) and drives owner actions through
 * POST /api/owner/process-execution (applyProcessExecutionAction). No business logic, no duplicate backend:
 * the server re-derives + re-checks every action. Presentation + safety layout live in MinimumOwnerCockpit.
 *
 * Business-context decision (revised — see docs/opsiq-governance, the P0-4 Home/Finance
 * consistency fix, the controlled-beta cockpit business-scoping fix / D-cockpit, and the
 * RECORD_OUTCOME/VERIFY_OUTCOME/REQUEST_REASSESSMENT businessId fixes folded into the WRITE
 * bullet below): NO selector, by design — this page still has no visible business selector.
 *
 * Read vs. write scoping of `processExecution` (the task bridge this page drives START/action/
 * progress against) are DIFFERENT and must not be conflated:
 *  - WRITE: most mutations (START/APPROVE/REJECT/DELEGATE/SUBMIT_EVIDENCE/COMPLETE/MARK_BLOCKED/
 *    REQUEST_MISSING_DATA/ACKNOWLEDGE/RECORD_PROGRESS) are still submitted by `taskKey` alone —
 *    POST /api/owner/process-execution does not send a businessId as the resolving key for these;
 *    the server resolves task ownership from the task record itself. That is unchanged and
 *    correct — it is why "switching business" mid-task never moves or hides an in-flight task
 *    the owner is actively working.
 *
 *    CORRECTION (fix/cockpit-record-outcome-businessid — this comment previously, and
 *    incorrectly, claimed the route "never sends a businessId" for every action; that stopped
 *    being universally true once Phase 3 added RECORD_OUTCOME): `RECORD_OUTCOME` IS REQUIRED
 *    server-side to carry a `businessId` (see `applyProcessExecutionAction`'s RECORD_OUTCOME
 *    branch in process-execution-bridge.service.ts, which returns `MISSING_INPUT` — a 400 —
 *    without one) so the recorded outcome can be attributed to a specific business.
 *    `REQUEST_REASSESSMENT` (fix/reassessment-businessid-wiring) has the identical server-side
 *    requirement — it opens an OwnerReassessmentEvent, a per-business record. `onAction()` below
 *    attaches the shared `activeBusinessId` to the POST body for exactly these actions
 *    (RECORD_OUTCOME, VERIFY_OUTCOME, REQUEST_REASSESSMENT) — never blanket-attached to every
 *    action; each action wires its own requirement in its own branch. VERIFY_OUTCOME does not
 *    strictly require businessId server-side but uses it, when present, to scope its best-effort
 *    post-verification reassessment side effect to the right business instead of falling back to
 *    the task's sourceFindingKey. This is safe to source from the page's shared
 *    `activeBusinessId` — not a per-task business id the client would otherwise have to track —
 *    because the execution-lifecycle items rendered here were themselves fetched from `now-view`
 *    scoped to that same `activeBusinessId` (see `buildExecutionLifecycle`'s businessId scoping),
 *    so a task offering these actions always either belongs to the active business or is a
 *    genuinely workspace-level task with no business of its own. The server independently
 *    re-validates that any supplied businessId belongs to the caller's workspace before using it
 *    (`businessInWorkspace` in process-execution-bridge.service.ts) and rejects a foreign one
 *    with `WRONG_WORKSPACE` — this client-side wiring is a convenience, never a trust boundary.
 *  - READ (what this page DISPLAYS as "Governed work you can start" / "Execution lifecycle"): `processExecution`
 *    is built from `processCorrections` + `cashProfitProtection` via `buildProcessExecutionBridge`.
 *    `cashProfitProtection` is genuinely per-business (arbitrated cash/finance state). But
 *    `processCorrections` (and the PASS23 workload/capability/SOP/training/effectiveness expansion
 *    families) are derived from a workspace-wide proof scan with NO per-business attribution at
 *    all — real human/live-production usability testing across 3 real businesses in one workspace
 *    (ZZ-TEST-FIELD-SERVICE / Trinity Services / ZZ-TEST-SANDBOX) proved that switching the active
 *    business left these two widgets stuck showing whichever business's evidence happened to
 *    dominate, while the finance diagnosis below correctly updated. This page now sends
 *    `restrictExecutionToBusiness=true` to now-view (see now-view/route.ts and
 *    GetOwnerNowViewOptions in owner-now-view.service.ts) so that, whenever the workspace holds
 *    more than one real business, only the genuinely business-attributable content (CASH_PROFIT /
 *    STARTUP_MODE) is shown as this business's own governed work / Execution lifecycle — never a
 *    workspace-wide finding mislabeled as belonging to whichever business is selected. A
 *    single-business workspace is unaffected (unambiguous by definition).
 *
 * GET /api/owner/now-view's OTHER signals (cash, finance, business condition, retention) are
 * genuinely per-business, and a real human usability test proved that fetching now-view with no
 * businessId let it silently fall back to a workspace-wide "most recent row" — sometimes a stale
 * or different business's cash/finance state entirely (Home said "at risk" while Finance for the
 * active business said SAFE). This page now reads the shared ActiveBusinessContext and passes its
 * businessId to now-view so those signals resolve to the SAME business as every other owner page,
 * without adding a selector control or touching the workspace-wide task queue above.
 *
 * Pending action forms vs. a business switch (controlled-beta hardening, independent of the
 * scoping fix above): this page has no business selector of its own, but `activeBusinessId` is
 * shared app-wide (ActiveBusinessContext) and every other owner page has a selector, so it CAN
 * change while this page stays mounted. `MinimumOwnerCockpit` renders every action as a local,
 * ephemeral inline form (the top-priority action's evidence/reason/delegate form, and each
 * execution-lifecycle item's own Phase 3 form) that is opened for a specific task and business
 * context and otherwise has no way to notice that context changed before the owner clicks
 * Confirm. `activeBusinessId` is passed down to `MinimumOwnerCockpit` here for exactly one
 * purpose — see its doc comment on `MinimumOwnerCockpitProps` — discarding any such open form the
 * instant it changes, so a switch never lets a stale form submit an action whose taskKey/business
 * context the owner is no longer looking at.
 */

/* eslint-disable react-hooks/set-state-in-effect -- load() on mount is the intentional fetch-on-mount pattern used across the owner pages */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, CardDashboardSkeleton, EmptyState, PageHeader, PageContainer } from "@/ui/primitives";
import { useActiveBusiness } from "@/context/active-business-context";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { MinimumOwnerCockpit, type CockpitActionInput } from "@/components/owner/MinimumOwnerCockpit";
import { StartHereContinuationCard } from "@/components/owner/StartHereContinuationCard";
import { OwnerDoNotRepeatPanel } from "@/components/owner/OwnerDoNotRepeatPanel";
import { OwnerAssessmentSummary } from "@/components/owner/OwnerAssessmentSummary";
import type { ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";
import type { OwnerRecoveryStatusResponse } from "@/domain/owner-mode/owner-recovery-status";
import type { OwnerPublicSignalsResponse } from "@/domain/owner-mode/owner-public-signals";
import type { DerivedBusinessConditionSignals } from "@/services/business-condition/business-condition-profile.service";
import type { GoalAttentionSignal, PolicyAttentionSignal, EscalationAttentionItem, OwnerExecutionLifecycleView, BusinessOperatingSystemView } from "@/services/owner-guidance/owner-now-view.service";
import type { CurrentOwnerDecision } from "@/domain/owner-spine/owner-decision";
import type { DoNotRepeatAnnotation } from "@/services/owner-mode/do-not-repeat.service";
import type { ProfitLeakFinding } from "@/domain/owner-mode/profit-leak-radar";
import type { TrendAlert } from "@/domain/owner-mode/business-state-timeline";
import { reconcileOwnerAssessment } from "@/domain/owner-guidance/owner-assessment-reconciliation";
import { composeOwnerAssessment, type OwnerAssessmentNarrative } from "@/domain/owner-guidance/owner-assessment-composer";
import type { OwnerNowView } from "@/domain/owner-guidance/guidance-orchestrator";

const FETCH_TIMEOUT_MS = 10_000;

async function apiGet(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Request timed out after 10 seconds.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/**
 * Owner-safe message for a failed action, whether it came back as a non-ok response body or as a
 * thrown exception. A real human usability test reported seeing raw internal error text on Start
 * Work and other cockpit actions; the previous code here rendered `data?.error?.message ||
 * data?.error?.code || data?.error` (or a caught exception's raw `.message`) directly, with no
 * governance. This routes every action-failure message here through the same
 * classifyOperatorError system CreateBusinessPanel already uses, so the owner never sees a raw
 * server error string, an error code, or a JS exception message verbatim.
 *
 * classifyOperatorError's own generic catch-all for an unrecognized message ("Couldn't process
 * this action. Please try again.") is honest but weaker than what the mission specifies ("We
 * couldn't start this action. Nothing was changed."). Since the server's own calm fallback text
 * (see canonical-route-enforcement.ts) also doesn't match any of classifyOperatorError's specific
 * patterns, it would otherwise silently fall through to that generic text and this function's
 * caller-supplied, action-specific fallback would never actually be shown. Substitute the
 * fallback back in for exactly that one generic case, while still deferring to
 * classifyOperatorError's more specific classifications (network/permission/validation/timeout).
 */
const GENERIC_ACTION_DEFAULT = "Couldn't process this action. Please try again.";

// Verified against the ProcessExecutionTask.status literals produced by
// applyProcessExecutionAction (src/services/owner-mode/process-execution-bridge.service.ts).
// Lowercase phrases for embedding in "task is now {phrase}." -- `.toLowerCase()` alone does not
// humanize an underscored value like "OUTCOME_RECORDED" into "outcome recorded".
const PROCESS_TASK_STATUS_PHRASE: Record<string, string> = {
  PROPOSED: "proposed",
  ACKNOWLEDGED: "acknowledged",
  IN_PROGRESS: "in progress",
  APPROVED: "approved",
  REJECTED: "rejected",
  BLOCKED: "blocked",
  NEEDS_DATA: "needs data",
  OUTCOME_RECORDED: "outcome recorded",
  OUTCOME_VERIFIED: "outcome verified",
  COMPLETED: "completed",
};

function describeActionFailure(raw: { error?: unknown } | undefined, fallback: string): string {
  const serverText =
    typeof raw?.error === "string" ? raw.error
      : typeof (raw?.error as { message?: unknown })?.message === "string" ? (raw!.error as { message: string }).message
      : undefined;
  const governed = classifyOperatorError(new Error(serverText ?? fallback), { context: "action" });
  return governed.operatorMessage === GENERIC_ACTION_DEFAULT ? fallback : governed.operatorMessage;
}

function describeThrownFailure(e: unknown, fallback: string): string {
  const governed = classifyOperatorError(e instanceof Error ? e : new Error(fallback), { context: "action" });
  return governed.operatorMessage === GENERIC_ACTION_DEFAULT ? fallback : governed.operatorMessage;
}

interface AvoidItem { avoid?: string; conditionOn?: string[] }

export default function OwnerCockpitPage() {
  const { activeBusinessId, needsBusinessRecovery, businesses, loading: contextLoading } = useActiveBusiness();
  const [bridge, setBridge] = useState<ProcessExecutionBridgeView | null>(null);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [stepConditions, setStepConditions] = useState<string[]>([]);
  const [recovery, setRecovery] = useState<OwnerRecoveryStatusResponse | null>(null);
  const [publicSignals, setPublicSignals] = useState<OwnerPublicSignalsResponse | null>(null);
  const [businessCondition, setBusinessCondition] = useState<DerivedBusinessConditionSignals | null>(null);
  const [dataFreshnessWeak, setDataFreshnessWeak] = useState<boolean>(false);
  const [goalAttentionSignal, setGoalAttentionSignal] = useState<GoalAttentionSignal | null>(null);
  const [topProfitLeak, setTopProfitLeak] = useState<ProfitLeakFinding | null>(null);
  const [policyAttentionSignal, setPolicyAttentionSignal] = useState<PolicyAttentionSignal | null>(null);
  const [trendAlerts, setTrendAlerts] = useState<TrendAlert[] | null>(null);
  const [doNotRepeatAnnotation, setDoNotRepeatAnnotation] = useState<DoNotRepeatAnnotation | null>(null);
  const [activeEscalations, setActiveEscalations] = useState<EscalationAttentionItem[] | null>(null);
  const [executionLifecycle, setExecutionLifecycle] = useState<OwnerExecutionLifecycleView | null>(null);
  const [businessOperatingSystem, setBusinessOperatingSystem] = useState<BusinessOperatingSystemView | null>(null);
  const [ownerDecision, setOwnerDecision] = useState<CurrentOwnerDecision | null>(null);
  // UX-03: the canonical owner-facing assessment (OwnerNowView -> reconcileOwnerAssessment ->
  // composeOwnerAssessment). Cleared at the start of every load() (below) so a business switch
  // never leaves the previous business's assessment visible while the new one is loading, and so
  // an error never renders alongside a stale assessment -- see load()'s own doc comment for the
  // generation-guard mechanism this participates in.
  const [assessmentNarrative, setAssessmentNarrative] = useState<OwnerAssessmentNarrative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // HOME BUSINESS-CONTEXT LEAK FIX (forensic remediation, live-proven across 3 real businesses in
  // one workspace: ZZ-TEST-FIELD-SERVICE -> Trinity Services -> ZZ-TEST-SANDBOX).
  //
  // ROOT CAUSE: `load()` had no request-generation guard. Every call fires
  // `Promise.all([now-view, recovery-status, public-signals])` for whichever `businessId` was
  // active at call time, and unconditionally commits the result on resolution. If the active
  // business changes while an OLDER load() for a DIFFERENT business is still in flight, and that
  // older request happens to resolve AFTER the newer one (a normal, unpredictable race on the
  // network — nothing guarantees request/response ordering), its stale response silently
  // overwrote the correctly-rendered newer business's `bridge`/`executionLifecycle`/
  // `ownerDecision` state — with no error and no visible loading transition, since the
  // loading skeleton had already been dismissed by the newer, faster request. The header (driven
  // directly by ActiveBusinessContext, never by this response) stayed correct throughout, which is
  // exactly why the live report saw a correct header alongside stale cockpit widgets. A stale
  // REJECTION had the same hazard in the other direction: it could overwrite an already-successful
  // newer render with an error/Retry screen.
  //
  // Server-side now-view scoping for businessId+restrictExecutionToBusiness is already proven
  // correct by real-Postgres tests (cockpit-business-scoping.db.test.ts's suppress=true A/B/C
  // isolation + CASH_PROFIT-attribution tests; owner-decision-consolidation.db.test.ts's business-
  // switch isolation test) — this is a pure client-side async race, not a server defect.
  //
  // FIX: a monotonically increasing generation number (a ref, not state, so incrementing it never
  // itself triggers a render) is stamped at the start of every load() call. Every state commit —
  // the successful result, a thrown error, and the `loading` flag itself — is guarded by "is this
  // still the latest generation?" immediately before it runs. A stale response (success or
  // failure) arriving after a newer load() has started is a correctly detected no-op: it can
  // never turn `loading` back on/off for a request that's no longer current, and it can never
  // overwrite state a newer, current request already rendered.
  const loadGenerationRef = useRef(0);
  // The business currently shown: a change recorded for a business the owner has since switched away from
  // never reloads that business's decision over the current one.
  const activeBusinessIdRef = useRef(activeBusinessId);
  useEffect(() => {
    activeBusinessIdRef.current = activeBusinessId;
  }, [activeBusinessId]);

  const load = useCallback(async (businessId: string | null) => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setError(null);
    // UX-03: never let the previous business's assessment linger while this new load is in
    // flight or if it fails -- it is only re-set below, inside the generation guard, on success.
    setAssessmentNarrative(null);
    try {
      // restrictExecutionToBusiness=true (sent here and by /owner/priorities — see now-view/route.ts's doc comment)
      // closes the cockpit business-scoping bug where switching the active business changed the
      // finance diagnosis but left the governed work / Execution lifecycle stuck on whichever business's
      // workspace-wide process-intelligence evidence happened to dominate. It has no effect without a
      // businessId, and no effect at all in a single-business workspace (see
      // GetOwnerNowViewOptions' doc comment in owner-now-view.service.ts).
      const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}&restrictExecutionToBusiness=true` : "";
      // now-view / recovery-status / public-signals each depend only on businessId, not on one
      // another's response -- they were previously three sequential awaits (a measured request
      // waterfall). recovery-status and public-signals keep their existing best-effort
      // `.catch(() => null)` isolation so a failure there still cannot fail the whole page; a
      // now-view failure still propagates and is still page-fatal, exactly as before.
      const [data, rec, sig] = await Promise.all([
        apiGet(`/api/owner/now-view${qs}`),
        apiGet(`/api/owner/recovery-status${qs}`).catch(() => null),
        apiGet(`/api/owner/public-signals${qs}`).catch(() => null),
      ]);
      // A newer load() has since started (the active business changed again while this request
      // was in flight) — this response is stale and must never commit. See this function's own
      // doc comment above for the full mechanism.
      if (loadGenerationRef.current !== generation) return;
      setBridge((data.processExecution as ProcessExecutionBridgeView) ?? null);
      const avoidList = (data?.view?.actionsToAvoid as AvoidItem[] | undefined) ?? [];
      // A rule the shared reconciler turned into a condition on a canonical step is guidance on how to
      // carry that step out — never listed under "Blocked / not allowed".
      setAvoid(avoidList.filter((a) => !a.conditionOn).map((a) => a.avoid ?? "").filter(Boolean));
      setStepConditions(avoidList.filter((a) => a.conditionOn).map((a) => a.avoid ?? "").filter(Boolean));
      setBusinessCondition((data.derivedBusinessCondition as DerivedBusinessConditionSignals) ?? null);
      setDataFreshnessWeak((data?.view as { confidenceCapped?: boolean } | undefined)?.confidenceCapped ?? false);
      setGoalAttentionSignal((data.goalAttentionSignal as GoalAttentionSignal) ?? null);
      setTopProfitLeak((data.topProfitLeak as ProfitLeakFinding) ?? null);
      setPolicyAttentionSignal((data.policyAttentionSignal as PolicyAttentionSignal) ?? null);
      setTrendAlerts(Array.isArray(data.trendAlerts) ? (data.trendAlerts as TrendAlert[]) : null);
      setDoNotRepeatAnnotation((data.doNotRepeatAnnotation as DoNotRepeatAnnotation) ?? null);
      setActiveEscalations(Array.isArray(data.activeEscalations) ? (data.activeEscalations as EscalationAttentionItem[]) : null);
      setExecutionLifecycle((data.executionLifecycle as OwnerExecutionLifecycleView) ?? null);
      setBusinessOperatingSystem((data.businessOperatingSystem as BusinessOperatingSystemView) ?? null);
      // The ONE canonical owner decision (server-resolved; same object Home/Priorities render).
      const decision = (data.ownerDecision as CurrentOwnerDecision | null | undefined) ?? null;
      setOwnerDecision(decision);
      // UX-03: build the canonical owner-facing assessment from THIS response's own OwnerNowView
      // (`data.view`) and condition detail (`data.derivedBusinessCondition`) -- never from
      // `activeBusinessId` (the server response's own businessId is the canonical source; see
      // reconcileOwnerAssessment's doc comment) and never re-derived from any other signal. Pure
      // mapping only: reconcileOwnerAssessment -> composeOwnerAssessment, no logic added here.
      const view = data.view as OwnerNowView | undefined;
      if (view) {
        const canonicalAssessment = reconcileOwnerAssessment({
          businessId: view.businessId,
          classification: view.classification,
          confidence: view.confidence,
          confidenceCapped: view.confidenceCapped,
          missingDataRequests: view.missingDataRequests,
          businessHealth: view.businessHealth,
          cashDangerStatus: view.cashDangerStatus,
          profitLeakStatus: view.profitLeakStatus,
          staffOverloadStatus: view.staffOverloadStatus,
          ownerOverloadStatus: view.ownerOverloadStatus,
          qualityFailureStatus: view.qualityFailureStatus,
          customerRetentionStatus: view.customerRetentionStatus,
          supplierInventoryStatus: view.supplierInventoryStatus,
          capacityStatus: view.capacityStatus,
          growthReadinessStatus: view.growthReadinessStatus,
          topOwnerActions: view.topOwnerActions,
          urgentRisks: view.urgentRisks,
          canonicalPrimaryClass: decision?.primaryConcernClass ?? null,
          conditionDimensions: (data.derivedBusinessCondition as DerivedBusinessConditionSignals) ?? null,
        });
        setAssessmentNarrative(composeOwnerAssessment(canonicalAssessment));
      }
      // Read-only recovery status (best-effort; a failure here must not break the cockpit).
      setRecovery(rec && typeof rec === "object" && "recoveryStatus" in rec ? (rec as OwnerRecoveryStatusResponse) : null);
      // Read-only outside signals (best-effort; a failure here must not break the cockpit).
      setPublicSignals(sig && typeof sig === "object" && "publicSignalStatus" in sig ? (sig as OwnerPublicSignalsResponse) : null);
    } catch (e) {
      // A stale failure (e.g. a slow request for a business the owner already switched away from
      // timing out or erroring) must never clobber an already-successful, current render with an
      // error/Retry screen.
      if (loadGenerationRef.current !== generation) return;
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to load"), { context: "load" }).operatorMessage);
    } finally {
      // A stale request's completion must never toggle the loading flag for a request that's no
      // longer current — it could otherwise dismiss the skeleton for a newer request still in
      // flight, or (harmlessly but pointlessly) re-set an already-false flag.
      if (loadGenerationRef.current === generation) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contextLoading) return;
    // A pending business-recovery choice must never be silently resolved by rendering
    // workspace-wide-fallback business signals as if they belonged to a resolved business —
    // see ActiveBusinessContext.needsBusinessRecovery.
    if (needsBusinessRecovery) return;
    // No real business exists yet for this workspace (activeBusinessId is legitimately null, not
    // a recovery case). A real human usability test found that calling now-view anyway still
    // rendered a full business diagnosis (cash/finance findings, "blocked: do not pursue growth",
    // business condition, execution lifecycle...) built from a workspace-wide fallback query, even
    // though no business-specific evidence exists yet. NO VALID OWNER BUSINESS => NO
    // BUSINESS-SPECIFIC DIAGNOSIS: skip the fetch entirely and render the onboarding state below.
    if (businesses.length === 0) { setLoading(false); return; }
    void load(activeBusinessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the shared context resolves or the owner switches business elsewhere, not on every `load` identity change
  }, [contextLoading, activeBusinessId, needsBusinessRecovery, businesses.length]);

  const onAction = useCallback(async (taskKey: string, action: string, input: CockpitActionInput) => {
    setBusy(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { taskKey, action };
      if (input.evidenceRefs?.length) body.evidenceRefs = input.evidenceRefs;
      if (input.reason) body.reason = input.reason;
      if (input.delegateToRole) body.delegateToRole = input.delegateToRole;
      // Phase 3 action fields
      if (input.progressPct != null) body.progressPct = input.progressPct;
      if (input.stage) body.stage = input.stage;
      if (input.outcomeStatus) body.outcomeStatus = input.outcomeStatus;
      // RECORD_OUTCOME requires a businessId server-side (applyProcessExecutionAction returns
      // MISSING_INPUT/400 without one) so the recorded outcome can be attributed to a business;
      // VERIFY_OUTCOME doesn't require it but uses it, when present, to correctly scope its
      // best-effort post-verification reassessment side effect. See the doc comment at the top of
      // this file for why `activeBusinessId` is the right, server-revalidated value to send here.
      // Scoped to just these two actions -- not attached to every action -- because other actions
      // reach tasks via a bare taskKey and the service's defense-in-depth business-isolation guard
      // (process-execution-bridge.service.ts) would incorrectly reject a task whose own businessId
      // happens to differ from whatever is currently active.
      if ((action === "RECORD_OUTCOME" || action === "VERIFY_OUTCOME") && activeBusinessId) {
        body.businessId = activeBusinessId;
      }
      // REQUEST_REASSESSMENT-only: the server requires businessId unconditionally for this action
      // (see this file's header comment) — attach it from the same active-business source as this
      // page's own reads. No other action gets a businessId here; each action wires its own
      // requirement in its own branch, never a shared blanket attachment.
      if (action === "REQUEST_REASSESSMENT" && activeBusinessId) body.businessId = activeBusinessId;
      const { ok, data } = await apiPost("/api/owner/process-execution", body);
      if (!ok) {
        setMessage(describeActionFailure(data, "We couldn't complete this action. Nothing was changed."));
      } else if (action === "REQUEST_REASSESSMENT") {
        // REQUEST_REASSESSMENT never changes task.status (the server returns the task's unchanged
        // status alongside the new reassessmentId — see applyProcessExecutionAction's
        // REQUEST_REASSESSMENT branch), so the generic "task is now {status}" phrase below said
        // something unrelated to what the owner just did (e.g. "task is now completed") and gave no
        // indication the reassessment itself succeeded. A live acceptance test confirmed the owner
        // saw no clear confirmation after a real 200 response.
        setMessage("Reassessment requested.");
        await load(activeBusinessId);
      } else {
        const rawStatus = String(data.status ?? "updated");
        setMessage(`Action applied — task is now ${PROCESS_TASK_STATUS_PHRASE[rawStatus] ?? rawStatus.toLowerCase()}.`);
        await load(activeBusinessId);
      }
    } catch (e) {
      setMessage(describeThrownFailure(e, "We couldn't complete this action. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }, [load, activeBusinessId]);

  const onStartWork = useCallback(async (taskKey: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const { ok, data } = await apiPost("/api/owner/process-execution", { taskKey, action: "START" });
      if (!ok) {
        setMessage(describeActionFailure(data, "We couldn't start this action. Nothing was changed."));
      } else {
        setMessage("Work started.");
        await load(activeBusinessId);
      }
    } catch (e) {
      setMessage(describeThrownFailure(e, "We couldn't start this action. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }, [load, activeBusinessId]);

  const onBosAction = useCallback(async (action: string, payload: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      let result: { ok: boolean; data: unknown };
      if (action === "run-arbitration") {
        result = await apiPost("/api/owner/goal-arbitration", {});
      } else if (action === "override") {
        result = await apiPost("/api/owner/override-arbitration", payload);
      } else if (action === "constraint") {
        result = await apiPost("/api/owner/constraints", payload);
      } else {
        setMessage(`Unknown BOS action: ${action}`);
        return;
      }
      if (!result.ok) {
        setMessage(describeActionFailure(result.data as { error?: unknown }, "We couldn't complete this action. Nothing was changed."));
      } else {
        setMessage(`${action === "run-arbitration" ? "Arbitration complete" : action === "override" ? "Override recorded" : "Constraint updated"}.`);
        await load(activeBusinessId);
      }
    } catch (e) {
      setMessage(describeThrownFailure(e, "We couldn't complete this action. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }, [load, activeBusinessId]);

  const onAcknowledgeEscalation = useCallback(async (escalationId: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const { ok, data } = await apiPost("/api/escalation/acknowledge", { escalationId });
      if (!ok) {
        setMessage(describeActionFailure(data, "We couldn't acknowledge this escalation. Nothing was changed."));
      } else {
        setMessage("Escalation acknowledged.");
        await load(activeBusinessId);
      }
    } catch (e) {
      setMessage(describeThrownFailure(e, "We couldn't acknowledge this escalation. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }, [load, activeBusinessId]);

  if (contextLoading) return <PageContainer narrow><CardDashboardSkeleton label="Loading your business" sections={2} /></PageContainer>;

  // No business exists yet for this workspace. Never render a diagnosis/recommendation built
  // from workspace-wide fallback data for a business that doesn't exist — see the effect above.
  if (!needsBusinessRecovery && businesses.length === 0) {
    return (
      <PageContainer narrow className="flex flex-col gap-6">
        <PageHeader title="Home" description="How your business is doing, what needs your attention, and what to do next." />
        <EmptyState
          title="Set up your business to get your first assessment"
          description="OpsIQ needs at least one business on file before it can show you cash health, priorities, or recommendations. Add your business to get started."
          primaryAction={{ label: "Set up your business", href: "/owner/data" }}
        />
      </PageContainer>
    );
  }

  // P1-A: StartHereContinuationCard drives its own two calls (onboarding, process-execution,
  // already fan-out via Promise.all inside it) and needs only `businessId` -- it never depended
  // on `load()`'s now-view/recovery-status/public-signals data. It previously lived only in the
  // branch below this `loading` check, so React fully unmounted/remounted it (and so restarted
  // its fetches) on every loading -> loaded transition, and its calls never started until this
  // page's own three calls had already finished -- a mount-order waterfall on top of the fetch
  // waterfall fixed in `load()` above. Rendering it once, unconditionally, at a stable position
  // keeps it mounted (and its own fetch running) across that transition so all five calls this
  // page depends on genuinely overlap on the wire.
  return (
    <PageContainer narrow className="flex flex-col gap-6">
      <PageHeader
        title="Home"
        description="How your business is doing, what needs your attention, and what to do next."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load(activeBusinessId)} disabled={busy}>
            Refresh
          </Button>
        }
      />
      {message && <p data-testid="cockpit-message" className="text-sm text-muted-foreground">{message}</p>}
      {loading ? (
        <CardDashboardSkeleton label="Loading your business" sections={2} />
      ) : error ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button onClick={() => void load(activeBusinessId)}>Retry</Button>
        </div>
      ) : (
        <>
          {/* "Plan a new business" (Startup Mode) deliberately does NOT live on Home — a real
              usability test found a prominent entry point here confusing for an owner who already
              has a real business set up. It now lives on My Business (/owner/data) as a secondary
              link (src/components/owner/PlanNewBusinessLink.tsx), plus in the nav's Growth section. */}
          <MinimumOwnerCockpit
            bridge={bridge}
            actionsToAvoid={avoid}
            stepConditions={stepConditions}
            recovery={recovery}
            publicSignals={publicSignals}
            businessCondition={businessCondition}
            dataFreshnessWeak={dataFreshnessWeak}
            goalAttentionSignal={goalAttentionSignal}
            topProfitLeak={topProfitLeak}
            policyAttentionSignal={policyAttentionSignal}
            trendAlerts={trendAlerts}
            doNotRepeatAnnotation={doNotRepeatAnnotation}
            activeEscalations={activeEscalations}
            onAction={onAction}
            onStartWork={onStartWork}
            onAcknowledgeEscalation={onAcknowledgeEscalation}
            executionLifecycle={executionLifecycle}
            businessOperatingSystem={businessOperatingSystem}
            onBosAction={onBosAction}
            ownerDecision={ownerDecision}
            hasBusiness={contextLoading || businesses.length > 0}
            activeBusinessId={activeBusinessId}
            busy={busy}
          />
        </>
      )}
      {/* The condition summary is context for the canonical main target (rendered inside the cockpit
          above), so it follows it and never reads as the first headline. */}
      {!loading && !error && assessmentNarrative && <OwnerAssessmentSummary narrative={assessmentNarrative} />}
      {/* The do-not-repeat rules and the owner's changed-context override (the main target's DNR blocker
          routes here); a recorded change reloads the canonical decision. */}
      <OwnerDoNotRepeatPanel
        businessId={activeBusinessId}
        focusRuleId={doNotRepeatAnnotation && (doNotRepeatAnnotation.holdsBackTarget || doNotRepeatAnnotation.issueStaysOpen) ? doNotRepeatAnnotation.ruleId ?? null : null}
        onChanged={(changedBusinessId) => { if (changedBusinessId === activeBusinessIdRef.current) void load(changedBusinessId); }} />
      {/* Setup continuation is secondary to the canonical main target, so it renders after it. */}
      <StartHereContinuationCard businessId={activeBusinessId} />
    </PageContainer>
  );
}
