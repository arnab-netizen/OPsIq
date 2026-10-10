/**
 * FIRST_TRUSTED_DECISION_INTERACTION — the activation definition.
 *
 * NOT activation: signed up, verified, completed OBQ, viewed the Cockpit — none of those show the owner
 * engaged with a recommendation they could trust. Activation is:
 *
 *   a first Money read exists  AND  the owner did at least one of
 *     1. ACTION_ACCEPTED         — accepted the recommendation (OwnerDecisionRecord state ACCEPTED)
 *     2. EVIDENCE_CORRECTED      — corrected the underlying evidence (financial snapshot amendment)
 *     3. IMPROVEMENT_REQUESTED   — asked to improve it by supplying new evidence
 *
 * Hostile audit: viewing, dismissing, rejecting and deferring are deliberately excluded (a reject or
 * defer is a decision, but not evidence that the owner trusted the read enough to act on or sharpen it);
 * a rough-estimate read still counts because acting on or correcting it is the engagement we measure.
 * Pure.
 */

export const TRUSTED_INTERACTION_KINDS = ["ACTION_ACCEPTED", "EVIDENCE_CORRECTED", "IMPROVEMENT_REQUESTED"] as const;
export type TrustedInteractionKind = (typeof TRUSTED_INTERACTION_KINDS)[number];

export interface TrustedInteractionFact {
  kind: string;
  /** ISO timestamp. */
  at: string;
}

export function isTrustedInteractionKind(kind: string): kind is TrustedInteractionKind {
  return (TRUSTED_INTERACTION_KINDS as readonly string[]).includes(kind);
}

export function firstTrustedInteraction(
  firstResultExists: boolean,
  interactions: readonly TrustedInteractionFact[],
): TrustedInteractionFact | null {
  if (!firstResultExists) return null;
  const qualifying = interactions
    .filter((i) => isTrustedInteractionKind(i.kind) && Number.isFinite(Date.parse(i.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return qualifying[0] ?? null;
}

export function isFirstTrustedDecisionInteraction(
  firstResultExists: boolean,
  interactions: readonly TrustedInteractionFact[],
): boolean {
  return firstTrustedInteraction(firstResultExists, interactions) !== null;
}

/** TIME_TO_FIRST_VALUE in whole seconds, from account verification to the first trusted interaction. */
export function timeToFirstValueSeconds(verifiedAtIso: string, interactionAtIso: string): number | null {
  const start = Date.parse(verifiedAtIso);
  const end = Date.parse(interactionAtIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}
