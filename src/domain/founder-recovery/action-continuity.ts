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
  /**
   * Whether the NEW cycle's evidence is completed, effective evidence (completedEvidencePeriod): its period
   * has ended by now and (Finance) its snapshot has not been amended since. A cycle on in-progress, future
   * or amended figures is never the current cycle, so it never becomes the owner of in-flight work.
   */
  currentCompleted: boolean;
  of: (prior: P) => Date | null;
}

/**
 * Whether a snapshot is completed, effective evidence at `now` (see ContinuityPeriods.currentCompleted): its
 * period has ended and it has not been superseded by an amendment.
 */
export function completedEvidencePeriod(snapshot: { periodEnd?: unknown; supersededById?: unknown } | null | undefined, now: Date): boolean {
  const end = periodEndOf(snapshot?.periodEnd);
  return end !== null && end.getTime() <= now.getTime() && !snapshot?.supersededById;
}

/**
 * Split planned actions into those to create and those already covered by
 * engaged prior actions. Every engaged prior action with a matching key is
 * returned (with the planned action it continues) so all of them are re-attached.
 *
 * Back-fill: a diagnosis of an OLDER period (entered after a newer one) is historical diagnosis, not the
 * current issue. An engaged action attached to a cycle of a NEWER period than the new cycle is "held" —
 * it is neither re-attached to the historical cycle nor duplicated there (its continuity stays with the
 * current cycle it is on).
 *
 * Not completed evidence (an in-progress or future period, or amended figures — `currentCompleted` false):
 * the new cycle is never the owner of in-flight work. Every engaged match is "held" on its cycle, and the
 * new cycle receives its own fresh proposals (so it has a full plan once its period ends); when it becomes
 * current, the owner's engaged work continues from the older cycle by continuity key at read time (Owner
 * Home and the domain dashboards), until a diagnosis of completed evidence carries it forward.
 *
 * `periods` is null only for Strategy, whose cycles are scenarios, not evidence periods.
 */
