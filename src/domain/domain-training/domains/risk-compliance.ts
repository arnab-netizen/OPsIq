/**
 * D24 — Risk / compliance (responder, pure).
 * Forces escalation to a verified expert for compliance-sensitive decisions, blocks
 * ignoring a known critical risk and proceeding without a mitigation plan. Uses the
 * F4 ESCALATE path with a verified-expert-source downgrade. Pure + deterministic.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface RiskComplianceInput {
  complianceSensitive?: boolean;
  criticalRiskIgnored?: boolean;
  noMitigationPlan?: boolean;
  verifiedExpertSource?: boolean;
  dataPoints: DataPoint[];
}

export function respondRiskCompliance(input: RiskComplianceInput): DomainResponse {
  const high = !!(input.complianceSensitive || input.criticalRiskIgnored);
  const severity: TrainingSeverity = (input.criticalRiskIgnored && input.complianceSensitive) ? "CRITICAL"
    : high ? "HIGH" : input.noMitigationPlan ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (input.complianceSensitive && !input.verifiedExpertSource) wntd.push("no acting on a compliance-sensitive decision without verified expert sign-off");
  if (input.criticalRiskIgnored) wntd.push("no ignoring a known critical risk");
  if (input.noMitigationPlan) wntd.push("no proceeding without a mitigation plan");

  const data = assessDataConfidence(input.dataPoints);
  const confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
    verifiedExpertSource: input.verifiedExpertSource === true,
  });

  let nextAction: string;
  if (input.criticalRiskIgnored) nextAction = "Address the ignored critical risk now and add a mitigation plan before proceeding.";
  else if (input.complianceSensitive && !input.verifiedExpertSource) nextAction = "Escalate to a verified expert for sign-off before acting; this is compliance-sensitive.";
  else if (input.complianceSensitive && input.verifiedExpertSource) nextAction = "Proceed under the expert sign-off and record the mitigation and review date.";
  else if (input.noMitigationPlan) nextAction = "Add a mitigation plan and owner before proceeding with the risk.";
  else nextAction = "No outstanding risk/compliance blocker; proceed with the standard controls.";

  return {
    diagnosis: `Risk/compliance: ${severity === "CRITICAL" || severity === "HIGH" ? "ACTION_REQUIRED" : severity === "MEDIUM" ? "MITIGATION_GAP" : "clear"}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "the risk register, compliance classification, expert sign-off, and mitigation plan",
    verificationMethod: "verify expert sign-off and the mitigation before the action proceeds",
    sideEffectMetrics: ["open critical risks", "compliance breach count", "mitigation coverage"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
