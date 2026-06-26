/**
 * D4 — What proof is required (responder, pure).
 *
 * Decides whether a completion claim is acceptable: rejects unsupported completion,
 * stale or contradictory proof, proof that shows the task done but not the outcome, and
 * high-risk closures on weaker-than-manager evidence. Wires F3 evidence-hierarchy +
 * F2/F4 confidence. Never accepts a false completion. Pure + deterministic.
 */

import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import { EvidenceType, canCloseHighRiskAlone, isAcceptableAsProof } from "@/domain/domain-training/evidence-hierarchy";
import type { TrainingSeverity } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface ProofInput {
  highRisk: boolean;
  evidence: EvidenceType | "none";
  proofStale?: boolean;
  proofContradictory?: boolean;
  /** Proof shows the task was done but not that the outcome improved. */
  proofShowsTaskNotOutcome?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondProofRequired(input: ProofInput): DomainResponse {
  const severity: TrainingSeverity = input.highRisk ? "HIGH" : "MEDIUM";
  const acceptable = input.evidence !== "none" && isAcceptableAsProof(input.evidence);
  const highRiskWeak = input.highRisk && (input.evidence === "none" || !canCloseHighRiskAlone(input.evidence));

  const wntd = new Set<string>();
  if (!acceptable) wntd.add("do not accept completion without proof");
  if (input.proofStale) wntd.add("do not accept stale proof");
  if (input.proofContradictory) wntd.add("do not accept contradictory proof");
  if (input.proofShowsTaskNotOutcome) wntd.add("do not accept task-done as outcome-verified");
  if (highRiskWeak && acceptable) wntd.add("do not close high-risk without manager verification or stronger");

  const rejected = !acceptable || !!input.proofStale || !!input.proofContradictory
    || !!input.proofShowsTaskNotOutcome || highRiskWeak;

  const data = assessDataConfidence(input.dataPoints);
  let confidence = classifyConfidence({
    dataConfidence: data.ceiling,
    blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0,
    complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";
  else if (rejected) confidence = "BLOCKED";

  let nextAction: string;
  if (input.complianceSensitive) {
    nextAction = "Route to professional review and collect the required proof matching the action's strength before closing.";
  } else if (rejected) {
    nextAction = "Collect the required proof matching the action's strength and verify the OUTCOME (not just task completion) before closing.";
  } else {
    nextAction = "Accept the verified proof and proceed to outcome verification.";
  }

  return {
    diagnosis: `Proof requirement for a ${input.highRisk ? "high-risk" : "routine"} action; completion is ${rejected ? "NOT acceptable yet" : "acceptable"}.`,
    confidence,
    severity,
    whatNotToDo: [...wntd],
    nextAction,
    assignedRole: "Owner",
    proofRequired: "proof matching the action's required strength (manager verification or stronger for high-risk), attesting the outcome",
    verificationMethod: "confirm the proof attests the OUTCOME, not only task completion",
    sideEffectMetrics: ["false-completion rate", "rework rate", "complaint rate"],
    hasStopRule: true,
    hasRollbackRule: true,
    hasRedesignRule: true,
    unsafeEmitted: [],
  };
}
