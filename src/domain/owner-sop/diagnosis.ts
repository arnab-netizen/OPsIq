/**
 * Owner SOP & Execution Accountability (Module 7 Slice 2) — execution diagnosis
 * orchestrator.
 *
 * Pure: computes Slice 1 metrics, emits risk + opportunity OwnerFindings,
 * deterministically ranks them, and produces an execution Spine `DomainScore`
 * (domain "sop"). Does NOT create recommendations/actions (Slice 3) and persists
 * nothing.
 */
import type { OwnerFinding, OwnerSeverity, DomainScore } from "@/domain/owner-spine/contracts";
import type { SopSnapshotInput, SopDerivedMetrics } from "./types";
import { computeSopMetrics } from "./metrics";
import { resolveSopThresholds } from "./thresholds";
import { buildSopRiskFindings } from "./risk-rules";
import { buildSopOpportunityFindings } from "./opportunity-rules";

const SEVERITY_RANK: Record<OwnerSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Deterministic finding order: severity desc → impact desc → urgency desc →
 * confidence desc → code asc. Pure; returns a new array.
 */
export function rankSopFindings(findings: OwnerFinding[]): OwnerFinding[] {
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

export interface SopDiagnosisResult {
  input: SopSnapshotInput;
  metrics: SopDerivedMetrics;
  findings: OwnerFinding[]; // all findings, ranked
  riskFindings: OwnerFinding[]; // ranked
  opportunityFindings: OwnerFinding[]; // ranked
  domainScore: DomainScore;
  missingCriticalData: string[];
  generatedAt: Date;
}

/** Diagnose an execution snapshot into ranked risk + opportunity findings + score. */
export function diagnoseSopSnapshot(
  input: SopSnapshotInput,
  opts: { now?: Date } = {}
): SopDiagnosisResult {
  const now = opts.now ?? new Date();
  const t = resolveSopThresholds(input.industryTemplate);
  const metrics = computeSopMetrics(input, { now });

  const riskFindings = rankSopFindings(buildSopRiskFindings(input, metrics, t));
  const opportunityFindings = rankSopFindings(buildSopOpportunityFindings(input, metrics, t));
  const findings = rankSopFindings([...riskFindings, ...opportunityFindings]);

  const domainScore: DomainScore = {
    domain: "sop",
    healthScore: metrics.executionHealthScore,
    riskScore: metrics.executionRiskScore,
    opportunityScore: metrics.executionOpportunityScore,
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
