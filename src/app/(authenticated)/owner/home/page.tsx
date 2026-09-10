"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, CardDashboardSkeleton } from "@/ui/primitives";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { CanonicalCockpitLink } from "@/components/owner/CanonicalCockpitLink";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- dynamic owner-home payload is untyped; load() fetch-on-mount is intentional */

// Mobile-first §19 owner home: risk-first, money-first, one clear set of next actions,
// every action carries its verification, insights tied to actions. Nothing invented —
// "no data" / "unknown" surfaces are shown honestly.

interface AlertSummary {
  alerts: Array<{ id: string; message: string; severity: string; type: string }>;
  unreadCount: number;
}

const DANGER_VARIANT: Record<string, "success" | "default" | "warning" | "destructive" | "muted"> = {
  unknown: "muted",
  none: "success",
  low: "default",
  elevated: "warning",
  high: "destructive",
  critical: "destructive",
};
const SEVERITY_VARIANT: Record<string, "success" | "default" | "warning" | "destructive"> = {
  critical: "destructive",
  high: "destructive",
  medium: "warning",
  low: "default",
};
const HEALTH_VARIANT = (score: number): "success" | "default" | "warning" | "destructive" =>
  score >= 70 ? "success" : score >= 50 ? "default" : score >= 30 ? "warning" : "destructive";

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

async function api(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
  return data;
}

function DangerCard({ label, danger }: { label: string; danger: any }) {
  const level = danger?.level ?? "unknown";
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <Badge variant={DANGER_VARIANT[level] || "muted"}>{level === "unknown" ? "no data" : level}</Badge>
        <span className="text-sm text-muted-foreground">
          {danger?.riskScore === null || danger?.riskScore === undefined ? "—" : `${Math.round(danger.riskScore)}/100`}
        </span>
      </div>
    </div>
  );
}

