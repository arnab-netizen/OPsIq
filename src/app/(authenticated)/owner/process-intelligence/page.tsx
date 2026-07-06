"use client";

/**
 * Owner Process Intelligence page — the minimal owner surface for the top process breakdown. It loads
 * the Owner Now View payload (`/api/owner/now-view`, which already carries the server-computed
 * `processIntelligence` block) and renders it via ProcessIntelligencePanel. No business logic here: the
 * finding is built server-side. Errors are shown safely; no raw internal error is exposed.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/ui/primitives";
import { ProcessIntelligencePanel, ProcessCorrectionsPanel, SopChecklistCorrectionsPanel, TrainingAssignmentsPanel, EffectivenessPanel, OwnerWorkloadReductionPanel, ApprovalPolicyPanel, CapabilityGapPanel, CashProfitPanel, OpportunityPanel, ValidationPanel, PortfolioPanel, OpportunityOperatingPanel, ValidationOutcomePanel, OpportunityExecutionPanel, ProcessExecutionBridgePanel, CockpitGroup, CockpitSubsection, type ProcessExecutionBridgeView, type ProcessIntelligenceView, type ProcessCorrectionsView, type SopChecklistCorrectionsView, type TrainingAssignmentsView, type EffectivenessView, type OwnerWorkloadReductionView, type ApprovalPolicyView, type CapabilityGapView, type CashProfitProtectionView, type ExternalOpportunityView, type OpportunityValidationView, type OpportunityPortfolioView, type OpportunityOperatingView, type ValidationOutcomeView, type OpportunityExecutionView } from "@/components/owner/ProcessIntelligencePanel";

const FETCH_TIMEOUT_MS = 10_000;

async function api(path: string): Promise<{ res: Response; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

function safeError(data: Record<string, unknown>, status: number): string {
  const body = data.error as string | { message?: unknown } | undefined;
  const serverText = typeof body === "string" ? body : body && typeof body === "object" && typeof body.message === "string" ? body.message : "";
  if (serverText) return serverText;
  if (status === 401 || status === 403) return "You are not authorized to view this workspace.";
  return `Could not load the process view (${status}).`;
}

export default function OwnerProcessIntelligencePage() {
  const [pi, setPi] = useState<ProcessIntelligenceView | null>(null);
  const [corrections, setCorrections] = useState<ProcessCorrectionsView | null>(null);
  const [sopCorrections, setSopCorrections] = useState<SopChecklistCorrectionsView | null>(null);
  const [training, setTraining] = useState<TrainingAssignmentsView | null>(null);
  const [effectiveness, setEffectiveness] = useState<EffectivenessView | null>(null);
  const [workload, setWorkload] = useState<OwnerWorkloadReductionView | null>(null);
  const [approvalPolicy, setApprovalPolicy] = useState<ApprovalPolicyView | null>(null);
  const [capabilityGaps, setCapabilityGaps] = useState<CapabilityGapView | null>(null);
  const [cashProfit, setCashProfit] = useState<CashProfitProtectionView | null>(null);
  const [opportunity, setOpportunity] = useState<ExternalOpportunityView | null>(null);
  const [validation, setValidation] = useState<OpportunityValidationView | null>(null);
  const [portfolio, setPortfolio] = useState<OpportunityPortfolioView | null>(null);
  const [operating, setOperating] = useState<OpportunityOperatingView | null>(null);
  const [outcomes, setOutcomes] = useState<ValidationOutcomeView[] | null>(null);
  const [execution, setExecution] = useState<OpportunityExecutionView | null>(null);
  const [bridge, setBridge] = useState<ProcessExecutionBridgeView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await api("/api/owner/now-view");
      if (!res.ok) throw new Error(safeError(data, res.status));
      setPi((data.processIntelligence as ProcessIntelligenceView) ?? null);
      setCorrections((data.processCorrections as ProcessCorrectionsView) ?? null);
      setSopCorrections((data.sopChecklistCorrections as SopChecklistCorrectionsView) ?? null);
      setTraining((data.trainingAssignments as TrainingAssignmentsView) ?? null);
      setEffectiveness((data.sopTrainingEffectiveness as EffectivenessView) ?? null);
      setWorkload((data.ownerWorkloadReduction as OwnerWorkloadReductionView) ?? null);
      setApprovalPolicy((data.approvalPolicy as ApprovalPolicyView) ?? null);
      setCapabilityGaps((data.capabilityGaps as CapabilityGapView) ?? null);
      setCashProfit((data.cashProfitProtection as CashProfitProtectionView) ?? null);
      setOpportunity((data.externalOpportunityIntelligence as ExternalOpportunityView) ?? null);
      setValidation((data.opportunityValidation as OpportunityValidationView) ?? null);
      setPortfolio((data.opportunityPortfolio as OpportunityPortfolioView) ?? null);
      setOperating((data.opportunityOperating as OpportunityOperatingView) ?? null);
      setOutcomes((data.opportunityValidationOutcomes as ValidationOutcomeView[]) ?? null);
      setExecution((data.opportunityExecution as OpportunityExecutionView) ?? null);
      setBridge((data.processExecution as ProcessExecutionBridgeView) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the process view.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main style={{ padding: "clamp(12px, 4vw, 24px)", maxWidth: 920, width: "100%", margin: "0 auto", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: "clamp(20px, 5vw, 28px)" }}>Where your process is breaking</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/owner/now" data-testid="back-to-now">Owner Now View</Link>
          <Button onClick={() => void load()}>Refresh</Button>
        </div>
      </header>

      <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
        OpsIQ points to the single stage most worth fixing today — with the evidence behind it and one
        recommended correction. Everything else is grouped below; open a group only when you need it.
      </p>

      {loading && <p>Loading the process view…</p>}
      {error && (
        <div>
          <p style={{ color: "#b91c1c" }} data-testid="pi-error">{error}</p>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      )}
      {!loading && !error && (
        <>
          {/* PRIMARY FOCUS — the single most important thing, always visible (no owner overload). */}
          <ProcessIntelligencePanel data={pi} />
          <section style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>What to do about it</h2>
            <ProcessCorrectionsPanel data={corrections} />
          </section>

          {/* THE ACTION TO TAKE — the diagnosis converted into a single governed execution route (who acts,
              approval level, evidence to complete), so the owner does not re-key the finding into a form. */}
          <section style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>The action to take</h2>
            <ProcessExecutionBridgePanel data={bridge} />
          </section>

          {/* SECONDARY — progressive disclosure: collapsed groups the owner opens only when needed. */}
          <CockpitGroup testid="cockpit-group-cash" title="Protect cash & profit" subtitle="Where cash or margin is at risk, and the one protective action for each">
            <CashProfitPanel data={cashProfit} />
          </CockpitGroup>

          <CockpitGroup testid="cockpit-group-followthrough" title="Fix & follow-through" subtitle="SOP/checklist changes, training, and whether the fixes worked">
            <CockpitSubsection title="SOP & checklist changes"><SopChecklistCorrectionsPanel data={sopCorrections} /></CockpitSubsection>
            <CockpitSubsection title="Training & review"><TrainingAssignmentsPanel data={training} /></CockpitSubsection>
            <CockpitSubsection title="Did the fixes work?"><EffectivenessPanel data={effectiveness} /></CockpitSubsection>
          </CockpitGroup>

          <CockpitGroup testid="cockpit-group-govern" title="Reduce your workload & govern actions" subtitle="Avoidable owner burden and what OpsIQ may do without asking">
            <CockpitSubsection title="Reduce your workload"><OwnerWorkloadReductionPanel data={workload} /></CockpitSubsection>
            <CockpitSubsection title="What OpsIQ may do without asking"><ApprovalPolicyPanel data={approvalPolicy} /></CockpitSubsection>
          </CockpitGroup>

          <CockpitGroup testid="cockpit-group-grow" title="Grow: opportunities to validate" subtitle="Evidence-backed opportunities — always cheap validation first, never scale">
            <CockpitSubsection title="Top opportunity candidate">
              <OpportunityPanel data={opportunity} />
            </CockpitSubsection>
            <CockpitSubsection title="Next validation experiment to run">
              <ValidationPanel data={validation} />
            </CockpitSubsection>
            <CockpitSubsection title="Where capital goes next">
              <PortfolioPanel data={portfolio} />
            </CockpitSubsection>
            <CockpitSubsection title="What the test proved">
              <ValidationOutcomePanel data={outcomes} />
            </CockpitSubsection>
            <CockpitSubsection title="Opportunity execution">
              <OpportunityExecutionPanel data={execution} />
            </CockpitSubsection>
            <CockpitSubsection title="Submitted opportunity signals">
              <OpportunityOperatingPanel data={operating} />
            </CockpitSubsection>
          </CockpitGroup>

          <CockpitGroup testid="cockpit-group-build" title="What OpsIQ should build next" subtitle="System capabilities that would close the gaps OpsIQ keeps hitting">
            <CapabilityGapPanel data={capabilityGaps} />
          </CockpitGroup>
        </>
      )}
    </main>
  );
}
