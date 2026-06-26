/**
 * D20 — Who (responder, pure). Delegation / accountable assignment.
 * Blocks owner bottlenecking, unaccountable tasks, wrong-skill assignment and
 * key-person dependency. Models business-operational human factors only. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface WhoInput {
  ownerDoingEverything?: boolean;
  noOwnerAssigned?: boolean;
  wrongSkillForTask?: boolean;
  keyPersonDependency?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondWho(input: WhoInput): DomainResponse {
  const critical = !!(input.ownerDoingEverything || input.noOwnerAssigned);
  const severity: TrainingSeverity = critical ? "HIGH"
    : (input.wrongSkillForTask || input.keyPersonDependency) ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (input.ownerDoingEverything) wntd.push("no owner bottlenecking; delegate non-owner work");
  if (input.noOwnerAssigned) wntd.push("no action without a single accountable owner");
  if (input.keyPersonDependency) wntd.push("no single-person dependency on a critical task");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (input.noOwnerAssigned) nextAction = "Assign one accountable owner with a due date before the work starts.";
  else if (input.ownerDoingEverything) nextAction = "Delegate the non-owner tasks and free the owner for the critical few.";
  else if (input.wrongSkillForTask) nextAction = "Reassign to someone with the right capability or train before assigning.";
  else if (input.keyPersonDependency) nextAction = "Cross-train a second person to remove the key-person dependency.";
  else nextAction = "Assignment is clear and accountable; keep the owner and due date.";

  return {
    diagnosis: `Assignment: ${critical ? "ACCOUNTABILITY_GAP" : severity === "MEDIUM" ? "CAPABILITY_RISK" : "clear"}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "task owner, due date, the assignee's capability, and backup cover",
    verificationMethod: "verify the assigned owner delivered on the due date",
    sideEffectMetrics: ["owner span of tasks", "unassigned task count", "key-person dependency count"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
