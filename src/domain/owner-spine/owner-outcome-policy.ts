/**
 * Owner Outcome Policy — the one semantic contract for "did the action work?".
 *
 * Pure and read-only: no persistence, no I/O, no scoring. It normalises what the existing loops already
 * record (domain verification rows, process-execution outcome rows) into one `OwnerOutcomeAssessment`
 * that keeps seven distinct facts apart:
 *
 *   1. the action was completed            (executionStatus)
 *   2. an outcome could be observed         (observationStatus)
 *   3. the metric moved                     (measurementResult)
 *   4. the target was reached               (targetAttainment)
 *   5. the problem is resolved              (issueResolution — only a newer diagnosis can say so)
 *   6. the action caused the result         (causalAttribution — never inferred from before/after)
 *   7. the recommendation is proven         (learningEligibility — only what existing governance says)
 *
 * Observed improvement after an OpsIQ recommendation is not by itself proof that the recommendation caused
 * the improvement.
 *
 * It reuses `verifyOutcome` for the baseline/target/after/direction/dispute comparison (not replaced), the
 * spine verification vocabulary, and `AI_IS_NOT_A_VERIFIER`. It never changes a score, threshold, ranking,
 * confidence or learning weight.
 */
import { verifyOutcome } from "../founder-recovery/verification";
import type { VerificationStatus } from "../founder-recovery/types";
import { AI_IS_NOT_A_VERIFIER } from "../owner-mode/evidence-verification";
import type { OwnerDomain } from "./contracts";

export type OutcomeExecutionStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";
export type OutcomeObservationStatus = "NOT_STARTED" | "WINDOW_OPEN" | "READY_TO_MEASURE" | "MISSING_AFTER_EVIDENCE" | "MEASURED";
/** `CHANGED_DIRECTION_UNKNOWN`: before and after differ but the intended direction was not recorded, so no judgment of better/worse is made. */
export type OutcomeMeasurementResult = "IMPROVED" | "UNCHANGED" | "WORSENED" | "CHANGED_DIRECTION_UNKNOWN" | "NOT_MEASURABLE" | "DISPUTED" | "EXTERNALLY_CONFOUNDED";
/** "unknown" is never defaulted to "up": a metric whose intended direction was not recorded cannot be judged better or worse. */
export type OutcomeDirection = "up" | "down" | "unknown";
export type OutcomeTargetAttainment = "REACHED" | "NOT_REACHED" | "NO_TARGET" | "UNKNOWN";
export type OutcomeIssueResolution = "RESOLVED" | "STILL_OPEN" | "WORSENED" | "NOT_YET_REASSESSED" | "INCONCLUSIVE";
export type OutcomeCausalAttribution = "NOT_ASSESSED" | "PLAUSIBLE" | "CONFOUNDED" | "DISPUTED" | "INSUFFICIENT_EVIDENCE";
export type OutcomeBaselineProvenance = "MEASURED" | "OWNER_REPORTED" | "EXTERNAL_SOURCE" | "UNKNOWN";
export type OutcomeAfterProvenance = "AUTHORITATIVE_SNAPSHOT" | "SYSTEM_MEASUREMENT" | "EXTERNAL_RECORD" | "OWNER_ENTERED" | "NARRATIVE_ONLY" | "NONE";
export type OutcomeVerifierKind = "NONE" | "INDEPENDENT" | "SELF" | "AI" | "UNKNOWN";
export type OutcomeEvidenceQuality = "strong" | "moderate" | "weak" | "anecdotal" | "none";
/** Which existing learning loop (if any) the domain feeds. This policy never adds one. */
export type OutcomeLearningLoop = "FINANCE_BRIDGE" | "PROCESS_EXECUTION_GATE" | "NONE";
/**
 * `ELIGIBLE_CONFIRMED_BY_GATE` requires an actual learning-gate result supplied by the caller. Without one the
 * best a pure assessment can say is `PENDING_GOVERNANCE` ("potentially eligible for learning review").
 */
