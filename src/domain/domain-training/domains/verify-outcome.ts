/**
 * D5 — How to verify outcome (responder, pure).
 *
 * Distinguishes task-completed vs outcome-improved vs failed vs harmed-another-metric vs
 * inconclusive vs disputed. Wires F9 side-effect verification + F2/F4 confidence. A
 * positive primary metric with a severe side effect is never "success". Pure.
 */

import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import { verifyWithSideEffects } from "@/domain/domain-training/side-effect-registry";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export type OutcomeClass = "IMPROVED" | "FAILED" | "HARMED" | "INCONCLUSIVE" | "DISPUTED" | "TASK_NOT_DONE";

export interface VerifyOutcomeInput {
  taskCompleted: boolean;
  primaryImproved: boolean;
  severeSideEffect?: boolean;
  inconclusive?: boolean;
  disputed?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function classifyOutcome(i: VerifyOutcomeInput): OutcomeClass {
  if (i.disputed) return "DISPUTED";
  if (i.inconclusive) return "INCONCLUSIVE";
  if (!i.taskCompleted) return "TASK_NOT_DONE";
  const v = verifyWithSideEffects(i.primaryImproved, i.severeSideEffect ? [{ key: "side_effect", worsened: true, severe: true }] : []);
  if (!v.success) return i.severeSideEffect ? "HARMED" : "FAILED";
  return "IMPROVED";
}

const SEVERITY: Record<OutcomeClass, TrainingSeverity> = {
  IMPROVED: "LOW", FAILED: "HIGH", HARMED: "HIGH", INCONCLUSIVE: "MEDIUM", DISPUTED: "MEDIUM", TASK_NOT_DONE: "MEDIUM",
};

export function respondVerifyOutcome(input: VerifyOutcomeInput): DomainResponse {
  const cls = classifyOutcome(input);
  const severity = SEVERITY[cls];

  const wntd: string[] = [];
  if (cls === "HARMED") wntd.push("do not classify as success despite primary improvement");
  if (cls === "DISPUTED") wntd.push("do not learn from a disputed outcome");
  if (cls === "INCONCLUSIVE") wntd.push("do not learn from an inconclusive outcome");
  if (cls === "TASK_NOT_DONE") wntd.push("do not verify outcome before the task is complete");
  if (cls === "FAILED") wntd.push("do not retry the same action unchanged without redesign");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";
  else if (cls === "DISPUTED" || cls === "INCONCLUSIVE") confidence = "BLOCKED";

  const ACTION: Record<OutcomeClass, string> = {
    IMPROVED: "Record the verified improvement and proceed to learning eligibility.",
    FAILED: "Classify as failed; trigger redesign and capture the negative pattern (no learning as positive).",
    HARMED: "Classify as harmed (not success); open reassessment and check the side-effect metrics.",
    INCONCLUSIVE: "Mark inconclusive; collect more outcome evidence before any learning.",
    DISPUTED: "Mark disputed; resolve the dispute before any learning.",
    TASK_NOT_DONE: "Complete the task and collect proof before verifying the outcome.",
  };

  return {
    diagnosis: `Outcome verification: classified ${cls}.`,
    confidence,
    severity,
    whatNotToDo: wntd,
    nextAction: ACTION[cls],
    assignedRole: "Owner",
    proofRequired: "before/after outcome metric with evidence, plus side-effect metrics",
    verificationMethod: "compare the primary metric AND side-effect metrics before and after",
    sideEffectMetrics: ["side-effect regression", "rework rate", "complaint rate"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true,
    unsafeEmitted: [],
  };
}
