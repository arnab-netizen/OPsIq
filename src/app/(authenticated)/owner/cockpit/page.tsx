"use client";

/**
 * Owner Cockpit (PASS 36) — the canonical minimum owner-visible surface for the proven governed execution
 * loop. It reads GET /api/owner/now-view (the server-computed payload) and drives owner actions through
 * POST /api/owner/process-execution (applyProcessExecutionAction). No business logic, no duplicate backend:
 * the server re-derives + re-checks every action. Presentation + safety layout live in MinimumOwnerCockpit.
 *
 * Business-context decision (revised — see docs/opsiq-governance and the P0-4 Home/Finance
 * consistency fix): this page still has NO visible selector — `processExecution` (the task bridge
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
import { Button, CardDashboardSkeleton, Modal, PageHeader } from "@/ui/primitives";
import { useActiveBusiness } from "@/context/active-business-context";
import { MinimumOwnerCockpit, type CockpitActionInput } from "@/components/owner/MinimumOwnerCockpit";
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

interface AvoidItem { avoid?: string }

export default function OwnerCockpitPage() {
  const { activeBusiness, activeBusinessId, needsBusinessRecovery, loading: contextLoading } = useActiveBusiness();
  const [startupModeConfirmOpen, setStartupModeConfirmOpen] = useState(false);
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
      setError(e instanceof Error ? e.message : "Failed to load");
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
    void load(activeBusinessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the shared context resolves or the owner switches business elsewhere, not on every `load` identity change
  }, [contextLoading, activeBusinessId, needsBusinessRecovery]);

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
        setMessage(data?.error?.message || data?.error?.code || data?.error || "Action was not allowed.");
      } else {
        setMessage(`Action applied — task is now ${String(data.status ?? "updated").toLowerCase()}.`);
        await load(activeBusinessId);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
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
        setMessage(data?.error?.message || data?.error?.code || data?.error || "Could not start work.");
      } else {
        setMessage("Work started.");
        await load(activeBusinessId);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Start work failed");
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
        const d = result.data as Record<string, unknown>;
        setMessage((d?.error as Record<string, unknown>)?.message as string || String(d?.error) || "Action failed.");
      } else {
        setMessage(`${action === "run-arbitration" ? "Arbitration complete" : action === "override" ? "Override recorded" : "Constraint updated"}.`);
        await load(activeBusinessId);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "BOS action failed");
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
        setMessage(data?.error?.message || data?.error?.code || data?.error || "Could not acknowledge escalation.");
      } else {
        setMessage("Escalation acknowledged.");
        await load(activeBusinessId);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Acknowledge failed");
    } finally {
      setBusy(false);
    }
  }, [load, activeBusinessId]);

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
      {/* G8: Startup Mode entry point — server-authoritative role gating at /owner/startup.
          Confirmation dialog added after a real usability test: clicking this navigated
          immediately with no explanation of what "Startup Mode" is or that it leaves the
          current business untouched — an owner could not tell if they were about to lose or
          change what they'd already set up. */}
      <nav aria-label="Owner mode navigation">
        <Button
          data-testid="cockpit-startup-mode-link"
          variant="ghost"
          size="sm"
          onClick={() => setStartupModeConfirmOpen(true)}
          className="text-muted-foreground"
        >
          Plan a new business
        </Button>
      </nav>
      <Modal
        isOpen={startupModeConfirmOpen}
        onClose={() => setStartupModeConfirmOpen(false)}
        title="Plan a new business"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setStartupModeConfirmOpen(false)}>
              {activeBusiness?.name ? `← Back to ${activeBusiness.name}` : "← Back"}
            </Button>
            <Button
              data-testid="cockpit-startup-mode-confirm"
              size="sm"
              onClick={() => { window.location.href = "/owner/startup"; }}
            >
              Continue to Starting up
            </Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          Startup planning is separate from {activeBusiness?.name ?? "your current business"}.
          Your current business will not be changed.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Use this if you&apos;re thinking about starting a brand-new business. You can always come
          back to {activeBusiness?.name ?? "your current business"} exactly as you left it.
        </p>
      </Modal>
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
