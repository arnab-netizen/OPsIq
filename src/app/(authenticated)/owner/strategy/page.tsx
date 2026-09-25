"use client";

import { VerificationEvidenceText } from "@/components/owner/VerificationEvidenceText";
import { canRecordOutcome } from "@/domain/founder-recovery/verification-evidence";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Select, CardDashboardSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
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
};

const STATE_VARIANT: Record<string, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  STRONG_GO: "success-accessible",
  GO: "default-accessible",
  MARGINAL: "warning-accessible",
  RISKY: "destructive-accessible",
  AVOID: "destructive-accessible",
};
const STATE_LABEL: Record<string, string> = {
  STRONG_GO: "Strong go",
  GO: "Go",
  MARGINAL: "Marginal",
  RISKY: "Risky",
  AVOID: "Avoid",
};

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
const STRATEGY_FIELDS: Array<{ name: string; label: string }> = [
  { name: "currentRevenue", label: "Current monthly revenue" },
  { name: "expectedRevenueChange", label: "Expected revenue change (+/-)" },
  { name: "costChange", label: "Cost change (+ more / - savings)" },
  { name: "investmentRequired", label: "Investment required (upfront)" },
  { name: "timeToImpactMonths", label: "Time to impact (months)" },
  { name: "cashAvailable", label: "Cash available" },
  { name: "capacityImpactPct", label: "Capacity impact %" },
  { name: "staffImpact", label: "Staff impact (+/-)" },
];

