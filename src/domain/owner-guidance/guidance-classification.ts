/**
 * Module 41 — Guidance classification (pure).
 *
 * The terminal classification of a guidance evaluation. Tells the owner surface
 * where this guidance is in ITS OWN workflow: ready to review, needs a decision, blocked on data/safety,
 * or rolled forward into an outcome/rollback/redesign state.
 *
 * It is NOT the owner's permission to commit money, capacity or a plan. That statement comes only from the canonical
 * advice policy (CurrentOwnerDecision.advicePolicy, owner-spine/owner-advice-policy.ts); a "ready" guidance classification
 * never overrides `advicePolicy.canMakeMaterialCommitment`.
 *
 * Pure + deterministic.
 */

export enum GuidanceClassification {
  GUIDANCE_READY = "GUIDANCE_READY",
  GUIDANCE_READY_WITH_LOW_CONFIDENCE = "GUIDANCE_READY_WITH_LOW_CONFIDENCE",
  GUIDANCE_BLOCKED_MISSING_DATA = "GUIDANCE_BLOCKED_MISSING_DATA",
  GUIDANCE_BLOCKED_UNSAFE = "GUIDANCE_BLOCKED_UNSAFE",
  GUIDANCE_REQUIRES_OWNER_DECISION = "GUIDANCE_REQUIRES_OWNER_DECISION",
  GUIDANCE_REQUIRES_PROFESSIONAL_REVIEW = "GUIDANCE_REQUIRES_PROFESSIONAL_REVIEW",
  GUIDANCE_REQUIRES_OUTCOME_CHECK = "GUIDANCE_REQUIRES_OUTCOME_CHECK",
  GUIDANCE_REQUIRES_ROLLBACK = "GUIDANCE_REQUIRES_ROLLBACK",
  GUIDANCE_REQUIRES_REDESIGN = "GUIDANCE_REQUIRES_REDESIGN",
}

/** Classifications where the owner must NOT proceed to execute as-is. */
const NON_ACTIONABLE: ReadonlySet<GuidanceClassification> = new Set([
  GuidanceClassification.GUIDANCE_BLOCKED_MISSING_DATA,
  GuidanceClassification.GUIDANCE_BLOCKED_UNSAFE,
  GuidanceClassification.GUIDANCE_REQUIRES_ROLLBACK,
  GuidanceClassification.GUIDANCE_REQUIRES_REDESIGN,
]);

/** Classifications that require an explicit human gate before execution. */
const REQUIRES_HUMAN_GATE: ReadonlySet<GuidanceClassification> = new Set([
  GuidanceClassification.GUIDANCE_REQUIRES_OWNER_DECISION,
  GuidanceClassification.GUIDANCE_REQUIRES_PROFESSIONAL_REVIEW,
]);

export function isBlocked(c: GuidanceClassification): boolean {
  return c === GuidanceClassification.GUIDANCE_BLOCKED_MISSING_DATA
    || c === GuidanceClassification.GUIDANCE_BLOCKED_UNSAFE;
}

export function isActionable(c: GuidanceClassification): boolean {
  return !NON_ACTIONABLE.has(c) && !REQUIRES_HUMAN_GATE.has(c);
}

export function requiresHumanGate(c: GuidanceClassification): boolean {
  return REQUIRES_HUMAN_GATE.has(c);
}

export function isReady(c: GuidanceClassification): boolean {
  return c === GuidanceClassification.GUIDANCE_READY
    || c === GuidanceClassification.GUIDANCE_READY_WITH_LOW_CONFIDENCE;
}
