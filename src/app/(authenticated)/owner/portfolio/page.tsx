"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button } from "@/ui/primitives";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic portfolio payload is untyped; load() fetch-on-mount is intentional */

const HEALTH_VARIANT = (score: number): "success" | "default" | "warning" | "destructive" =>
  score >= 70 ? "success" : score >= 50 ? "default" : score >= 30 ? "warning" : "destructive";
const RISK_VARIANT = (score: number): "success" | "default" | "warning" | "destructive" =>
  score >= 70 ? "destructive" : score >= 40 ? "warning" : score >= 20 ? "default" : "success";

const ALERT_VARIANT: Record<string, "warning" | "destructive"> = {
  survival_risk: "destructive",
  cash_risk: "destructive",
  execution_risk: "warning",
};

async function api(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

function score(n: number | null): string {
  return n === null ? "—" : String(Math.round(n));
}

export default function OwnerPortfolioPage() {
  const [view, setView] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api("/api/owner/portfolio/dashboard");
      setView(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="p-8">Loading portfolio…</div>;

  const businesses: any[] = view?.businesses ?? [];
  const byId = (id: string | null) => businesses.find((b) => b.businessId === id)?.name ?? "—";
  const ranking = view?.ranking ?? {};

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Portfolio Command Center</h1>
          <p className="text-muted-foreground text-sm">
            Every business in one view — which is healthiest, which needs attention today, where to spend time, and where to invest.
          </p>
        </div>
        <Link href="/owner"><Button>Command Center</Button></Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!view?.hasData ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          {view?.businessCount > 0
            ? "No business has a diagnosis yet. Run a diagnosis in any domain to populate the portfolio."
            : "No businesses yet. Create one in any owner domain to begin."}
        </div>
      ) : (
        <div className="space-y-6">
          <section className="border rounded-lg p-4 bg-white">
            <div className="text-xs uppercase text-muted-foreground mb-2">Portfolio health</div>
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant={HEALTH_VARIANT(view.portfolioHealthScore)}>
                Health {Math.round(view.portfolioHealthScore)}/100
              </Badge>
              <span className="text-xs text-muted-foreground">{view.businessCount} business(es)</span>
            </div>
          </section>

          <section className="border rounded-lg p-4 bg-white">
            <h2 className="font-bold mb-3">Cross-business ranking</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div>Most urgent: <strong>{byId(ranking.mostUrgentBusinessId)}</strong></div>
              <div>Highest profit opportunity: <strong>{byId(ranking.highestProfitOpportunityBusinessId)}</strong></div>
              <div>Highest cash risk: <strong>{byId(ranking.highestCashRiskBusinessId)}</strong></div>
              <div>Worst execution problem: <strong>{byId(ranking.worstExecutionProblemBusinessId)}</strong></div>
              <div>Best growth candidate: <strong>{byId(ranking.bestGrowthCandidateBusinessId)}</strong></div>
            </div>
          </section>

          {Array.isArray(view.top3Priorities) && view.top3Priorities.length > 0 && (
            <section className="border-2 border-foreground/10 rounded-lg p-4 bg-white">
              <div className="text-xs uppercase text-muted-foreground mb-2">Today&apos;s top 3 priorities</div>
              <div className="space-y-2">
                {view.top3Priorities.map((p: any, i: number) => (
                  <div key={p.action?.id ?? i} className="border-b py-1">
                    <div className="font-semibold">{i + 1}. {p.action?.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.businessName} · {p.action?.domain} · priority {Math.round(p.action?.priorityScore ?? 0)} · verify via {p.action?.verificationMetric}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {view.investmentRecommendation && (
            <section className="border rounded-lg p-4 bg-white">
              <div className="text-xs uppercase text-muted-foreground">Investment recommendation</div>
              <div className="font-semibold">{view.investmentRecommendation.businessName}</div>
              <p className="text-xs text-muted-foreground">{view.investmentRecommendation.reason}</p>
            </section>
          )}

          {Array.isArray(view.riskAlerts) && view.riskAlerts.length > 0 && (
            <section className="border rounded-lg p-4 bg-white">
              <h2 className="font-bold mb-3">Risk alerts</h2>
              <div className="space-y-2">
                {view.riskAlerts.map((a: any, i: number) => (
                  <div key={`${a.businessId}-${a.type}-${i}`} className="flex justify-between items-center border-b py-1 text-sm">
                    <span>{a.businessName} — {a.message}</span>
                    <Badge variant={ALERT_VARIANT[a.type] || "warning"}>{a.type.replace("_", " ")}</Badge>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="border rounded-lg p-4 bg-white">
            <h2 className="font-bold mb-3">Businesses (most urgent first)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1 pr-3">Business</th>
                    <th className="py-1 px-2">Health</th>
                    <th className="py-1 px-2">Survival risk</th>
                    <th className="py-1 px-2">Growth opp</th>
                    <th className="py-1 px-2">Exec risk</th>
                    <th className="py-1 px-2">Fin</th>
                    <th className="py-1 px-2">Sales</th>
                    <th className="py-1 px-2">Ops</th>
                    <th className="py-1 px-2">Cash</th>
                    <th className="py-1 px-2">Exec</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((b: any) => (
                    <tr key={b.businessId} className="border-b">
                      <td className="py-1 pr-3 font-medium">{b.name}{!b.hasData && <span className="text-muted-foreground"> (no data)</span>}</td>
                      <td className="py-1 px-2"><Badge variant={HEALTH_VARIANT(b.overallHealthScore)}>{score(b.overallHealthScore)}</Badge></td>
                      <td className="py-1 px-2"><Badge variant={RISK_VARIANT(b.survivalRiskScore)}>{score(b.survivalRiskScore)}</Badge></td>
                      <td className="py-1 px-2">{score(b.growthOpportunityScore)}</td>
                      <td className="py-1 px-2"><Badge variant={RISK_VARIANT(b.executionRiskScore)}>{score(b.executionRiskScore)}</Badge></td>
                      <td className="py-1 px-2">{score(b.financialScore)}</td>
                      <td className="py-1 px-2">{score(b.salesScore)}</td>
                      <td className="py-1 px-2">{score(b.operationsScore)}</td>
                      <td className="py-1 px-2">{score(b.cashflowScore)}</td>
                      <td className="py-1 px-2">{score(b.executionScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
