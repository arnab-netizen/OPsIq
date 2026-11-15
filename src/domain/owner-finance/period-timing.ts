/**
 * Owner Finance — where a saved period sits relative to today, in owner words (pure).
 *
 * Mirrors `evidencePeriodState` (services/owner-spine/current-diagnosis-cycle.ts), the rule every read already uses: only a
 * period that has ENDED is completed evidence; one that has started but not ended is provisional; one that has not started
 * is not evidence at all and is never used. A future-dated snapshot is accepted and kept (the owner may be planning), but it
 * is labelled as such everywhere it is listed so it is never mistaken for an observed month. A test pins this against
 * `evidencePeriodState` so the two cannot drift.
 */
export type SavedPeriodTiming = "completed" | "provisional" | "future";

export function savedPeriodTiming(period: { periodStart?: string | Date | null; periodEnd?: string | Date | null }, now: Date): SavedPeriodTiming | null {
  if (!period.periodEnd) return null;
  const end = new Date(period.periodEnd).getTime();
  if (Number.isNaN(end)) return null;
  if (end <= now.getTime()) return "completed";
  const start = period.periodStart ? new Date(period.periodStart).getTime() : Number.NaN;
  return !Number.isNaN(start) && start <= now.getTime() ? "provisional" : "future";
}

export const SAVED_PERIOD_TIMING_NOTE: Readonly<Record<Exclude<SavedPeriodTiming, "completed">, string>> = Object.freeze({
  provisional: "In progress — treated as provisional until the period ends.",
  future: "Starts in the future — kept on record but not used until the period begins. Check the dates if this was a mistake.",
});
