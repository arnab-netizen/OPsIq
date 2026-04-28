import type { DiagnosisV2Result } from "@/domain/diagnosis-v2/types";

export interface ExplanationNode {
  recommendationKey: string;
  title: string;
  explanation: string;
  evidence: string[];
  assumptions: string[];
  confidence: number;
}

export function buildDiagnosisExplanations(result: DiagnosisV2Result): ExplanationNode[] {
  return result.recommendations.map((recommendation) => {
    const linkedHypotheses = result.hypotheses.filter((hypothesis) => recommendation.linkedHypothesisKeys.includes(hypothesis.hypothesisKey));
    const evidence = linkedHypotheses.flatMap((hypothesis) => hypothesis.evidenceFor.map((item) => item.label));
    const policy = result.policyDecisions.find((decision) => decision.recommendationKey === recommendation.recommendationKey);
    const assumptions = [
      ...(recommendation.preconditions.length ? recommendation.preconditions : ["Recommendation assumes input values are materially accurate."]),
      ...(policy?.outcome === "requires_approval" ? ["Owner approval is required before full rollout."] : []),
      ...(policy?.outcome === "blocked" ? ["Recommendation is blocked until governance condition is resolved."] : []),
    ];
    return {
      recommendationKey: recommendation.recommendationKey,
      title: recommendation.title,
      explanation: recommendation.rationale,
      evidence: [...new Set(evidence)],
      assumptions: [...new Set(assumptions)],
      confidence: recommendation.confidence,
    };
  });
}
