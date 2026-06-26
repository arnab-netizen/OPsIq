/**
 * D8 — Staff workload (responder, pure).
 * Detects overload/underutilization/overtime dependence; blocks new non-critical tasks for
 * overloaded staff, hiring before workload proof, and blaming staff without evidence. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface StaffWorkloadInput {
  utilizationPct: number;
  overtimeDependence?: boolean;
  absenteeismHigh?: boolean;
  skillMismatch?: boolean;
  ownerWantsAddTasks?: boolean;
  ownerWantsHireNoProof?: boolean;
  ownerBlamesStaffNoEvidence?: boolean;
  emergencyTemporary?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondStaffWorkload(input: StaffWorkloadInput): DomainResponse {
  const u = input.utilizationPct;
  const overload = u >= 1.0 || input.overtimeDependence === true;
  const high = !overload && u >= 0.85;
  const under = u < 0.5;
  const severity: TrainingSeverity = overload ? "HIGH" : high ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (overload || high) wntd.push("no new non-critical tasks for overloaded staff");
  if (input.ownerWantsHireNoProof && !input.emergencyTemporary) wntd.push("no hiring before workload proof unless emergency");
  if (input.ownerBlamesStaffNoEvidence) wntd.push("no blaming staff without workload/SOP evidence");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  const nextAction = overload
    ? "Redistribute or pause non-critical tasks and remove the overtime dependence before adding any work."
    : under
      ? "Underutilized: reassign the spare capacity to higher-value work."
      : high
        ? "Monitor load and avoid adding non-critical tasks; check the workload-quality link."
        : "Workload is balanced; protect it and keep the SOP realistic.";

  return {
    diagnosis: `Staff workload at ${Math.round(u * 100)}% (${overload ? "OVERLOAD" : under ? "UNDER" : high ? "HIGH" : "NORMAL"}); severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "hours vs sustainable load, overtime, absenteeism, and error/rework rate",
    verificationMethod: "recheck utilization, overtime and error rate after the workload change",
    sideEffectMetrics: ["error rate", "absenteeism", "complaint rate", "owner intervention"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
