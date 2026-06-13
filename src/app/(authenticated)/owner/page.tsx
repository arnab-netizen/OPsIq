"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Select } from "@/ui/primitives";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic command-center payload is untyped; load() fetch-on-mount is intentional */

const RISK_VARIANT = (score: number): "success" | "default" | "warning" | "destructive" =>
  score >= 70 ? "destructive" : score >= 40 ? "warning" : score >= 20 ? "default" : "success";
const HEALTH_VARIANT = (score: number): "success" | "default" | "warning" | "destructive" =>
  score >= 70 ? "success" : score >= 50 ? "default" : score >= 30 ? "warning" : "destructive";

async function api(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
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

  const businesses: any[] = data?.businesses ?? [];
  const profile = data?.profile ?? null;
  const next = profile?.recommendedNextAction ?? null;
  const missing: string[] = profile?.missingCriticalData ?? [];

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Owner Command Center</h1>
          <p className="text-muted-foreground text-sm">
            One business condition. One highest-impact next action. Evidence, not guesses.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/owner/finance"><Button>Finance</Button></Link>
          <Link href="/owner/cashflow"><Button>Cashflow</Button></Link>
          <Link href="/owner/sales"><Button>Sales</Button></Link>
          <Link href="/owner/operations"><Button>Operations</Button></Link>
          <Link href="/owner/execution"><Button>Execution</Button></Link>
          <Link href="/owner/marketing"><Button>Marketing</Button></Link>
          <Link href="/owner/strategy"><Button>Strategy</Button></Link>
          <Link href="/owner/portfolio"><Button>Portfolio</Button></Link>
          <Link href="/owner/recovery"><Button>Recovery</Button></Link>
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

          {!data?.hasData || !profile ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              No business condition yet. Run a diagnosis in{" "}
              <Link href="/owner/finance" className="underline">Finance</Link> to populate the command center.
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
                <div className="text-xs text-muted-foreground mt-2">
                  Domains wired: {(data.domainsWired ?? []).join(", ") || "none"}
                </div>
              </section>

              {missing.length > 0 && (
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
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2 items-center">
                      <Badge variant="muted">{next.domain}</Badge>
                      <span>priority {Math.round(next.priorityScore)}</span>
                      <span>· impact {Math.round(next.expectedImpactScore)}</span>
                      <span>· effort {Math.round(next.effortScore)}</span>
                      <span>· verify via {next.verificationMetric}</span>
                    </div>
                    {DOMAIN_LINK[next.domain] && (
                      <Link href={DOMAIN_LINK[next.domain]} className="inline-block mt-3">
                        <Button>Open {next.domain}</Button>
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
                  {(profile.domainScores ?? []).map((d: any) => (
                    <div key={d.domain} className="flex justify-between items-center border-b py-1 text-sm">
                      <span className="capitalize font-medium">{d.domain}</span>
                      <span className="flex gap-2 items-center text-muted-foreground">
                        <Badge variant={HEALTH_VARIANT(d.healthScore)}>health {Math.round(d.healthScore)}</Badge>
                        <Badge variant={RISK_VARIANT(d.riskScore)}>risk {Math.round(d.riskScore)}</Badge>
                        <span>opp {Math.round(d.opportunityScore)}</span>
                        {DOMAIN_LINK[d.domain] && <Link href={DOMAIN_LINK[d.domain]} className="underline">open</Link>}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
