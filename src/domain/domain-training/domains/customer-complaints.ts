/**
 * D12 — Customer complaints (responder, pure).
 * Assesses severity / repeat-pattern / reputation risk and root cause; blocks closing a
 * complaint without recovery proof and treating it as isolated when a pattern exists. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface ComplaintInput {
  severity: "low" | "medium" | "high";
  repeatPattern?: boolean;
  reputationRisk?: boolean;
  recoveryProofPresent?: boolean;
  ownerWantsCloseNoProof?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondCustomerComplaints(input: ComplaintInput): DomainResponse {
  let severity: TrainingSeverity = input.severity === "high" ? "HIGH" : input.severity === "medium" ? "MEDIUM" : "LOW";
  if (input.reputationRisk && severity === "HIGH") severity = "CRITICAL";

  const wntd: string[] = [];
  if (!input.recoveryProofPresent || input.ownerWantsCloseNoProof) wntd.push("no closing the complaint without recovery proof");
  if (input.repeatPattern) wntd.push("no treating the complaint as isolated when a pattern exists");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (input.repeatPattern) nextAction = "Fix the root cause behind the repeat complaints, recover the affected customers, and require closure proof.";
  else if (!input.recoveryProofPresent) nextAction = "Run the recovery action and collect closure proof before closing the complaint.";
  else nextAction = "Recovery proof present; close the complaint and log a pattern check.";

  return {
    diagnosis: `Customer complaint severity ${input.severity}${input.repeatPattern ? " (repeat pattern)" : ""}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "complaint record, recovery action proof, customer confirmation, repeat-pattern check",
    verificationMethod: "confirm the recovery was accepted by the customer and check for a pattern",
    sideEffectMetrics: ["repeat complaint rate", "customer retention", "reputation"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
