/**
 * Effectiveness / SOP-adherence / training attribution classifier (PASS 26) — pure domain.
 *
 * The effectiveness loop previously compared a baseline metric to a current metric and, on an improvement,
 * said the correction "appears to be working" — a FALSE ATTRIBUTION: it never checked whether the correction
 * was actually EXECUTED. This module makes attribution first-class and impossible to overstate. It separates
 * three independent facts that were previously conflated:
 *
 *   1. execution   — was the correction/SOP/training actually carried out, with evidence?
 *   2. outcome     — did the targeted metric change, measured AFTER execution?
 *   3. attribution — can the outcome be honestly attributed to the action?
 *
 * OpsIQ may only say a fix "worked" when execution is evidenced AND a post-execution reassessment shows
 * improvement. Improvement without execution evidence is reported as unattributed; execution without a
 * post-execution measurement routes to a reassessment; a weak/absent execution never yields a VERIFIED state.
 *
 * Pure + deterministic. No metric is fabricated; unknown inputs resolve to explicit UNKNOWN / INSUFFICIENT
 * states, never to a favourable guess.
 */

// ── First-class states ──────────────────────────────────────────────────────────────────────────────────

/** Was the correction actually carried out? Distinguishes proposed / assigned / executed / evidence quality. */
export type CorrectionExecutionState =
  | "PROPOSED" | "ASSIGNED" | "IN_PROGRESS" | "EXECUTED_WITH_EVIDENCE"
  | "EXECUTED_WITH_WEAK_EVIDENCE" | "NOT_EXECUTED" | "BLOCKED" | "CANCELLED" | "UNKNOWN";

/** SOP lifecycle — DRAFTED/ADOPTED (change made) is distinct from ADHERENCE_VERIFIED (people actually follow it). */
export type SopAdherenceState =
  | "NOT_APPLICABLE" | "SOP_PROPOSED" | "SOP_DRAFTED" | "SOP_APPROVED" | "SOP_ASSIGNED"
  | "SOP_ADOPTED_WITH_EVIDENCE" | "SOP_ADHERENCE_VERIFIED" | "SOP_NOT_FOLLOWED"
  | "SOP_WEAK_EVIDENCE" | "NEEDS_RECHECK" | "INSUFFICIENT_EVIDENCE" | "UNKNOWN";

/** Training lifecycle — ASSIGNED ≠ COMPLETED ≠ EFFECTIVE. Post-training outcome is separate from completion. */
export type TrainingEffectivenessState =
  | "TRAINING_NOT_ASSIGNED" | "TRAINING_ASSIGNED" | "TRAINING_COMPLETED_WITH_EVIDENCE"
  | "TRAINING_COMPLETED_WEAK_EVIDENCE" | "TRAINING_NOT_COMPLETED" | "POST_TRAINING_IMPROVED"
  | "POST_TRAINING_UNCHANGED" | "POST_TRAINING_WORSENED" | "NEEDS_RECHECK" | "INSUFFICIENT_EVIDENCE" | "UNKNOWN";

/** The honest attribution verdict — the only place OpsIQ decides whether a fix may be called effective. */
export type EffectivenessAttributionState =
  | "VERIFIED_IMPROVED_AFTER_EXECUTION" | "VERIFIED_UNCHANGED_AFTER_EXECUTION" | "VERIFIED_WORSENED_AFTER_EXECUTION"
  | "IMPROVED_BUT_EXECUTION_NOT_PROVEN" | "EXECUTED_BUT_OUTCOME_NOT_PROVEN" | "OUTCOME_CHANGED_BUT_ATTRIBUTION_WEAK"
  | "INSUFFICIENT_EXECUTION_EVIDENCE" | "INSUFFICIENT_OUTCOME_EVIDENCE" | "NEEDS_REASSESSMENT"
  | "MONITOR_ONLY_VERIFIED_IMPROVEMENT" | "UNKNOWN";

export type OutcomeDirection = "IMPROVED" | "WORSENED" | "UNCHANGED" | "INSUFFICIENT_DATA";

/** The safe execution route an attribution implies (mirrors the bridge ExecutionRoute vocabulary). */
export type AttributionRoute =
  | "MONITOR_ONLY" | "CREATE_REASSESSMENT_TASK" | "CREATE_EVIDENCE_REQUEST" | "CREATE_MISSING_DATA_TASK"
  | "CREATE_TRAINING_TASK" | "CREATE_SOP_CHECKLIST_TASK" | "CREATE_OWNER_APPROVAL_TASK";

export interface AttributionInput {
  executionState: CorrectionExecutionState;
  outcomeDirection: OutcomeDirection;
  /** True only when a real post-execution measurement exists (baseline + elapsed window + enough data). */
  hasPostExecutionOutcome: boolean;
}

