/**
 * D18 — What not to do (responder, pure).
 * Given the current business condition, produces the prohibited-action list and the
 * single next safe action. Cash red outranks everything. Pure + deterministic.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface WhatNotToDoInput {
  cashRed?: boolean;
  qualityRed?: boolean;
  capacityRed?: boolean;
  ownerWantsToScale?: boolean;
  ownerWantsDiscount?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondWhatNotToDo(input: WhatNotToDoInput): DomainResponse {
  const anyRed = !!(input.cashRed || input.qualityRed || input.capacityRed);
  const severity: TrainingSeverity = anyRed ? "HIGH"
    : (input.ownerWantsToScale || input.ownerWantsDiscount) ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (input.cashRed) wntd.push("no discretionary spend or growth while cash is red");
  if (input.qualityRed) wntd.push("no marketing or scaling while quality is red");
  if (input.capacityRed) wntd.push("no taking on more work while capacity is red");
  if (input.ownerWantsToScale) wntd.push("no scaling before the readiness gates pass");
  if (input.ownerWantsDiscount) wntd.push("no discounting without a contribution-margin check");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (input.cashRed) nextAction = "Stop discretionary outflows and fix cash first; nothing else proceeds until cash clears.";
  else if (input.qualityRed) nextAction = "Fix quality before any marketing or scaling; recheck the defect signal.";
  else if (input.capacityRed) nextAction = "Relieve the capacity constraint before taking on more work.";
  else if (input.ownerWantsToScale) nextAction = "Hold scaling until the growth and scale readiness gates pass.";
  else if (input.ownerWantsDiscount) nextAction = "Run the contribution-margin check before approving any discount.";
  else nextAction = "No prohibited actions right now; proceed with the standard guardrails.";

  return {
    diagnosis: `What-not-to-do: ${wntd.length} prohibited action(s); severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "current cash, quality, and capacity status and the requested action",
    verificationMethod: "verify none of the prohibited actions were taken before the gate cleared",
    sideEffectMetrics: ["prohibited-action incidents", "gate breach count", "cash runway"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
