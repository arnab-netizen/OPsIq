/**
 * Validation Outcome (depth pass) — the governed, pure recording of what actually happened when an
 * opportunity's validation experiment ran, so the live Opportunity Portfolio can move past NOT_STARTED and
 * make real kill / park / scale-candidate decisions on evidence instead of hunches.
 *
 * Hard governance:
 * - PASSED requires real evidence (leads / responses / conversions / a success-metric result / proof refs);
 *   a PASSED claim with no evidence is downgraded to INCONCLUSIVE (no fake wins).
 * - A stop-loss trigger can NEVER be a PASS — it forces FAILED.
 * - Scaling stays gated: SCALE_CANDIDATE is reachable only from PASSED WITH cost + margin evidence, and it
 *   still requires owner approval. Missing cost/margin on a PASS → NEEDS_DATA (cannot scale yet).
 * - INCONCLUSIVE / NOT_EVALUATED can never scale.
 * - No fabricated revenue / conversions / profit; numbers are the recorder's own results, carried verbatim.
 */

import type { ValidationStatus } from "./opportunity-validation-experiment-engine";
import type { ApprovalLevel } from "./process-intelligence";

export type OutcomeStatus = "NOT_STARTED" | "RUNNING" | "COMPLETED" | "CANCELLED" | "NEEDS_DATA";
export type OutcomeResult = "PASSED" | "FAILED" | "INCONCLUSIVE" | "NOT_EVALUATED";
export type NextDecision = "KILL" | "PARK" | "MODIFY" | "RETEST" | "SCALE_CANDIDATE" | "NEEDS_DATA";

export const OUTCOME_STATUSES: readonly OutcomeStatus[] = ["NOT_STARTED", "RUNNING", "COMPLETED", "CANCELLED", "NEEDS_DATA"];
export const OUTCOME_RESULTS: readonly OutcomeResult[] = ["PASSED", "FAILED", "INCONCLUSIVE", "NOT_EVALUATED"];

const FORBIDDEN_LANGUAGE = /\b(fraud|fraudulent|theft|thief|embezzl|negligence|negligent|fire them|firing|payroll cut|docking pay|disciplin)\b/i;

/** The recorder's submission (owner/manager records what happened). */
export interface ValidationOutcomeSubmission {
  experimentKey: string;
  opportunityKey: string; // `${signalSourceType}:${opportunityType}` — links to the portfolio candidate
  status: OutcomeStatus;
  result: OutcomeResult;
  startedAt?: string | null;
  completedAt?: string | null;
  actualCost?: number | null;
  actualOwnerTimeMinutes?: number | null;
  leadsGenerated?: number | null;
  responses?: number | null;
  conversions?: number | null;
  revenueEvidence?: string | null;
  marginEvidence?: string | null;
  customerFeedback?: string | null;
  operationalIssues?: string | null;
  cashImpactNotes?: string | null;
  proofEvidenceRefs?: string[];
  successMetricResult?: string | null;
  failureMetricResult?: string | null;
  stopLossTriggered?: boolean;
  idempotencyKey?: string | null;
}

export interface NormalizedOutcomeRow {
  idempotencyKey: string;
  experimentKey: string;
  opportunityKey: string;
  status: OutcomeStatus;
  result: OutcomeResult; // possibly downgraded from the submission (no fake wins)
  startedAt: Date | null;
  completedAt: Date | null;
  actualCost: number | null;
  actualOwnerTimeMinutes: number | null;
  leadsGenerated: number | null;
  responses: number | null;
  conversions: number | null;
  revenueEvidence: string | null;
  marginEvidence: string | null;
  customerFeedback: string | null;
  operationalIssues: string | null;
  cashImpactNotes: string | null;
  proofEvidenceRefs: string[];
  successMetricResult: string | null;
  failureMetricResult: string | null;
  stopLossTriggered: boolean;
  ownerVisibleSummary: string;
  nextRecommendedDecision: NextDecision;
  approvalLevel: ApprovalLevel;
}

export type OutcomePlan =
  | { ok: true; row: NormalizedOutcomeRow }
  | { ok: false; reason: string };

