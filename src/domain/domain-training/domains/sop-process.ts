/**
 * D11 — SOP / process execution (responder, pure).
 * Detects missing/unfollowed/unrealistic SOP, handoff failure, false checklist completion;
 * blocks scale when not repeatable and completion without evidence. Pure + deterministic.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface SopInput {
  sopMissing?: boolean;
  sopNotFollowed?: boolean;
  sopUnrealistic?: boolean;
  handoffFailure?: boolean;
  falseChecklistCompletion?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondSopProcess(input: SopInput): DomainResponse {
  const notRepeatable = !!(input.sopMissing || input.sopNotFollowed || input.sopUnrealistic || input.handoffFailure || input.falseChecklistCompletion);
  const severity: TrainingSeverity = (input.falseChecklistCompletion || input.sopMissing) ? "HIGH"
    : notRepeatable ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (notRepeatable) wntd.push("no scale until the SOP is repeatable");
  if (input.falseChecklistCompletion) wntd.push("no completion without evidence");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (input.falseChecklistCompletion) nextAction = "Reject the false checklist and require evidence-backed completion before closing.";
  else if (input.sopMissing) nextAction = "Write the missing SOP for the error-prone task and have staff follow it on the next job.";
  else if (input.sopUnrealistic) nextAction = "Revise the unrealistic SOP with the staff who do the work, then retest it.";
  else if (input.sopNotFollowed || input.handoffFailure) nextAction = "Re-train on the SOP and fix the handoff; verify adherence on the next jobs.";
  else nextAction = "SOP is repeatable; protect it and keep adherence checks in place.";

  return {
    diagnosis: `SOP/process: ${notRepeatable ? "NOT repeatable" : "repeatable"}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Operations Lead",
    proofRequired: "SOP document, checklist completion evidence, adherence rate, handoff logs",
    verificationMethod: "verify SOP adherence and the outcome on the next jobs",
    sideEffectMetrics: ["rework rate", "handoff errors", "complaint rate"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
