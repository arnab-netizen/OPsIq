/**
 * Jarvis 360 Slice 13 — self-evaluation classifier (pure).
 *
 * Audit finding: rich outcome/attribution models existed but the loop was never
 * closed at runtime. This classifies whether a recommendation/action worked and,
 * when it failed, attributes the failure (bad recommendation, poor execution, weak
 * data, owner override, external factor, insufficient proof). No DB/I-O.
 */

export type EvaluationResult = "worked" | "failed" | "unknown";

export type FailureReason =
  | "bad_recommendation"
  | "poor_execution"
  | "weak_data"
  | "owner_override"
  | "external_factor"
  | "insufficient_proof";

export interface OutcomeSignals {
  /** Was the action actually executed (materially, not deviated)? */
  executed: boolean;
  /** Did the measured outcome meet/exceed the expected target? */
  metExpectation: boolean;
  /** Was the supporting data weak/missing? */
  weakData?: boolean;
  /** Did the owner override a safety recommendation? */
  ownerOverrode?: boolean;
  /** Did an external shock invalidate the test? */
  externalEvent?: boolean;
  /** Was proof insufficient to verify? */
  insufficientProof?: boolean;
  /** Was execution materially poor? */
  poorExecution?: boolean;
}

export interface EvaluationVerdict {
  result: EvaluationResult;
  failureReason: FailureReason | null;
  reassessmentRequired: boolean;
}

/** Classify an outcome into worked / failed (+reason) / unknown. Fail-attribution order matters. */
export function classifyOutcome(s: OutcomeSignals): EvaluationVerdict {
  if (!s.executed) return { result: "unknown", failureReason: null, reassessmentRequired: false };
  if (s.metExpectation) return { result: "worked", failureReason: null, reassessmentRequired: false };

  // Failed — attribute, most-specific first.
  let failureReason: FailureReason = "bad_recommendation";
  if (s.insufficientProof) failureReason = "insufficient_proof";
  else if (s.externalEvent) failureReason = "external_factor";
  else if (s.weakData) failureReason = "weak_data";
  else if (s.ownerOverrode) failureReason = "owner_override";
  else if (s.poorExecution) failureReason = "poor_execution";

  return { result: "failed", failureReason, reassessmentRequired: true };
}
