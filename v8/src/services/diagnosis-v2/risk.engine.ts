import type { ContingencyPlanV2, PolicyDecisionV2, RecommendationRiskV2, RecommendationV2, RiskClass, RiskItemV2, ValidationIssueV2 } from "@/domain/diagnosis-v2/types";
import { clampScore } from "./utils";

function classify(score: number): RiskClass {
  if (score >= 85) return "blocked";
  if (score >= 70) return "review_required";
  if (score >= 55) return "pilot_only";
  if (score >= 35) return "controlled_rollout";
  return "safe_now";
}

function residual(input: { likelihood: number; impact: number; detectability: number; reversibility: number; velocity: number }): number {
  const raw = input.likelihood * 0.28 + input.impact * 0.34 + input.detectability * 0.14 + input.velocity * 0.14 + (100 - input.reversibility) * 0.1;
  return clampScore(raw);
}

function riskItem(input: Omit<RiskItemV2, "residualScore">): RiskItemV2 {
  return { ...input, residualScore: residual(input) };
}

export function assessRecommendationRisks(recommendations: RecommendationV2[], issues: ValidationIssueV2[] = []): RecommendationRiskV2[] {
  const blocking = issues.some((issue) => issue.blocksCompletion);
  const criticalIssues = issues.filter((issue) => issue.severity === "critical").length;
  const highIssues = issues.filter((issue) => issue.severity === "high").length;

  return recommendations.map((recommendation) => {
    const evidencePenalty = blocking && recommendation.category !== "controls_reporting" ? 18 : criticalIssues * 6 + highIssues * 3;
    const baseByCategory: Record<string, RiskItemV2["riskType"]> = {
      controls_reporting: "data",
      liquidity_control: "financial",
      pricing_margin: "customer",
      revenue_quality: "data",
      demand_retention: "customer",
      monitoring: "execution",
    };
    const type = baseByCategory[recommendation.category] ?? "execution";
    const categoryLikelihood = recommendation.category === "liquidity_control" ? 58 : recommendation.category === "pricing_margin" ? 54 : recommendation.category === "controls_reporting" ? 32 : 38;
    const categoryImpact = recommendation.priority === "critical" ? 82 : recommendation.priority === "high" ? 68 : recommendation.priority === "medium" ? 48 : 32;
    const item = riskItem({
      riskType: type,
      title: `${recommendation.category} execution risk`,
      description: "Risk is calculated from recommendation category, priority, validation quality, detectability, reversibility, and speed of downside. This is a deterministic first-pass governance score, not actuarial prediction.",
      likelihood: clampScore(categoryLikelihood + evidencePenalty / 2),
      impact: clampScore(categoryImpact + evidencePenalty),
      detectability: recommendation.category === "pricing_margin" ? 55 : 38,
      reversibility: recommendation.category === "liquidity_control" ? 42 : recommendation.category === "pricing_margin" ? 65 : 75,
      velocity: recommendation.priority === "critical" ? 78 : 52,
      mitigationControls: recommendation.preconditions,
    });
    const score = item.residualScore;
    return {
      recommendationKey: recommendation.recommendationKey,
      recommendationTitle: recommendation.title,
      overallRiskScore: score,
      riskClass: classify(score),
      items: [item],
    };
  });
}

export function generateContingencies(recommendations: RecommendationV2[], risks: RecommendationRiskV2[] = []): ContingencyPlanV2[] {
  const riskByKey = new Map(risks.map((risk) => [risk.recommendationKey, risk]));
  return recommendations.map((recommendation) => {
    const risk = riskByKey.get(recommendation.recommendationKey);
    const highRisk = risk ? ["pilot_only", "review_required", "blocked"].includes(risk.riskClass) : false;
    return {
      recommendationKey: recommendation.recommendationKey,
      recommendationTitle: recommendation.title,
      preconditions: recommendation.preconditions,
      earlyWarningSignals: [
        "Primary metric worsens after action start",
        "Customer, supplier, or staff complaints increase week-over-week",
        "Execution owner misses agreed checkpoint",
        ...(recommendation.category === "pricing_margin" ? ["Quote conversion drops after pricing change"] : []),
        ...(recommendation.category === "liquidity_control" ? ["Cash balance falls below minimum threshold"] : []),
      ],
      stopLossTriggers: [
        "Negative movement exceeds 10% against baseline",
        "Critical cash threshold breached",
        "Two consecutive execution checkpoints missed",
        ...(highRisk ? ["Owner approval not recorded before high-risk rollout"] : []),
      ],
      fallbackActions: ["Pause rollout", "Limit to pilot scope", "Return to prior operating rule where reversible"],
      recoveryActions: ["Run targeted re-diagnosis", "Escalate to owner review", "Replace action with lower-risk alternative"],
      communicationPlan: {
        owner: "Notify business owner immediately for critical or approval-gated actions.",
        operators: "Share only operationally necessary action details.",
        customers: recommendation.category === "pricing_margin" ? "Use approved pricing-change script before customer-facing rollout." : "No customer communication required unless action affects service promise.",
      },
    };
  });
}

export function evaluatePolicies(recommendations: RecommendationV2[], risks: RecommendationRiskV2[]): PolicyDecisionV2[] {
  const riskByKey = new Map(risks.map((risk) => [risk.recommendationKey, risk]));
  return recommendations.map((recommendation) => {
    const risk = riskByKey.get(recommendation.recommendationKey);
    if (!risk) return { recommendationKey: recommendation.recommendationKey, recommendationTitle: recommendation.title, outcome: "blocked", reason: "Missing risk assessment." };
    if (risk.riskClass === "blocked") return { recommendationKey: recommendation.recommendationKey, recommendationTitle: recommendation.title, outcome: "blocked", reason: "Risk class is blocked." };
    if (recommendation.category === "controls_reporting" && recommendation.priority === "critical") return { recommendationKey: recommendation.recommendationKey, recommendationTitle: recommendation.title, outcome: "requires_approval", reason: "Critical evidence remediation must be owned and reviewed before action plan closure." };
    if (risk.riskClass === "review_required" || risk.riskClass === "pilot_only" || ["pricing_margin", "liquidity_control"].includes(recommendation.category)) {
      return { recommendationKey: recommendation.recommendationKey, recommendationTitle: recommendation.title, outcome: "requires_approval", reason: "Customer, liquidity, evidence, or operational downside requires owner approval before full rollout." };
    }
    return { recommendationKey: recommendation.recommendationKey, recommendationTitle: recommendation.title, outcome: "allowed", reason: "Risk is within controlled execution tolerance." };
  });
}
