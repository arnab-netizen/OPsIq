import type { EvidenceSufficiencyV2, NormalizedFact, ValidationIssueV2 } from "@/domain/diagnosis-v2/types";
import { clamp01, round } from "@/services/diagnosis-v2/utils";

export interface DataQualityScore {
  completeness: number;
  reliability: number;
  freshness: number;
  contradictionPenalty: number;
  overall: number;
  band: "weak" | "usable" | "strong";
  rationale: string[];
}

export function computeDataQualityScore(input: { facts: NormalizedFact[]; validationIssues: ValidationIssueV2[]; evidenceSufficiency: EvidenceSufficiencyV2 }): DataQualityScore {
  const rationale: string[] = [];
  const completeness = clamp01(input.evidenceSufficiency.score);
  const avgFactConfidence = input.facts.length ? input.facts.reduce((sum, fact) => sum + fact.confidence, 0) / input.facts.length : 0;
  const reliability = clamp01(avgFactConfidence);
  const staleCount = input.validationIssues.filter((issue) => issue.issueType === "stale_data").length;
  const freshness = clamp01(1 - staleCount * 0.15);
  const contradictionCount = input.validationIssues.filter((issue) => issue.issueType === "contradiction").length;
  const anomalyCount = input.validationIssues.filter((issue) => issue.issueType === "anomaly").length;
  const criticalCount = input.validationIssues.filter((issue) => issue.severity === "critical").length;
  const contradictionPenalty = clamp01(contradictionCount * 0.2 + anomalyCount * 0.08 + criticalCount * 0.14);
  const overall = clamp01(completeness * 0.38 + reliability * 0.34 + freshness * 0.18 - contradictionPenalty * 0.28);

  if (completeness < 0.75) rationale.push("Evidence completeness is below production confidence threshold.");
  if (reliability < 0.7) rationale.push("Average fact confidence is weak; outputs should remain provisional.");
  if (staleCount) rationale.push(`${staleCount} stale-data issue(s) reduce freshness.`);
  if (contradictionCount) rationale.push(`${contradictionCount} contradiction issue(s) require human review.`);
  if (anomalyCount) rationale.push(`${anomalyCount} anomaly issue(s) require definition or evidence review.`);
  if (!rationale.length) rationale.push("Data quality is sufficient for a bounded diagnosis output.");

  return { completeness, reliability: round(reliability, 2), freshness, contradictionPenalty, overall, band: overall >= 0.8 ? "strong" : overall >= 0.55 ? "usable" : "weak", rationale };
}
