"use client";

/**
 * Owner Cockpit (PASS 36) — the canonical minimum owner-visible surface for the proven governed execution
 * loop. It reads GET /api/owner/now-view (the server-computed payload) and drives owner actions through
 * POST /api/owner/process-execution (applyProcessExecutionAction). No business logic, no duplicate backend:
 * the server re-derives + re-checks every action. Presentation + safety layout live in MinimumOwnerCockpit.
 *
 * Business-context decision (revised — see docs/opsiq-governance and the P0-4 Home/Finance
 * consistency fix): NO selector, by design — this page still has no visible business selector.
 * `processExecution` (the task bridge
 * this page drives START/action/progress against) is built via `buildProcessExecutionBridge(
 * processCorrections, cashProfitProtection, workspaceId, ...)` — workspace-scoped, not
 * businessId-scoped — and every mutation here is submitted by `taskKey` (POST
 * /api/owner/process-execution never sends a businessId; the server resolves task ownership from
 * the task record itself). That part is unchanged: it is a workspace-wide execution queue, the
 * same shape as /owner/tasks, and letting the owner "switch business" mid-task here would not
 * change which tasks are shown and could wrongly imply an in-flight task moved.
 *
 * BUT GET /api/owner/now-view's OTHER signals (cash, finance, business condition, retention) are
 * genuinely per-business, and a real human usability test proved that fetching now-view with no
 * businessId let it silently fall back to a workspace-wide "most recent row" — sometimes a stale
 * or different business's cash/finance state entirely (Home said "at risk" while Finance for the
 * active business said SAFE). This page now reads the shared ActiveBusinessContext and passes its
 * businessId to now-view so those signals resolve to the SAME business as every other owner page,
 * without adding a selector control or touching the workspace-wide task queue above.
 */

/* eslint-disable react-hooks/set-state-in-effect -- load() on mount is the intentional fetch-on-mount pattern used across the owner pages */
import { useCallback, useEffect, useState } from "react";
import { Button, CardDashboardSkeleton, EmptyState, PageHeader } from "@/ui/primitives";
import { useActiveBusiness } from "@/context/active-business-context";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { MinimumOwnerCockpit, type CockpitActionInput } from "@/components/owner/MinimumOwnerCockpit";
import { StartHereContinuationCard } from "@/components/owner/StartHereContinuationCard";
import type { ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";
import type { OwnerRecoveryStatusResponse } from "@/domain/owner-mode/owner-recovery-status";
import type { OwnerPublicSignalsResponse } from "@/domain/owner-mode/owner-public-signals";
import type { DerivedBusinessConditionSignals } from "@/services/business-condition/business-condition-profile.service";
import type { GoalAttentionSignal, PolicyAttentionSignal, EscalationAttentionItem, OwnerExecutionLifecycleView, BusinessOperatingSystemView } from "@/services/owner-guidance/owner-now-view.service";
import type { CockpitFinancePriority } from "@/services/owner-guidance/cockpit-finance-priority.service";
import type { DoNotRepeatAnnotation } from "@/services/owner-mode/do-not-repeat.service";
import type { ProfitLeakFinding } from "@/domain/owner-mode/profit-leak-radar";
import type { TrendAlert } from "@/domain/owner-mode/business-state-timeline";

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

interface AvoidItem { avoid?: string }

export default function OwnerCockpitPage() {
  const { activeBusinessId, needsBusinessRecovery, businesses, loading: contextLoading } = useActiveBusiness();
  const [bridge, setBridge] = useState<ProcessExecutionBridgeView | null>(null);
  const [avoid, setAvoid] = useState<string[]>([]);
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
  const [financeTopPriority, setFinanceTopPriority] = useState<CockpitFinancePriority | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (businessId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
      const data = await apiGet(`/api/owner/now-view${qs}`);
      setBridge((data.processExecution as ProcessExecutionBridgeView) ?? null);
      const avoidList = (data?.view?.actionsToAvoid as AvoidItem[] | undefined) ?? [];
      setAvoid(avoidList.map((a) => a.avoid ?? "").filter(Boolean));
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
      setFinanceTopPriority((data.financeTopPriority as CockpitFinancePriority) ?? null);
      // Read-only recovery status (best-effort; a failure here must not break the cockpit).
      const rec = await apiGet(`/api/owner/recovery-status${qs}`).catch(() => null);
      setRecovery(rec && typeof rec === "object" && "recoveryStatus" in rec ? (rec as OwnerRecoveryStatusResponse) : null);
      // Read-only outside signals (best-effort; a failure here must not break the cockpit).
      const sig = await apiGet(`/api/owner/public-signals${qs}`).catch(() => null);
      setPublicSignals(sig && typeof sig === "object" && "publicSignalStatus" in sig ? (sig as OwnerPublicSignalsResponse) : null);
    } catch (e) {
      setError(classifyOperatorError(e instanceof Error ? e : new Error("Failed to load"), { context: "load" }).operatorMessage);
    } finally {
      setLoading(false);
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
      const { ok, data } = await apiPost("/api/owner/process-execution", body);
      if (!ok) {
        setMessage(describeActionFailure(data, "We couldn't complete this action. Nothing was changed."));
      } else {
        setMessage(`Action applied — task is now ${String(data.status ?? "updated").toLowerCase()}.`);
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

  if (contextLoading) return <main className="p-6"><CardDashboardSkeleton label="Loading your business" sections={2} /></main>;

  // No business exists yet for this workspace. Never render a diagnosis/recommendation built
  // from workspace-wide fallback data for a business that doesn't exist — see the effect above.
  if (!needsBusinessRecovery && businesses.length === 0) {
    return (
      <main className="flex max-w-2xl flex-col gap-6 p-6">
        <PageHeader title="Home" description="How your business is doing, what needs your attention, and what to do next." />
        <EmptyState
          title="Set up your business to get your first assessment"
          description="OpsIQ needs at least one business on file before it can show you cash health, priorities, or recommendations. Add your business to get started."
          primaryAction={{ label: "Set up your business", href: "/owner/data" }}
        />
      </main>
    );
  }

  if (loading) return <main className="p-6"><CardDashboardSkeleton label="Loading your business" sections={2} /></main>;
  if (error) return (
    <main className="flex flex-col items-start gap-3 p-6">
      <p className="text-sm text-destructive">{error}</p>
      <Button onClick={() => void load(activeBusinessId)}>Retry</Button>
    </main>
  );

  return (
    <main className="flex max-w-2xl flex-col gap-6 p-6">
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
      <StartHereContinuationCard businessId={activeBusinessId} />
      {/* "Plan a new business" (Startup Mode) deliberately does NOT live on Home — a real
          usability test found a prominent entry point here confusing for an owner who already
          has a real business set up. It now lives on My Business (/owner/data) as a secondary
          link (src/components/owner/PlanNewBusinessLink.tsx), plus in the nav's Growth section. */}
      <MinimumOwnerCockpit
        bridge={bridge}
        actionsToAvoid={avoid}
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
        financeTopPriority={financeTopPriority}
        busy={busy}
      />
    </main>
  );
}
