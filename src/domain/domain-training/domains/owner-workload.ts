/**
 * D9 — Owner workload (responder, pure).
 * Detects owner bottleneck / approval bottleneck / firefighting and delegatable tasks;
 * blocks owner-heavy recommendations without a high-value/survival reason and owner-only
 * execution of routine tasks. Pure + deterministic.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface OwnerWorkloadInput {
  dailyLoadPct: number;
  approvalBottleneck?: boolean;
  recurringFirefighting?: boolean;
  delegatableTasksPresent?: boolean;
  proposedOwnerHeavyAction?: boolean;
  survivalCritical?: boolean;
  routineTaskOwnerOnly?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondOwnerWorkload(input: OwnerWorkloadInput): DomainResponse {
  const u = input.dailyLoadPct;
  const overload = u >= 1.0 || input.recurringFirefighting === true;
  const high = !overload && u >= 0.85;
  const severity: TrainingSeverity = overload ? "HIGH" : high ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (input.proposedOwnerHeavyAction && !input.survivalCritical) wntd.push("no owner-heavy action without a high-value/survival reason");
  if (input.routineTaskOwnerOnly) wntd.push("no owner-only execution for routine tasks");
  if (input.approvalBottleneck) wntd.push("no funneling all approvals through the owner");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  const nextAction = (overload || input.delegatableTasksPresent)
    ? "Delegate the delegatable tasks and remove the owner from routine approvals to clear the bottleneck."
    : high
      ? "Reduce owner load: delegate routine approvals and protect focus time."
      : "Owner load is sustainable; keep routine work delegated and protect it.";

  return {
    diagnosis: `Owner daily load at ${Math.round(u * 100)}% (${overload ? "OVERLOAD" : high ? "HIGH" : "NORMAL"}); severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "owner hours by task, approval queue, firefighting incidents, delegatable list",
    verificationMethod: "recheck owner daily load and approval queue after delegation",
    sideEffectMetrics: ["owner hours", "approval delay", "staff autonomy"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
