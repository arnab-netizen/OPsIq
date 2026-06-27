"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Input, Select } from "@/ui/primitives";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic budget plan payloads are untyped; load() fetch-on-mount is intentional */

/**
 * Owner UI — Budget & Profit Plan.
 *
 * Presents the existing Dynamic Budget backend (mode classifier, capital allocation,
 * reassessment, forecast, spend governance, authority, override) to the owner. It
 * READS the existing routes only — it does not re-implement or duplicate any
 * backend logic. It never presents unverified data as verified, never hides
 * confidence, and labels advisory generated actions as NOT persisted execution tasks.
 *
 * Module honesty: DYNAMIC_BUDGET_MODULE_INTEGRATED_PARTIAL (not OWNER_MODE_READY).
 */

const MODE_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  EMERGENCY: "destructive",
  STABILIZE: "warning",
  HYBRID: "warning",
  PROFIT_INCREASE: "default",
  GROW: "success",
  SCALE: "success",
  DATA_INSUFFICIENT: "muted",
};

const CONFIDENCE_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  UNVERIFIED: "destructive",
  PARTIAL: "warning",
  OPERATIONAL: "default",
  VERIFIED: "success",
  AUDITED: "success",
};

const SIGNAL_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  INFO: "muted",
  LOW: "muted",
  MEDIUM: "warning",
  HIGH: "destructive",
  CRITICAL: "destructive",
};

const PARTIAL_LIMITATIONS = [
  "Owner UI is new — backend governance is DB/CI-proven, but live operational feeds are not yet wired.",
  "Generated actions below are ADVISORY recommendations, not persisted execution tasks (deep action-system linkage is PARTIAL).",
  "Revenue-assurance / working-capital ageing / vendor benchmarks rely on entered data — live POS/gateway/bank feeds are not connected.",
  "Runtime least-privilege RBAC denial is enforced by the server wrapper but not yet proven by an automated runtime test.",
];

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

