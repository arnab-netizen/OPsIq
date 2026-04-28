import type { DiagnosisV2Input, DiagnosisV2Result, ValidationIssueV2 } from "@/domain/diagnosis-v2/types";
import { normalizeDiagnosisInput } from "./intake-normalization.engine";
import { assessEvidenceSufficiency, validateDiagnosisFacts } from "./validation.engine";
import { computeDiagnosisMetrics } from "./metrics.engine";
import { scoreDiagnosisDomains } from "./scoring.engine";
import { generateHypotheses } from "./hypothesis.engine";
import { generateRecommendations } from "./recommendation.engine";
import { assessRecommendationRisks, evaluatePolicies, generateContingencies } from "./risk.engine";
import { buildScenarioCases } from "./scenario.engine";
import { assertIsoDateTime, clamp01, round } from "./utils";

function insufficientEvidenceIssue(missing: string[]): ValidationIssueV2 {
  return {
    issueType: "insufficient_evidence",
    severity: "high",
    message: `Minimum evidence missing: ${missing.join(", ")}`,
    fieldRefs: missing,
    blocksCompletion: true,
    details: { missing },
  };
}

export function runDiagnosisV2(input: DiagnosisV2Input): DiagnosisV2Result {
  assertIsoDateTime(input.nowIso);
  const facts = normalizeDiagnosisInput(input);
  const evidenceSufficiency = assessEvidenceSufficiency(input, facts);
  const validationIssues = validateDiagnosisFacts(input, facts);
  if (!evidenceSufficiency.minimumViable) validationIssues.push(insufficientEvidenceIssue(evidenceSufficiency.missing));

  const metrics = computeDiagnosisMetrics(facts);
  const scorecard = scoreDiagnosisDomains(metrics, validationIssues);
  const hypotheses = generateHypotheses(metrics, scorecard, validationIssues);
  const blocking = validationIssues.some((issue) => issue.blocksCompletion);
  const recommendations = generateRecommendations(hypotheses, validationIssues);
  const risks = assessRecommendationRisks(recommendations, validationIssues);
  const contingencies = generateContingencies(recommendations, risks);
  const policyDecisions = evaluatePolicies(recommendations, risks);
  const scenarios = buildScenarioCases(metrics);

  const issuePenalty = validationIssues.reduce((sum, issue) => sum + (issue.severity === "critical" ? 0.12 : issue.severity === "high" ? 0.08 : issue.severity === "medium" ? 0.04 : 0.02), 0);
  const avgScoreConfidence = scorecard.length ? scorecard.reduce((sum, score) => sum + score.rationale.confidence, 0) / scorecard.length : 0.5;
  const confidence = clamp01(evidenceSufficiency.score * 0.45 + avgScoreConfidence * 0.4 + (blocking ? 0.05 : 0.15) - issuePenalty);
  const topHypothesis = hypotheses[0]?.title ?? "Insufficient evidence for a dominant hypothesis";
  const status = blocking ? "needs_input" : "completed";

  return {
    run: {
      engagementId: input.engagementId,
      runId: input.runId,
      status,
      runMode: blocking ? "provisional" : "full",
      confidence: round(confidence, 2),
      summary: blocking
        ? `Diagnosis is provisional: ${topHypothesis}. Blocking data issues must be resolved before high-impact action.`
        : `Diagnosis completed. Dominant hypothesis: ${topHypothesis}.`,
      completedAt: input.nowIso,
    },
    audit: { engineVersion: "diagnosis-v2.2-enterprise", deterministic: true, warnings: [] },
    facts,
    validationIssues,
    evidenceSufficiency,
    metrics,
    scorecard,
    hypotheses,
    recommendations,
    risks,
    contingencies,
    policyDecisions,
    scenarios,
    needsInput: blocking,
  };
}
