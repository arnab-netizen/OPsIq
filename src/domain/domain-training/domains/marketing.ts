/**
 * D14 — Marketing (responder, pure).
 * Blocks marketing spend while upstream (quality/capacity/retention) is red, blocks
 * vanity-metric optimization and untraceable spend. Wires F2/F4 confidence. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface MarketingInput {
  qualityRed?: boolean;
  capacityConstrained?: boolean;
  retentionLeaking?: boolean;
  vanityFocus?: boolean;
  noTrackingToSales?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondMarketing(input: MarketingInput): DomainResponse {
  const blockedUpstream = !!(input.qualityRed || input.capacityConstrained || input.retentionLeaking);
  const severity: TrainingSeverity = blockedUpstream ? "HIGH"
    : (input.vanityFocus || input.noTrackingToSales) ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (blockedUpstream) wntd.push("no marketing spend while upstream (quality/capacity/retention) is red");
  if (input.vanityFocus) wntd.push("no optimizing vanity metrics over leads and sales");
  if (input.noTrackingToSales) wntd.push("no marketing spend you cannot trace to sales");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (blockedUpstream) nextAction = "Fix the upstream constraint (quality/capacity/retention) before scaling marketing spend; verify it cleared.";
  else if (input.noTrackingToSales) nextAction = "Instrument marketing so every dollar can trace to sales before increasing budget.";
  else if (input.vanityFocus) nextAction = "Refocus marketing from vanity metrics to leads and sales; track cost per acquisition.";
  else nextAction = "Marketing is safe to run; scale gradually and track cost per acquisition.";

  return {
    diagnosis: `Marketing: upstream ${blockedUpstream ? "RED" : "clear"}${input.vanityFocus ? " (vanity focus)" : ""}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "cost per acquisition, conversion to sales, and upstream readiness (quality/capacity/retention)",
    verificationMethod: "verify spend traces to sales and cost per acquisition holds after the change",
    sideEffectMetrics: ["cost per acquisition", "conversion rate", "customer acquisition cost"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
