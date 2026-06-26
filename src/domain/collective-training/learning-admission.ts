/**
 * C13 — Collective learning admission controller (pure).
 *
 * Decides the packet's learning status by wiring the existing F10 verified-learning
 * quarantine (`canPromote` / `terminalStage`). No learning from unverified or disputed
 * outcomes; a harmful or cross-domain-harmful outcome becomes a quarantined negative
 * pattern, never a positive promotion; promotion requires the full simulation-tested
 * chain.
 */

import { LearningStage, canPromote, terminalStage, type LearningCandidate } from "@/domain/domain-training/learning-quarantine";
import type { CollectiveLearningStatus } from "@/domain/collective-training/collective-types";

export interface LearningAdmissionInput {
  learningRequested: boolean;
  outcomeVerified: boolean;
  harmChecked: boolean;
  harmful: boolean;
  crossDomainHarm: boolean;
  disputed: boolean;
  inconclusive: boolean;
  simulationTested: boolean;
}

const STAGE_TO_STATUS: Record<LearningStage, CollectiveLearningStatus> = {
  [LearningStage.CAPTURED]: "CAPTURED",
  [LearningStage.EVIDENCE_CHECKED]: "EVIDENCE_CHECKED",
  [LearningStage.OUTCOME_VERIFIED]: "OUTCOME_VERIFIED",
  [LearningStage.HARM_CHECKED]: "HARM_CHECKED",
  [LearningStage.DOMAIN_REVIEWED]: "HARM_CHECKED",
  [LearningStage.QUARANTINED_PATTERN]: "QUARANTINED",
  [LearningStage.SIMULATION_TESTED]: "HARM_CHECKED",
  [LearningStage.PROMOTED]: "PROMOTED",
  [LearningStage.REJECTED]: "REJECTED",
  [LearningStage.INCONCLUSIVE]: "INCONCLUSIVE",
  [LearningStage.DISPUTED]: "DISPUTED",
};

export interface LearningAdmissionResult {
  status: CollectiveLearningStatus;
  canPromote: boolean;
  reason: string;
}

export function decideLearning(i: LearningAdmissionInput): LearningAdmissionResult {
  if (!i.learningRequested) {
    return { status: "NOT_ELIGIBLE", canPromote: false, reason: "no learning requested" };
  }
  // A cross-domain harm is treated as harmful for admission purposes.
  const harmful = i.harmful || i.crossDomainHarm;

  const candidate: LearningCandidate = {
    stage: i.simulationTested ? LearningStage.SIMULATION_TESTED
      : i.harmChecked ? LearningStage.HARM_CHECKED
      : i.outcomeVerified ? LearningStage.OUTCOME_VERIFIED
      : LearningStage.CAPTURED,
    outcomeVerified: i.outcomeVerified,
    harmChecked: i.harmChecked,
    harmful,
    disputed: i.disputed,
    inconclusive: i.inconclusive,
    simulationTested: i.simulationTested,
  };

  if (canPromote(candidate)) {
    return { status: "PROMOTED", canPromote: true, reason: "verified, harm-checked, undisputed, conclusive, simulation-tested" };
  }
  const terminal = terminalStage(candidate);
  const status = STAGE_TO_STATUS[terminal];
  const reason = i.disputed ? "disputed outcome"
    : i.inconclusive ? "inconclusive outcome"
    : harmful ? "harmful/cross-domain harm → quarantined negative pattern"
    : !i.outcomeVerified ? "outcome not verified → cannot admit"
    : "not yet simulation-tested";
  return { status, canPromote: false, reason };
}
