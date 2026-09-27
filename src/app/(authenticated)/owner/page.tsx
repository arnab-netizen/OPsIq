"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Button, Select, CardDashboardSkeleton, Disclosure, PageHeader, PageContainer } from "@/ui/primitives";
import { PriorityCommandStrip } from "@/components/owner/PriorityCommandStrip";
import { SupervisorSummary } from "@/components/owner/SupervisorSummary";
import { CanonicalCockpitLink } from "@/components/owner/CanonicalCockpitLink";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";

import { humanizeMetricKey } from "@/lib/metric-label";
import { OwnerDecisionCard } from "@/components/owner/OwnerDecisionCard";
import type { CurrentOwnerDecision } from "@/domain/owner-spine/owner-decision";
import {
  ownerImperativeContext,
  planConstraintAsCondition,
  reconcilePlanCards,
  reconcilePlanGrowthGate,
  reconcilePlanSummary,
} from "@/domain/owner-spine/owner-imperatives";
import { formatHumanDate } from "@/lib/format-human-date";
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

const RISK_VARIANT = (score: number): "success-accessible" | "default-accessible" | "warning-accessible" | "destructive-accessible" =>
  score >= 70 ? "destructive-accessible" : score >= 40 ? "warning-accessible" : score >= 20 ? "default-accessible" : "success-accessible";
const HEALTH_VARIANT = (score: number): "success-accessible" | "default-accessible" | "warning-accessible" | "destructive-accessible" =>
  score >= 70 ? "success-accessible" : score >= 50 ? "default-accessible" : score >= 30 ? "warning-accessible" : "destructive-accessible";

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
    // Never surface a raw error string (operator-error governance). Generic, safe copy only.
    const timedOut = e instanceof Error && e.name === "AbortError";
    return { ok: false, status: 0, data: { error: timedOut ? "Request timed out. Check your connection and try again." : "Could not reach the server. Try again." } };
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
// Canonical domain display names -- matches the nav array's own {label, domain} pairs
// further down this file (e.g. domain "sop" navigates to "Execution", not "Sop").
const DOMAIN_LABEL: Record<string, string> = {
  finance: "Finance",
  cashflow: "Cashflow",
  sales: "Sales",
  operations: "Operations",
  sop: "Execution",
  marketing: "Marketing",
  strategy: "Strategy",
  recovery: "Recovery",
};
// Verified against OwnerApprovalOutcome in
// src/services/owner-mode/owner-approval-resolution.service.ts.
const APPROVAL_OUTCOME_LABEL: Record<string, string> = {
  auto_handled: "Auto-handled",
  forbidden: "Forbidden",
  needs_owner_approval: "Needs owner approval",
};
// Verified against Severity (input-guidance.ts's SEVERITY_RANK: critical/high/medium/low).
const INPUT_SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
// Verified against EffortLevel in src/domain/owner-mode/input-catalog.ts.
const EFFORT_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
// Verified against the action-plan ProofType in src/domain/owner-mode/action-assignment.ts
// (photo/document/receipt/metric_screenshot/signed_record/system_log) -- a distinct, smaller
// enum from execution/proof.ts's ProofType used on the task-detail page.
const ACTION_PROOF_TYPE_LABEL: Record<string, string> = {
  photo: "Photo",
  document: "Document",
  receipt: "Receipt",
  metric_screenshot: "Metric screenshot",
  signed_record: "Signed record",
  system_log: "System log",
};
// Verified against the missing-finance-input priority values used alongside
// MISSING_INPUT_REASON above (CRITICAL/IMPORTANT).
const MISSING_INPUT_PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: "Critical",
  IMPORTANT: "Important",
};
// Verified against Confidence in src/domain/owner-mode/supervisor-summary.ts
// (none/low/medium/high, also used for wbp.data.overallConfidence).
const CONFIDENCE_LABEL: Record<string, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
};
// Verified against DelegatedTaskStatus in src/domain/execution/delegated-task.ts
// (same set used in owner/tasks/[taskId]/page.tsx's STATUS_LABELS).
const TASK_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ASSIGNED: "Assigned",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  NEEDS_OWNER_CLARIFICATION: "Needs clarification",
  ESCALATED: "Escalated",
  PROOF_REQUIRED: "Proof required",
  PROOF_SUBMITTED: "Proof submitted",
  COMPLETED_PENDING_REVIEW: "Pending review",
  APPROVED_COMPLETE: "Approved",
  REJECTED_INCOMPLETE: "Rejected",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  DISPUTED: "Disputed",
};