export interface AttributionResult {
  attribution: EffectivenessAttributionState;
  /** Precise, non-overstated owner-facing sentence. Never claims causality the evidence does not support. */
  ownerVisibleSummary: string;
  route: AttributionRoute;
  /** True only for a verified improvement that needs no further action — safe to monitor, not completable. */
  monitorOnly: boolean;
}

/** The safe execution route each attribution implies — single source of truth for the effectiveness bridge. */
export const ROUTE_FOR_ATTRIBUTION: Record<EffectivenessAttributionState, AttributionRoute> = {
  MONITOR_ONLY_VERIFIED_IMPROVEMENT: "MONITOR_ONLY",
  VERIFIED_IMPROVED_AFTER_EXECUTION: "MONITOR_ONLY",
  EXECUTED_BUT_OUTCOME_NOT_PROVEN: "CREATE_REASSESSMENT_TASK",
  NEEDS_REASSESSMENT: "CREATE_REASSESSMENT_TASK",
  VERIFIED_UNCHANGED_AFTER_EXECUTION: "CREATE_REASSESSMENT_TASK",
  VERIFIED_WORSENED_AFTER_EXECUTION: "CREATE_OWNER_APPROVAL_TASK",
  IMPROVED_BUT_EXECUTION_NOT_PROVEN: "CREATE_EVIDENCE_REQUEST",
  OUTCOME_CHANGED_BUT_ATTRIBUTION_WEAK: "CREATE_EVIDENCE_REQUEST",
  INSUFFICIENT_EXECUTION_EVIDENCE: "CREATE_EVIDENCE_REQUEST",
  INSUFFICIENT_OUTCOME_EVIDENCE: "CREATE_MISSING_DATA_TASK",
  UNKNOWN: "CREATE_MISSING_DATA_TASK",
};

/** True only for a verified improvement that is safe to monitor and must NOT be completable (no false "worked"). */
export function isMonitorOnlyVerified(state: EffectivenessAttributionState): boolean {
  return state === "MONITOR_ONLY_VERIFIED_IMPROVEMENT" || state === "VERIFIED_IMPROVED_AFTER_EXECUTION";
}

const EXECUTED_STRONG = "EXECUTED_WITH_EVIDENCE";
const EXECUTED_WEAK = "EXECUTED_WITH_WEAK_EVIDENCE";

/**
 * Classify effectiveness attribution from execution + outcome facts. The gate order enforces the honesty rule:
 * a VERIFIED_* state is only reachable when execution is evidenced AND a post-execution outcome exists.
 */
export function classifyEffectivenessAttribution(input: AttributionInput): AttributionResult {
  const { executionState, outcomeDirection, hasPostExecutionOutcome } = input;

  // Executed with strong evidence — attribution is possible, gated on a real post-execution measurement.
  if (executionState === EXECUTED_STRONG) {
    if (!hasPostExecutionOutcome || outcomeDirection === "INSUFFICIENT_DATA") {
      return {
        attribution: "EXECUTED_BUT_OUTCOME_NOT_PROVEN",
        ownerVisibleSummary: "Correction executed with evidence, but the outcome has not been reassessed yet — effectiveness is not proven.",
        route: "CREATE_REASSESSMENT_TASK", monitorOnly: false,
      };
    }
    if (outcomeDirection === "IMPROVED") {
      return {
        attribution: "MONITOR_ONLY_VERIFIED_IMPROVEMENT",
        ownerVisibleSummary: "Correction executed with evidence; reassessment shows improvement after execution. Verified — no further action required unless the issue repeats.",
        route: "MONITOR_ONLY", monitorOnly: true,
      };
    }
    if (outcomeDirection === "WORSENED") {
      return {
        attribution: "VERIFIED_WORSENED_AFTER_EXECUTION",
        ownerVisibleSummary: "Outcome worsened after execution — the correction did not work; a follow-up correction is required.",
        route: "CREATE_OWNER_APPROVAL_TASK", monitorOnly: false,
      };
    }
    return {
      attribution: "VERIFIED_UNCHANGED_AFTER_EXECUTION",
      ownerVisibleSummary: "Correction executed with evidence, but the outcome is unchanged — a follow-up review is required.",
      route: "CREATE_REASSESSMENT_TASK", monitorOnly: false,
    };
  }

  // Executed but the completion evidence is weak — never a VERIFIED state; ask for firmer proof.
  if (executionState === EXECUTED_WEAK) {
    if (hasPostExecutionOutcome && (outcomeDirection === "IMPROVED" || outcomeDirection === "WORSENED" || outcomeDirection === "UNCHANGED")) {
      return {
        attribution: "OUTCOME_CHANGED_BUT_ATTRIBUTION_WEAK",
        ownerVisibleSummary: "The outcome changed, but the execution evidence is too weak to attribute the change to this correction — firmer completion proof is needed.",
        route: "CREATE_EVIDENCE_REQUEST", monitorOnly: false,
      };
    }
    return {
      attribution: "INSUFFICIENT_EXECUTION_EVIDENCE",
      ownerVisibleSummary: "The correction's completion evidence is weak — submit firmer proof before its effectiveness can be judged.",
      route: "CREATE_EVIDENCE_REQUEST", monitorOnly: false,
    };
  }

  // Not executed (proposed / assigned / in-progress / not-executed / blocked / cancelled / unknown).
  if (hasPostExecutionOutcome && outcomeDirection === "IMPROVED") {
    return {
      attribution: "IMPROVED_BUT_EXECUTION_NOT_PROVEN",
      ownerVisibleSummary: "The issue improved, but OpsIQ cannot attribute the improvement to this correction because execution evidence is missing.",
      route: "CREATE_EVIDENCE_REQUEST", monitorOnly: false,
    };
  }
  if (outcomeDirection === "INSUFFICIENT_DATA" || !hasPostExecutionOutcome) {
    return {
      attribution: "INSUFFICIENT_EXECUTION_EVIDENCE",
      ownerVisibleSummary: "The correction has no execution evidence yet — it cannot be reported as working. Record that it was carried out, with proof.",
      route: "CREATE_EVIDENCE_REQUEST", monitorOnly: false,
    };
  }
  // Outcome measured (WORSENED/UNCHANGED) but execution not proven — the effectiveness question is moot until executed.
  return {
    attribution: "INSUFFICIENT_EXECUTION_EVIDENCE",
    ownerVisibleSummary: "The targeted issue has not improved and the correction has no execution evidence — carry out the correction with proof before judging effectiveness.",
    route: "CREATE_EVIDENCE_REQUEST", monitorOnly: false,
  };
}

