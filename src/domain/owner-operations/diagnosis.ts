/**
 * Owner Operations (Module 4 Slice 2) — operations diagnosis orchestrator.
 *
 * Pure: computes Slice 1 metrics, emits risk + opportunity OwnerFindings,
 * deterministically ranks them, and produces an operations Spine `DomainScore`
 * (domain "operations"). Does NOT create recommendations/actions (Slice 3) and
 * persists nothing.
 */
import type { OwnerFinding, OwnerSeverity, DomainScore } from "@/domain/owner-spine/contracts";
import type { OperationsSnapshotInput, OperationsDerivedMetrics } from "./types";
import { computeOperationsMetrics } from "./metrics";
import { resolveOperationsThresholds } from "./thresholds";
import { buildOperationsRiskFindings } from "./risk-rules";
import { buildOperationsOpportunityFindings } from "./opportunity-rules";

const SEVERITY_RANK: Record<OwnerSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Deterministic finding order: severity desc → impact desc → urgency desc →
 * confidence desc → code asc. Pure; returns a new array.
 */
export function rankOperationsFindings(findings: OwnerFinding[]): OwnerFinding[] {
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

export interface OperationsDiagnosisResult {
  input: OperationsSnapshotInput;
  metrics: OperationsDerivedMetrics;
  findings: OwnerFinding[]; // all findings, ranked
  riskFindings: OwnerFinding[]; // ranked
  opportunityFindings: OwnerFinding[]; // ranked
  domainScore: DomainScore;
  missingCriticalData: string[];
  generatedAt: Date;
}

/** Diagnose an operations snapshot into ranked risk + opportunity findings + score. */
export function diagnoseOperationsSnapshot(
  input: OperationsSnapshotInput,
  opts: { now?: Date } = {}
): OperationsDiagnosisResult {
  const now = opts.now ?? new Date();
  const t = resolveOperationsThresholds(input.industryTemplate);
  const metrics = computeOperationsMetrics(input, { now });

  const riskFindings = rankOperationsFindings(buildOperationsRiskFindings(input, metrics, t));
  const opportunityFindings = rankOperationsFindings(
    buildOperationsOpportunityFindings(input, metrics, t)
  );
  const findings = rankOperationsFindings([...riskFindings, ...opportunityFindings]);

  const domainScore: DomainScore = {
    domain: "operations",
    healthScore: metrics.operationsHealthScore,
    riskScore: metrics.operationsRiskScore,
    opportunityScore: metrics.operationsOpportunityScore,
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
