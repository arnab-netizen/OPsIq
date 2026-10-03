"use client";

import { DomainMainTargetContext } from "@/components/owner/DomainMainTargetContext";
import { VerificationEvidenceText } from "@/components/owner/VerificationEvidenceText";
import { canRecordOutcome } from "@/domain/founder-recovery/verification-evidence";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Select, CardDashboardSkeleton, PageHeader, PageContainer, Disclosure } from "@/ui/primitives";
import { StrategyDecisionCard } from "@/components/owner/StrategyDecisionCard";
import type { StrategyDecision } from "@/domain/owner-strategy/decision";
import {
  LEGACY_STRATEGY_RATING_NOTE,
  formatStrategyPeriod,
  legacyStrategyRatingText,
  strategyScenarioName,
  type StrategyScenarioSummary,
} from "@/domain/owner-strategy/presentation";
import { BUSINESS_TYPE_OPTIONS } from "@/domain/owner-mode/owner-data-hub";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";

import { humanizeMetricKey, humanizeEvidenceLine } from "@/lib/metric-label";
import { presentDomainError } from "@/lib/owner-domain-error-presentation";
import { httpResponseErrorFromBody } from "@/lib/operator-safe-errors";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic dashboard payloads are untyped; load() fetch-on-mount is intentional */

const SEVERITY_VARIANT: Record<string, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  low: "muted-accessible",
  medium: "default-accessible",
  high: "warning-accessible",
  critical: "destructive-accessible",
};
const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};
const FINDING_TYPE_LABEL: Record<string, string> = {
  opportunity: "Opportunity",
  risk: "Risk",
};
/** Findings from earlier evaluations whose stored type no longer describes them. */
const FINDING_CODE_TYPE_LABEL: Record<string, string> = {
  STR_OPP_DATA_QUALITY: "Data gap", // data completeness is evidence, not an opportunity
};
/** How a finding's empty source value reads (default: "not entered"). */
const FINDING_NULL_VALUE_LABEL: Record<string, string> = {
  STR_INVALID_CURRENCY: "not valid",
};

/**
 * Own-property-only lookup for a plain object literal used as a label/variant table. A bare
 * `map[key]` lookup is unsafe when `key` comes from server-controlled data: every plain JS
 * object inherits `Object.prototype` members (`constructor`, `toString`, `hasOwnProperty`,
 * `valueOf`, and, via the `__proto__` accessor, the prototype object itself), so a
 * findingType/severity value equal to one of those names can resolve to that inherited
 * function/object instead of `undefined` -- producing a value React cannot render, instead of
 * falling through to the existing raw-value fallback like any other unrecognized string. Same
 * pattern as src/components/owner/FindingCard.tsx's own `ownLookup` (PR #525) -- duplicated
 * locally here since this page defines its own local label maps rather than importing them.
 */
function ownLookup<T>(map: Record<string, T>, key: string | undefined): T | undefined {
  return key !== undefined && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

const VERIFY_VARIANT: Record<string, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  unverified: "muted-accessible",
  verified_improved: "success-accessible",
  verified_not_improved: "destructive-accessible",
  inconclusive: "warning-accessible",
  disputed: "warning-accessible",
};
const VERIFY_LABEL: Record<string, string> = {
  unverified: "Not yet verified",
  verified_improved: "Verified — improved",
  verified_not_improved: "Verified — no improvement",
  inconclusive: "Inconclusive",
  disputed: "Disputed",
};
const ACTION_STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};
/** How an action relates to the current decision (server-derived `decisionFit`). */
const ACTION_FIT_LABEL: Record<string, string> = {
  primary: "Next step",
  on_hold: "On hold",
  superseded: "Replaced",
  resolved: "No longer needed",
};

/** Server-derived fits whose proposed actions are not to be taken on (only cancelled). */
const FIT_WITHOUT_FORWARD_STEPS = new Set(["on_hold", "superseded", "resolved"]);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpResponseErrorFromBody(res.status, data);
  return data;
}

