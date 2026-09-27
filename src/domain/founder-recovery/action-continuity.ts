/**
 * Action continuity across diagnosis cycles (all owner domains + recovery).
 *
 * Each diagnosis run creates a new cycle and re-plans every recommendation as a
 * fresh "proposed" action (the asserted per-cycle contract). Without continuity,
 * an action the owner had already taken on (assigned / in progress / blocked)
 * stayed attached to an older cycle the UI no longer showed and was duplicated
 * by a new "proposed" copy — in-flight work vanished from view.
 *
 * Rule:
 * - An ENGAGED prior action whose finding/recommendation is planned again is
 *   carried forward instead of duplicated: the caller re-attaches it to the new
 *   cycle (cycle, finding and ranking re-evaluated, audited), so every reader of
 *   "the latest cycle's actions" sees it without special-casing.
 * - Never-touched "proposed" actions are NOT carried: the new cycle's fresh
 *   proposals supersede them (they carry the re-evaluated ranking).
 * - Terminal actions (completed/cancelled) never block a fresh proposal.
 * - An engaged action that is not planned again stays on its older cycle; domain
 *   dashboards still list it (flagged when the latest diagnosis no longer raises
 *   its finding) for the owner to finish or cancel.
 */
import type { RecoveryActionStatus } from "./action-status";

/** Statuses in which the owner has taken on the action (carried across cycles). */
export const ENGAGED_ACTION_STATUSES: readonly RecoveryActionStatus[] = ["assigned", "in_progress", "blocked"];

export interface ContinuityKeyed {
  findingCode: string;
  recommendationCode?: string | null;
}

export function continuityKey(a: ContinuityKeyed): string {
  return `${a.findingCode}::${a.recommendationCode ?? ""}`;
}

/**
 * The evidence period behind each side of a continuity decision (back-fill protection). `current` is the
 * period the NEW cycle's snapshot describes; `of(prior)` the period of the cycle the engaged action is
 * attached to now. Null ⇒ unknown (treated as not newer).
 */
export interface ContinuityPeriods<P> {
  current: Date | null;
  of: (prior: P) => Date | null;
}

/**
 * Split planned actions into those to create and those already covered by
 * engaged prior actions. Every engaged prior action with a matching key is
 * returned (with the planned action it continues) so all of them are re-attached.
 *
 * Back-fill: a diagnosis of an OLDER period (entered after a newer one) is historical diagnosis, not the
 * current issue. An engaged action attached to a cycle of a NEWER period than the new cycle is "held" —
 * it is neither re-attached to the historical cycle nor duplicated there (its continuity stays with the
 * current cycle it is on). Without `periods` every match is carried (the pre-existing behaviour).
 */
export function planWithContinuity<T extends ContinuityKeyed, P extends ContinuityKeyed & { id: string }>(
  planned: readonly T[],
  engagedPrior: readonly P[],
  periods?: ContinuityPeriods<P>
): { toCreate: T[]; carried: Array<{ prior: P; planned: T }>; held: Array<{ prior: P; planned: T }> } {
  const byKey = new Map<string, P[]>();
  for (const p of engagedPrior) {
    const key = continuityKey(p);
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  const newerThanCurrent = (p: P): boolean => {
    if (!periods?.current) return false;
    const at = periods.of(p);
    return at !== null && at.getTime() > periods.current.getTime();
  };
  const toCreate: T[] = [];
  const carried: Array<{ prior: P; planned: T }> = [];
  const held: Array<{ prior: P; planned: T }> = [];
  for (const a of planned) {
    const priors = byKey.get(continuityKey(a));
    if (priors) for (const prior of priors) (newerThanCurrent(prior) ? held : carried).push({ prior, planned: a });
    else toCreate.push(a);
  }
  return { toCreate, carried, held };
}

/** A Prisma-style `periodEnd` value (Date or ISO string) as a Date, or null. */
export function periodEndOf(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
