/**
 * D6 — When to stop, rollback, or redesign (responder, pure).
 *
 * Maps active signals to STOP / ROLLBACK / REDESIGN / CONTINUE with harm + expert
 * escalation thresholds. Wires F2/F4 confidence. Fail-closed on harm + compliance/safety.
 * Pure + deterministic.
 */

import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export type StopVerdict = "STOP" | "ROLLBACK" | "REDESIGN" | "CONTINUE";

export interface StopInput {
  harmDetected?: boolean;
  complianceOrSafetyIssue?: boolean;
  outcomeWorsening?: boolean;
  repeatedFailure?: boolean;
  irreversibleRiskRising?: boolean;
  dataPoints: DataPoint[];
}

export function stopVerdict(i: StopInput): StopVerdict {
  if (i.harmDetected || i.complianceOrSafetyIssue || i.irreversibleRiskRising) return "STOP";
  if (i.outcomeWorsening) return "ROLLBACK";
  if (i.repeatedFailure) return "REDESIGN";
  return "CONTINUE";
}

const SEVERITY: Record<StopVerdict, TrainingSeverity> = { STOP: "CRITICAL", ROLLBACK: "HIGH", REDESIGN: "MEDIUM", CONTINUE: "LOW" };

export function respondStopRollbackRedesign(input: StopInput): DomainResponse {
  const verdict = stopVerdict(input);
  const severity = SEVERITY[verdict];

  const wntd: string[] = [];
  if (verdict === "STOP" || verdict === "ROLLBACK") wntd.push("do not continue the current action");
  if (input.repeatedFailure) wntd.push("do not retry the same action unchanged");
  if (input.complianceOrSafetyIssue) wntd.push("do not proceed without expert review");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceOrSafetyIssue === true,
  });
  if (input.complianceOrSafetyIssue) confidence = "ESCALATE";

  const ACTION: Record<StopVerdict, string> = {
    STOP: "Stop the action now and contain the harm; escalate to the owner/expert before any restart.",
    ROLLBACK: "Roll back to the previous stable state and re-evaluate before retrying.",
    REDESIGN: "Redesign the approach (the same action keeps failing); test the new design before rollout.",
    CONTINUE: "Continue with monitoring; recheck the outcome at the next review window.",
  };

  return {
    diagnosis: `Stop/rollback/redesign decision: ${verdict}.`,
    confidence,
    severity,
    whatNotToDo: wntd,
    nextAction: ACTION[verdict],
    assignedRole: "Owner",
    proofRequired: "outcome trend, harm signals, failure count, and reversibility assessment",
    verificationMethod: "recheck harm + outcome trend after the stop/rollback/redesign decision",
    sideEffectMetrics: ["harm severity", "outcome trend", "reversibility"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true,
    unsafeEmitted: [],
  };
}