export default function OwnerBudgetPlanPage() {
  const [businesses, setBusinesses] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<any | null>(null);
  const [plan, setPlan] = useState<any | null>(null);
  const [forecast, setForecast] = useState<any | null>(null);
  const [authorities, setAuthorities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOverride, setShowOverride] = useState(false);

  const load = useCallback(async (businessId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      let list = businesses;
      if (list === null) {
        list = await api("/api/owner/recovery/businesses");
        setBusinesses(Array.isArray(list) ? list : []);
      }
      const bid = businessId ?? selected ?? (Array.isArray(list) && list[0] ? list[0].id : null);
      setSelected(bid);
      if (!bid) { setGuidance(null); setPlan(null); setForecast(null); setAuthorities([]); return; }

      const qs = `?businessId=${bid}`;
      const [g, snaps, fc, auth] = await Promise.all([
        api(`/api/owner/budget/guidance${qs}`).catch(() => null),
        api(`/api/owner/budget/snapshots${qs}`).catch(() => []),
        api(`/api/owner/budget/forecast${qs}`).catch(() => null),
        api(`/api/owner/budget/authority${qs}`).catch(() => []),
      ]);
      setGuidance(g);
      const current = Array.isArray(snaps) ? (snaps.find((s: any) => s.isCurrent) ?? snaps[0] ?? null) : null;
      setPlan(current?.plan ?? null);
      setForecast(fc);
      setAuthorities(Array.isArray(auth) ? auth : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load budget plan");
    } finally {
      setLoading(false);
    }
  }, [businesses, selected]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitOverride(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !plan) return;
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/owner/budget/override", {
        method: "POST",
        body: JSON.stringify({
          businessId: selected,
          originalRecommendation: plan.nextBestAction,
          riskWarning: `Overriding the ${plan.mode} plan's recommendation ("${plan.decisionType}") may accept the risk it was protecting against.`,
          reason: fd.get("reason"),
          affectedLines: Array.isArray(plan.affectedBudgetLines) ? plan.affectedBudgetLines : [],
          expectedConsequence: fd.get("expectedConsequence"),
          reviewInDays: parseInt(String(fd.get("reviewInDays") || "14"), 10),
        }),
      });
      setShowOverride(false);
      await load(selected);
    } catch (e) {
      // The server refuses illegal/unsafe overrides (vendor-bank-unverified, statutory
      // reserve, unlawful action) — surface that refusal honestly.
      setError(e instanceof Error ? e.message : "Override rejected");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-8">Loading Budget &amp; Profit Plan…</div>;

  const list: any[] = businesses ?? [];
  const mode = guidance?.mode ?? plan?.mode ?? null;
  const confidence = guidance?.confidence ?? plan?.confidence ?? null;
  const signals: any[] = plan?.signals ?? guidance?.signals ?? [];
  const actions: any[] = plan?.generatedActions ?? guidance?.generatedActions ?? [];

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Budget &amp; Profit Plan</h1>
          <p className="text-muted-foreground text-sm">
            Governed budget mode, capital allocation, cash/profit forecast, spend control, and your single next best action — evidence-gated, not guesses.
          </p>
        </div>
        <Link href="/owner"><Button>← Command Center</Button></Link>
      </div>

      {/* Honest module-status banner (never imply OWNER_MODE_READY). */}
      <div className="mb-6 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs space-y-1">
        <div className="font-semibold">Module status: DYNAMIC_BUDGET_MODULE_INTEGRATED_PARTIAL (backend governance DB/CI-proven; not Owner-Mode-complete)</div>
        {PARTIAL_LIMITATIONS.map((l) => (<div key={l}>• {l}</div>))}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {list.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No businesses yet. Start in <Link href="/owner/finance" className="underline">Finance</Link> to create one and record financials.
        </div>
      ) : (
        <>
          <div className="mb-6 w-72">
            <Select
              name="businessSelector"
              label="Business"
              value={selected ?? undefined}
              onChange={(e: any) => load(e.target.value)}
              options={list.map((b) => ({ value: b.id, label: `${b.name} (${b.currency})` }))}
            />
          </div>

          {!guidance?.hasPlan && !plan ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              No budget plan yet for this business. Create a budget period, add spend, or record financials so a plan can be reassessed.
            </div>
          ) : (
            <div className="space-y-6">
              {/* 1 + 2: Mode + confidence */}
              <section className="border rounded-lg p-4 bg-white flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Current budget mode</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={MODE_VARIANT[mode] ?? "muted"}>{mode ?? "—"}</Badge>
                    <Badge variant={CONFIDENCE_VARIANT[confidence] ?? "muted"}>confidence: {confidence ?? "—"}</Badge>
                    {plan?.highRiskBlocked && <Badge variant="destructive">high-risk recommendations blocked</Badge>}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {guidance?.version != null && <div>plan v{guidance.version}</div>}
                  {guidance?.reassessedAt && <div>reassessed {new Date(guidance.reassessedAt).toLocaleString()}</div>}
                </div>
              </section>

              {confidence && confidence !== "VERIFIED" && confidence !== "AUDITED" && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                  ⚠ Data confidence is <strong>{confidence}</strong>. Irreversible spend (hiring, capex, new branch, major marketing) is blocked below VERIFIED — figures may be ranges, not precise amounts.
                </div>
              )}

              {/* 3: What changed */}
              {plan?.whatChanged && (
                <section className="border rounded-lg p-4 bg-white">
                  <div className="text-xs uppercase text-muted-foreground">What changed</div>
                  <div className="text-sm">
                    <strong>{plan.whatChanged.field}</strong>
                    {plan.whatChanged.previousValue != null && <> — from <code>{String(plan.whatChanged.previousValue)}</code></>}
                    {plan.whatChanged.newValue != null && <> to <code>{String(plan.whatChanged.newValue)}</code></>}
                  </div>
                  {Array.isArray(plan.affectedBudgetLines) && plan.affectedBudgetLines.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">Affected lines: {plan.affectedBudgetLines.join(", ")}</div>
                  )}
                </section>
              )}

              {/* 4: Next best action */}
              <section className="border-2 border-foreground/10 rounded-lg p-4 bg-white">
                <div className="text-xs uppercase text-muted-foreground">Next best action</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="default">{plan?.decisionType ?? guidance?.decisionType ?? "—"}</Badge>
                  <span className="font-semibold">{plan?.nextBestAction ?? guidance?.nextBestAction}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Why first: {plan?.topConstraint ?? guidance?.topRisk}</p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div><strong>Cash:</strong> {plan?.cashImpact ?? "—"}</div>
                  <div><strong>Profit:</strong> {plan?.profitImpact ?? "—"}</div>
                  <div><strong>Runway:</strong> {plan?.runwayImpact ?? "—"}</div>
                </div>
              </section>

              {/* 5: Forecast */}
              {forecast?.hasData && (
                <section className="border rounded-lg p-4 bg-white">
                  <h2 className="font-bold mb-2">Cash forecast</h2>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="muted">7-day {Math.round(forecast.sevenDayCash)}</Badge>
                    <Badge variant="muted">30-day {Math.round(forecast.thirtyDayCash)}</Badge>
                    <Badge variant="muted">90-day {Math.round(forecast.ninetyDayCash)}</Badge>
                    <Badge variant="muted">reserve required {Math.round(forecast.reserveRequired)}</Badge>
                    {forecast.nextCriticalDueInDays != null && <Badge variant="warning">next due in {forecast.nextCriticalDueInDays}d</Badge>}
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    {(forecast.scenarios ?? []).map((s: any) => (
                      <div key={s.name} className="flex justify-between border-b py-1">
                        <span className="capitalize">{s.name.replace("_", " ")}</span>
                        <span className="text-muted-foreground">
                          ending {Math.round(s.endingCash)} · min {Math.round(s.minCash)} ·{" "}
                          {s.reserveBreachWeek ? <span className="text-destructive">reserve breach wk {s.reserveBreachWeek}</span> : "no reserve breach (13wk)"}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 6: Fund allocation */}
              {Array.isArray(plan?.fundAllocationChanges) && plan.fundAllocationChanges.length > 0 && (
                <section className="border rounded-lg p-4 bg-white">
                  <h2 className="font-bold mb-2">Fund allocation</h2>
                  <ul className="space-y-1 text-sm">
                    {plan.fundAllocationChanges.map((c: string, i: number) => (<li key={i} className="text-muted-foreground">• {c}</li>))}
                  </ul>
                </section>
              )}

              {/* 7: Spend governance */}
              <section className="border rounded-lg p-4 bg-white">
                <h2 className="font-bold mb-2">Spend governance</h2>
                {Array.isArray(plan?.spendRestrictions) && plan.spendRestrictions.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {plan.spendRestrictions.map((r: string, i: number) => (<li key={i} className="text-muted-foreground">• {r}</li>))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">No active spend restrictions.</p>}
                {Array.isArray(plan?.requiredProof) && plan.requiredProof.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2"><strong>Proof required:</strong> {plan.requiredProof.join("; ")}</p>
                )}
                {signals.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {signals.map((s: any, i: number) => (
                      <span key={i} title={s.message}>
                        <Badge variant={SIGNAL_VARIANT[s.severity] ?? "muted"}>{s.type}</Badge>
                      </span>
                    ))}
                  </div>
                )}
              </section>

              {/* 8: Accountability */}
              <section className="border rounded-lg p-4 bg-white">
                <h2 className="font-bold mb-2">Accountability</h2>
                {Array.isArray(plan?.accountableRoles) && plan.accountableRoles.length > 0 && (
                  <div className="text-sm text-muted-foreground">Accountable: {plan.accountableRoles.join(", ")}</div>
                )}
                {authorities.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs">
                    {authorities.map((a: any) => (
                      <div key={a.id} className="flex justify-between border-b py-1">
                        <span>{a.subjectRole ?? a.subjectUserId ?? "role"}{a.scopeCategory ? ` · ${a.scopeCategory}` : ""}</span>
                        <span className="flex items-center gap-2">
                          <Badge variant={a.status === "NORMAL" || a.status === "RESTORED" ? "muted" : "warning"}>{a.status}</Badge>
                          {a.reason && <span className="text-muted-foreground">{a.reason}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground mt-1">No budget-authority restrictions recorded.</p>}
              </section>

              {/* 9: Linked actions (advisory, not persisted tasks) */}
              <section className="border rounded-lg p-4 bg-white">
                <h2 className="font-bold mb-1">Generated actions</h2>
                <p className="text-xs text-muted-foreground mb-2">⚠ Advisory recommendations — these are NOT yet persisted execution tasks (deep action-system linkage is PARTIAL).</p>
                {actions.length === 0 ? <p className="text-sm text-muted-foreground">No actions generated.</p> : (
                  <div className="space-y-2">
                    {actions.map((a: any, i: number) => (
                      <div key={i} className="border rounded p-3">
                        <div className="flex justify-between items-start">
                          <span className="font-semibold">{a.title}</span>
                          <Badge variant="muted">{a.decisionType}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {a.accountableRole} · review in {a.reviewInDays}d · impact: {a.expectedFinancialImpact}
                        </div>
                        {a.requiredProof && <div className="text-xs text-muted-foreground">Proof: {a.requiredProof}</div>}
                        {a.killRule && <div className="text-xs text-muted-foreground">Kill rule: {a.killRule}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* What not to do */}
              {Array.isArray(plan?.whatNotToDo) && plan.whatNotToDo.length > 0 && (
                <section className="border rounded-lg p-4 bg-white">
                  <h2 className="font-bold mb-2">What not to do now</h2>
                  <ul className="space-y-1 text-sm">
                    {plan.whatNotToDo.map((w: string, i: number) => (<li key={i} className="text-muted-foreground">• {w}</li>))}
                  </ul>
                </section>
              )}

              {/* 10: Owner override */}
              <section className="border rounded-lg p-4 bg-white">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">Owner override</h2>
                  <Button onClick={() => setShowOverride((s) => !s)}>{showOverride ? "Cancel" : "Override this plan"}</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  You may override most recommendations — it is logged, risk-disclosed, and reassessed. Illegal/unsafe actions (unverified vendor bank change, statutory-reserve breach, unlawful employee action) are refused by the server.
                </p>
                {showOverride && (
                  <form onSubmit={submitOverride} className="mt-3 space-y-3">
                    <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-xs">
                      <strong>Risk:</strong> overriding the {mode} plan may accept the risk it was protecting against ({plan?.decisionType}: {plan?.nextBestAction}).
                    </div>
                    <Input name="reason" label="Override reason (required)" required />
                    <Input name="expectedConsequence" label="Expected consequence (required)" required />
                    <Input name="reviewInDays" label="Review in (days)" type="number" defaultValue="14" />
                    <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit override"}</Button>
                  </form>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
