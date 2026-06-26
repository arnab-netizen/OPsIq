/**
 * D16 — Daily priorities (responder, pure).
 * Forces the critical blocker to the top of the day and blocks low-leverage busywork
 * while it is open; enforces focus over an everything-is-priority list. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface DailyPrioritiesInput {
  openCriticalBlocker?: boolean;
  workingOnLowLeverage?: boolean;
  tooManyPriorities?: boolean;
  noPlan?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondDailyPriorities(input: DailyPrioritiesInput): DomainResponse {
  const critical = input.openCriticalBlocker === true;
  const severity: TrainingSeverity = critical ? "HIGH"
    : (input.tooManyPriorities || input.workingOnLowLeverage || input.noPlan) ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (critical) wntd.push("no low-leverage work while a critical blocker is open");
  if (input.tooManyPriorities) wntd.push("no treating everything as top priority");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (critical) nextAction = "Clear the critical blocker first today; defer everything else until it is resolved.";
  else if (input.tooManyPriorities) nextAction = "Pick the one to three highest-leverage tasks for today and drop the rest.";
  else if (input.noPlan) nextAction = "Set a written daily plan with the top three priorities before starting work.";
  else if (input.workingOnLowLeverage) nextAction = "Switch from low-leverage work to the highest-impact task on today's list.";
  else nextAction = "Priorities are focused; protect the plan and review at end of day.";

  return {
    diagnosis: `Daily priorities: ${critical ? "CRITICAL_BLOCKER_OPEN" : severity === "MEDIUM" ? "UNFOCUSED" : "focused"}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "today's priority list, the critical-blocker status, and time spent per task",
    verificationMethod: "review at end of day whether the top priorities were completed",
    sideEffectMetrics: ["critical blocker age", "top-priority completion rate", "time on low-leverage work"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
