/**
 * F10 — Verified-learning quarantine (pure).
 *
 * The staged admission pipeline that prevents any learning from unverified, disputed,
 * or harmful outcomes. Wires the existing M27 learning-gate / learning-eligibility
 * concepts into explicit stages. A candidate can only be PROMOTED after it is
 * outcome-verified, harm-checked (no harm), undisputed, conclusive, and
 * simulation-tested. Pure + deterministic.
 */

export enum LearningStage {
  CAPTURED = "CAPTURED",
  EVIDENCE_CHECKED = "EVIDENCE_CHECKED",
  OUTCOME_VERIFIED = "OUTCOME_VERIFIED",
  HARM_CHECKED = "HARM_CHECKED",
  DOMAIN_REVIEWED = "DOMAIN_REVIEWED",
  QUARANTINED_PATTERN = "QUARANTINED_PATTERN",
  SIMULATION_TESTED = "SIMULATION_TESTED",
  PROMOTED = "PROMOTED",
  REJECTED = "REJECTED",
  INCONCLUSIVE = "INCONCLUSIVE",
  DISPUTED = "DISPUTED",
}

export interface LearningCandidate {
  stage: LearningStage;
  outcomeVerified: boolean;
  harmChecked: boolean;
  harmful: boolean;
  disputed: boolean;
  inconclusive: boolean;
  simulationTested: boolean;
}

/** A candidate may be promoted only when every guard passes. */
export function canPromote(c: LearningCandidate): boolean {
  return c.outcomeVerified
    && c.harmChecked
    && !c.harmful
    && !c.disputed
    && !c.inconclusive
    && c.simulationTested
    && c.stage === LearningStage.SIMULATION_TESTED;
}

/** The correct terminal classification for a candidate that cannot be promoted. */
export function terminalStage(c: LearningCandidate): LearningStage {
  if (c.disputed) return LearningStage.DISPUTED;
  if (c.inconclusive) return LearningStage.INCONCLUSIVE;
  if (c.harmful) return LearningStage.QUARANTINED_PATTERN; // negative pattern, never positive learning
  if (!c.outcomeVerified) return LearningStage.CAPTURED; // cannot advance without verified outcome
  return canPromote(c) ? LearningStage.PROMOTED : LearningStage.DOMAIN_REVIEWED;
}

/** Direct CAPTURED→PROMOTED is forbidden — promotion requires the full chain. */
export function isIllegalJump(from: LearningStage, to: LearningStage): boolean {
  return to === LearningStage.PROMOTED && from !== LearningStage.SIMULATION_TESTED;
}