// Numeric scenario fields; expectedRevenueChange/costChange/staffImpact may be negative.
// `money` fields are labelled with the business currency (explicit units).
const STRATEGY_FIELDS: Array<{ name: string; label: string; money?: boolean }> = [
  { name: "currentRevenue", label: "Current revenue per month", money: true },
  { name: "expectedRevenueChange", label: "Expected revenue change per month (+/−)", money: true },
  { name: "costChange", label: "Expected cost change per month (+ more / − savings)", money: true },
  { name: "investmentRequired", label: "Upfront investment (one-time)", money: true },
  { name: "timeToImpactMonths", label: "Time to impact (months)" },
  { name: "cashAvailable", label: "Cash you can put into this", money: true },
  { name: "capacityImpactPct", label: "Capacity impact (%)" },
  { name: "staffImpact", label: "Staff impact (+/− people)" },
];

export default function OwnerStrategyPage() {
  const { businesses, activeBusinessId, needsBusinessRecovery, setActiveBusinessId, refreshBusinesses, loading: contextLoading } = useActiveBusiness();
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBusinessForm, setShowBusinessForm] = useState(false);
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  // The saved scenario whose evaluation is in flight (its button shows progress).
  const [evaluatingScenarioId, setEvaluatingScenarioId] = useState<string | null>(null);
  const requestSeq = useRef(0);
  // The business selected right now. A mutation's follow-up reload targets it, not the business
  // captured when the mutation started: if the owner switched business meanwhile, reloading the
  // old one would win the requestSeq race and show its scenarios under the new selection.
  const selectedBusinessRef = useRef<string | null>(activeBusinessId);
  useEffect(() => {
    selectedBusinessRef.current = activeBusinessId;
  }, [activeBusinessId]);

  const load = useCallback(async (businessId: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api(`/api/owner/strategy/dashboard?businessId=${businessId}`);
      if (requestSeq.current !== seq) return;
      setDashboard(data);
    } catch (e) {
      if (requestSeq.current !== seq) return;
      setError(presentDomainError(e, "load"));
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, []);

  const reloadSelected = useCallback(async () => {
    const id = selectedBusinessRef.current;
    if (id) await load(id);
  }, [load]);

  useEffect(() => {
    if (contextLoading) return;
    if (needsBusinessRecovery) return;
    if (!activeBusinessId) { setDashboard(null); setLoading(false); return; }
    void load(activeBusinessId);
  }, [contextLoading, activeBusinessId, needsBusinessRecovery, load]);

  const onSwitchBusiness = useCallback((id: string) => {
    setLoading(true);
    setActiveBusinessId(id);
  }, [setActiveBusinessId]);

  async function createBusiness(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      // Strategy reuses OwnerBusiness; create via the shared recovery businesses route.
      const created = await api("/api/owner/recovery/businesses", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          businessType: fd.get("businessType"),
          location: fd.get("location") || undefined,
          currency: fd.get("currency"),
          b2cSupported: fd.get("b2cSupported") === "yes",
          b2bSupported: fd.get("b2bSupported") === "yes",
        }),
      });
      setShowBusinessForm(false);
      setActiveBusinessId(created.id);
      await refreshBusinesses();
    } catch (e) {
      setError(presentDomainError(e, "save"));
    } finally {
      setBusy(false);
    }
  }

  async function addSnapshot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      periodStart: fd.get("periodStart"),
      periodEnd: fd.get("periodEnd"),
      currency: currentBusiness?.currency || fd.get("currency") || "INR",
    };
    const optionName = fd.get("optionName");
    if (optionName && typeof optionName === "string" && optionName.trim()) body.optionName = optionName.trim();
    const risk = fd.get("riskLevel");
    if (risk && typeof risk === "string" && risk.trim()) body.riskLevel = risk;
    const model = fd.get("businessModel");
    if (model && typeof model === "string" && model.trim()) body.businessModel = model;
    for (const f of STRATEGY_FIELDS) {
      const v = fd.get(f.name);
      if (v && typeof v === "string" && v.trim()) body[f.name] = parseFloat(v);
    }
    try {
      await api(`/api/owner/strategy/businesses/${activeBusinessId}/snapshots`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setShowSnapshotForm(false);
      await reloadSelected();
    } catch (e) {
      setError(presentDomainError(e, "save"));
    } finally {
      setBusy(false);
    }
  }

  // Evaluates exactly the scenario the owner chose (never inferred from the assessment period).
  async function evaluateScenario(scenarioId: string) {
    if (!activeBusinessId) return;
    setBusy(true);
    setEvaluatingScenarioId(scenarioId);
    setError(null);
    try {
      await api(`/api/owner/strategy/businesses/${activeBusinessId}/diagnoses`, {
        method: "POST",
        body: JSON.stringify({ snapshotId: scenarioId }),
      });
      await reloadSelected();
    } catch (e) {
      setError(presentDomainError(e, "action"));
    } finally {
      setEvaluatingScenarioId(null);
      setBusy(false);
    }
  }

  async function updateAction(action: any, status: string) {
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { status };
      if (status === "completed") {
        body.completionNotes = window.prompt("Completion notes:") || "";
        const ev = window.prompt("Completion evidence:") || "";
        body.completionEvidence = ev ? [ev] : [];
      }
      await api(`/api/owner/strategy/actions/${action.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await reloadSelected();
    } catch (e) {
      setError(presentDomainError(e, "action"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyAction(action: any) {
    if (!activeBusinessId) return;
    setBusy(true);
    setError(null);
    try {
      const beforeRaw = window.prompt(
        action.measuredBaseline == null
          ? `BEFORE value for ${humanizeMetricKey(action.verificationMetric)} (not measured by the diagnosis — required):`
          : `BEFORE value for ${humanizeMetricKey(action.verificationMetric)} (measured: ${action.measuredBaseline}; leave blank to use it — a different value is recorded as owner-reported):`
      );
      if (beforeRaw === null) { setBusy(false); return; }
      const afterRaw = window.prompt(`AFTER value for ${humanizeMetricKey(action.verificationMetric)}:`);
      if (afterRaw === null) { setBusy(false); return; }
      const dir = window.prompt("Target direction (up / down):", "up");
      if (dir === null) { setBusy(false); return; }
      // Strict parse: blank = not given; anything else must be a plain number ("₹1200" or "1,200"
      // must not silently become "not given" and be recorded against the measured baseline).
      const beforeValue = beforeRaw.trim() === "" ? null : Number(beforeRaw.trim());
      const afterValue = afterRaw.trim() === "" ? null : Number(afterRaw.trim());
      if ((beforeValue !== null && !Number.isFinite(beforeValue)) || (afterValue !== null && !Number.isFinite(afterValue))) {
        setError("Enter plain numbers only (no currency symbols or thousands separators).");
        setBusy(false);
        return;
      }
      await api(`/api/owner/strategy/actions/${action.id}/verify`, {
        method: "POST",
        body: JSON.stringify({
          beforeValue,
          afterValue,
          targetDirection: dir === "down" ? "down" : "up",
        }),
      });
      await reloadSelected();
    } catch (e) {
      setError(presentDomainError(e, "action"));
    } finally {
      setBusy(false);
    }
  }

  if (contextLoading || loading) return <CardDashboardSkeleton label="Loading your strategy information" />;
  if (needsBusinessRecovery) return (
    <PageContainer>
      <p>Your previously selected business is no longer available. Choose a business to continue.</p>
      <BusinessContextSelector businesses={businesses} selectedId={null} onChange={onSwitchBusiness} />
    </PageContainer>
  );

  const currentBusiness = businesses.find((b) => b.id === activeBusinessId) || null;
  const cycle = dashboard?.latestCycle ?? null;
  const score = dashboard?.domainScore ?? null;
  const missing: string[] = dashboard?.missingCriticalData ?? [];
  const scenarios: StrategyScenarioSummary[] = Array.isArray(dashboard?.scenarios) ? dashboard.scenarios : [];
  // Shown after the decision once one exists (the decision stays first on the page), and above the
  // empty state before any evaluation.
  const scenarioList = scenarios.length > 0 ? (
    <StrategyScenarioList
      scenarios={scenarios}
      busy={busy}
      evaluatingScenarioId={evaluatingScenarioId}
      onEvaluate={evaluateScenario}
    />
  ) : null;

  return (
    <PageContainer>
      <div className="mb-6">
        <PageHeader
          title="Owner Strategy & Scenarios"
          description="Should you add staff, buy equipment, raise price, or open a branch? Check one option's profit, cash, downside and evidence — then get one clear decision and your next step."
          actions={<Button onClick={() => setShowBusinessForm((s) => !s)}>+ New business</Button>}
        />
      </div>

      {error && (
        <div
          role="alert"
          data-testid="strategy-page-error"
          className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {showBusinessForm && (
        <form onSubmit={createBusiness} className="mb-6 border rounded-lg p-4 bg-card space-y-3">
          <h2 className="font-semibold">Create a business</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input name="name" label="Business name" required />
            <Select
              name="businessType"
              label="Business type"
              required
              options={[...BUSINESS_TYPE_OPTIONS]}
            />
            <Input name="location" label="Location" />
            <Input name="currency" label="Currency" defaultValue="INR" required />
            <Select name="b2cSupported" label="B2C supported" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
            <Select name="b2bSupported" label="B2B supported" options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create business"}</Button>
        </form>
      )}

      {businesses.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No businesses yet. Create your first business to evaluate a strategic option.
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <BusinessContextSelector
              businesses={businesses}
              selectedId={activeBusinessId}
              onChange={onSwitchBusiness}
            />
            <Button onClick={() => setShowSnapshotForm((s) => !s)} disabled={!activeBusinessId}>
              + Add scenario
            </Button>
          </div>

          {showSnapshotForm && (
            <form onSubmit={addSnapshot} className="mb-6 border rounded-lg p-4 bg-card space-y-3">
              <h2 className="font-semibold">
                Strategic option {currentBusiness ? `(${currentBusiness.currency})` : ""}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input name="optionName" label="Option name (e.g. Open 2nd branch)" />
                <Select
                  name="riskLevel"
                  label="Execution risk"
                  options={[
                    { value: "", label: "—" },
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ]}
                />
                <Input name="periodStart" label="Assessed from" type="date" required />
                <Input name="periodEnd" label="Assessed to" type="date" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {STRATEGY_FIELDS.map((f) => (
                  <Input
                    key={f.name}
                    name={f.name}
                    label={f.money && currentBusiness?.currency ? `${f.label} (${currentBusiness.currency})` : f.label}
                    type="number"
                    step="any"
                    placeholder="—"
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave a field blank if you don&apos;t know it — it is reported as missing, never guessed. Enter 0 when an amount really is zero (for example, no upfront investment or no cash available). Revenue/cost changes and staff impact may be negative.
              </p>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save scenario"}</Button>
            </form>
          )}

          {/* dashboard is set only on a successful load() and is never reset to null on failure
              (see load()'s catch block above), so `dashboard === null` here means only "no
              successful response yet" -- distinct from a successful response confirming no
              scenario data. Unlike Group A (Finance/Operations/Sales), `businesses` above comes
              from the independently loaded ActiveBusinessContext, not from `dashboard` -- the
              outer `businesses.length === 0` branch is unaffected by this gate. A failed initial
              load must never render "No scenario yet." next to the error banner above: that
              would present unverified emptiness as a fact. A failure AFTER a prior success
              leaves dashboard (and this whole section) exactly as it was -- unaffected. */}
          <DomainMainTargetContext domain="strategy" businessId={dashboard?.selectedBusinessId} revision={dashboard} />

          {dashboard === null ? null : !dashboard.hasData ? (
            <div className="space-y-6">
              {scenarioList}
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                {scenarios.length > 0
                  ? "Scenario recorded. Choose a saved scenario above and click “Evaluate this scenario” to get a decision and your next step."
                  : "No scenario yet. Add a strategic option, then evaluate it."}
              </div>
            </div>
          ) : (
            <StrategyCycleView
              cycle={cycle}
              score={score}
              missing={missing}
              recommended={dashboard.recommendedNextAction}
              decisionStep={dashboard.decisionStep ?? null}
              decision={dashboard.decision ?? null}
              history={dashboard.cycleHistory}
              scenarioList={scenarioList}
              busy={busy}
              onUpdateAction={updateAction}
              onVerifyAction={verifyAction}
            />
          )}
        </>
      )}
    </PageContainer>
  );
}

function StrategyScenarioList({
  scenarios,
  busy,
  evaluatingScenarioId,
  onEvaluate,
}: {
  scenarios: StrategyScenarioSummary[];
  busy: boolean;
  evaluatingScenarioId: string | null;
  onEvaluate: (scenarioId: string) => void;
}) {
  return (
    <section className="border rounded-lg p-4 bg-card" aria-labelledby="strategy-scenarios-heading" data-testid="strategy-scenarios">
      <h2 id="strategy-scenarios-heading" className="font-bold">Saved scenarios ({scenarios.length})</h2>
      <p className="text-xs text-muted-foreground mb-3">Pick the scenario to evaluate — the decision on this page always comes from the one marked “Current decision”.</p>
      <ul className="space-y-2">
        {scenarios.map((sc) => {
          const name = strategyScenarioName(sc.optionName);
          const period = formatStrategyPeriod(sc.periodStart, sc.periodEnd);
          return (
            <li
              key={sc.id}
              data-testid="strategy-scenario"
              data-scenario-id={sc.id}
              data-current={sc.isCurrentDecision ? "true" : "false"}
              className={`rounded-md border p-3 flex flex-wrap items-center justify-between gap-2 ${sc.isCurrentDecision ? "border-primary/50 bg-primary/5" : ""}`}
            >
              <div className="min-w-0">
                <div className="font-semibold break-words">{name}</div>
                <div className="text-xs text-muted-foreground">Assessed {period}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {sc.isCurrentDecision ? (
                    <Badge variant="default-accessible">Current decision</Badge>
                  ) : sc.lastEvaluationSequence == null ? (
                    <Badge variant="muted-accessible">Not evaluated yet</Badge>
                  ) : (
                    <Badge variant="muted-accessible">Last evaluated in #{sc.lastEvaluationSequence}</Badge>
                  )}
                </div>
              </div>
              <Button
                onClick={() => onEvaluate(sc.id)}
                disabled={busy}
                aria-label={`Evaluate this scenario: ${name}, ${period}`}
              >
                {evaluatingScenarioId === sc.id ? "Evaluating…" : "Evaluate this scenario"}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function scenarioCaption(cycle: any): string {
  const snap = cycle.snapshot;
  const parts = [`Current decision · evaluation #${cycle.sequenceNumber}`];
  if (snap) {
    parts.push(strategyScenarioName(snap.optionName));
    if (snap.periodStart && snap.periodEnd) parts.push(formatStrategyPeriod(snap.periodStart, snap.periodEnd));
  }
  return parts.join(" · ");
}

function StrategyCycleView({
  cycle,
  score,
  missing,
  recommended,
  decisionStep,
  decision,
  history,
  scenarioList,
  busy,
  onUpdateAction,
  onVerifyAction,
}: {
  scenarioList: React.ReactNode;
  cycle: any;
  score: any;
  missing: string[];
  recommended: any;
  decisionStep: { state: "current" | "not_listed" | "replaced" | "held"; replacedBecause: string | null; openStep?: { title: string; description: string } | null } | null;
  decision: StrategyDecision | null;
  history: any[];
  busy: boolean;
  onUpdateAction: (a: any, s: string) => void;
  onVerifyAction: (a: any) => void;
}) {
  const state = score?.strategyState ?? cycle.strategyState;
  const caption = scenarioCaption(cycle);
  const scoresLine = `Attractiveness ${Math.round(score?.healthScore ?? cycle.healthScore)}/100 · Risk ${Math.round(score?.riskScore ?? cycle.riskScore)}/100 · Upside ${Math.round(score?.opportunityScore ?? cycle.opportunityScore)}/100`;
  const confidenceLine = `data confidence ${Math.round(score?.dataConfidenceScore ?? cycle.dataConfidenceScore)}/100`;
  return (
    <div className="space-y-6">
      {decision ? (
        <>
          <StrategyDecisionCard
            decision={decision}
            caption={caption}
            nextStepRow={decisionStep?.state === "current" && recommended ? { status: recommended.status, statusLabel: ACTION_STATUS_LABEL[recommended.status] ?? recommended.status } : null}
            replacedStep={decisionStep?.state === "replaced" || decisionStep?.state === "held" ? { replacedBecause: decisionStep.replacedBecause ?? "", held: decisionStep.state === "held", step: recommended ? { title: recommended.title, description: recommended.description } : null } : null}
            openStep={decisionStep?.state === "not_listed" ? decisionStep.openStep ?? null : null}
          />
          <Disclosure summary="Detailed scores">
            {decision.dimensions.profit.state === "unknown" ? (
              <p>Not scored — the profit effect is unknown until the missing inputs are entered.</p>
            ) : (
              <p className="tabular-nums">{scoresLine} · {confidenceLine}</p>
            )}
            <p className="mt-1" data-testid="strategy-legacy-rating">
              {legacyStrategyRatingText(state)} <span className="text-muted-foreground">— {LEGACY_STRATEGY_RATING_NOTE}; kept for reference only. The decision above replaces it.</span>
            </p>
          </Disclosure>
        </>
      ) : (
        <>
          <div className="border rounded-lg p-4 bg-card flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase text-muted-foreground">{caption}</div>
              <div className="text-lg font-semibold tabular-nums">{scoresLine}</div>
            </div>
            <div className="sm:text-right">
              <Badge variant="muted-accessible">{legacyStrategyRatingText(state)}</Badge>
              <div className="text-xs text-muted-foreground mt-1">{LEGACY_STRATEGY_RATING_NOTE}</div>
              <div className="text-xs text-muted-foreground mt-1">{confidenceLine}</div>
            </div>
          </div>

          {missing.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
              <strong>Missing critical inputs:</strong> {missing.map(humanizeMetricKey).join(", ")} — provide these to raise confidence.
            </div>
          )}

          {recommended && (
            <div className="border rounded-lg p-4 bg-card">
              <div className="text-xs uppercase text-muted-foreground">Next step within Strategy (local to this area — your overall main target is on Home)</div>
              <div className="font-semibold">{recommended.title}</div>
              <p className="text-xs text-muted-foreground">{recommended.description}</p>
              {recommended.localStepSource === "domain_action" && (
                <p className="text-xs text-muted-foreground">
                  priority {Math.round(recommended.priorityScore)} · impact {Math.round(recommended.expectedImpactScore)} · effort {Math.round(recommended.effortScore)}{recommended.verificationMetric ? ` · verify via ${humanizeMetricKey(recommended.verificationMetric)}` : ""}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {scenarioList}

      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">What the evaluation found ({cycle.findings.length})</h2>
        {cycle.findings.length === 0 && <p className="text-sm text-muted-foreground">No scenario risks or upsides detected.</p>}
        <div className="space-y-3">
          {cycle.findings.map((f: any) => (
            <div key={f.id} className={`border-l-4 pl-3 py-1 ${f.findingType === "opportunity" ? "border-success" : "border-warning"}`}>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <span className="font-semibold min-w-0 break-words">{f.title}</span>
                <span className="flex gap-1">
                  <Badge variant="muted-accessible">{ownLookup(FINDING_CODE_TYPE_LABEL, f.code) ?? ownLookup(FINDING_TYPE_LABEL, f.findingType) ?? f.findingType}</Badge>
                  {/* Severity grades problems; an upside has none to show. */}
                  {f.findingType !== "opportunity" && (
                    <Badge variant={ownLookup(SEVERITY_VARIANT, f.severity)}>{ownLookup(SEVERITY_LABEL, f.severity) ?? f.severity}</Badge>
                  )}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{f.summary}</p>
              <Disclosure summary="Numbers behind this" className="mt-1">
                <p className="text-xs">
                  <strong>Metric:</strong> {humanizeMetricKey(f.sourceMetric)} ={" "}
                  {f.sourceValue == null ? (ownLookup(FINDING_NULL_VALUE_LABEL, f.code) ?? "not entered") : String(f.sourceValue)}
                  {f.threshold == null ? "" : ` (threshold ${String(f.threshold)})`} · evidence strength {Math.round((f.confidence ?? 0) * 100)}/100 (heuristic, not a probability)
                </p>
                {Array.isArray(f.evidence) && f.evidence.length > 0 && (
                  <p className="text-xs"><strong>Evidence:</strong> {f.evidence.map(humanizeEvidenceLine).join("; ")}</p>
                )}
                {f.verificationMetric && (
                  <p className="text-xs"><strong>Verify via:</strong> {humanizeMetricKey(f.verificationMetric)}</p>
                )}
              </Disclosure>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">Strategy actions ({cycle.actions.length})</h2>
        <div className="space-y-3">
          {cycle.actions.map((a: any) => {
            const latestVerification = a.verifications?.[0];
            return (
              <div key={a.id} className="border rounded p-3">
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div>
                    <div className="font-semibold">{a.title}</div>
                    {ownLookup(ACTION_FIT_LABEL, a.decisionFit) && (
                      <Badge variant={a.decisionFit === "primary" ? "default-accessible" : "muted-accessible"}>{ownLookup(ACTION_FIT_LABEL, a.decisionFit)}</Badge>
                    )}
                    {a.decisionFitNote && <div className="text-xs text-muted-foreground">{a.decisionFitNote}</div>}
                    {a.carriedFromCycleSequence != null && (
                      <div className="text-xs text-muted-foreground">{a.completedEarlier ? "Completed in cycle #" : "Still open from cycle #"}{a.carriedFromCycleSequence}
                        {a.stillFlaggedByLatestDiagnosis === false && !a.decisionFitNote && " — the latest diagnosis no longer flags this; finish or cancel it"}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {a.ownerRole} · priority {Math.round(a.priorityScore)} · ~{a.expectedTimeframeDays}d
                    </div>
                  </div>
                  <Badge variant="muted-accessible">{ACTION_STATUS_LABEL[a.status] ?? a.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                <p className="text-xs text-muted-foreground">
                  How to check: {humanizeEvidenceLine(a.verificationMethod ?? "")}
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {a.status === "proposed" && !FIT_WITHOUT_FORWARD_STEPS.has(a.decisionFit) && <Button onClick={() => onUpdateAction(a, "assigned")} disabled={busy}>Assign</Button>}
                  {a.status === "assigned" && <Button onClick={() => onUpdateAction(a, "in_progress")} disabled={busy}>Start</Button>}
                  {a.status === "in_progress" && <Button onClick={() => onUpdateAction(a, "completed")} disabled={busy}>Complete</Button>}
                  {a.status === "in_progress" && <Button onClick={() => onUpdateAction(a, "blocked")} disabled={busy}>Block</Button>}
                  {a.status === "blocked" && <Button onClick={() => onUpdateAction(a, "in_progress")} disabled={busy}>Resume</Button>}
                  {canRecordOutcome(a.status) && <Button onClick={() => onVerifyAction(a)} disabled={busy}>Verify outcome</Button>}
                  {FIT_WITHOUT_FORWARD_STEPS.has(a.decisionFit) && a.status !== "completed" && a.status !== "cancelled" && (
                    <Button onClick={() => onUpdateAction(a, "cancelled")} disabled={busy}>Cancel</Button>
                  )}
                </div>
                {latestVerification && (
                  <div className="mt-2 text-xs">
                    <Badge variant={VERIFY_VARIANT[latestVerification.status] || "muted-accessible"}>
                      {VERIFY_LABEL[latestVerification.status] ?? latestVerification.status}
                    </Badge>{" "}
                    <VerificationEvidenceText verification={latestVerification} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="border rounded-lg p-4 bg-card" data-testid="strategy-history">
        <h2 className="font-bold mb-1">Evaluation history</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Earlier evaluations keep the rating they were given at the time. Those legacy ratings come from the previous Strategy model and are not comparable with the current decision.
        </p>
        <ul className="space-y-2 text-sm">
          {history.map((c: any) => {
            const isCurrent = decision !== null && c.id === cycle.id;
            return (
              <li key={c.id} className="border-b pb-2" data-testid="strategy-history-row" data-current={isCurrent ? "true" : "false"}>
                <div className="flex flex-wrap justify-between gap-x-3">
                  <span>#{c.sequenceNumber} — {new Date(c.createdAt).toLocaleDateString()}</span>
                  <span className="text-muted-foreground">{c.findingCount} findings · {c.actionCount} actions</span>
                </div>
                {c.scenario && (
                  <div className="text-xs text-muted-foreground break-words">
                    {strategyScenarioName(c.scenario.optionName)} · {formatStrategyPeriod(c.scenario.periodStart, c.scenario.periodEnd)}
                  </div>
                )}
                {isCurrent ? (
                  <div className="mt-1">
                    <Badge variant="default-accessible">Current decision: {decision.headline}</Badge>
                  </div>
                ) : (
                  <div className="mt-1">
                    <span className="inline-block rounded border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground">
                      {legacyStrategyRatingText(c.strategyState)}
                    </span>
                    <div className="text-xs text-muted-foreground">{LEGACY_STRATEGY_RATING_NOTE}</div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
