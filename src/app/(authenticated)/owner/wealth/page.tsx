"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Button, CardDashboardSkeleton, PageHeader, PageContainer } from "@/ui/primitives";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { useActiveBusiness } from "@/context/active-business-context";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- command-center payload is the service contract (typed server-side in WealthCommandCenter); rendered read-only here. load() on mount is intentional. */

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
    if (e instanceof Error && e.name === "AbortError") throw new Error("Request timed out after 10 seconds.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const MOVE_VARIANT = (d: string): "success-accessible" | "default-accessible" | "warning-accessible" | "destructive-accessible" =>
  d === "BLOCKED" ? "destructive-accessible" : d === "VALIDATE_FIRST" ? "warning-accessible" : d === "CHOOSE_ALTERNATIVE" ? "default-accessible" : "success-accessible";

// Verified against NextMoveDecision (src/domain/owner-strategy/command-center.types.ts).
const MOVE_LABEL: Record<string, string> = {
  DO_THIS: "Do this",
  CHOOSE_ALTERNATIVE: "Choose an alternative",
  VALIDATE_FIRST: "Validate first",
  BLOCKED: "Blocked",
};
// Verified against WealthCommandCenter.outcomeReviewState (command-center.types.ts).
const OUTCOME_REVIEW_LABEL: Record<string, string> = {
  no_actions_yet: "No actions yet",
  pending_review: "Pending review",
  all_reviewed: "All reviewed",
};
// Verified against CashSafetyOutcome (src/domain/owner-finance/cash-safety-gate.ts).
const CASH_SAFETY_LABEL: Record<string, string> = {
  ALLOWED: "Allowed",
  BLOCKED_CASH_UNSAFE: "Blocked — cash unsafe",
};
// Verified against SpendDecisionType (src/domain/owner-budget/types.ts).
const SPEND_DECISION_LABEL: Record<string, string> = {
  AUTO_LOG: "Auto-logged",
  REQUIRE_PROOF: "Requires proof",
  REQUIRE_OWNER_APPROVAL: "Requires owner approval",
  HOLD: "On hold",
  BLOCK: "Blocked",
  INVESTIGATE: "Needs investigation",
};

/**
 * Owner Wealth Command Center — the owner-facing surface for the wealth-loop
 * decision view (wealth path + business-model quality, risk-adjusted score,
 * next best move, Work Package, owner workload transfer, proof requirement).
 * Read-only: all logic and authorization live in /api/owner/wealth-command-center.
 */
export default function OwnerWealthPage() {
  const { businesses, activeBusinessId, needsBusinessRecovery, setActiveBusinessId, loading: contextLoading } = useActiveBusiness();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async (bizId: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api(`/api/owner/wealth-command-center?businessId=${encodeURIComponent(bizId)}`);
      if (requestSeq.current !== seq) return;
      setData(res);
    } catch (e) {
      if (requestSeq.current !== seq) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contextLoading) return;
    if (needsBusinessRecovery) return;
    if (!activeBusinessId) { setLoading(false); return; }
    void load(activeBusinessId);
  }, [contextLoading, activeBusinessId, needsBusinessRecovery, load]);

  const onSwitchBusiness = useCallback((id: string) => {
    setLoading(true);
    setActiveBusinessId(id);
  }, [setActiveBusinessId]);

  if (contextLoading) return <CardDashboardSkeleton sections={4} label="Loading your Wealth Command Center" />;
  if (needsBusinessRecovery) return (
    <PageContainer>
      <p>Your previously selected business is no longer available. Choose a business to continue.</p>
      <BusinessContextSelector businesses={businesses} selectedId={null} onChange={onSwitchBusiness} />
    </PageContainer>
  );
  if (!activeBusinessId) return (
    <PageContainer>
      <p>No businesses yet. Create one to see your Wealth Command Center.</p>
    </PageContainer>
  );
  if (loading) return <CardDashboardSkeleton sections={4} label="Loading your Wealth Command Center" />;
  if (error)
    return (
      <PageContainer>
        <p style={{ color: "#b91c1c" }}>{error}</p>
        <Button onClick={() => void load(activeBusinessId)}>Retry</Button>
      </PageContainer>
    );
  if (!data) return null;

  const cc = data.commandCenter ?? {};
  const move = cc.nextBestMove ?? {};
  const wp = cc.workPackage ?? null;
  const transfer = cc.ownerWorkloadTransfer ?? null;

  return (
    <PageContainer>
      <div style={{ marginBottom: 16 }}>
        <PageHeader
          title="Wealth Command Center"
          actions={<Link href="/owner"><Button>Command Center</Button></Link>}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <BusinessContextSelector
          businesses={businesses}
          selectedId={activeBusinessId}
          onChange={onSwitchBusiness}
        />
      </div>

      {data.inProgressPeriodEnd && (
        <p data-testid="wealth-in-progress-period" style={{ color: "#b45309", fontSize: 13, marginBottom: 12 }}>
          {data.snapshotPeriodEnd
            ? `Figures for the period ending ${String(data.inProgressPeriodEnd).slice(0, 10)} are still in progress, so they are not used here: this view rests on the latest completed period (ending ${String(data.snapshotPeriodEnd).slice(0, 10)}).`
            : `Figures for the period ending ${String(data.inProgressPeriodEnd).slice(0, 10)} are still in progress, and there is no completed period yet, so this view has no completed figures to rest on.`}
        </p>
      )}

      {cc.provisional && (
        <p style={{ color: "#b45309", fontSize: 13, marginBottom: 12 }}>
          Provisional: this view is based on limited data. Add more business inputs to sharpen it.
        </p>
      )}

      {/* Next Best Move — the headline decision */}
      <section style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Next wealth move (wealth plan only — your overall main target is on Home)</span>
          <Badge variant={MOVE_VARIANT(move.decision ?? "")}>{(move.decision && MOVE_LABEL[move.decision]) ?? move.decision ?? "—"}</Badge>
        </div>
        <p style={{ fontSize: 18, fontWeight: 600 }}>{move.actionLabel ?? "No action proposed"}</p>
        {move.reason && <p style={{ fontSize: 14, color: "#4b5563", marginTop: 4 }}>{move.reason}</p>}
      </section>

      {/* Scores */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Metric label="Wealth path" value={cc.wealthPath?.label ?? "—"} />
        <Metric label="Business model quality" value={cc.businessModelQuality ? `${cc.businessModelQuality.score} (${cc.businessModelQuality.tier})` : "—"} />
        <Metric label="Risk-adjusted score" value={cc.riskAdjustedScore != null ? String(cc.riskAdjustedScore) : "—"} />
        <Metric label="Outcome review" value={(cc.outcomeReviewState && OUTCOME_REVIEW_LABEL[cc.outcomeReviewState]) ?? cc.outcomeReviewState ?? "—"} />
      </section>

      {/* Financial governor / cash safety */}
      {(cc.cashSafety || cc.financialGovernor) && (
        <section style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Financial safety</h2>
          {cc.cashSafety && (
            <p style={{ fontSize: 14 }}>
              Cash-safety gate: <strong>{CASH_SAFETY_LABEL[cc.cashSafety.outcome] ?? cc.cashSafety.outcome}</strong>
              {cc.cashSafety.reason && <span style={{ color: "#6b7280" }}> — {cc.cashSafety.reason}</span>}
            </p>
          )}
          {cc.financialGovernor && (
            <p style={{ fontSize: 14 }}>Spend governor: <strong>{(cc.financialGovernor.decision && SPEND_DECISION_LABEL[cc.financialGovernor.decision]) ?? cc.financialGovernor.decision ?? "—"}</strong></p>
          )}
        </section>
      )}

      {/* Work Package — the transferred work */}
      {wp && (
        <section style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Prepared Work Package</h2>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{wp.title ?? "Work Package"}</p>
          {wp.assigneeRole && <p style={{ fontSize: 13, color: "#6b7280" }}>Assign to: {wp.assigneeRole}</p>}
          {Array.isArray(wp.steps) && wp.steps.length > 0 && (
            <ol style={{ fontSize: 13, marginTop: 8, paddingLeft: 18 }}>
              {wp.steps.slice(0, 8).map((s: any, i: number) => (
                <li key={i}>{typeof s === "string" ? s : s.label ?? s.description ?? JSON.stringify(s)}</li>
              ))}
            </ol>
          )}
          {cc.proofRequirement && (
            <p style={{ fontSize: 13, marginTop: 8, color: "#374151" }}>Proof required: {cc.proofRequirement}</p>
          )}
        </section>
      )}

      {/* Owner workload transfer */}
      {transfer && (
        <section style={{ fontSize: 13, color: "#374151" }}>
          Owner time: {transfer.minutesBefore}m → {transfer.minutesAfter}m
          {" "}(<strong>{transfer.minutesSaved}m saved, {transfer.pctReduced}% reduced</strong>)
        </section>
      )}

      {Array.isArray(cc.warnings) && cc.warnings.length > 0 && (
        <ul style={{ fontSize: 12, color: "#b45309", marginTop: 12 }}>
          {cc.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </PageContainer>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
