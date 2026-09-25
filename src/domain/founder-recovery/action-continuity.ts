/**
 * Action continuity across diagnosis cycles (all owner domains + recovery).
 *
 * Each diagnosis run creates a new cycle. Without continuity, a re-run
 * re-proposed every recommendation as a brand-new "proposed" action while the
 * owner's still-open action for the same finding stayed attached to an older
 * cycle that the UI no longer showed — in-flight work vanished from view and was
 * duplicated. The rule here: a planned action whose finding/recommendation
 * already has an OPEN action (not completed/cancelled) for the same business is
 * carried forward (kept as-is, not duplicated). Terminal actions never block a
 * fresh proposal, so a recurring problem is re-proposed after completion.
 */
import type { RecoveryActionStatus } from "./action-status";

/** Non-terminal statuses: work that is still open for the owner. */
export const OPEN_ACTION_STATUSES: readonly RecoveryActionStatus[] = ["proposed", "assigned", "in_progress", "blocked"];

export interface ContinuityKeyed {
  findingCode: string;
  recommendationCode?: string | null;
}

export function continuityKey(a: ContinuityKeyed): string {
  return `${a.findingCode}::${a.recommendationCode ?? ""}`;
}

/** Planned actions minus those already open for the same finding/recommendation. */
export function withoutOpenDuplicates<T extends ContinuityKeyed>(
  planned: readonly T[],
  openPrior: readonly ContinuityKeyed[]
): { toCreate: T[]; carriedForward: number } {
  const open = new Set(openPrior.map(continuityKey));
  const toCreate = planned.filter((a) => !open.has(continuityKey(a)));
  return { toCreate, carriedForward: planned.length - toCreate.length };
}
