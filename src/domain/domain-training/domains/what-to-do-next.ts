/**
 * D19 — What to do next (responder, pure).
 * Picks the correct next step on the survival -> stabilize -> optimize -> grow ladder
 * and blocks jumping to growth before survival/stability are secured. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface WhatToDoNextInput {
  cashRed?: boolean;
  qualityRed?: boolean;
  capacityRed?: boolean;
  profitWeak?: boolean;
  ownerWantsGrowthFirst?: boolean;
  noNextActionDefined?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondWhatToDoNext(input: WhatToDoNextInput): DomainResponse {
  const critical = !!(input.cashRed || input.qualityRed || input.capacityRed);
  const severity: TrainingSeverity = critical ? "HIGH"
    : (input.profitWeak || input.ownerWantsGrowthFirst || input.noNextActionDefined) ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (input.cashRed) wntd.push("no other work before cash is stabilized");
  if (input.ownerWantsGrowthFirst) wntd.push("no jumping to growth before survival and stability are secured");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (input.cashRed) nextAction = "Do the cash-survival action next: stabilize cash before anything else.";
  else if (input.qualityRed) nextAction = "Do the quality fix next: clear the red quality signal before optimizing.";
  else if (input.capacityRed) nextAction = "Do the capacity fix next: relieve the bottleneck before taking more on.";
  else if (input.profitWeak) nextAction = "Do the profit action next: improve margin before chasing growth.";
  else if (input.ownerWantsGrowthFirst) nextAction = "Hold growth; the next action is to pass the readiness gates first.";
  else if (input.noNextActionDefined) nextAction = "Define the single next action with an owner and a due date.";
  else nextAction = "The next action is set; execute it and re-evaluate after.";

  return {
    diagnosis: `Next action: ${critical ? "SURVIVAL_FIRST" : severity === "MEDIUM" ? "STABILIZE_OR_OPTIMIZE" : "on_track"}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "current condition (cash/quality/capacity/profit) and the proposed next action",
    verificationMethod: "verify the next action was executed and the condition improved",
    sideEffectMetrics: ["next-action completion rate", "sequence adherence", "cash runway"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