export default function OwnerStrategyPage() {
  const { businesses, activeBusinessId, needsBusinessRecovery, setActiveBusinessId, refreshBusinesses, loading: contextLoading } = useActiveBusiness();
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBusinessForm, setShowBusinessForm] = useState(false);
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  const requestSeq = useRef(0);

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
      await load(activeBusinessId);
    } catch (e) {
      setError(presentDomainError(e, "save"));
    } finally {
      setBusy(false);
    }
  }

  async function runDiagnosis() {
    if (!activeBusinessId || !dashboard?.latestSnapshot) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/owner/strategy/businesses/${activeBusinessId}/diagnoses`, {
        method: "POST",
        body: JSON.stringify({ snapshotId: dashboard.latestSnapshot.id }),
      });
      await load(activeBusinessId);
    } catch (e) {
      setError(presentDomainError(e, "action"));
    } finally {
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
      await load(activeBusinessId);
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
      await api(`/api/owner/strategy/actions/${action.id}/verify`, {
        method: "POST",
        body: JSON.stringify({
          beforeValue: beforeRaw.trim() === "" ? null : parseFloat(beforeRaw),
          afterValue: afterRaw.trim() === "" ? null : parseFloat(afterRaw),
          targetDirection: dir === "down" ? "down" : "up",
        }),
      });
      await load(activeBusinessId);
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

  return (
    <PageContainer>
      <div className="mb-6">
        <PageHeader
          title="Owner Strategy & Scenarios"
          description="Should you add staff, buy equipment, raise price, or open a branch? Score one option's profit, payback, downside, and safe upside — then a clear go / no-go."
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
            <Button onClick={runDiagnosis} disabled={!activeBusinessId || !dashboard?.latestSnapshot || busy}>
              Evaluate scenario
            </Button>
          </div>

          {showSnapshotForm && (
            <form onSubmit={addSnapshot} className="mb-6 border rounded-lg p-4 bg-card space-y-3">
              <h2 className="font-semibold">
                Strategic option {currentBusiness ? `(${currentBusiness.currency})` : ""}
              </h2>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-4 gap-3">
                {STRATEGY_FIELDS.map((f) => (
                  <Input key={f.name} name={f.name} label={f.label} type="number" placeholder="—" />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave fields blank if unknown — missing data is reported, never invented. Revenue/cost changes and staff impact may be negative.
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
          {dashboard === null ? null : !dashboard.hasData ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              {dashboard.latestSnapshot
                ? "Scenario recorded. Click “Evaluate scenario” to generate the go / no-go analysis and an action plan."
                : "No scenario yet. Add a strategic option, then evaluate it."}
            </div>
          ) : (
            <StrategyCycleView
              cycle={cycle}
              score={score}
              missing={missing}
              recommended={dashboard.recommendedNextAction}
              history={dashboard.cycleHistory}
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

function StrategyCycleView({
  cycle,
  score,
  missing,
  recommended,
  history,
  busy,
  onUpdateAction,
  onVerifyAction,
}: {
  cycle: any;
  score: any;
  missing: string[];
  recommended: any;
  history: any[];
  busy: boolean;
  onUpdateAction: (a: any, s: string) => void;
  onVerifyAction: (a: any) => void;
}) {
  const state = score?.strategyState ?? cycle.strategyState;
  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-4 bg-card flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-muted-foreground">
            Latest evaluation · #{cycle.sequenceNumber}{cycle.snapshot?.optionName ? ` · ${cycle.snapshot.optionName}` : ""}
          </div>
          <div className="text-lg font-semibold tabular-nums">
            Attractiveness {Math.round(score?.healthScore ?? cycle.healthScore)}/100 · Risk {Math.round(score?.riskScore ?? cycle.riskScore)}/100 · Upside {Math.round(score?.opportunityScore ?? cycle.opportunityScore)}/100
          </div>
        </div>
        <div className="text-right">
          <Badge variant={STATE_VARIANT[state] || "muted-accessible"}>{STATE_LABEL[state] ?? state}</Badge>
          <div className="text-xs text-muted-foreground mt-1">
            data confidence {Math.round(score?.dataConfidenceScore ?? cycle.dataConfidenceScore)}/100
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <strong>Missing critical inputs:</strong> {missing.map(humanizeMetricKey).join(", ")} — provide these to raise confidence.
        </div>
      )}

      {recommended && (
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-xs uppercase text-muted-foreground">Recommended next strategy action</div>
          <div className="font-semibold">{recommended.title}</div>
          <p className="text-xs text-muted-foreground">{recommended.description}</p>
          <p className="text-xs text-muted-foreground">
            priority {Math.round(recommended.priorityScore)} · impact {Math.round(recommended.expectedImpactScore)} · effort {Math.round(recommended.effortScore)} · verify via {humanizeMetricKey(recommended.verificationMetric)}
          </p>
        </div>
      )}

      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">Findings ({cycle.findings.length})</h2>
        {cycle.findings.length === 0 && <p className="text-sm text-muted-foreground">No scenario risks or upsides detected.</p>}
        <div className="space-y-3">
          {cycle.findings.map((f: any) => (
            <div key={f.id} className="border-l-4 pl-3 py-1" style={{ borderColor: f.findingType === "opportunity" ? "#16a34a" : "#f59e0b" }}>
              <div className="flex justify-between">
                <span className="font-semibold">{f.title}</span>
                <span className="flex gap-1">
                  <Badge variant="muted-accessible">{ownLookup(FINDING_TYPE_LABEL, f.findingType) ?? f.findingType}</Badge>
                  <Badge variant={ownLookup(SEVERITY_VARIANT, f.severity)}>{ownLookup(SEVERITY_LABEL, f.severity) ?? f.severity}</Badge>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{f.summary}</p>
              <p className="text-xs text-muted-foreground">
                <strong>Metric:</strong> {humanizeMetricKey(f.sourceMetric)} = {String(f.sourceValue)} (threshold {String(f.threshold)}) · confidence {Math.round((f.confidence ?? 0) * 100)}%
              </p>
              {Array.isArray(f.evidence) && f.evidence.length > 0 && (
                <p className="text-xs text-muted-foreground"><strong>Evidence:</strong> {f.evidence.map(humanizeEvidenceLine).join("; ")}</p>
              )}
              {f.verificationMetric && (
                <p className="text-xs text-muted-foreground"><strong>Verify via:</strong> {humanizeMetricKey(f.verificationMetric)}</p>
              )}
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
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.ownerRole} · priority {Math.round(a.priorityScore)} · ~{a.expectedTimeframeDays}d
                    </div>
                  </div>
                  <Badge variant="muted-accessible">{ACTION_STATUS_LABEL[a.status] ?? a.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                <p className="text-xs text-muted-foreground">
                  Verify <strong>{humanizeMetricKey(a.verificationMetric)}</strong> — {humanizeEvidenceLine(a.verificationMethod ?? "")}
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {a.status === "proposed" && <Button onClick={() => onUpdateAction(a, "assigned")} disabled={busy}>Assign</Button>}
                  {a.status === "assigned" && <Button onClick={() => onUpdateAction(a, "in_progress")} disabled={busy}>Start</Button>}
                  {a.status === "in_progress" && <Button onClick={() => onUpdateAction(a, "completed")} disabled={busy}>Complete</Button>}
                  {a.status === "in_progress" && <Button onClick={() => onUpdateAction(a, "blocked")} disabled={busy}>Block</Button>}
                  {canRecordOutcome(a.status) && <Button onClick={() => onVerifyAction(a)} disabled={busy}>Verify outcome</Button>}
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

      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-3">Evaluation history</h2>
        <div className="space-y-1 text-sm">
          {history.map((c: any) => (
            <div key={c.id} className="flex justify-between border-b py-1">
              <span>#{c.sequenceNumber} — {new Date(c.createdAt).toLocaleDateString()}</span>
              <span className="text-muted-foreground">
                {STATE_LABEL[c.strategyState] ?? c.strategyState} · {c.findingCount} findings · {c.actionCount} actions
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
