/**
 * Owner Marketing & Growth (Module 6 Slice 2) — marketing diagnosis orchestrator.
 *
 * Pure: computes Slice 1 metrics, emits risk + opportunity OwnerFindings,
 * deterministically ranks them, and produces a marketing Spine `DomainScore`
 * (domain "marketing"). Does NOT create recommendations/actions (Slice 3) and
 * persists nothing.
 */
import type { OwnerFinding, OwnerSeverity, DomainScore } from "@/domain/owner-spine/contracts";
import type { MarketingSnapshotInput, MarketingDerivedMetrics } from "./types";
import { computeMarketingMetrics } from "./metrics";
import { resolveMarketingThresholds } from "./thresholds";
import { buildMarketingRiskFindings } from "./risk-rules";
import { buildMarketingOpportunityFindings } from "./opportunity-rules";

const SEVERITY_RANK: Record<OwnerSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Deterministic finding order: severity desc → impact desc → urgency desc →
 * confidence desc → code asc. Pure; returns a new array.
 */
export function rankMarketingFindings(findings: OwnerFinding[]): OwnerFinding[] {
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

export interface MarketingDiagnosisResult {
  input: MarketingSnapshotInput;
  metrics: MarketingDerivedMetrics;
  findings: OwnerFinding[]; // all findings, ranked
  riskFindings: OwnerFinding[]; // ranked
  opportunityFindings: OwnerFinding[]; // ranked
  domainScore: DomainScore;
  missingCriticalData: string[];
  generatedAt: Date;
}

/** Diagnose a marketing snapshot into ranked risk + opportunity findings + score. */
export function diagnoseMarketingSnapshot(
  input: MarketingSnapshotInput,
  opts: { now?: Date } = {}
): MarketingDiagnosisResult {
  const now = opts.now ?? new Date();
  const t = resolveMarketingThresholds(input.industryTemplate);
  const metrics = computeMarketingMetrics(input, { now });

  const riskFindings = rankMarketingFindings(buildMarketingRiskFindings(input, metrics, t));
  const opportunityFindings = rankMarketingFindings(
    buildMarketingOpportunityFindings(input, metrics, t)
  );
  const findings = rankMarketingFindings([...riskFindings, ...opportunityFindings]);

  const domainScore: DomainScore = {
    domain: "marketing",
    healthScore: metrics.marketingHealthScore,
    riskScore: metrics.marketingRiskScore,
    opportunityScore: metrics.marketingOpportunityScore,
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
