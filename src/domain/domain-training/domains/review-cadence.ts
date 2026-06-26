/**
 * D17 — Review cadence (responder, pure). Weekly / monthly governed re-evaluation.
 * Blocks skipping the review while at risk, vanity-only reviews, and reviews that
 * produce no actions; tightens cadence to the business condition. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface ReviewCadenceInput {
  reviewOverdue?: boolean;
  vanityOnlyReview?: boolean;
  noActionsFromReview?: boolean;
  cadenceTooSlowForCondition?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondReviewCadence(input: ReviewCadenceInput): DomainResponse {
  const critical = !!(input.reviewOverdue || input.cadenceTooSlowForCondition);
  const severity: TrainingSeverity = critical ? "HIGH"
    : (input.vanityOnlyReview || input.noActionsFromReview) ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (critical) wntd.push("no skipping the governed review while the business is at risk");
  if (input.vanityOnlyReview) wntd.push("no review that only reads vanity metrics");
  if (input.noActionsFromReview) wntd.push("no review that produces no decisions");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (input.reviewOverdue) nextAction = "Run the overdue review now against the four governed dimensions and set the next cadence.";
  else if (input.cadenceTooSlowForCondition) nextAction = "Tighten the review cadence to match the at-risk condition (for example weekly).";
  else if (input.vanityOnlyReview) nextAction = "Re-run the review against real KPIs and governed dimensions, not vanity metrics.";
  else if (input.noActionsFromReview) nextAction = "Convert the review findings into owned, dated actions before closing it.";
  else nextAction = "Review cadence is healthy; keep it on schedule and action-driven.";

  return {
    diagnosis: `Review cadence: ${critical ? "AT_RISK" : severity === "MEDIUM" ? "WEAK" : "healthy"}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "review schedule, last review date, KPIs reviewed, and actions raised",
    verificationMethod: "verify the next review runs on cadence and produced dated actions",
    sideEffectMetrics: ["review on-time rate", "actions per review", "KPI trend"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