// ── Deriving the execution state from a persisted execution task ─────────────────────────────────────────

/** Persisted-task facts needed to judge whether a correction was executed. */
export interface TaskExecutionFacts {
  status: string;            // ProcessExecutionTask.status
  evidenceCount: number;     // evidenceRefs.length
  hasOutcomeNote?: boolean;  // a recorded outcome note strengthens weak evidence
}

/**
 * Map a persisted execution task to a CorrectionExecutionState. COMPLETED with evidence is the only
 * EXECUTED_WITH_EVIDENCE; completed-without-evidence is weak; open statuses map to their lifecycle stage.
 */
export function correctionExecutionStateFromTask(task: TaskExecutionFacts | null | undefined): CorrectionExecutionState {
  if (!task) return "UNKNOWN";
  switch (task.status) {
    case "COMPLETED":
      return task.evidenceCount > 0 ? "EXECUTED_WITH_EVIDENCE" : task.hasOutcomeNote ? "EXECUTED_WITH_WEAK_EVIDENCE" : "EXECUTED_WITH_WEAK_EVIDENCE";
    case "APPROVED": return "ASSIGNED";
    case "IN_PROGRESS": return "IN_PROGRESS";
    case "BLOCKED": return "BLOCKED";
    case "REJECTED": return "CANCELLED";
    case "NEEDS_DATA": return "NOT_EXECUTED";
    case "PROPOSED": return "PROPOSED";
    default: return "UNKNOWN";
  }
}

// ── SOP adherence ───────────────────────────────────────────────────────────────────────────────────────

export interface SopAdherenceFacts {
  /** The persisted SOP task's execution state (drafted → adopted → …). */
  executionState: CorrectionExecutionState;
  /** A post-adoption adherence re-check outcome, if one has been measured. */
  adherenceOutcome: OutcomeDirection;
  hasPostAdoptionCheck: boolean;
}