export type OutcomeLearningEligibility = "ELIGIBLE_CONFIRMED_BY_GATE" | "PENDING_GOVERNANCE" | "NOT_ELIGIBLE" | "NO_LEARNING_LOOP";

/** The result of the authoritative learning gate (`determineLearningEligibility`), passed in — never computed here. */
export interface OutcomeLearningGateResult {
  status: string;
  eligible: boolean;
}

export const OUTCOME_AFTER_PROVENANCE_INDEPENDENT: readonly OutcomeAfterProvenance[] = [
  "AUTHORITATIVE_SNAPSHOT",
  "SYSTEM_MEASUREMENT",
  "EXTERNAL_RECORD",
];

/** A diagnosis cycle produced strictly after the action's completion/measurement. */
export interface OutcomeNewerDiagnosisFact {
  /** When the evidence behind that diagnosis was captured. */
  evidenceAsOf: Date | null;
  /** True when the evidence is complete and current enough for "not raised" to mean "gone". */
  evidenceCurrent: boolean;
  /** Does the newer diagnosis still raise the issue this action addressed? */
  stillRaised: boolean;
  /** Is the issue more severe than before? */
  worsened?: boolean;
}

export interface OwnerOutcomeInput {
  domain: OwnerDomain | "customer";
  actionId: string;
  recommendationId?: string | null;
  executionStatus: OutcomeExecutionStatus;
  completedAt: Date | null;
  verificationMetric: string | null;
  baselineValue: number | null;
  baselineProvenance: OutcomeBaselineProvenance;
  afterValue: number | null;
  afterProvenance: OutcomeAfterProvenance;
  afterMeasuredAt: Date | null;
  direction: OutcomeDirection;
  targetValue: number | null;
  /** Observation window in days, anchored at completion. Null = no window recorded (not "no waiting needed"). */
  windowDays: number | null;
  /** The owner or a reviewer flagged the recorded after-value as disputed. */
  disputed: boolean;
  /** An external event (shock, loss, market change) is flagged during the observation period. */
  externalEvent: boolean;
  verifierKind: OutcomeVerifierKind;
  /** A verification attempt was recorded (it may lack an after-value). */
  verificationAttempted: boolean;
  verifiedAt: Date | null;
  /** Result of an existing causal-attribution adjudication, if one was ever run. Never inferred here. */
  causalAssessment?: "likely_caused" | "plausible_contributor" | "correlation_only" | "confounded" | "external_event_dominant" | "insufficient_evidence" | "not_assessed" | null;
  newerDiagnosis: OutcomeNewerDiagnosisFact | null;
  learningLoop: OutcomeLearningLoop;
  /** Actual learning-gate result, when the caller ran the gate with real inputs. Absent = governance not yet consulted. */
  learningGate?: OutcomeLearningGateResult | null;
  /** Evidence quality the source row already carries (process-execution outcomes); derived when absent. */
  recordedEvidenceQuality?: OutcomeEvidenceQuality | null;
  now: Date;
}

