/**
 * Jarvis 360 Slice 8 — process review rules (pure).
 *
 * Audit finding: no regular process review loop. These rules decide when a process
 * must be reviewed — on schedule OR on a failure signal (repeated failure, complaint
 * spike, quality decline, missed checklist, training failure, equipment issue, or a
 * changed business goal) — and classify whether a resulting update is material
 * (needs owner approval) or a non-material improvement. No DB/I-O.
 */

export const REVIEW_TRIGGERS = [
  "scheduled_due",
  "repeated_failure",
  "complaint_spike",
  "quality_decline",
  "missed_checklist",
  "training_failure",
  "equipment_issue",
  "goal_changed",
] as const;
export type ReviewTrigger = (typeof REVIEW_TRIGGERS)[number];

export interface ProcessReviewSignals {
  repeatedFailure?: boolean;
  complaintSpike?: boolean;
  qualityDecline?: boolean;
  missedChecklist?: boolean;
  trainingFailure?: boolean;
  equipmentIssue?: boolean;
  goalChanged?: boolean;
}

export interface ProcessReviewState {
  nextReviewAt: Date | null;
}

export interface ReviewDecision {
  due: boolean;
  triggers: ReviewTrigger[];
}

/** Decide whether a process needs review now, and why. */
export function evaluateProcessReview(state: ProcessReviewState, signals: ProcessReviewSignals, now: Date): ReviewDecision {
  const triggers: ReviewTrigger[] = [];
  if (state.nextReviewAt && state.nextReviewAt.getTime() <= now.getTime()) triggers.push("scheduled_due");
  if (signals.repeatedFailure) triggers.push("repeated_failure");
  if (signals.complaintSpike) triggers.push("complaint_spike");
  if (signals.qualityDecline) triggers.push("quality_decline");
  if (signals.missedChecklist) triggers.push("missed_checklist");
  if (signals.trainingFailure) triggers.push("training_failure");
  if (signals.equipmentIssue) triggers.push("equipment_issue");
  if (signals.goalChanged) triggers.push("goal_changed");
  return { due: triggers.length > 0, triggers };
}

/** Compute the next review timestamp from a cadence (days). */
export function nextReviewDate(from: Date, frequencyDays: number): Date {
  return new Date(from.getTime() + frequencyDays * 24 * 60 * 60 * 1000);
}

export type ProcessUpdateKind = "sop_change" | "cost_change" | "risk_change" | "customer_promise_change" | "minor";

/** A material update changes the SOP, cost, risk, or customer promise → owner approval. */
export function processUpdateRequiresOwnerApproval(kind: ProcessUpdateKind): boolean {
  return kind !== "minor";
}
