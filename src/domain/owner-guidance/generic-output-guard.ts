/**
 * Module 41 §10 — NON-GENERIC GUIDANCE ENFORCEMENT (pure).
 *
 * OpsIQ must never emit lazy/generic business advice ("improve marketing",
 * "reduce costs", "train staff", "make SOPs", "track KPIs", ...) unless the
 * guidance is backed by concrete, business-specific steps: a named role, an
 * exact step, a proof requirement (or a justified waiver), an expected outcome,
 * and an explicit risk/avoid/rollback. A generic phrase is acceptable ONLY when
 * the guidance object around it is fully specific.
 *
 * Pure + deterministic. No Date.now()/Math.random(). No IO.
 */

import type { GuidanceObject } from "@/domain/owner-guidance/guidance-object";

/**
 * The 11 forbidden generic phrases (lowercased). Any of these appearing in
 * `exactStep` or `reasonNow` triggers the specificity gate.
 */
export const FORBIDDEN_GENERIC_PHRASES: readonly string[] = [
  "improve marketing",
  "reduce costs",
  "train staff",
  "make sops",
  "track kpis",
  "improve quality",
  "increase sales",
  "follow up customers",
  "manage cash flow",
  "optimize operations",
  "improve retention",
];

export interface GuidanceSpecificity {
  hasContext: boolean;
  hasReasonNow: boolean;
  hasRole: boolean;
  hasStep: boolean;
  hasProof: boolean;
  hasExpectedOutcome: boolean;
  hasRiskOrAvoid: boolean;
  hasConfidence: boolean;
}

export interface GenericRejection {
  rejected: boolean;
  reasons: string[];
  forbiddenPhrases: string[];
}

function blank(s: string | undefined | null): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

/** Escape a literal string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns which forbidden generic phrases appear in `text` (case-insensitive,
 * word-boundary-ish so "improve marketing" matches inside a larger sentence).
 * Empty when none match. Order follows FORBIDDEN_GENERIC_PHRASES.
 */
export function containsForbiddenGeneric(text: string): string[] {
  if (blank(text)) return [];
  const hits: string[] = [];
  for (const phrase of FORBIDDEN_GENERIC_PHRASES) {
    const pattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i");
    if (pattern.test(text)) hits.push(phrase);
  }
  return hits;
}

/**
 * Derive the eight specificity flags from a GuidanceObject. A flag is true only
 * when the corresponding concrete field is populated.
 */
export function assessSpecificity(g: GuidanceObject): GuidanceSpecificity {
  const hasArchetype = !blank(g.archetype);
  const reasonNowConcrete = !blank(g.reasonNow) && g.reasonNow.trim().length > 15;

  return {
    hasContext: hasArchetype || reasonNowConcrete,
    hasReasonNow: !blank(g.reasonNow),
    hasRole: !blank(g.assignedRole),
    hasStep: !blank(g.exactStep),
    hasProof: g.proofRequired ? g.proofType !== undefined : !blank(g.noProofReason),
    hasExpectedOutcome: !blank(g.expectedOutcome),
    hasRiskOrAvoid:
      (Array.isArray(g.actionsToAvoid) && g.actionsToAvoid.length > 0) ||
      !blank(g.rollbackTrigger),
    // `confidence` is a required enum field on GuidanceObject → always present.
    hasConfidence: true,
  };
}

/** True only when all eight specificity flags are satisfied. */
export function isSpecificEnough(g: GuidanceObject): boolean {
  const s = assessSpecificity(g);
  return (
    s.hasContext &&
    s.hasReasonNow &&
    s.hasRole &&
    s.hasStep &&
    s.hasProof &&
    s.hasExpectedOutcome &&
    s.hasRiskOrAvoid &&
    s.hasConfidence
  );
}

/** Map each unmet specificity flag to a stable rejection reason. */
function missingSpecificityReasons(s: GuidanceSpecificity): string[] {
  const reasons: string[] = [];
  if (!s.hasContext) reasons.push("missing_specific_context");
  if (!s.hasReasonNow) reasons.push("missing_specific_reason_now");
  if (!s.hasRole) reasons.push("missing_specific_role");
  if (!s.hasStep) reasons.push("missing_specific_step");
  if (!s.hasProof) reasons.push("missing_specific_proof");
  if (!s.hasExpectedOutcome) reasons.push("missing_specific_expected_outcome");
  if (!s.hasRiskOrAvoid) reasons.push("missing_specific_risk_or_avoid");
  if (!s.hasConfidence) reasons.push("missing_specific_confidence");
  return reasons;
}

/**
 * Evaluate a guidance object for generic-output rejection.
 *
 * REJECT when:
 *  (a) `exactStep` or `reasonNow` contains a forbidden generic phrase AND the
 *      guidance is NOT specific enough → "generic_phrase_without_concrete_steps".
 *  (b) the guidance is NOT specific enough → one reason per missing flag.
 *
 * A guidance that contains a forbidden phrase but is fully specific is ACCEPTED:
 * the phrase is fine when followed by concrete steps.
 */
export function evaluateGuidanceForGeneric(g: GuidanceObject): GenericRejection {
  const phraseSources = `${g.exactStep ?? ""}\n${g.reasonNow ?? ""}`;
  const forbiddenPhrases = containsForbiddenGeneric(phraseSources);
  const specific = isSpecificEnough(g);

  const reasons: string[] = [];

  if (forbiddenPhrases.length > 0 && !specific) {
    reasons.push("generic_phrase_without_concrete_steps");
  }

  if (!specific) {
    reasons.push(...missingSpecificityReasons(assessSpecificity(g)));
  }

  return {
    rejected: reasons.length > 0,
    reasons,
    forbiddenPhrases,
  };
}

/** Thrown when guidance is rejected as generic / not concrete enough. */
export class GenericGuidanceError extends Error {
  readonly code = "GENERIC_GUIDANCE";
  readonly reasons: string[];
  constructor(ref: string, reasons: string[]) {
    super(`Guidance ${ref} rejected as generic: ${reasons.join(", ")}.`);
    this.name = "GenericGuidanceError";
    this.reasons = reasons;
  }
}

/** Guard: throws GenericGuidanceError when the guidance is rejected as generic. */
export function assertNonGeneric(g: GuidanceObject): void {
  const result = evaluateGuidanceForGeneric(g);
  if (result.rejected) {
    throw new GenericGuidanceError(g.guidanceId || "guidance", result.reasons);
  }
}
