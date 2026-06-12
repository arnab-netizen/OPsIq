/**
 * Owner Cashflow (Module 5 Slice 2) — cashflow diagnosis orchestrator.
 *
 * Pure: computes Slice 1 metrics, emits risk + opportunity OwnerFindings,
 * deterministically ranks them, and produces a cashflow Spine `DomainScore`
 * (domain "cashflow"). Does NOT create recommendations/actions (Slice 3) and
 * persists nothing.
 */
import type { OwnerFinding, OwnerSeverity, DomainScore } from "@/domain/owner-spine/contracts";
import type { CashflowSnapshotInput, CashflowDerivedMetrics } from "./types";
import { computeCashflowMetrics } from "./metrics";
import { resolveCashflowThresholds } from "./thresholds";
import { buildCashflowRiskFindings } from "./risk-rules";
import { buildCashflowOpportunityFindings } from "./opportunity-rules";

const SEVERITY_RANK: Record<OwnerSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Deterministic finding order: severity desc → impact desc → urgency desc →
 * confidence desc → code asc. Pure; returns a new array.
 */
export function rankCashflowFindings(findings: OwnerFinding[]): OwnerFinding[] {
  return [...findings].sort((a, b) => {
    if (SEVERITY_RANK[b.severity] !== SEVERITY_RANK[a.severity]) {
      return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    }
    if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
    if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
}

export interface CashflowDiagnosisResult {
  input: CashflowSnapshotInput;
  metrics: CashflowDerivedMetrics;
  findings: OwnerFinding[]; // all findings, ranked
  riskFindings: OwnerFinding[]; // ranked
  opportunityFindings: OwnerFinding[]; // ranked
  domainScore: DomainScore;
  missingCriticalData: string[];
  generatedAt: Date;
}

/** Diagnose a cashflow snapshot into ranked risk + opportunity findings + score. */
export function diagnoseCashflowSnapshot(
  input: CashflowSnapshotInput,
  opts: { now?: Date } = {}
): CashflowDiagnosisResult {
  const now = opts.now ?? new Date();
  const t = resolveCashflowThresholds(input.industryTemplate);
  const metrics = computeCashflowMetrics(input, { now });

  const riskFindings = rankCashflowFindings(buildCashflowRiskFindings(input, metrics, t));
  const opportunityFindings = rankCashflowFindings(
    buildCashflowOpportunityFindings(input, metrics, t)
  );
  const findings = rankCashflowFindings([...riskFindings, ...opportunityFindings]);

  const domainScore: DomainScore = {
    domain: "cashflow",
    healthScore: metrics.cashflowHealthScore,
    riskScore: metrics.cashflowDangerScore,
    opportunityScore: metrics.cashflowOpportunityScore,
    dataConfidenceScore: metrics.dataConfidenceScore,
    topFindingCodes: riskFindings.slice(0, 3).map((f) => f.code),
    topActionCodes: [], // Slice 3
    generatedAt: now,
  };

  return {
    input,
    metrics,
    findings,
    riskFindings,
    opportunityFindings,
    domainScore,
    missingCriticalData: metrics.missingRequiredInputs,
    generatedAt: now,
  };
}