export function planWithContinuity<T extends ContinuityKeyed, P extends ContinuityKeyed & { id: string }>(
  planned: readonly T[],
  engagedPrior: readonly P[],
  periods: ContinuityPeriods<P> | null
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
  const notCompleted = periods !== null && !periods.currentCompleted;
  for (const a of planned) {
    const priors = byKey.get(continuityKey(a));
    if (notCompleted) {
      for (const prior of priors ?? []) held.push({ prior, planned: a });
      toCreate.push(a);
    } else if (priors) for (const prior of priors) (newerThanCurrent(prior) ? held : carried).push({ prior, planned: a });
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

/** An action row as read-time continuity sees it. */
export interface ReadTimeContinuityAction {
  id: string;
  cycleId: string;
  status: string;
  completedAt?: Date | string | null;
  /**
   * P2-3: the action's recorded verifications (latest first), when loaded. A verification is stronger
   * terminal proof than the completion timestamp alone — an owner-confirmed outcome recorded after
   * completion is itself evidence the work is genuinely done as of that later moment.
   */
  verifications?: ReadonlyArray<{ createdAt?: unknown }>;
}

/** The current cycle as read-time continuity sees it. */
export interface ReadTimeContinuityCycle {
  id: string;
  /** When the cycle was diagnosed. */
  createdAt: Date | string | null;
  /** The start of the evidence period it describes. */
  periodStart: Date | string | null;
  /** The end of the evidence period it describes. */
  periodEnd: Date | string | null;
  /** The finding codes its diagnosis raises. */
  raisedCodes: ReadonlySet<string>;
}

/**
 * The terminal proof time for a completed action: its completion timestamp, or its latest verification's
 * timestamp when that is later (a verification is stronger, more recent terminal proof than completion
 * alone). Null when neither is known.
 */
export function terminalProofTime(a: { completedAt?: Date | string | null; verifications?: ReadonlyArray<{ createdAt?: unknown }> }): Date | null {
  const completed = periodEndOf(a.completedAt ?? null);
  const verified = periodEndOf(a.verifications?.[0]?.createdAt ?? null);
  if (completed === null) return verified;
  if (verified === null) return completed;
  return verified.getTime() > completed.getTime() ? verified : completed;
}

/**
 * Whether the current cycle's evidence can prove the same intervention is required again after a
 * completion: its evidence period must START strictly after the terminal proof time — a period that
 * merely ENDS after it (but started before or during it) still covers time before the work was proven
 * done, and cannot itself prove recurrence. The cycle must also have been diagnosed after that time (a
 * back-dated re-diagnosis of an old period is never treated as new evidence).
 */
export function evidencePostdatesCompletion(cycle: Pick<ReadTimeContinuityCycle, "createdAt" | "periodStart">, terminalProofAt: Date | string | null | undefined): boolean {
  const done = periodEndOf(terminalProofAt ?? null);
  const diagnosed = periodEndOf(cycle.createdAt);
  const start = periodEndOf(cycle.periodStart);
  if (done === null || diagnosed === null || start === null) return false;
  return diagnosed.getTime() > done.getTime() && start.getTime() > done.getTime();
}

/**
 * Read-time action continuity for the CURRENT cycle, shared by Owner Home (the canonical candidate builder)
 * and every domain dashboard, so the two never disagree about what is live work:
 *   - ENGAGED work (assigned / in progress / blocked) on another cycle whose finding the current diagnosis
 *     still raises is followed as live work (`followed`), and takes the place of the current cycle's
 *     never-engaged copy for the same continuity key;
 *   - engaged work whose finding the current diagnosis no longer raises is returned apart (`notRaised`) —
 *     dashboards flag it for the owner to finish or cancel; it is never a current step;
 *   - COMPLETED work on another cycle is terminal historical evidence (`completedEarlier`): it suppresses the
 *     current cycle's never-engaged proposal for the SAME continuity key (finding code + recommendation code —
 *     never a title match) until evidence that post-dates the completion re-raises it
 *     (evidencePostdatesCompletion). It is never carried forward as actionable work;
 *   - CANCELLED work is not completion: it never suppresses a proposal (a cancelled step may be proposed
 *     again), exactly as at diagnosis time.
 * A proposal the owner has already engaged on stays (the owner chose to act again). Unrelated completed work
 * (another key) suppresses nothing.
 */
export function readTimeContinuity<A extends ReadTimeContinuityAction>(
  cycle: ReadTimeContinuityCycle,
  own: readonly A[],
  others: readonly A[],
  keyOf: (a: A) => string | null,
  codeOf: (a: A) => string | null
): { own: A[]; followed: A[]; notRaised: A[]; completedEarlier: A[] } {
  const engaged: ReadonlySet<string> = new Set(ENGAGED_ACTION_STATUSES);
  const elsewhere = others.filter((a) => a.cycleId !== cycle.id);
  const engagedElsewhere = elsewhere.filter((a) => engaged.has(a.status));
  const followed = engagedElsewhere.filter((a) => {
    const code = codeOf(a);
    return code !== null && cycle.raisedCodes.has(code);
  });
  const notRaised = engagedElsewhere.filter((a) => !followed.includes(a));
  const followedKeys = new Set(followed.map(keyOf).filter((k): k is string => k !== null));
  const ownProposalKeys = new Set(own.filter((a) => a.status === "proposed").map(keyOf).filter((k): k is string => k !== null));
  // The latest standing completion per key that has a never-engaged proposal to suppress.
  const completedByKey = new Map<string, A>();
  for (const a of elsewhere) {
    if (a.status !== "completed") continue;
    const key = keyOf(a);
    if (key === null || !ownProposalKeys.has(key) || followedKeys.has(key)) continue;
    if (evidencePostdatesCompletion(cycle, terminalProofTime(a))) continue;
    const prev = completedByKey.get(key);
    const at = terminalProofTime(a)?.getTime() ?? 0;
    if (!prev || at > (terminalProofTime(prev)?.getTime() ?? 0)) completedByKey.set(key, a);
  }
  const completedEarlier = [...completedByKey.values()];
  const suppressFollowed = (a: A) => {
    const key = keyOf(a);
    return key !== null && followedKeys.has(key) && !engaged.has(a.status) && a.status !== "completed";
  };
  const suppressCompleted = (a: A) => {
    const key = keyOf(a);
    return key !== null && completedByKey.has(key) && a.status === "proposed";
  };
  return { own: own.filter((a) => !suppressFollowed(a) && !suppressCompleted(a)), followed, notRaised, completedEarlier };
}