function s(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}
function n(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** True when the outcome carries at least one genuine piece of positive evidence. */
function hasPositiveEvidence(sub: ValidationOutcomeSubmission): boolean {
  return (n(sub.leadsGenerated) ?? 0) > 0 || (n(sub.responses) ?? 0) > 0 || (n(sub.conversions) ?? 0) > 0
    || s(sub.revenueEvidence) != null || s(sub.successMetricResult) != null || (sub.proofEvidenceRefs ?? []).some((r) => s(r) != null);
}

/**
 * Validate + normalise a recorded outcome. Pure. Enforces the no-fake-win / stop-loss / scale-gate rules and
 * derives the next recommended decision + approval level. Fails closed on missing keys / bad enums / forbidden
 * language / bad dates.
 */
export function planValidationOutcome(sub: ValidationOutcomeSubmission): OutcomePlan {
  if (!sub || typeof sub !== "object") return { ok: false, reason: "An outcome is required." };
  const experimentKey = s(sub.experimentKey);
  const opportunityKey = s(sub.opportunityKey);
  if (!experimentKey) return { ok: false, reason: "An experimentKey is required." };
  if (!opportunityKey) return { ok: false, reason: "An opportunityKey is required." };
  if (!OUTCOME_STATUSES.includes(sub.status)) return { ok: false, reason: "Unknown outcome status." };
  if (!OUTCOME_RESULTS.includes(sub.result)) return { ok: false, reason: "Unknown outcome result." };
  const freeText = [sub.revenueEvidence, sub.marginEvidence, sub.customerFeedback, sub.operationalIssues, sub.cashImpactNotes, sub.successMetricResult, sub.failureMetricResult].map((t) => t ?? "").join(" ");
  if (FORBIDDEN_LANGUAGE.test(freeText)) return { ok: false, reason: "The outcome must not contain fraud/negligence/HR-discipline language." };
  const startedAt = s(sub.startedAt) ? new Date(sub.startedAt as string) : null;
  if (startedAt && Number.isNaN(startedAt.getTime())) return { ok: false, reason: "startedAt is not a valid date." };
  const completedAt = s(sub.completedAt) ? new Date(sub.completedAt as string) : null;
  if (completedAt && Number.isNaN(completedAt.getTime())) return { ok: false, reason: "completedAt is not a valid date." };

  const stopLossTriggered = sub.stopLossTriggered === true;
  const actualCost = n(sub.actualCost);
  const marginEvidence = s(sub.marginEvidence);

  // No fake wins: a stop-loss trigger can never be a PASS; a PASS with no evidence becomes INCONCLUSIVE.
  let result: OutcomeResult = sub.result;
  if (stopLossTriggered && result === "PASSED") result = "FAILED";
  if (result === "PASSED" && !hasPositiveEvidence(sub)) result = "INCONCLUSIVE";

  // The next decision is derived, never fabricated. Scale is only reachable from a PASS with cost + margin.
  let nextRecommendedDecision: NextDecision;
  if (stopLossTriggered || result === "FAILED") {
    nextRecommendedDecision = "KILL";
  } else if (result === "PASSED") {
    nextRecommendedDecision = actualCost != null && marginEvidence != null ? "SCALE_CANDIDATE" : "NEEDS_DATA";
  } else if (result === "INCONCLUSIVE") {
    nextRecommendedDecision = "RETEST";
  } else {
    nextRecommendedDecision = "NEEDS_DATA";
  }

  const approvalLevel: ApprovalLevel = nextRecommendedDecision === "SCALE_CANDIDATE" || nextRecommendedDecision === "KILL" ? "OWNER" : "MANAGER";
  const ownerVisibleSummary = buildSummary(result, nextRecommendedDecision, stopLossTriggered);

  return {
    ok: true,
    row: {
      idempotencyKey: s(sub.idempotencyKey) ?? `${experimentKey}:${opportunityKey}`,
      experimentKey, opportunityKey, status: sub.status, result, startedAt, completedAt,
      actualCost, actualOwnerTimeMinutes: n(sub.actualOwnerTimeMinutes) != null ? Math.round(n(sub.actualOwnerTimeMinutes) as number) : null,
      leadsGenerated: n(sub.leadsGenerated), responses: n(sub.responses), conversions: n(sub.conversions),
      revenueEvidence: s(sub.revenueEvidence), marginEvidence, customerFeedback: s(sub.customerFeedback),
      operationalIssues: s(sub.operationalIssues), cashImpactNotes: s(sub.cashImpactNotes),
      proofEvidenceRefs: Array.from(new Set((sub.proofEvidenceRefs ?? []).map((r) => s(r)).filter((r): r is string => r !== null))).slice(0, 20),
      successMetricResult: s(sub.successMetricResult), failureMetricResult: s(sub.failureMetricResult),
      stopLossTriggered, ownerVisibleSummary, nextRecommendedDecision, approvalLevel,
    },
  };
}

function buildSummary(result: OutcomeResult, next: NextDecision, stopLoss: boolean): string {
  if (stopLoss) return "Stop-loss triggered during the test — stop this opportunity; do not spend more on it.";
  switch (result) {
    case "PASSED":
      return next === "SCALE_CANDIDATE"
        ? "Validation passed with cost + margin evidence — bring a scaling plan to the owner for approval."
        : "Validation passed, but cost/margin evidence is missing — capture it before any scaling decision.";
    case "FAILED":
      return "Validation failed — stop this opportunity; the assumption did not hold.";
    case "INCONCLUSIVE":
      return "Result was inconclusive — retest more cheaply or gather better evidence before deciding.";
    default:
      return "Not yet evaluated — record the experiment's real result before the portfolio can act.";
  }
}

/** Map a recorded result onto the portfolio's ValidationStatus (so the portfolio's scale gate consumes it). */
export function resultToValidationStatus(status: OutcomeStatus, result: OutcomeResult): ValidationStatus {
  if (status === "CANCELLED") return "ABORTED";
  if (status === "RUNNING") return "RUNNING";
  switch (result) {
    case "PASSED": return "PASSED";
    case "FAILED": return "FAILED";
    case "INCONCLUSIVE": return "INCONCLUSIVE";
    default: return "NOT_STARTED";
  }
}
