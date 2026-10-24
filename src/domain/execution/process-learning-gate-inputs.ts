/**
 * Process-execution learning gate inputs — fail closed.
 *
 * `determineLearningEligibility` is documented as an ordered, fail-closed gate. It is only meaningful when each
 * input comes from a real, governed fact. This module assembles the gate input from facts the caller actually
 * has and refuses (returns the missing facts) when any required fact is unproven. It never supplies a favourable
 * default: no `ACCEPTED` proof, `ACCEPTABLE` quality, `LIKELY` attribution, `NOT_REQUIRED` approval or `NONE`
 * AI-mutation status is ever invented.
 *
 * Which facts can be proven today (no schema carries them for process-execution outcomes):
 *   proof status            — NONE   (a task holds free-text `evidenceRefs`; no accepted-proof link or status)
 *   implementation quality  — NONE   (quality-assessment is not persisted against a task)
 *   attribution status      — NONE   (causal-attribution is not wired; `causalAttributionId` is never populated)
 *   profit impact           — NONE   (no profit-impact record linked to the task)
 *   owner learning approval — NONE   (approval is recorded on the candidate, which this path does not create)
 *   AI mutation status      — NONE   (no record states that no AI wrote the outcome/verification)
 * Until a governed source exists for each, process-execution outcomes cannot become learning candidates.
 */
import {
  AiMutationAttemptStatus,
  AttributionStatus,
  ImplementationQualityStatus,
  OutcomeStatus,
  OwnerLearningApproval,
  ProfitImpactConfidence,
  ProofGateStatus,
  type LearningGateInput,
} from "./learning-gate";

export type ProcessLearningFactSource = "NONE";

/** Honest inventory of where each required gate fact would come from. Everything is NONE today. */
export const PROCESS_LEARNING_GATE_FACT_SOURCES = {
  proofStatus: "NONE",
  implementationQuality: "NONE",
  attributionStatus: "NONE",
  profitImpact: "NONE",
  ownerLearningApproval: "NONE",
  aiMutationStatus: "NONE",
} as const satisfies Record<string, ProcessLearningFactSource>;

export type OwnerOutcomeClassificationName =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "NO_MEASURABLE_IMPACT"
  | "FAILURE"
  | "NEGATIVE_IMPACT"
  | "INCONCLUSIVE"
  | "EXTERNAL_EVENT_INTERFERENCE"
  | "OBSERVATION_WINDOW_OPEN"
  | "INSUFFICIENT_EVIDENCE";

/** Classification → the gate's outcome status. External interference maps to ATTRIBUTION_UNCLEAR (fail closed). */
export function gateOutcomeStatusFor(classification: OwnerOutcomeClassificationName): OutcomeStatus | null {
  switch (classification) {
    case "SUCCESS":
      return OutcomeStatus.VERIFIED_SUCCESS;
    case "PARTIAL_SUCCESS":
      return OutcomeStatus.PARTIAL_SUCCESS;
    case "FAILURE":
    case "NEGATIVE_IMPACT":
      return OutcomeStatus.VERIFIED_FAILURE;
    case "EXTERNAL_EVENT_INTERFERENCE":
      return OutcomeStatus.ATTRIBUTION_UNCLEAR;
    case "OBSERVATION_WINDOW_OPEN":
      return OutcomeStatus.MEASUREMENT_WINDOW_OPEN;
    case "NO_MEASURABLE_IMPACT":
    case "INCONCLUSIVE":
    case "INSUFFICIENT_EVIDENCE":
      return OutcomeStatus.INSUFFICIENT_DATA;
    default:
      return null;
  }
}

/** Facts a caller may supply when it genuinely has them. Absent (null/undefined) means unproven. */
export interface ProcessLearningFacts {
  classification: OwnerOutcomeClassificationName;
  proofStatus?: ProofGateStatus | null;
  proofRequired?: boolean | null;
  implementationQuality?: ImplementationQualityStatus | null;
  attributionStatus?: AttributionStatus | null;
  profitImpactRequired?: boolean | null;
  profitImpactConfidence?: ProfitImpactConfidence | null;
  ownerLearningApproval?: OwnerLearningApproval | null;
  aiMutationAttempt?: AiMutationAttemptStatus | null;
}

export type ProcessLearningGateInputResult =
  | { ok: true; input: LearningGateInput }
  | { ok: false; missing: string[] };

export function buildProcessLearningGateInput(f: ProcessLearningFacts): ProcessLearningGateInputResult {
  const outcomeStatus = gateOutcomeStatusFor(f.classification);
  const missing: string[] = [];
  if (!outcomeStatus) missing.push("outcomeStatus");
  if (f.proofStatus == null || f.proofRequired == null) missing.push("proofStatus");
  if (f.implementationQuality == null) missing.push("implementationQuality");
  if (f.attributionStatus == null) missing.push("attributionStatus");
  if (f.profitImpactRequired == null || f.profitImpactConfidence == null) missing.push("profitImpact");
  if (f.ownerLearningApproval == null) missing.push("ownerLearningApproval");
  if (f.aiMutationAttempt == null) missing.push("aiMutationStatus");
  if (missing.length > 0 || !outcomeStatus) return { ok: false, missing };
  return {
    ok: true,
    input: {
      proofStatus: f.proofStatus as ProofGateStatus,
      proofRequired: f.proofRequired as boolean,
      implementationQuality: f.implementationQuality as ImplementationQualityStatus,
      outcomeStatus,
      attributionStatus: f.attributionStatus as AttributionStatus,
      profitImpactRequired: f.profitImpactRequired as boolean,
      profitImpactConfidence: f.profitImpactConfidence as ProfitImpactConfidence,
      ownerLearningApproval: f.ownerLearningApproval as OwnerLearningApproval,
      aiMutationAttempt: f.aiMutationAttempt as AiMutationAttemptStatus,
    },
  };
}
