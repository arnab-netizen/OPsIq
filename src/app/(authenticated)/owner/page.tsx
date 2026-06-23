"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Select } from "@/ui/primitives";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic command-center payload is untyped; load() fetch-on-mount is intentional */

const MISSING_INPUT_REASON: Record<string, string> = {
  revenue: "needed to compute margins, cash runway, and survival risk",
  costs: "needed to determine profitability and cost structure",
  cashOnHand: "needed to compute cash runway and survival risk",
  costOfGoods: "needed to compute gross margin",
  fixedCosts: "needed to separate structural vs. variable costs",
  payroll: "needed to assess payroll sustainability",
  debtPayments: "needed to assess debt coverage and liquidity risk",
  receivables: "needed to compute days-sales-outstanding and cash conversion",
  payables: "needed to assess supplier payment risk",
  ownerWithdrawals: "needed to assess owner cash drain",
  orderCount: "needed to compute revenue per order",
  customerCount: "needed to compute revenue per customer",
  discountAmount: "needed to assess discount impact on margins",
  refundReworkCost: "needed to assess quality and rework drain",
};

const RISK_VARIANT = (score: number): "success" | "default" | "warning" | "destructive" =>
  score >= 70 ? "destructive" : score >= 40 ? "warning" : score >= 20 ? "default" : "success";
const HEALTH_VARIANT = (score: number): "success" | "default" | "warning" | "destructive" =>
  score >= 70 ? "success" : score >= 50 ? "default" : score >= 30 ? "warning" : "destructive";

const FETCH_TIMEOUT_MS = 10_000;

