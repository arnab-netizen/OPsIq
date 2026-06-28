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

// POST helper — owner ACTS through secured routes (server still enforces every gate).
// Returns { ok, status, data } so the caller can render the gate/proof/arbitration reason.
async function apiPost(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return { ok: false, status: 0, data: { error: "Request timed out." } };
    return { ok: false, status: 0, data: { error: e instanceof Error ? e.message : "Request failed." } };
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

/**
 * EH-03/EH-04 — minimal owner action controls. The owner can ACT (not just read):
 * complete a proof-gated task and resolve an approval. Calls the secured POST routes;
 * the server enforces every gate, and the gate/proof reason is surfaced here.
 */
function OwnerActions() {
  const [taskId, setTaskId] = useState("");
  const [ownerOverride, setOwnerOverride] = useState(false);
  const [taskResult, setTaskResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [taskBusy, setTaskBusy] = useState(false);

  const [scope, setScope] = useState("");
  const [actionType, setActionType] = useState("");
  const [riskClass, setRiskClass] = useState("medium");
  const [content, setContent] = useState("");
  const [apprResult, setApprResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [apprBusy, setApprBusy] = useState(false);

  const completeTask = async () => {
    if (!taskId.trim()) return;
    setTaskBusy(true);
    setTaskResult(null);
    const r = await apiPost("/api/owner/tasks/complete", { taskId: taskId.trim(), ownerOverride });
    if (r.ok) setTaskResult({ ok: true, text: `Completed — status ${r.data.status}.` });
    else if (r.status === 409 && r.data?.blocked) setTaskResult({ ok: false, text: `Blocked: ${r.data.reason}.` });
    else setTaskResult({ ok: false, text: r.data?.error?.message || r.data?.error || `Failed (${r.status}).` });
    setTaskBusy(false);
  };

  const resolveApproval = async () => {
    if (!scope.trim() || !actionType.trim() || !content.trim()) return;
    setApprBusy(true);
    setApprResult(null);
    const r = await apiPost("/api/owner/approvals/resolve", { scope: scope.trim(), actionType: actionType.trim(), riskClass, content: { note: content.trim() } });
    if (r.ok) {
      const handled = r.data.handledByOpsIQ ? "OpsIQ handled this" : "owner decision required";
      setApprResult({ ok: r.data.handledByOpsIQ, text: `${r.data.outcome} (${handled}).` });
    } else setApprResult({ ok: false, text: r.data?.error?.message || r.data?.error || `Failed (${r.status}).` });
    setApprBusy(false);
  };

  return (
    <section className="border rounded-lg p-4 bg-white" data-testid="owner-actions">
      <div className="text-xs uppercase text-muted-foreground mb-3">Owner actions</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-medium">Complete a proof-gated task</div>
          <input
            className="w-full border rounded px-2 py-2 text-sm min-h-[44px]"
            placeholder="Task ID"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={ownerOverride} onChange={(e) => setOwnerOverride(e.target.checked)} />
            Owner override (audited; bypasses proof gate)
          </label>
          <Button className="min-h-[44px]" disabled={taskBusy || !taskId.trim()} onClick={completeTask}>
            {taskBusy ? "Completing…" : "Complete task"}
          </Button>
          {taskResult && (
            <p className={`text-xs ${taskResult.ok ? "text-success" : "text-destructive"}`}>{taskResult.text}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Resolve an approval</div>
          <input className="w-full border rounded px-2 py-2 text-sm min-h-[44px]" placeholder="Scope (e.g. pricing.discount)" value={scope} onChange={(e) => setScope(e.target.value)} />
          <input className="w-full border rounded px-2 py-2 text-sm min-h-[44px]" placeholder="Action type (e.g. apply_discount)" value={actionType} onChange={(e) => setActionType(e.target.value)} />
          <Select
            name="riskClass"
            label="Risk class"
            value={riskClass}
            onChange={(e: any) => setRiskClass(e.target.value)}
            options={["low", "medium", "high", "critical"].map((r) => ({ value: r, label: r }))}
          />
          <input className="w-full border rounded px-2 py-2 text-sm min-h-[44px]" placeholder="Decision summary" value={content} onChange={(e) => setContent(e.target.value)} />
          <Button className="min-h-[44px]" disabled={apprBusy || !scope.trim() || !actionType.trim() || !content.trim()} onClick={resolveApproval}>
            {apprBusy ? "Resolving…" : "Resolve approval"}
          </Button>
          {apprResult && (
            <p className={`text-xs ${apprResult.ok ? "text-success" : "text-muted-foreground"}`}>{apprResult.text}</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function OwnerCommandCenterPage() {
  const [data, setData] = useState<any | null>(null);
  const [control, setControl] = useState<any | null>(null);
  const [businesses, setBusinesses] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const loadProfile = useCallback(async (businessId?: string | null) => {
    setProfileLoading(true);
    setError(null);
    try {
      const qs = businessId ? `?businessId=${businessId}` : "";
      const res = await api(`/api/owner/command-center${qs}`);
      setData(res);
      setSelected(res.selectedBusinessId);
      // Owner control center (safety/blocked/attention/what-not-to-do). Non-fatal if it fails.
      try {
        setControl(await api(`/api/owner/control-center${qs}`));
      } catch {
        setControl(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const load = useCallback(async (businessId?: string | null) => {
    if (businesses === null) {
      setLoading(true);
      try {
        const biz = await api("/api/owner/businesses");
        setBusinesses(biz.businesses ?? []);
      } catch {
        // fall through to full load
      } finally {
        setLoading(false);
      }
    }
    await loadProfile(businessId);
  }, [businesses, loadProfile]);

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

  const businessList: any[] = businesses ?? data?.businesses ?? [];
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
            { label: "Budget & Profit Plan", href: "/owner/budget", domain: null },
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

      {businessList.length === 0 ? (
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
              options={businessList.map((b) => ({ value: b.id, label: `${b.name} (${b.currency})` }))}
            />
          </div>

          {businessList.length > 1 && selected && (
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {businessList.find((b) => b.id === selected)?.name ?? ""}
            </h2>
          )}

          {profileLoading ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground animate-pulse">
              Loading diagnosis…
            </div>
          ) : !data?.hasData || !profile ? (
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

              {control && (
                <section className="border-2 border-foreground/20 rounded-lg p-4 bg-white" data-testid="owner-control-center">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs uppercase text-muted-foreground">OpsIQ control center</div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={control.needsOwnerAttention ? "warning" : "success"}>
                        {control.ownerActionsToday} owner action{control.ownerActionsToday === 1 ? "" : "s"} today
                      </Badge>
                      <Badge variant="muted">{control.handledByOpsIQ} handled by OpsIQ</Badge>
                    </div>
                  </div>

                  {control.criticalAlerts?.length > 0 && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-1 mb-3">
                      <strong className="text-destructive">Critical:</strong>
                      <ul className="list-disc ml-5">
                        {control.criticalAlerts.map((a: string, i: number) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}

                  {control.whatNotToDo?.length > 0 && (
                    <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm space-y-1 mb-3">
                      <strong>What NOT to do now:</strong>
                      <ul className="list-disc ml-5">
                        {control.whatNotToDo.map((a: string, i: number) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}

                  {control.nextBestAction && (
                    <div className="text-sm mb-3">
                      <span className="font-medium">Next best action:</span> {control.nextBestAction}
                    </div>
                  )}

                  <div className="mb-3"><OwnerActions /></div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {[
                      { label: "Blocked recs", value: control.sections?.blockedRecommendations, warn: true },
                      { label: "Finance blocked", value: control.sections?.financeBlocked, warn: true },
                      { label: "Proof blocked", value: control.sections?.proofBlocked, warn: true },
                      { label: "Equipment bottlenecks", value: control.sections?.equipmentBottlenecks, warn: true },
                      { label: "SOPs to review", value: control.sections?.sopsNeedingReview, warn: false },
                      { label: "Training items", value: control.sections?.trainingRecommendations, warn: false },
                      { label: "Process reviews due", value: control.sections?.processReviewsDue, warn: false },
                      { label: "Reassessments due", value: control.sections?.reassessmentsDue, warn: true },
                      { label: "Owner decisions", value: control.attention?.ownerDecisionsRequired, warn: false },
                    ].map((s) => (
                      <div key={s.label} className="border rounded p-2 flex flex-col">
                        <span className={`text-lg font-semibold ${s.warn && (s.value ?? 0) > 0 ? "text-destructive" : ""}`}>
                          {s.value ?? 0}
                        </span>
                        <span className="text-muted-foreground">{s.label}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

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