/**
 * EH-03/EH-04 — minimal owner action controls. The owner can ACT (not just read):
 * complete a proof-gated task and resolve an approval. Calls the secured POST routes;
 * the server enforces every gate, and the gate/proof reason is surfaced here.
 */
function OwnerActions({ businessId }: { businessId: string | null }) {
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

  const [fitScore, setFitScore] = useState("0.7");
  const [paymentRisk, setPaymentRisk] = useState("low");
  const [oppResult, setOppResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [oppBusy, setOppBusy] = useState(false);

  const decideOpportunity = async () => {
    if (!businessId) return;
    const fit = Number(fitScore);
    if (!Number.isFinite(fit) || fit < 0 || fit > 1) {
      setOppResult({ ok: false, text: "Fit score must be between 0 and 1." });
      return;
    }
    setOppBusy(true);
    setOppResult(null);
    const r = await apiPost("/api/owner/opportunities/decide", { businessId, fitScore: fit, paymentRisk });
    if (r.ok) setOppResult({ ok: r.data.verdict === "accept", text: `${r.data.verdict.toUpperCase()} — ${r.data.reasons?.[0] ?? ""} ${r.data.nextAction ?? ""}` });
    else setOppResult({ ok: false, text: r.data?.error?.message || r.data?.error || `Failed (${r.status}).` });
    setOppBusy(false);
  };

  const completeTask = async () => {
    if (!taskId.trim()) return;
    setTaskBusy(true);
    setTaskResult(null);
    const r = await apiPost("/api/owner/tasks/complete", { taskId: taskId.trim(), ownerOverride });
    if (r.ok) setTaskResult({ ok: true, text: `Completed — status ${TASK_STATUS_LABEL[r.data.status] ?? r.data.status}.` });
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
      setApprResult({ ok: r.data.handledByOpsIQ, text: `${APPROVAL_OUTCOME_LABEL[r.data.outcome] ?? r.data.outcome} (${handled}).` });
    } else setApprResult({ ok: false, text: r.data?.error?.message || r.data?.error || `Failed (${r.status}).` });
    setApprBusy(false);
  };

  return (
    <section className="border rounded-lg p-4 bg-card" data-testid="owner-actions">
      <div className="text-xs uppercase text-muted-foreground mb-3">Owner actions</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <div className="text-sm font-medium">Complete a proof-gated task</div>
          <label htmlFor="owner-action-task-id" className="sr-only">Task ID</label>
          <input
            id="owner-action-task-id"
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
            <p className={`text-xs ${taskResult.ok ? "text-[var(--success-text)]" : "text-destructive"}`}>{taskResult.text}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Resolve an approval</div>
          <label htmlFor="owner-action-scope" className="sr-only">Scope</label>
          <input id="owner-action-scope" className="w-full border rounded px-2 py-2 text-sm min-h-[44px]" placeholder="Scope (e.g. pricing.discount)" value={scope} onChange={(e) => setScope(e.target.value)} />
          <label htmlFor="owner-action-type" className="sr-only">Action type</label>
          <input id="owner-action-type" className="w-full border rounded px-2 py-2 text-sm min-h-[44px]" placeholder="Action type (e.g. apply_discount)" value={actionType} onChange={(e) => setActionType(e.target.value)} />
          <Select
            name="riskClass"
            label="Risk class"
            value={riskClass}
            onChange={(e: any) => setRiskClass(e.target.value)}
            options={["low", "medium", "high", "critical"].map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))}
          />
          <label htmlFor="owner-action-decision-summary" className="sr-only">Decision summary</label>
          <input id="owner-action-decision-summary" className="w-full border rounded px-2 py-2 text-sm min-h-[44px]" placeholder="Decision summary" value={content} onChange={(e) => setContent(e.target.value)} />
          <Button className="min-h-[44px]" disabled={apprBusy || !scope.trim() || !actionType.trim() || !content.trim()} onClick={resolveApproval}>
            {apprBusy ? "Resolving…" : "Resolve approval"}
          </Button>
          {apprResult && (
            <p className={`text-xs ${apprResult.ok ? "text-[var(--success-text)]" : "text-muted-foreground"}`}>{apprResult.text}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Decide an opportunity</div>
          <p className="text-xs text-muted-foreground">OpsIQ uses this business&apos;s real capacity + margin.</p>
          <label htmlFor="owner-action-fit-score" className="sr-only">Fit score</label>
          <input id="owner-action-fit-score" className="w-full border rounded px-2 py-2 text-sm min-h-[44px]" placeholder="Fit score 0–1" value={fitScore} onChange={(e) => setFitScore(e.target.value)} />
          <Select
            name="paymentRisk"
            label="Payment risk"
            value={paymentRisk}
            onChange={(e: any) => setPaymentRisk(e.target.value)}
            options={["low", "medium", "high"].map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))}
          />
          <Button className="min-h-[44px]" disabled={oppBusy || !businessId} onClick={decideOpportunity}>
            {oppBusy ? "Deciding…" : "Decide"}
          </Button>
          {oppResult && (
            <p className={`text-xs ${oppResult.ok ? "text-[var(--success-text)]" : "text-muted-foreground"}`}>{oppResult.text}</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function OwnerCommandCenterPage() {
  const { businesses, activeBusinessId, needsBusinessRecovery, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();
  const [data, setData] = useState<any | null>(null);
  const [control, setControl] = useState<any | null>(null);
  const [wbp, setWbp] = useState<any | null>(null);
  const [guidance, setGuidance] = useState<any | null>(null);
  const [readiness, setReadiness] = useState<any | null>(null);
  const [actionPlan, setActionPlan] = useState<any | null>(null);
  const [priorities, setPriorities] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const loadProfile = useCallback(async (businessId: string) => {
    const seq = ++requestSeq.current;
    setProfileLoading(true);
    setError(null);
    try {
      const qs = `?businessId=${businessId}`;
      const res = await api(`/api/owner/command-center${qs}`);
      if (requestSeq.current !== seq) return;
      setData(res);
      // Owner control center (safety/blocked/attention/what-not-to-do). Non-fatal if it fails.
      try {
        const c = await api(`/api/owner/control-center${qs}`);
        if (requestSeq.current === seq) setControl(c);
      } catch {
        if (requestSeq.current === seq) setControl(null);
      }
      // NEW production owner-advice runtime → whole-business plan (provider-backed). Non-fatal.
      try {
        const w = await api(`/api/owner/whole-business-plan${qs}`);
        if (requestSeq.current === seq) setWbp(w);
      } catch {
        if (requestSeq.current === seq) setWbp(null);
      }
      // Dynamic input-accuracy guidance (next best input / missing data). Non-fatal.
      try {
        const g = await api(`/api/owner/input-guidance${qs}`);
        if (requestSeq.current === seq) setGuidance(g);
      } catch {
        if (requestSeq.current === seq) setGuidance(null);
      }
      // Owner Pilot Readiness Score. Non-fatal.
      try {
        const r = await api(`/api/owner/readiness${qs}`);
        if (requestSeq.current === seq) setReadiness(r);
      } catch {
        if (requestSeq.current === seq) setReadiness(null);
      }
      // Action assignment + proof framing for the live next best action. Non-fatal.
      try {
        const a = await api(`/api/owner/action-plan${qs}`);
        if (requestSeq.current === seq) setActionPlan(a);
      } catch {
        if (requestSeq.current === seq) setActionPlan(null);
      }
      // Top 3–5 priority command strip (runtime-fed). Non-fatal.
      try {
        const p = await api(`/api/owner/priorities${qs}`);
        if (requestSeq.current === seq) setPriorities(p);
      } catch {
        if (requestSeq.current === seq) setPriorities(null);
      }
    } catch (e) {
      if (requestSeq.current !== seq) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (requestSeq.current === seq) setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contextLoading) return;
    if (needsBusinessRecovery) return;
    if (!activeBusinessId) {
      setData(null); setControl(null); setWbp(null); setGuidance(null);
      setReadiness(null); setActionPlan(null); setPriorities(null);
      return;
    }
    void loadProfile(activeBusinessId);
  }, [contextLoading, activeBusinessId, needsBusinessRecovery, loadProfile]);

  const onSwitchBusiness = useCallback((id: string) => {
    setProfileLoading(true);
    setActiveBusinessId(id);
  }, [setActiveBusinessId]);

  if (contextLoading) return <CardDashboardSkeleton label="Loading owner command center" />;
  if (needsBusinessRecovery) return (
    <PageContainer>
      <p>Your previously selected business is no longer available. Choose a business to continue.</p>
      <BusinessContextSelector businesses={businesses} selectedId={null} onChange={onSwitchBusiness} />
    </PageContainer>
  );
  if (error && !data) return (
    <PageContainer>
      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <p className="font-medium mb-2">Failed to load command center</p>
        <p className="mb-4">{error}</p>
        <Button onClick={() => activeBusinessId && void loadProfile(activeBusinessId)} className="min-h-[44px]">Retry</Button>
      </div>
    </PageContainer>
  );

  const businessList: any[] = businesses;
  const profile = data?.profile ?? null;
  // The ONE canonical owner decision (owner-home service → Spine arbiter) — the same main target
  // Home, Cockpit and Priorities show. Nothing on this page elects a different one.
  const decision = (data?.currentOwnerDecision ?? null) as CurrentOwnerDecision | null;
  // Plan analysis is a secondary system: beside the canonical decision its imperatives are restated
  // as constraints on the main target (owner-imperatives.ts), never shown as separate orders.
  const imperativeCtx = ownerImperativeContext(decision);
  const missing: string[] = profile?.missingCriticalData ?? [];
  const missingWithPriority: Array<{ field: string; priority: string }> = data?.missingInputsWithPriority ?? [];

  return (
    <PageContainer>
      <div className="mb-6"><CanonicalCockpitLink from="command center" /></div>
      <div className="mb-6">
        <PageHeader
          title="Owner Command Center"
          description="One business condition. One main target. Evidence, not guesses."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            // "Home" points at the canonical /owner/cockpit, not the legacy /owner/home duplicate
            // -- that page independently falls back to the most-recently-created business when no
            // businessId is supplied (src/services/owner-home/home.service.ts), the exact
            // stale-business bug /owner/cockpit was fixed for.
            { label: "Home", href: "/owner/cockpit", domain: null },
            { label: "Finance", href: "/owner/finance", domain: "finance" },
            { label: "Budget & Profit Plan", href: "/owner/budget", domain: null },
            { label: "Cashflow", href: "/owner/cashflow", domain: "cashflow" },
            { label: "Sales", href: "/owner/sales", domain: "sales" },
            { label: "Operations", href: "/owner/operations", domain: "operations" },
            { label: "Execution", href: "/owner/execution", domain: "sop" },
            { label: "Wealth", href: "/owner/wealth", domain: null },
            { label: "Portfolio", href: "/owner/portfolio", domain: null },
            { label: "Data Intake", href: "/owner/intake", domain: null },
            { label: "Trust", href: "/owner/trust", domain: null },
            { label: "Approvals", href: "/owner/approvals", domain: null },
            { label: "Learning", href: "/owner/learning", domain: null },
            { label: "Delegation", href: "/owner/tasks", domain: null },
            { label: "Automation", href: "/owner/automation", domain: null },
            { label: "Growth Pricing", href: "/owner/growth-pricing", domain: null },
          ].map(({ label, href, domain }) => {
            const isRecommended = domain !== null && decision?.primaryDomain === domain;
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
          No businesses yet. Start in <Link href="/owner/finance" className="underline">Finance</Link> to create one.
        </div>
      ) : (
        <>
          <div className="mb-6">
            <BusinessContextSelector
              businesses={businessList}
              selectedId={activeBusinessId}
              onChange={onSwitchBusiness}
            />
          </div>

          {businessList.length > 1 && activeBusinessId && (
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {businessList.find((b) => b.id === activeBusinessId)?.name ?? ""}
            </h2>
          )}

          {decision && (
            <div className="mb-6 rounded-lg border bg-card p-4" data-testid="command-center-owner-decision">
              <OwnerDecisionCard decision={decision} />
            </div>
          )}

          {/* Supporting plan analysis: the whole-business plan model runs its own analysis, so it is
              collapsed behind one disclosure BELOW the canonical decision and never presented as a
              competing "first" (hostile review A P1-1). */}
          {(wbp?.supervisor?.found || priorities?.found || wbp?.found) && (
          <Disclosure summary={decision ? "Supporting plan analysis (context for your main target above)" : "Supporting plan analysis"} className="mb-6" data-testid="command-center-plan-analysis">
          <div className="p-3">
          {wbp?.supervisor?.found && <SupervisorSummary summary={reconcilePlanSummary(wbp.supervisor, imperativeCtx)} />}

          {priorities?.found && <PriorityCommandStrip cards={reconcilePlanCards(priorities.cards, imperativeCtx)} />}

          {wbp?.found && (
            <section className="border-2 border-foreground/20 rounded-lg p-4 bg-card mb-6" data-testid="owner-whole-business-plan">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="text-xs uppercase text-muted-foreground">Whole-business plan (live runtime)</div>
                <div className="flex flex-wrap gap-2">
                  <span data-testid="wbp-provider-status">
                    <Badge variant={wbp.data.criticalDomainsRealProviderBacked ? "success-accessible" : "warning-accessible"}>
                      {wbp.data.criticalDomainsRealProviderBacked ? "Provider-backed data" : "Partial data"}
                    </Badge>
                  </span>
                  <span data-testid="wbp-confidence">
                    <Badge variant="muted-accessible">Confidence: {CONFIDENCE_LABEL[wbp.data.overallConfidence] ?? wbp.data.overallConfidence}</Badge>
                  </span>
                  <Badge variant="muted-accessible">Plan score {Math.round(wbp.collectiveScore)}/100</Badge>
                  <Badge variant="muted-accessible">Stage: {String(wbp.stage).replace(/_/g, " ")}</Badge>
                </div>
              </div>

              <div className="rounded-md border border-foreground/20 bg-foreground/5 p-3 mb-3" data-testid="wbp-top-priority">
                <div className="text-xs uppercase text-muted-foreground">Plan analysis focus (supporting context — your main target is shown above)</div>
                <div className="text-lg font-semibold">{wbp.topPriority.label}</div>
                <div className="text-xs text-muted-foreground">
                  Dominant constraint: <span data-testid="wbp-dominant-constraint">{String(wbp.dominantConstraint).replace(/_/g, " ").toLowerCase()}</span>
                </div>
              </div>

              <div className="text-sm mb-3" data-testid="wbp-next-action">
                <span className="font-medium">The plan analysis suggests:</span> {wbp.nextBestAction}
              </div>

              {/* Beside a canonical decision the plan's stop list is restated as constraints on the main target. */}
              {wbp.doNotDo.length > 0 && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm mb-3" data-testid="wbp-do-not-do">
                  <strong>{imperativeCtx.decisionPresent ? "Plan constraints:" : "What NOT to do / stop:"}</strong>
                  <ul className="list-disc ml-5">{wbp.doNotDo.map((x: string, i: number) => <li key={i}>{planConstraintAsCondition(x, imperativeCtx)}</li>)}</ul>
                </div>
              )}

              <div className="rounded-md border p-3 text-sm mb-3" data-testid="wbp-owner-workload">
                <strong>Owner workload / offload:</strong> {wbp.ownerWorkload.offload}
                {wbp.ownerWorkload.approvalRequired && <Badge variant="warning-accessible" className="ml-2">Owner approval required</Badge>}
                {wbp.ownerWorkload.delegatedWork.length > 0 && (
                  <ul className="list-disc ml-5 mt-1">{wbp.ownerWorkload.delegatedWork.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 mb-3">
                <div className="rounded-md border p-3 text-sm" data-testid="wbp-proof">
                  <strong>Proof required:</strong>
                  {wbp.proofRequired.length > 0
                    ? <ul className="list-disc ml-5">{wbp.proofRequired.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                    : <span className="text-muted-foreground"> none outstanding</span>}
                </div>
                <div className="rounded-md border p-3 text-sm" data-testid="wbp-reassessment">
                  <strong>Reassessment trigger:</strong>
                  <ul className="list-disc ml-5">{wbp.reassessmentTriggers.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 mb-3">
                <div className="rounded-md border p-3 text-sm" data-testid="wbp-growth-gate">
                  <strong>Growth / scale gate:</strong> {reconcilePlanGrowthGate(wbp.growth, imperativeCtx)}
                </div>
                <div className="rounded-md border p-3 text-sm" data-testid="wbp-arbitration">
                  <strong>Plan analysis constraint:</strong> {String(wbp.arbitration.dominantConstraint).replace(/_/g, " ").toLowerCase()}; {wbp.arbitration.rejectedCount} conflicting plan move(s) set aside.
                  {wbp.arbitration.ownerApprovalNeeded && " Owner approval needed."}
                </div>
              </div>

              <div className="rounded-md border p-3 text-sm mb-3" data-testid="wbp-domains">
                <strong>Critical / red domains:</strong>{" "}
                {wbp.redDomains.length > 0
                  ? <span className="text-destructive">{wbp.redDomains.map((d: string) => DOMAIN_LABEL[d] ?? d).join(", ")}</span>
                  : <span className="text-[var(--success-text)]">none red</span>}
                <span className="text-muted-foreground"> · {wbp.domainHealth.length} domains assessed</span>
              </div>

              <div className="rounded-md border p-3 text-sm mb-3" data-testid="wbp-learning">
                <strong>Stored learning applied:</strong> {wbp.learning.applied ? "yes" : "no"}
                {wbp.learning.applied && <span className="text-muted-foreground"> ({wbp.learning.artifactIds.length} artifact{wbp.learning.artifactIds.length === 1 ? "" : "s"})</span>}
                {wbp.learning.notes.length > 0 && (
                  <ul className="list-disc ml-5 mt-1">{wbp.learning.notes.slice(0, 3).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                )}
              </div>

              <Disclosure summary="Whole-business plan summary" data-testid="wbp-plan-detail">
                <p className="text-sm mt-1 text-foreground">{wbp.plan.businessHealthSummary}</p>
                <p className="text-xs mt-1"><strong>7-day:</strong> {wbp.plan.plan7Day}</p>
                <p className="text-xs"><strong>30-day:</strong> {wbp.plan.plan30Day}</p>
                <p className="text-xs"><strong>90-day:</strong> {wbp.plan.plan90Day}</p>
              </Disclosure>
            </section>
          )}
          </div>
          </Disclosure>
          )}

          {readiness?.found && (
            <section className="border-2 border-foreground/20 rounded-lg p-4 bg-card mb-6" data-testid="owner-readiness-score">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-xs uppercase text-muted-foreground">Owner pilot readiness</div>
                <div className="flex flex-wrap gap-2">
                  <span data-testid="readiness-overall">
                    <Badge variant={HEALTH_VARIANT(readiness.overallScore)}>
                      Readiness {Math.round(readiness.overallScore)}/100
                    </Badge>
                  </span>
                  <span data-testid="readiness-gate">
                    <Badge variant={readiness.pilotReady ? "success-accessible" : "warning-accessible"}>
                      {readiness.pilotReady ? "Pilot-ready" : "Not pilot-ready yet"}
                    </Badge>
                  </span>
                </div>
              </div>
              {readiness.blockers.length > 0 && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm" data-testid="readiness-blockers">
                  <strong>What is holding readiness back:</strong>
                  <ul className="list-disc ml-5">{readiness.blockers.slice(0, 4).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              <Disclosure summary="Readiness by dimension" className="mt-2" data-testid="readiness-dimensions">
                <div className="grid gap-1 sm:grid-cols-2">
                  {readiness.dimensions.map((d: any) => (
                    <div key={d.key} className="flex items-center justify-between text-sm border rounded px-2 py-1 bg-background text-foreground">
                      <span className="capitalize">{String(d.label)}</span>
                      <Badge variant={HEALTH_VARIANT(d.score)}>{Math.round(d.score)}</Badge>
                    </div>
                  ))}
                </div>
              </Disclosure>
            </section>
          )}

          {guidance?.found && (
            <section className="border rounded-lg p-4 bg-card mb-6" data-testid="owner-input-guidance">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-xs uppercase text-muted-foreground">Improve accuracy</div>
                <span data-testid="guidance-confidence"><Badge variant="muted-accessible">Confidence: {CONFIDENCE_LABEL[guidance.overallConfidence] ?? guidance.overallConfidence}</Badge></span>
              </div>
              <div className="text-sm mb-2" data-testid="guidance-next-input">
                <span className="font-medium">Next best input:</span>{" "}
                {guidance.nextBestInput ? (
                  <>
                    {guidance.nextBestInput.replace(/_/g, " ")}
                    <Link href="/owner/intake" className="ml-2 underline">add it →</Link>
                  </>
                ) : (
                  "you have what you need to start"
                )}
              </div>
              {!guidance.canProceedWithStrongRecommendation && (
                <p className="text-xs text-[var(--warning-text)] mb-2" data-testid="guidance-must-wait">
                  Strong recommendations are paused until the critical data below is supplied.
                </p>
              )}
              {guidance.missingBySeverity.length > 0 && (
                <ul className="space-y-2" data-testid="guidance-missing">
                  {guidance.missingBySeverity.slice(0, 3).map((m: any) => (
                    <li key={m.category} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{m.label}</span>
                        <Badge variant={m.severity === "critical" ? "destructive-accessible" : m.severity === "high" ? "warning-accessible" : "muted-accessible"}>{INPUT_SEVERITY_LABEL[m.severity] ?? m.severity}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{m.why}</p>
                      <p className="text-xs text-muted-foreground">Affects: {m.decisionAffected} · effort: {EFFORT_LABEL[m.ownerEffort] ?? m.ownerEffort}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2">
                <Link href="/owner/onboarding" className="text-xs text-[var(--primary-text)] underline">See full setup guidance →</Link>
              </div>
            </section>
          )}

          {actionPlan?.found && actionPlan.assignment && (
            <Disclosure summary="Plan action & proof (supporting analysis)" className="mb-6" data-testid="owner-action-plan-disclosure">
            <section className="border rounded-lg p-4 bg-card mb-6" data-testid="owner-action-plan">
              <div className="text-xs uppercase text-muted-foreground mb-2">Plan action &amp; proof (supporting analysis)</div>
              <div className="text-sm font-medium mb-2" data-testid="action-title">{actionPlan.assignment.actionTitle}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border p-2 text-sm" data-testid="action-responsible">
                  <strong>Who owns it:</strong> <span className="capitalize">{actionPlan.assignment.responsibleParty}</span>
                  {actionPlan.assignment.assistedBy.length > 0 && (
                    <span className="text-muted-foreground"> (with {actionPlan.assignment.assistedBy.join(", ")})</span>
                  )}
                  {actionPlan.assignment.ownerApprovalRequired && <Badge variant="warning-accessible" className="ml-2">Owner approval</Badge>}
                  {actionPlan.assignment.delegatable && <Badge variant="muted-accessible" className="ml-2">Delegatable</Badge>}
                </div>
                <div className="rounded-md border p-2 text-sm" data-testid="action-opsiq-work">
                  <strong>OpsIQ prepared:</strong> {actionPlan.assignment.opsiqPreparedWork}
                </div>
                <div className="rounded-md border p-2 text-sm" data-testid="action-proof">
                  <strong>Proof required:</strong> {ACTION_PROOF_TYPE_LABEL[actionPlan.assignment.proofType] ?? actionPlan.assignment.proofType} — {actionPlan.assignment.acceptanceCriteria}
                </div>
                <div className="rounded-md border p-2 text-sm" data-testid="action-escalation">
                  <strong>Escalation:</strong> {actionPlan.assignment.escalationTrigger}
                  <div className="text-xs text-muted-foreground mt-1">Reassess: {actionPlan.assignment.reassessmentMetric}</div>
                </div>
              </div>
            </section>
            </Disclosure>
          )}

          {profileLoading ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground animate-pulse">
              Loading diagnosis…
            </div>
          ) : !data?.hasData || !profile ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              Your OpsIQ diagnosis requires business data.{" "}
              <Link href="/owner/intake" className="underline">Add your data →</Link>
            </div>
          ) : (
            <div className="space-y-6">
              <section className="border rounded-lg p-4 bg-card">
                <div className="text-xs uppercase text-muted-foreground mb-2">Business condition</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={HEALTH_VARIANT(profile.overallHealthScore)}>
                    Health {Math.round(profile.overallHealthScore)}/100
                  </Badge>
                  <Badge variant={RISK_VARIANT(profile.survivalRiskScore)}>
                    Survival risk {Math.round(profile.survivalRiskScore)}/100
                  </Badge>
                  <Badge variant="default-accessible">Growth opportunity {Math.round(profile.growthOpportunityScore)}/100</Badge>
                  <Badge variant={RISK_VARIANT(profile.executionRiskScore)}>
                    Execution risk {Math.round(profile.executionRiskScore)}/100
                  </Badge>
                  <Badge variant="muted-accessible">Data confidence {Math.round(profile.dataConfidenceScore)}/100</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Domains wired: {(data.domainsWired ?? []).map((d: string) => DOMAIN_LABEL[d] ?? d).join(", ") || "none"}
                </div>
              </section>

              {control && (
                <section className="border-2 border-foreground/20 rounded-lg p-4 bg-card" data-testid="owner-control-center">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="text-xs uppercase text-muted-foreground">OpsIQ control center</div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={control.needsOwnerAttention ? "warning-accessible" : "success-accessible"}>
                        {control.ownerActionsToday} owner action{control.ownerActionsToday === 1 ? "" : "s"} today
                      </Badge>
                      <Badge variant="muted-accessible">{control.handledByOpsIQ} handled by OpsIQ</Badge>
                      <Badge variant="success-accessible">{control.approvalsAvoided ?? 0} approvals avoided</Badge>
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

                  <div className="mb-3"><OwnerActions businessId={activeBusinessId} /></div>

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
                        <Badge variant={m.priority === "CRITICAL" ? "destructive-accessible" : "warning-accessible"} className="mt-0.5 shrink-0">{MISSING_INPUT_PRIORITY_LABEL[m.priority] ?? m.priority}</Badge>
                        <span>
                          <span className="font-medium">{humanizeMetricKey(m.field)}</span>
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

              <section className="border rounded-lg p-4 bg-card">
                <h2 className="font-bold mb-3">Domain scores</h2>
                <div className="space-y-2">
                  {(profile.domainScores ?? []).map((d: any) => {
                    const findingCount: number = (d.topFindingCodes ?? []).length;
                    const actionCount: number = (d.topActionCodes ?? []).length;
                    return (
                      <div key={d.domain} className="flex flex-wrap justify-between items-center gap-2 border-b py-1 text-sm">
                        <span className="font-medium">{DOMAIN_LABEL[d.domain] ?? d.domain}</span>
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

              <section className="border rounded-lg p-4 bg-card">
                <h2 className="font-bold mb-1">Reassessment</h2>
                {data.lastDiagnosedAt && (
                  <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
                    <div>Last diagnosed: {formatHumanDate(data.lastDiagnosedAt)}</div>
                    {data.nextReassessmentDue && (
                      <div className={new Date(data.nextReassessmentDue) <= new Date() ? "text-[var(--warning-text)] font-medium" : ""}>
                        Next reassessment {new Date(data.nextReassessmentDue) <= new Date() ? "overdue" : "due"}:{" "}
                        {formatHumanDate(data.nextReassessmentDue)}
                        {data.reassessmentCadenceDays != null && <> (every {data.reassessmentCadenceDays} days)</>}
                      </div>
                    )}
                    {data.reassessmentReason && (
                      <div className="italic">Why: {data.reassessmentReason}</div>
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
    </PageContainer>
  );
}