async function api(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Request timed out after 10 seconds. Check your connection and try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const DOMAIN_LINK: Record<string, string> = {
  finance: "/owner/finance",
  cashflow: "/owner/cashflow",
  sales: "/owner/sales",
  operations: "/owner/operations",
  sop: "/owner/execution",
  marketing: "/owner/marketing",
  strategy: "/owner/strategy",
  recovery: "/owner/recovery",
};

export default function OwnerCommandCenterPage() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (businessId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = businessId ? `?businessId=${businessId}` : "";
      const res = await api(`/api/owner/command-center${qs}`);
      setData(res);
      setSelected(res.selectedBusinessId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="p-8">Loading owner command center…</div>;
  if (error && !data) return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <p className="font-medium mb-2">Failed to load command center</p>
        <p className="mb-4">{error}</p>
        <Button onClick={() => load()} className="min-h-[44px]">Retry</Button>
      </div>
    </div>
  );

  const businesses: any[] = data?.businesses ?? [];
  const profile = data?.profile ?? null;
  const next = profile?.recommendedNextAction ?? null;
  const missing: string[] = profile?.missingCriticalData ?? [];
  const missingWithPriority: Array<{ field: string; priority: string }> = data?.missingInputsWithPriority ?? [];

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Owner Command Center</h1>
          <p className="text-muted-foreground text-sm">
            One business condition. One highest-impact next action. Evidence, not guesses.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Home", href: "/owner/home", domain: null },
            { label: "Finance", href: "/owner/finance", domain: "finance" },
            { label: "Cashflow", href: "/owner/cashflow", domain: "cashflow" },
            { label: "Sales", href: "/owner/sales", domain: "sales" },
            { label: "Operations", href: "/owner/operations", domain: "operations" },
            { label: "Execution", href: "/owner/execution", domain: "sop" },
            { label: "Marketing", href: "/owner/marketing", domain: "marketing" },
            { label: "Strategy", href: "/owner/strategy", domain: "strategy" },
            { label: "Portfolio", href: "/owner/portfolio", domain: null },
            { label: "Data Intake", href: "/owner/intake", domain: null },
            { label: "Trust", href: "/owner/trust", domain: null },
            { label: "Recovery", href: "/owner/recovery", domain: "recovery" },
          ].map(({ label, href, domain }) => {
            const isRecommended = domain !== null && next?.domain === domain;
            return (
              <Link key={href} href={href}>
                <Button
                  className={`min-h-[44px] min-w-[44px] py-3${isRecommended ? " ring-2 ring-foreground" : ""}`}
                  title={isRecommended ? "Recommended domain" : undefined}
                >
                  {label}{isRecommended ? " ★" : ""}
                </Button>
              </Link>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {businesses.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No businesses yet. Start in <Link href="/owner/finance" className="underline">Finance</Link> or{" "}
          <Link href="/owner/recovery" className="underline">Recovery</Link> to create one.
        </div>
      ) : (
        <>
          <div className="mb-6 w-72">
            <Select
              name="businessSelector"
              label="Business"
              value={selected ?? undefined}
              onChange={(e: any) => load(e.target.value)}
              options={businesses.map((b) => ({ value: b.id, label: `${b.name} (${b.currency})` }))}
            />
          </div>

          {businesses.length > 1 && selected && (
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {businesses.find((b) => b.id === selected)?.name ?? ""}
            </h2>
          )}

          {!data?.hasData || !profile ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              Your OpsIQ diagnosis requires business data.{" "}
              <Link href="/owner/intake" className="underline">Upload your data →</Link>
            </div>
          ) : (
            <div className="space-y-6">
              <section className="border rounded-lg p-4 bg-white">
                <div className="text-xs uppercase text-muted-foreground mb-2">Business condition</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={HEALTH_VARIANT(profile.overallHealthScore)}>
                    Health {Math.round(profile.overallHealthScore)}/100
                  </Badge>
                  <Badge variant={RISK_VARIANT(profile.survivalRiskScore)}>
                    Survival risk {Math.round(profile.survivalRiskScore)}/100
                  </Badge>
                  <Badge variant="default">Growth opportunity {Math.round(profile.growthOpportunityScore)}/100</Badge>
                  <Badge variant={RISK_VARIANT(profile.executionRiskScore)}>
                    Execution risk {Math.round(profile.executionRiskScore)}/100
                  </Badge>
                  <Badge variant="muted">Data confidence {Math.round(profile.dataConfidenceScore)}/100</Badge>
                </div>
                {(() => {
                  const topFindings: any[] = profile.topFindings ?? [];
                  const driver = topFindings.find((f: any) => f.severity === "critical") ??
                    topFindings.find((f: any) => f.severity === "high") ??
                    topFindings[0];
                  return driver ? (
                    <div className="text-xs text-muted-foreground mt-2">
                      <span className="font-medium">Primary driver:</span>{" "}
                      <span className="capitalize">{driver.domain}</span> — {driver.title}
                    </div>
                  ) : null;
                })()}
                <div className="text-xs text-muted-foreground mt-1">
                  Domains wired: {(data.domainsWired ?? []).join(", ") || "none"}
                </div>
              </section>

              {data.isStaleData && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm flex items-center justify-between">
                  <span>
                    <strong>Stale data:</strong> Your finance data is {data.dataAgeDays} day{data.dataAgeDays === 1 ? "" : "s"} old — diagnosis may not reflect current conditions.
                  </span>
                  <Link href="/owner/intake" className="ml-4 underline whitespace-nowrap">Update now →</Link>
                </div>
              )}

              {missingWithPriority.length > 0 && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm space-y-2">
                  <strong>Missing finance inputs ({missingWithPriority.filter((m: any) => m.priority === "CRITICAL").length} critical, {missingWithPriority.filter((m: any) => m.priority === "IMPORTANT").length} important):</strong>
                  <div className="space-y-1 mt-1">
                    {missingWithPriority.map((m: any) => (
                      <div key={m.field} className="flex items-start gap-2">
                        <Badge variant={m.priority === "CRITICAL" ? "destructive" : "warning"} className="mt-0.5 shrink-0">{m.priority}</Badge>
                        <span>
                          <span className="font-medium">{m.field}</span>
                          {MISSING_INPUT_REASON[m.field] && (
                            <span className="text-muted-foreground"> — {MISSING_INPUT_REASON[m.field]}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Link href="/owner/intake" className="text-xs underline">Add missing data →</Link>
                </div>
              )}

              {missing.length > 0 && missingWithPriority.length === 0 && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                  <strong>Missing critical data:</strong> {missing.join(", ")} — provide these to raise confidence.
                </div>
              )}

              <section className="border-2 border-foreground/10 rounded-lg p-4 bg-white">
                <div className="text-xs uppercase text-muted-foreground">Do this next</div>
                {next ? (
                  <>
                    <div className="text-lg font-semibold">{next.title}</div>
                    <p className="text-sm text-muted-foreground">{next.description}</p>
                    {next.evidenceRationale && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        Why: {next.evidenceRationale}
                      </p>
                    )}
                    {next.evidence && next.evidence.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Based on: {next.evidence.join(" · ")}
                      </p>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2 items-center">
                      <Badge variant="muted">{next.domain}</Badge>
                      <span>priority {Math.round(next.priorityScore)}</span>
                      <span>· impact {Math.round(next.expectedImpactScore)}</span>
                      <span>· effort {Math.round(next.effortScore)}</span>
                      <span>· verify via {next.verificationMetric}</span>
                    </div>
                    {DOMAIN_LINK[next.domain] && (
                      <Link href={DOMAIN_LINK[next.domain]} className="inline-block mt-3">
                        <Button className="min-h-[44px]">Open {next.domain}</Button>
                      </Link>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No outstanding action — keep verifying outcomes.</p>
                )}
              </section>

              <section className="border rounded-lg p-4 bg-white">
                <h2 className="font-bold mb-3">Domain scores</h2>
                <div className="space-y-2">
                  {(profile.domainScores ?? []).map((d: any) => {
                    const findingCount: number = (d.topFindingCodes ?? []).length;
                    const actionCount: number = (d.topActionCodes ?? []).length;
                    return (
                      <div key={d.domain} className="flex justify-between items-center border-b py-1 text-sm">
                        <span className="capitalize font-medium">{d.domain}</span>
                        <span className="flex flex-wrap gap-2 items-center text-muted-foreground">
                          <Badge variant={HEALTH_VARIANT(d.healthScore)}>health {Math.round(d.healthScore)}</Badge>
                          <Badge variant={RISK_VARIANT(d.riskScore)}>risk {Math.round(d.riskScore)}</Badge>
                          <span>opp {Math.round(d.opportunityScore)}</span>
                          <span className="text-xs">
                            {findingCount > 0 ? `${findingCount} finding${findingCount !== 1 ? "s" : ""}` : <span className="text-destructive/70">no findings</span>}
                            {" · "}
                            {actionCount > 0 ? `${actionCount} action${actionCount !== 1 ? "s" : ""}` : "no actions"}
                          </span>
                          {DOMAIN_LINK[d.domain] && <Link href={DOMAIN_LINK[d.domain]} className="underline">open</Link>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="border rounded-lg p-4 bg-white">
                <h2 className="font-bold mb-1">Reassessment</h2>
                {data.lastDiagnosedAt && (
                  <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
                    <div>Last diagnosed: {new Date(data.lastDiagnosedAt).toLocaleDateString()}</div>
                    {data.nextReassessmentDue && (
                      <div className={new Date(data.nextReassessmentDue) <= new Date() ? "text-warning font-medium" : ""}>
                        Next reassessment {new Date(data.nextReassessmentDue) <= new Date() ? "overdue" : "due"}:{" "}
                        {new Date(data.nextReassessmentDue).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-sm text-muted-foreground mb-3">
                  Run a new diagnosis cycle after updating data, completing actions, or when conditions change.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/owner/finance">
                    <Button className="min-h-[44px]">Re-diagnose Finance</Button>
                  </Link>
                  <Link href="/owner/cashflow">
                    <Button className="min-h-[44px]">Re-diagnose Cashflow</Button>
                  </Link>
                  <Link href="/owner/intake">
                    <Button className="min-h-[44px]">Update data →</Button>
                  </Link>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
