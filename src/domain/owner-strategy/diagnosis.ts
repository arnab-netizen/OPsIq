/**
 * Owner Strategy & Scenario Planning (Module 8 Slice 2) — scenario diagnosis
 * orchestrator.
 *
 * Pure: computes Slice 1 metrics, emits risk + opportunity OwnerFindings,
 * deterministically ranks them, and produces a strategy Spine `DomainScore`
 * (domain "strategy"). Does NOT create recommendations/actions (Slice 3) and
 * persists nothing.
 */
import { rankOwnerFindingsBySeverity, type OwnerFinding, type DomainScore } from "@/domain/owner-spine/contracts";
import type { StrategySnapshotInput, StrategyDerivedMetrics } from "./types";
import { computeStrategyMetrics } from "./metrics";
import { resolveStrategyThresholds } from "./thresholds";
import { buildStrategyRiskFindings } from "./risk-rules";
import { buildStrategyOpportunityFindings } from "./opportunity-rules";

/**
 * Deterministic finding order: severity desc → impact desc → urgency desc →
 * confidence desc → code asc (the canonical spine ranking). Pure; returns a new array.
 */
export function rankStrategyFindings(findings: OwnerFinding[]): OwnerFinding[] {
  return rankOwnerFindingsBySeverity(findings);
}

export interface StrategyDiagnosisResult {
  input: StrategySnapshotInput;
  metrics: StrategyDerivedMetrics;
  findings: OwnerFinding[]; // all findings, ranked
  riskFindings: OwnerFinding[]; // ranked
  opportunityFindings: OwnerFinding[]; // ranked
  domainScore: DomainScore;
  missingCriticalData: string[];
  generatedAt: Date;
}

/** Diagnose a scenario into ranked risk + opportunity findings + score. */
export function diagnoseStrategySnapshot(
  input: StrategySnapshotInput,
  opts: { now?: Date } = {}
): StrategyDiagnosisResult {
  const now = opts.now ?? new Date();
  const t = resolveStrategyThresholds(input.industryTemplate);
  const metrics = computeStrategyMetrics(input, { now });

  const riskFindings = rankStrategyFindings(buildStrategyRiskFindings(input, metrics, t));
  const opportunityFindings = rankStrategyFindings(
    buildStrategyOpportunityFindings(input, metrics, t)
  );
  const findings = rankStrategyFindings([...riskFindings, ...opportunityFindings]);

  const domainScore: DomainScore = {
    domain: "strategy",
    healthScore: metrics.strategyHealthScore,
    riskScore: metrics.strategyRiskScore,
    opportunityScore: metrics.strategyOpportunityScore,
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
