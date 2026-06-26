/**
 * D10 — Quality (responder, pure).
 * Detects complaints/defects/rework/inspection failure + root cause; blocks marketing/
 * growth/scale while quality is red. Wires F2/F4 confidence. Pure + deterministic.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface QualityInput {
  complaintRate: number;
  reworkRate?: number;
  inspectionFailing?: boolean;
  rootCause?: "supplier_input" | "staff_process" | "unknown";
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondQuality(input: QualityInput): DomainResponse {
  const cr = input.complaintRate, rr = input.reworkRate ?? 0;
  const red = cr >= 0.15 || rr >= 0.15 || input.inspectionFailing === true;
  const amber = !red && (cr >= 0.07 || rr >= 0.07);
  const severity: TrainingSeverity = red ? "HIGH" : amber ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (red || amber) { wntd.push("no marketing while quality is red"); wntd.push("no growth/scale while quality is red"); }

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  const nextAction = red
    ? `Fix the quality root cause (${input.rootCause ?? "unknown"}) before any marketing/growth; recheck defect and complaint rate.`
    : amber
      ? "Tighten the quality check on the failing step and monitor complaint/rework rate."
      : "Quality is stable; protect the standard and keep the check in place.";

  return {
    diagnosis: `Quality: complaint ${Math.round(cr * 100)}% / rework ${Math.round(rr * 100)}% (${red ? "RED" : amber ? "AMBER" : "GREEN"}); severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Operations Lead",
    proofRequired: "complaint rate, defect/rework rate, inspection pass rate, and refund cost",
    verificationMethod: "recheck defect and complaint rate after the fix",
    sideEffectMetrics: ["complaint rate", "rework rate", "customer retention"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