/** SOP adopted (change made) is NOT SOP followed. Verified adherence needs a post-adoption re-check with evidence. */
export function classifySopAdherence(f: SopAdherenceFacts): { state: SopAdherenceState; ownerVisibleSummary: string; route: AttributionRoute } {
  switch (f.executionState) {
    case "UNKNOWN": return { state: "UNKNOWN", ownerVisibleSummary: "SOP status unknown.", route: "CREATE_MISSING_DATA_TASK" };
    case "PROPOSED": return { state: "SOP_PROPOSED", ownerVisibleSummary: "SOP change proposed; not yet drafted or approved.", route: "CREATE_SOP_CHECKLIST_TASK" };
    case "IN_PROGRESS": return { state: "SOP_DRAFTED", ownerVisibleSummary: "SOP change drafted; adoption and adherence not yet verified.", route: "CREATE_SOP_CHECKLIST_TASK" };
    case "ASSIGNED": return { state: "SOP_APPROVED", ownerVisibleSummary: "SOP change approved; adoption evidence and adherence not yet verified.", route: "CREATE_SOP_CHECKLIST_TASK" };
    case "NOT_EXECUTED": case "BLOCKED": case "CANCELLED":
      return { state: "SOP_NOT_FOLLOWED", ownerVisibleSummary: "SOP change was not adopted; a manager re-check is required.", route: "CREATE_REASSESSMENT_TASK" };
    case "EXECUTED_WITH_WEAK_EVIDENCE":
      return { state: "SOP_WEAK_EVIDENCE", ownerVisibleSummary: "SOP was drafted, but adoption evidence is weak and adherence has not been verified.", route: "CREATE_EVIDENCE_REQUEST" };
    case "EXECUTED_WITH_EVIDENCE":
      if (!f.hasPostAdoptionCheck || f.adherenceOutcome === "INSUFFICIENT_DATA")
        return { state: "NEEDS_RECHECK", ownerVisibleSummary: "SOP was adopted with evidence, but adherence has not been re-checked — it is not yet verified as followed.", route: "CREATE_REASSESSMENT_TASK" };
      if (f.adherenceOutcome === "IMPROVED")
        return { state: "SOP_ADHERENCE_VERIFIED", ownerVisibleSummary: "SOP adopted with evidence and a re-check confirms it is being followed.", route: "MONITOR_ONLY" };
      return { state: "SOP_NOT_FOLLOWED", ownerVisibleSummary: "SOP was adopted, but the adherence re-check shows it is not being followed — a manager re-check is required.", route: "CREATE_REASSESSMENT_TASK" };
    default: return { state: "INSUFFICIENT_EVIDENCE", ownerVisibleSummary: "Not enough evidence to judge SOP adherence.", route: "CREATE_MISSING_DATA_TASK" };
  }
}

// ── Training effectiveness ──────────────────────────────────────────────────────────────────────────────

export interface TrainingFacts {
  executionState: CorrectionExecutionState;
  postTrainingOutcome: OutcomeDirection;
  hasPostTrainingCheck: boolean;
}

/** Training assigned ≠ completed ≠ effective. A post-training outcome is required before effectiveness is judged. */
export function classifyTrainingEffectiveness(f: TrainingFacts): { state: TrainingEffectivenessState; ownerVisibleSummary: string; route: AttributionRoute } {
  switch (f.executionState) {
    case "UNKNOWN": return { state: "UNKNOWN", ownerVisibleSummary: "Training status unknown.", route: "CREATE_MISSING_DATA_TASK" };
    case "PROPOSED": return { state: "TRAINING_NOT_ASSIGNED", ownerVisibleSummary: "Training proposed but not yet assigned.", route: "CREATE_TRAINING_TASK" };
    case "ASSIGNED": case "IN_PROGRESS": return { state: "TRAINING_ASSIGNED", ownerVisibleSummary: "Training assigned; completion evidence not yet submitted.", route: "CREATE_TRAINING_TASK" };
    case "NOT_EXECUTED": case "BLOCKED": case "CANCELLED":
      return { state: "TRAINING_NOT_COMPLETED", ownerVisibleSummary: "Training was not completed; a follow-up is required.", route: "CREATE_TRAINING_TASK" };
    case "EXECUTED_WITH_WEAK_EVIDENCE":
      return { state: "TRAINING_COMPLETED_WEAK_EVIDENCE", ownerVisibleSummary: "Training was marked complete, but the completion evidence is weak — firmer proof is needed before judging effect.", route: "CREATE_EVIDENCE_REQUEST" };
    case "EXECUTED_WITH_EVIDENCE":
      if (!f.hasPostTrainingCheck || f.postTrainingOutcome === "INSUFFICIENT_DATA")
        return { state: "NEEDS_RECHECK", ownerVisibleSummary: "Training was completed with evidence, but post-training performance has not been reassessed.", route: "CREATE_REASSESSMENT_TASK" };
      if (f.postTrainingOutcome === "IMPROVED")
        return { state: "POST_TRAINING_IMPROVED", ownerVisibleSummary: "Training completed with evidence; performance improved afterwards. Monitor unless the issue repeats.", route: "MONITOR_ONLY" };
      if (f.postTrainingOutcome === "WORSENED")
        return { state: "POST_TRAINING_WORSENED", ownerVisibleSummary: "Training completed, but performance worsened afterwards — a follow-up review is required.", route: "CREATE_TRAINING_TASK" };
      return { state: "POST_TRAINING_UNCHANGED", ownerVisibleSummary: "Training completed, but performance is unchanged — a follow-up review is required.", route: "CREATE_TRAINING_TASK" };
    default: return { state: "INSUFFICIENT_EVIDENCE", ownerVisibleSummary: "Not enough evidence to judge training effectiveness.", route: "CREATE_MISSING_DATA_TASK" };
  }
}