export default function OwnerHomePage() {
  const [data, setData] = useState<any | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alertSummary, setAlertSummary] = useState<AlertSummary | null>(null);

  const load = useCallback(async (businessId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = businessId ? `?businessId=${businessId}` : "";
      const res = await api(`/api/owner/home${qs}`);
      setData(res);
      setSelected(res.selectedBusinessId);
      // Load alert summary (best-effort — must not break home if alerts API is down)
      api("/api/owner/alerts?severity=critical&limit=3")
        .then((d) => setAlertSummary({ alerts: d.alerts ?? [], unreadCount: d.unreadCount ?? 0 }))
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <CardDashboardSkeleton label="Loading owner home" />;

  const businesses: any[] = data?.businesses ?? [];
  const s = data?.summary ?? null;

  return (
    <div className="mx-auto max-w-md sm:max-w-2xl md:max-w-4xl py-6 px-4">
      <div className="mb-4"><CanonicalCockpitLink from="home" /></div>
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Owner Home</h1>
            <p className="text-muted-foreground text-xs">Risk first. Money first. One clear set of next actions.</p>
          </div>
          <Link href="/owner"><Button>Command Center</Button></Link>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Domain navigation">
          {[
            { label: "Finance", href: "/owner/finance" },
            { label: "Cashflow", href: "/owner/cashflow" },
            { label: "Sales", href: "/owner/sales" },
            { label: "Operations", href: "/owner/operations" },
            { label: "Execution", href: "/owner/execution" },
            { label: "Data Intake", href: "/owner/intake" },
            { label: "Approvals", href: "/owner/approvals" },
            { label: "Learning", href: "/owner/learning" },
            { label: "Delegation", href: "/owner/tasks" },
            { label: "Automation", href: "/owner/automation" },
            { label: "Growth Pricing", href: "/owner/growth-pricing" },
          ].map(({ label, href }) => (
            <Link key={href} href={href}>
              <Button className="min-h-[44px] text-xs py-1 px-2">{label}</Button>
            </Link>
          ))}
        </nav>
      </div>

      {/* Alert summary — critical alerts and unread count */}
      {alertSummary && (alertSummary.unreadCount > 0 || alertSummary.alerts.length > 0) && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-semibold text-destructive">
              {alertSummary.unreadCount > 0 ? `${alertSummary.unreadCount} unread alert${alertSummary.unreadCount === 1 ? "" : "s"}` : "Critical alerts"}
            </span>
            <Link href="/owner/alerts" className="text-xs underline text-destructive">View all →</Link>
          </div>
          {alertSummary.alerts.length > 0 && (
            <ul className="space-y-1">
              {alertSummary.alerts.map((a) => (
                <li key={a.id} className="text-xs text-destructive truncate">
                  · {a.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {businesses.length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-muted-foreground">
          No businesses yet. Start in <Link href="/owner/finance" className="underline">Finance</Link>.
        </div>
      ) : (
        <>
          <div className="mb-4">
            <BusinessContextSelector
              businesses={businesses}
              selectedId={selected}
              onChange={(businessId) => load(businessId)}
            />
          </div>

          {!data?.hasData || !s ? (
            <div className="border rounded-lg p-6 text-center text-muted-foreground">
              No business condition yet. Run a diagnosis in{" "}
              <Link href="/owner/finance" className="underline">Finance</Link> to populate your home.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Business health */}
              <section className="border rounded-lg p-4 bg-card text-center">
                <div className="text-xs uppercase text-muted-foreground">Business health</div>
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  <Badge variant={HEALTH_VARIANT(s.businessHealthScore)}>
                    {Math.round(s.businessHealthScore)}/100
                  </Badge>
                  {typeof s.dataConfidenceScore === "number" && (
                    <Badge variant="muted">
                      confidence {Math.round(s.dataConfidenceScore)}/100
                    </Badge>
                  )}
                </div>
              </section>

              {/* Danger surfaces (money first, then execution) */}
              <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <DangerCard label="Cash danger" danger={s.cashDanger} />
                <DangerCard label="Sales danger" danger={s.salesDanger} />
                <DangerCard label="Operations danger" danger={s.operationsDanger} />
                <DangerCard label="Execution danger" danger={s.executionDanger} />
              </section>

              {/* Today's required actions */}
              <section className="border-2 border-foreground/10 rounded-lg p-4 bg-card">
                <div className="text-xs uppercase text-muted-foreground mb-2">Today&apos;s required actions</div>
                {s.requiredActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open actions from diagnosed domains — run a diagnosis in each domain to see required actions.</p>
                ) : (
                  <div className="space-y-1">
                    {s.requiredActions.map((a: any, i: number) => (
                      DOMAIN_LINK[a.domain] ? (
                        <Link
                          key={`${a.domain}-${a.findingCode}-${i}`}
                          href={DOMAIN_LINK[a.domain]}
                          className="block w-full py-3 px-3 rounded-lg border-b hover:bg-accent/50 transition-colors min-h-[44px]"
                        >
                          <div className="font-semibold text-sm">{i + 1}. {a.title}</div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 items-center mt-0.5">
                            <Badge variant="muted">{a.domain}</Badge>
                            <span>priority {Math.round(a.priorityScore)}</span>
                            <span>· impact {Math.round(a.expectedImpactScore)}</span>
                          </div>
                        </Link>
                      ) : (
                        <div key={`${a.domain}-${a.findingCode}-${i}`} className="py-3 px-3 border-b min-h-[44px]">
                          <div className="font-semibold text-sm">{i + 1}. {a.title}</div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 items-center mt-0.5">
                            <Badge variant="muted">{a.domain}</Badge>
                            <span>priority {Math.round(a.priorityScore)}</span>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </section>

              {/* Top risks + opportunities side-by-side on tablet */}
              <div className="md:grid md:grid-cols-2 md:gap-4 space-y-5 md:space-y-0">
              {/* Top 3 risks */}
              <section className="border rounded-lg p-4 bg-card">
                <div className="text-xs uppercase text-muted-foreground mb-2">Top risks</div>
                {s.top3Risks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No risks from diagnosed domains — run a domain diagnosis to surface risks.</p>
                ) : (
                  <div className="space-y-2">
                    {s.top3Risks.map((r: any) => (
                      <div key={`${r.domain}-${r.code}`} className="flex justify-between items-start gap-2 border-b pb-2">
                        <div>
                          <div className="text-sm font-medium">{r.title}</div>
                          <div className="text-xs text-muted-foreground">{r.domain} · impact {Math.round(r.impactScore)}</div>
                        </div>
                        <Badge variant={SEVERITY_VARIANT[r.severity] || "default"}>{r.severity}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Top 3 opportunities */}
              <section className="border rounded-lg p-4 bg-card md:mt-0">
                <div className="text-xs uppercase text-muted-foreground mb-2">Top opportunities</div>
                {s.top3Opportunities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No opportunities from diagnosed domains — run a domain diagnosis to surface opportunities.</p>
                ) : (
                  <div className="space-y-2">
                    {s.top3Opportunities.map((o: any) => (
                      <div key={`${o.domain}-${o.code}`} className="flex justify-between items-start gap-2 border-b pb-2">
                        <div>
                          <div className="text-sm font-medium">{o.title}</div>
                          <div className="text-xs text-muted-foreground">{o.domain}</div>
                        </div>
                        <Badge variant="success">impact {Math.round(o.impactScore)}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              </div>

              {/* Last verified improvement */}
              <section className="border rounded-lg p-4 bg-card">
                <div className="text-xs uppercase text-muted-foreground">Last verified improvement</div>
                {s.lastVerifiedImprovement ? (
                  <div className="mt-1 text-sm">
                    <div className="font-medium">{s.lastVerifiedImprovement.actionTitle}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.lastVerifiedImprovement.domain} · {s.lastVerifiedImprovement.metric}:{" "}
                      {s.lastVerifiedImprovement.beforeValue ?? "—"} → {s.lastVerifiedImprovement.afterValue ?? "—"} ·{" "}
                      {new Date(s.lastVerifiedImprovement.verifiedAt).toLocaleDateString()}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    No verified improvement yet — complete and verify an action to see proof here.
                  </p>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
