/**
 * D22 — Growth readiness (responder, pure).
 * Gates growth spend behind cash health, quality, retention, and unit economics;
 * blocks growth and override-of-a-failed-gate until every gate passes. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface GrowthReadinessInput {
  cashNotHealthy?: boolean;
  qualityNotGreen?: boolean;
  retentionLeaking?: boolean;
  unitEconomicsNegative?: boolean;
  ownerWantsToGrowAnyway?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondGrowthReadiness(input: GrowthReadinessInput): DomainResponse {
  const gateFailed = !!(input.cashNotHealthy || input.qualityNotGreen || input.retentionLeaking || input.unitEconomicsNegative);
  const severity: TrainingSeverity = gateFailed ? "HIGH" : input.ownerWantsToGrowAnyway ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (gateFailed) wntd.push("no growth spend until the readiness gates pass");
  if (input.ownerWantsToGrowAnyway) wntd.push("no overriding a failed readiness gate");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (input.cashNotHealthy) nextAction = "Fix cash first; growth is gated until cash is healthy.";
  else if (input.qualityNotGreen) nextAction = "Fix quality first; growth is gated until quality is green.";
  else if (input.retentionLeaking) nextAction = "Fix retention first; growth is gated until the leak is closed.";
  else if (input.unitEconomicsNegative) nextAction = "Fix unit economics first; growth is gated until each sale is profitable.";
  else if (input.ownerWantsToGrowAnyway) nextAction = "Hold growth; the readiness gates have not passed yet.";
  else nextAction = "Growth gates pass; grow gradually and watch cash, quality, and retention.";

  return {
    diagnosis: `Growth readiness: ${gateFailed ? "GATED" : severity === "MEDIUM" ? "PRESSURE" : "ready"}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "cash health, quality status, retention/churn, and unit economics",
    verificationMethod: "verify every growth gate passed before releasing spend",
    sideEffectMetrics: ["gate pass rate", "cash runway", "churn rate"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
