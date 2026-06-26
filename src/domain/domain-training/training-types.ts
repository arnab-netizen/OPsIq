/**
 * Owner Mode Individual Domain Training — shared vocabulary (pure).
 *
 * Establishes the shared enums every domain training contract + the scoring harness
 * reuse. Deliberately reuses the existing M1 EvidenceConfidenceLevel rather than
 * inventing a second confidence scale. No engine logic here — vocabulary only.
 */

import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";

export { EvidenceConfidenceLevel };

/** Training maturity levels a domain progresses through. */
export enum TrainingLevel {
  LEVEL_0_UNTRUSTED = "LEVEL_0_UNTRUSTED",
  LEVEL_1_INPUT_AWARE = "LEVEL_1_INPUT_AWARE",
  LEVEL_2_DIAGNOSTIC = "LEVEL_2_DIAGNOSTIC",
  LEVEL_3_ACTIONABLE = "LEVEL_3_ACTIONABLE",
  LEVEL_4_EVIDENCE_GOVERNED = "LEVEL_4_EVIDENCE_GOVERNED",
  LEVEL_5_OUTCOME_VERIFIED = "LEVEL_5_OUTCOME_VERIFIED",
  LEVEL_6_LEARNING_ELIGIBLE = "LEVEL_6_LEARNING_ELIGIBLE",
}

export const TRAINING_LEVEL_ORDER: readonly TrainingLevel[] = [
  TrainingLevel.LEVEL_0_UNTRUSTED,
  TrainingLevel.LEVEL_1_INPUT_AWARE,
  TrainingLevel.LEVEL_2_DIAGNOSTIC,
  TrainingLevel.LEVEL_3_ACTIONABLE,
  TrainingLevel.LEVEL_4_EVIDENCE_GOVERNED,
  TrainingLevel.LEVEL_5_OUTCOME_VERIFIED,
  TrainingLevel.LEVEL_6_LEARNING_ELIGIBLE,
];

/** Minimum score (%) required to reach each level (F15 promotion thresholds). */
export const LEVEL_THRESHOLD: Record<TrainingLevel, number> = {
  [TrainingLevel.LEVEL_0_UNTRUSTED]: 0,
  [TrainingLevel.LEVEL_1_INPUT_AWARE]: 70,
  [TrainingLevel.LEVEL_2_DIAGNOSTIC]: 75,
  [TrainingLevel.LEVEL_3_ACTIONABLE]: 80,
  [TrainingLevel.LEVEL_4_EVIDENCE_GOVERNED]: 85,
  [TrainingLevel.LEVEL_5_OUTCOME_VERIFIED]: 90,
  [TrainingLevel.LEVEL_6_LEARNING_ELIGIBLE]: 90,
};

/** Recommendation confidence protocol classes (F4). */
export type RecommendationConfidence = "HIGH" | "MEDIUM" | "LOW" | "BLOCKED" | "ESCALATE";

/** Training severity (F5) — extends the ops severity scale with INFO. */
export type TrainingSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const TRAINING_SEVERITY_ORDER: readonly TrainingSeverity[] = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** Simulation scenario types every domain must cover. */
export type ScenarioType =
  | "clean_normal"
  | "messy_real_world"
  | "adversarial"
  | "missing_data"
  | "cross_pressure"
  | "archetype_laundry"
  | "archetype_housekeeping"
  | "owner_pressure"
  | "false_completion"
  | "vanity_metric";

export const REQUIRED_SCENARIO_TYPES: readonly ScenarioType[] = [
  "clean_normal",
  "messy_real_world",
  "adversarial",
  "missing_data",
  "cross_pressure",
  "archetype_laundry",
  "archetype_housekeeping",
  "owner_pressure",
  "false_completion",
  "vanity_metric",
];

/** Minimum simulation cases a domain must carry before it can be marked trained. */
export const MIN_CASES_PER_DOMAIN = 21;
