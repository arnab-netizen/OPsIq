/**
 * D23 — Scale readiness (responder, pure).
 * Gates scaling (volume/locations/team) behind repeatable SOPs, owner-independence,
 * systems in place, and margin holding at scale; blocks scaling broken process. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface ScaleReadinessInput {
  sopsNotRepeatable?: boolean;
  ownerDependent?: boolean;
  systemsNotInPlace?: boolean;
  marginBreaksAtScale?: boolean;
  ownerWantsToScaleAnyway?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondScaleReadiness(input: ScaleReadinessInput): DomainResponse {
  const gateFailed = !!(input.sopsNotRepeatable || input.ownerDependent || input.systemsNotInPlace || input.marginBreaksAtScale);
  const severity: TrainingSeverity = gateFailed ? "HIGH" : input.ownerWantsToScaleAnyway ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (gateFailed) wntd.push("no scaling until the operation is repeatable without the owner");
  if (input.ownerWantsToScaleAnyway) wntd.push("no overriding a failed scale gate");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (input.sopsNotRepeatable) nextAction = "Make the SOPs repeatable before scaling; scale multiplies broken process.";
  else if (input.ownerDependent) nextAction = "Remove the owner dependency before scaling; the system must run without the owner.";
  else if (input.systemsNotInPlace) nextAction = "Put the systems in place before scaling so volume does not break operations.";
  else if (input.marginBreaksAtScale) nextAction = "Fix the unit margin before scaling; scaling a loss multiplies the loss.";
  else if (input.ownerWantsToScaleAnyway) nextAction = "Hold scaling; the scale gates have not passed yet.";
  else nextAction = "Scale gates pass; scale in controlled steps and re-check margin and quality.";

  return {
    diagnosis: `Scale readiness: ${gateFailed ? "GATED" : severity === "MEDIUM" ? "PRESSURE" : "ready"}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "SOP repeatability, owner-independence, systems readiness, and margin at scale",
    verificationMethod: "verify every scale gate passed before adding volume or locations",
    sideEffectMetrics: ["scale gate pass rate", "margin at scale", "owner dependency count"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
