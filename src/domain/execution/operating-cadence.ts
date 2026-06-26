/**
 * Module 16 — Operating Cadence (pure domain core).
 *
 * The owner-briefing engine accepts a timeHorizon but there is no cadence
 * scheduler. This computes which governed review is due — daily owner briefing,
 * weekly business review, monthly operating review — from the last-run time and a
 * supplied clock (no hidden Date.now()), so the owner operating rhythm is enforced.
 * Pure + deterministic.
 */

export enum CadenceType {
  DAILY_OWNER_BRIEFING = "DAILY_OWNER_BRIEFING",
  WEEKLY_BUSINESS_REVIEW = "WEEKLY_BUSINESS_REVIEW",
  MONTHLY_OPERATING_REVIEW = "MONTHLY_OPERATING_REVIEW",
}

const INTERVAL_MS: Record<CadenceType, number> = {
  [CadenceType.DAILY_OWNER_BRIEFING]: 24 * 60 * 60 * 1000,
  [CadenceType.WEEKLY_BUSINESS_REVIEW]: 7 * 24 * 60 * 60 * 1000,
  [CadenceType.MONTHLY_OPERATING_REVIEW]: 30 * 24 * 60 * 60 * 1000,
};

export interface CadenceState {
  type: CadenceType;
  lastRunAt?: Date | null;
}

/** Interval (ms) for a cadence type. */
export function cadenceIntervalMs(type: CadenceType): number {
  return INTERVAL_MS[type];
}

/** When the next run is due, given the last run (or `now` if never run). */
export function nextDueAt(type: CadenceType, lastRunAt: Date | null | undefined, now: Date): Date {
  if (!lastRunAt) return new Date(now.getTime());
  return new Date(lastRunAt.getTime() + INTERVAL_MS[type]);
}

/** Is the cadence due at `now`? Never-run cadences are always due. */
export function isCadenceDue(type: CadenceType, lastRunAt: Date | null | undefined, now: Date): boolean {
  if (!lastRunAt) return true;
  return now.getTime() >= lastRunAt.getTime() + INTERVAL_MS[type];
}

/** How overdue (ms) the cadence is at `now`; 0 if not yet due. */
export function overdueMs(type: CadenceType, lastRunAt: Date | null | undefined, now: Date): number {
  if (!lastRunAt) return INTERVAL_MS[type]; // treat never-run as one full interval overdue
  return Math.max(now.getTime() - (lastRunAt.getTime() + INTERVAL_MS[type]), 0);
}

/** The set of cadences currently due, most-overdue first. */
export function dueReviews(states: CadenceState[], now: Date): CadenceType[] {
  return states
    .filter((s) => isCadenceDue(s.type, s.lastRunAt, now))
    .sort((a, b) => overdueMs(b.type, b.lastRunAt, now) - overdueMs(a.type, a.lastRunAt, now))
    .map((s) => s.type);
}
