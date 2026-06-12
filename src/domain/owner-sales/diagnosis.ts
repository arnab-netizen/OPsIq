/**
 * Owner Sales (Module 3 Slice 2) — sales diagnosis orchestrator.
 *
 * Pure: computes Slice 1 metrics, emits risk + opportunity OwnerFindings,
 * deterministically ranks them, and produces a sales Spine `DomainScore`
 * (domain "sales"). Does NOT create recommendations/actions (Slice 3) and
 * persists nothing.
 */
import type { OwnerFinding, OwnerSeverity, DomainScore } from "@/domain/owner-spine/contracts";
import type { SalesSnapshotInput, SalesDerivedMetrics } from "./types";
import { computeSalesMetrics } from "./metrics";
import { resolveSalesThresholds } from "./thresholds";
import { buildSalesRiskFindings } from "./risk-rules";
import { buildSalesOpportunityFindings } from "./opportunity-rules";

const SEVERITY_RANK: Record<OwnerSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Deterministic finding order: severity desc → impact desc → urgency desc →
 * confidence desc → code asc. Pure; returns a new array.
 */
export function rankSalesFindings(findings: OwnerFinding[]): OwnerFinding[] {
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

export interface SalesDiagnosisResult {
  input: SalesSnapshotInput;
  metrics: SalesDerivedMetrics;
  findings: OwnerFinding[]; // all findings, ranked
  riskFindings: OwnerFinding[]; // ranked
  opportunityFindings: OwnerFinding[]; // ranked
  domainScore: DomainScore;
  missingCriticalData: string[];
  generatedAt: Date;
}

/** Diagnose a sales snapshot into ranked risk + opportunity findings + score. */
export function diagnoseSalesSnapshot(
  input: SalesSnapshotInput,
  opts: { now?: Date } = {}
): SalesDiagnosisResult {
  const now = opts.now ?? new Date();
  const t = resolveSalesThresholds(input.industryTemplate);
  const metrics = computeSalesMetrics(input, { now });

  const riskFindings = rankSalesFindings(buildSalesRiskFindings(input, metrics, t));
  const opportunityFindings = rankSalesFindings(buildSalesOpportunityFindings(input, metrics, t));
  const findings = rankSalesFindings([...riskFindings, ...opportunityFindings]);

  const domainScore: DomainScore = {
    domain: "sales",
    healthScore: metrics.salesHealthScore,
    riskScore: metrics.salesRiskScore,
    opportunityScore: metrics.salesOpportunityScore,
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