export interface OwnerOutcomeAssessment {
  domain: OwnerOutcomeInput["domain"];
  actionId: string;
  recommendationId: string | null;
  executionStatus: OutcomeExecutionStatus;
  observationStatus: OutcomeObservationStatus;
  verificationMetric: string | null;
  baselineValue: number | null;
  baselineProvenance: OutcomeBaselineProvenance;
  afterValue: number | null;
  afterProvenance: OutcomeAfterProvenance;
  direction: OutcomeDirection;
  targetValue: number | null;
  targetAttainment: OutcomeTargetAttainment;
  measurementResult: OutcomeMeasurementResult;
  issueResolution: OutcomeIssueResolution;
  /** Spine vocabulary. `verified_*` means a measured comparison exists — never that the issue is gone or the action caused it. */
  verificationStatus: VerificationStatus;
  evidenceQuality: OutcomeEvidenceQuality;
  disputed: boolean;
  externalInterference: boolean;
  /** Independent verifier recorded (not the owner who did the work, not AI). */
  independentlyVerified: boolean;
  selfVerified: boolean;
  causalAttribution: OutcomeCausalAttribution;
  learningEligibility: OutcomeLearningEligibility;
  learningBlockers: string[];
  measuredAt: Date | null;
  verifiedAt: Date | null;
  nextVerificationAction: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** AI is never a verifier. Throws when a verifier type names an AI; used by write paths that take a verifier type. */
export function assertOutcomeVerifierIsNotAI(kind: OutcomeVerifierKind): void {
  if (AI_IS_NOT_A_VERIFIER && kind === "AI") {
    throw new Error("AI cannot verify an outcome (AI_IS_NOT_A_VERIFIER).");
  }
}

function afterEvidenceQuality(input: OwnerOutcomeInput): OutcomeEvidenceQuality {
  if (input.afterValue === null && input.afterProvenance !== "NARRATIVE_ONLY") return input.recordedEvidenceQuality ?? "none";
  if (input.recordedEvidenceQuality) return input.recordedEvidenceQuality;
  switch (input.afterProvenance) {
    case "AUTHORITATIVE_SNAPSHOT":
    case "SYSTEM_MEASUREMENT":
    case "EXTERNAL_RECORD":
      return "strong";
    case "OWNER_ENTERED":
      return "weak";
    case "NARRATIVE_ONLY":
      return "anecdotal";
    default:
      return "none";
  }
}

function causalFrom(input: OwnerOutcomeInput): OutcomeCausalAttribution {
  if (input.disputed) return "DISPUTED";
  if (input.externalEvent) return "CONFOUNDED";
  switch (input.causalAssessment ?? "not_assessed") {
    // Even a "likely caused" adjudication is reported only as PLAUSIBLE: this contract never claims proof.
    case "likely_caused":
    case "plausible_contributor":
      return "PLAUSIBLE";
    case "confounded":
    case "external_event_dominant":
      return "CONFOUNDED";
    case "correlation_only":
    case "insufficient_evidence":
      return "INSUFFICIENT_EVIDENCE";
    default:
      return "NOT_ASSESSED";
  }
}

function windowEnd(input: OwnerOutcomeInput): Date | null {
  if (input.windowDays === null || input.completedAt === null) return null;
  return new Date(input.completedAt.getTime() + input.windowDays * DAY_MS);
}

/** Resolution comes only from a diagnosis newer than the action's completion/measurement. */
function resolveIssue(input: OwnerOutcomeInput, measurement: OutcomeMeasurementResult): OutcomeIssueResolution {
  const nd = input.newerDiagnosis;
  const anchor = input.afterMeasuredAt ?? input.completedAt;
  const isNewer = !!nd && !!nd.evidenceAsOf && !!anchor && nd.evidenceAsOf.getTime() > anchor.getTime();
  if (isNewer && nd) {
    if (nd.stillRaised) return nd.worsened ? "WORSENED" : "STILL_OPEN";
    // Not raised: only meaningful on complete, current evidence. Missing/stale data is not disappearance.
    return nd.evidenceCurrent ? "RESOLVED" : "INCONCLUSIVE";
  }
  if (measurement === "WORSENED") return "WORSENED";
  return "NOT_YET_REASSESSED";
}

export function assessOwnerOutcome(input: OwnerOutcomeInput): OwnerOutcomeAssessment {
  assertOutcomeVerifierIsNotAI(input.verifierKind);

  const completed = input.executionStatus === "COMPLETED";
  const end = windowEnd(input);
  const measuredOrNow = input.afterMeasuredAt ?? input.now;
  const windowOpen = completed && end !== null && measuredOrNow.getTime() < end.getTime();

  // A baseline of unknown origin is not a baseline (no fabricated or unattributed baselines).
  const baselineUsable = input.baselineValue !== null && input.baselineProvenance !== "UNKNOWN";
  const afterUsable = input.afterValue !== null && input.afterProvenance !== "NARRATIVE_ONLY" && input.afterProvenance !== "NONE";

  const directionKnown = input.direction === "up" || input.direction === "down";
  // Direction is never guessed: with an unknown direction the shared directional comparison is not run.
  const compared = directionKnown
    ? verifyOutcome({
        baselineValue: baselineUsable ? input.baselineValue : null,
        targetValue: input.targetValue,
        afterValue: afterUsable ? input.afterValue : null,
        direction: input.direction as "up" | "down",
        disputed: input.disputed,
      })
    : {
        status: (input.disputed ? "disputed" : "inconclusive") as VerificationStatus,
        actualMovement: null as number | null,
        // Equality with the target is direction-independent; anything else cannot be judged.
        reachedTarget: afterUsable && input.targetValue !== null && input.afterValue === input.targetValue,
        reason: "Intended direction was not recorded.",
      };

  let observationStatus: OutcomeObservationStatus;
  if (!completed) observationStatus = "NOT_STARTED";
  else if (windowOpen) observationStatus = "WINDOW_OPEN";
  else if (!afterUsable) observationStatus = input.verificationAttempted ? "MISSING_AFTER_EVIDENCE" : "READY_TO_MEASURE";
  else observationStatus = "MEASURED";

  let measurementResult: OutcomeMeasurementResult;
  if (input.disputed) measurementResult = "DISPUTED";
  else if (input.externalEvent) measurementResult = "EXTERNALLY_CONFOUNDED";
  else if (observationStatus !== "MEASURED" || !baselineUsable || !afterUsable) measurementResult = "NOT_MEASURABLE";
  else {
    const move = (input.afterValue as number) - (input.baselineValue as number);
    if (move === 0) measurementResult = "UNCHANGED";
    else if (!directionKnown) measurementResult = "CHANGED_DIRECTION_UNKNOWN";
    else measurementResult = (input.direction === "up" ? move > 0 : move < 0) ? "IMPROVED" : "WORSENED";
  }

  const comparable = measurementResult === "IMPROVED" || measurementResult === "UNCHANGED" || measurementResult === "WORSENED" || measurementResult === "CHANGED_DIRECTION_UNKNOWN";
  let targetAttainment: OutcomeTargetAttainment;
  if (!comparable) targetAttainment = "UNKNOWN";
  else if (input.targetValue === null) targetAttainment = "NO_TARGET";
  else if (!directionKnown) targetAttainment = compared.reachedTarget ? "REACHED" : "UNKNOWN";
  else targetAttainment = compared.reachedTarget ? "REACHED" : "NOT_REACHED";

  // Spine vocabulary: a window that is still open (or a missing completion) is simply unverified.
  let verificationStatus: VerificationStatus;
  if (!completed || windowOpen) verificationStatus = "unverified";
  else verificationStatus = compared.status;
  // An external event or a missing-baseline measurement can never read as verified improvement.
  if (input.externalEvent && (verificationStatus === "verified_improved" || verificationStatus === "verified_not_improved")) {
    verificationStatus = "inconclusive";
  }

  const issueResolution = resolveIssue(input, measurementResult);
  const causalAttribution = causalFrom(input);

  const independentlyVerified = input.verifierKind === "INDEPENDENT" && input.verifiedAt !== null;
  const selfVerified = input.verifierKind === "SELF" && input.verifiedAt !== null;
  const evidenceQuality = afterEvidenceQuality(input);

  const learningBlockers: string[] = [];
  if (input.learningLoop === "NONE") learningBlockers.push("This domain has no outcome-learning loop.");
  if (verificationStatus !== "verified_improved" && verificationStatus !== "verified_not_improved") learningBlockers.push("No conclusive verified comparison.");
  if (!directionKnown) learningBlockers.push("The intended direction of the metric was not recorded.");
  if (input.disputed) learningBlockers.push("The outcome is disputed.");
  if (input.externalEvent) learningBlockers.push("An external event interfered; the result is not attributable.");
  if (!baselineUsable) learningBlockers.push("No usable baseline.");
  if (windowOpen) learningBlockers.push("The observation window is still open.");
  let learningEligibility: OutcomeLearningEligibility;
  if (input.learningLoop === "NONE") learningEligibility = "NO_LEARNING_LOOP";
  else if (learningBlockers.length > 0) learningEligibility = "NOT_ELIGIBLE";
  else if (input.learningGate) {
    if (input.learningGate.eligible) learningEligibility = "ELIGIBLE_CONFIRMED_BY_GATE";
    else {
      learningEligibility = "NOT_ELIGIBLE";
      learningBlockers.push(`Learning gate: ${input.learningGate.status}.`);
    }
  } else {
    // A conclusive comparison makes this *potentially* eligible for learning review; it is not eligibility.
    learningEligibility = "PENDING_GOVERNANCE";
    learningBlockers.push("The learning gate has not been run with real inputs.");
  }

  const base: OwnerOutcomeAssessment = {
    domain: input.domain,
    actionId: input.actionId,
    recommendationId: input.recommendationId ?? null,
    executionStatus: input.executionStatus,
    observationStatus,
    verificationMetric: input.verificationMetric,
    baselineValue: input.baselineValue,
    baselineProvenance: input.baselineProvenance,
    afterValue: input.afterValue,
    afterProvenance: input.afterProvenance,
    direction: input.direction,
    targetValue: input.targetValue,
    targetAttainment,
    measurementResult,
    issueResolution,
    verificationStatus,
    evidenceQuality,
    disputed: input.disputed,
    externalInterference: input.externalEvent,
    independentlyVerified,
    selfVerified,
    causalAttribution,
    learningEligibility,
    learningBlockers,
    measuredAt: input.afterMeasuredAt,
    verifiedAt: input.verifiedAt,
    nextVerificationAction: "",
  };
  base.nextVerificationAction = ownerOutcomeLoopState(base, end).nextStep;
  return base;
}

// ── Owner-facing loop states ─────────────────────────────────────────────────

export type OwnerOutcomeLoopStateCode =
  | "IN_PROGRESS"
  | "DONE"
  | "WAITING_TO_MEASURE"
  | "NEEDS_AFTER_DATA"
  | "IMPROVED_TARGET_MISSED"
  | "TARGET_REACHED"
  | "NEEDS_DIRECTION"
  | "NO_MEASURABLE_IMPROVEMENT"
  | "MADE_WORSE"
  | "DISPUTED"
  | "EXTERNAL_EVENT_INTERFERED"
  | "NEW_DIAGNOSIS_CONFIRMS_RESOLVED"
  | "STILL_OPEN";

export interface OwnerOutcomeLoopState {
  code: OwnerOutcomeLoopStateCode;
  label: string;
  /** Plain-language reading. Never states resolution or causation the evidence does not support. */
  reading: string;
  /** Every state is non-terminal except a confirmed resolution; each names a concrete next step. */
  nextStep: string;
  terminal: boolean;
}

const METRIC_FALLBACK = "the metric this action was meant to move";

export function ownerOutcomeLoopState(a: OwnerOutcomeAssessment, windowEndsAt?: Date | null): OwnerOutcomeLoopState {
  const metric = a.verificationMetric ?? METRIC_FALLBACK;
  const make = (code: OwnerOutcomeLoopStateCode, label: string, reading: string, nextStep: string, terminal = false): OwnerOutcomeLoopState => ({ code, label, reading, nextStep, terminal });

  if (a.executionStatus !== "COMPLETED") {
    return make("IN_PROGRESS", "Not done yet", "The action has not been completed, so there is nothing to measure.", "Finish the action, then record how it went.");
  }
  if (a.disputed) {
    return make("DISPUTED", "Disputed", "The recorded result is disputed, so it is not counted as proof either way.", `Re-measure ${metric} from a source both sides accept, then record it again.`);
  }
  if (a.externalInterference) {
    return make("EXTERNAL_EVENT_INTERFERED", "External event interfered", "Something outside this action affected the result, so the movement cannot be credited to — or held against — the action.", "Record what happened and have it reviewed before this result is used for anything.");
  }
  if (a.observationStatus === "WINDOW_OPEN") {
    const when = windowEndsAt ? ` (window ends ${windowEndsAt.toISOString().slice(0, 10)})` : "";
    return make("WAITING_TO_MEASURE", "Waiting to measure", "Too early to judge. This is not a failure.", `Measure ${metric} once the observation window has passed${when}.`);
  }
  if (a.issueResolution === "WORSENED") {
    return make("MADE_WORSE", "Made worse", `${metric} moved the wrong way. This stays visible and goes back into review.`, "Review whether to stop, reverse or change the action, and re-check the diagnosis.");
  }
  if (a.issueResolution === "STILL_OPEN") {
    return make("STILL_OPEN", "Still open", "The newer figures still show this issue, whatever the action's own result was.", "Treat the issue as open and decide the next action from the new diagnosis.");
  }
  if (a.issueResolution === "RESOLVED") {
    return make("NEW_DIAGNOSIS_CONFIRMS_RESOLVED", "New diagnosis confirms resolved", "A newer diagnosis on current evidence no longer raises this issue. That does not by itself show the action caused it.", "Keep watching it at the normal review cadence.", true);
  }
  if (a.verificationMetric === null) {
    return make("DONE", "Done", "The action is complete, but no metric was set to show whether it worked.", "Choose a measurable result for this action and record a before value.");
  }
  if (a.observationStatus === "READY_TO_MEASURE" || a.observationStatus === "MISSING_AFTER_EVIDENCE" || a.measurementResult === "NOT_MEASURABLE") {
    const reason = a.baselineProvenance === "UNKNOWN" || a.baselineValue === null ? "there is no usable before value" : "there is no after value yet";
    return make("NEEDS_AFTER_DATA", "Needs after-data", `The action is done but ${reason}, so the result is unknown.`, `Record ${a.baselineValue === null || a.baselineProvenance === "UNKNOWN" ? "a before value and " : ""}the current ${metric} from a recorded source.`);
  }
  if (a.measurementResult === "CHANGED_DIRECTION_UNKNOWN") {
    return make("NEEDS_DIRECTION", "Needs direction", "OpsIQ has the before and after values, but the intended direction for this metric was not recorded, so target attainment cannot be verified.", `Record whether ${metric} should go up or down, then re-check it.`);
  }
  if (a.measurementResult === "WORSENED") {
    return make("MADE_WORSE", "Made worse", `${metric} moved the wrong way. This stays visible and goes back into review.`, "Review whether to stop, reverse or change the action, and re-check the diagnosis.");
  }
  if (a.measurementResult === "UNCHANGED") {
    return make("NO_MEASURABLE_IMPROVEMENT", "No measurable improvement", `${metric} did not move. The issue is not treated as fixed.`, "Check whether the action was carried out as planned, then choose a different or stronger action.");
  }
  if (a.targetAttainment === "REACHED") {
    return make("TARGET_REACHED", "Target reached", "The action reached its verification target; confirm with new business evidence. The issue is not marked resolved until a newer diagnosis agrees.", "Add refreshed figures so the diagnosis can be re-run.");
  }
  return make("IMPROVED_TARGET_MISSED", "Improved but target missed", `${metric} moved the right way but did not reach its target.`, "Decide whether to continue, strengthen or replace the action, and add refreshed figures.");
}

/** The single wording for a "verified" line shown to the owner. */
export function describeVerifiedActionLine(title: string): string {
  return `"${title}" reached its verification target; confirm with new business evidence.`;
}
