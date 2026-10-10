/**
 * Return path for "Improve this recommendation". The evidence a progressive question asks for lives on the
 * existing governed input surfaces (Money, Manual entry, Intake): they are reused, never duplicated. This module only
 * owns the marker that tells the shared return bar the owner came from the first read, and the place to go back to.
 * Pure.
 */
export const FIRST_RUN_RETURN_PARAM = "returnTo";
export const FIRST_RUN_RETURN_VALUE = "first-run";
/** Where the owner goes back to; the first-run surface re-runs the canonical diagnosis and shows what changed. */
export const FIRST_RUN_UPDATE_HREF = "/owner/first-run?update=1";

/** Mark an in-app href as "came from the first read" (query goes before any #fragment). */
export function withFirstRunReturn(href: string): string {
  const hashAt = href.indexOf("#");
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${FIRST_RUN_RETURN_PARAM}=${FIRST_RUN_RETURN_VALUE}${hash}`;
}

export function isFirstRunReturn(value: string | null | undefined): boolean {
  return value === FIRST_RUN_RETURN_VALUE;
}

/** What the owner saw before leaving, so the return can show what changed. Plain tokens and labels only: no amounts. */
export interface FirstRunBeforeSummary {
  recommendedAction: string | null;
  confidenceTier: string;
  evidenceQuality: string | null;
  missingEvidence: string[];
  questionLabel: string;
}
