/**
 * D7 — Capacity (responder, pure).
 * Detects the active bottleneck + safe demand limit; blocks broad marketing/growth when
 * capacity is stressed. Wires F2/F4 confidence. Never emits a vetoed action. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface CapacityInput {
  utilizationPct: number;
  bottleneckResource: string;
  backlogRising?: boolean;
  reworkDrain?: boolean;
  qualityUnsafe?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondCapacity(input: CapacityInput): DomainResponse {
  const u = input.utilizationPct;
  const red = u >= 0.95 || input.backlogRising === true;
  const amber = !red && u >= 0.85;
  const severity: TrainingSeverity = u >= 0.98 ? "CRITICAL" : red ? "HIGH" : amber ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (red || amber) wntd.push("no broad marketing while capacity is stressed");
  if (red || input.qualityUnsafe) wntd.push("no growth until backlog/turnaround/quality is safe");
  if (input.reworkDrain) wntd.push("no ignoring rework capacity drain");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  const nextAction = red
    ? `Cap intake at the safe demand limit and clear the ${input.bottleneckResource} bottleneck before accepting new volume.`
    : amber
      ? `Hold intake near the safe limit; schedule the ${input.bottleneckResource} before accepting more.`
      : "Capacity is healthy; monitor the bottleneck and protect turnaround.";

  return {
    diagnosis: `Capacity: bottleneck ${input.bottleneckResource} at ${Math.round(u * 100)}% (${red ? "RED" : amber ? "AMBER" : "GREEN"}); severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Operations Lead",
    proofRequired: "utilization by resource, backlog, turnaround time, and rework rate",
    verificationMethod: "recheck bottleneck utilization and turnaround after the intake change",
    sideEffectMetrics: ["turnaround time", "complaint rate", "staff overload"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
