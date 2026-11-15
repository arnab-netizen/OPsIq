/**
 * The ONE definition of a domain's CURRENT diagnosis cycle for owner advice and gating.
 *
 * A diagnosis can be run on any of a business's snapshots — including a back-filled OLDER period — and
 * every run takes the next sequence number. The latest run is therefore not necessarily the current
 * truth. The current diagnosis is the one on the latest evidence PERIOD (its snapshot's `periodEnd`);
 * within that period, the latest capture of the figures (a correction); then the latest run on them
 * (a re-diagnosis of the same figures). Evidence out of date or amended since is handled by the reader
 * (stale → refresh target; superseded Finance snapshot → not current), never by picking another cycle.
 *
 * Every owner advice/gating read of "the current cycle" orders by these constants (enforced by
 * src/__tests__/governance/current-diagnosis-cycle.test.ts). Strategy is the one exception, stated
 * below (CURRENT_STRATEGY_CYCLE_ORDER).
 *
 * Evidence periods have three states relative to `now` (evidencePeriodState):
 *   - COMPLETED (periodEnd <= now): completed current evidence, subject to freshness and supersession.
 *     Every read ordered by CURRENT_DIAGNOSIS_CYCLE_ORDER or CURRENT_RECOVERY_CYCLE_ORDER filters with
 *     currentEvidenceWhere(now) (same governance test), so the current cycle is always a completed one.
 *   - PROVISIONAL (periodStart <= now < periodEnd): the in-progress current period. It is never completed
 *     truth: it cannot become the current cycle, own carried actions, prove a resolution, establish safety
 *     for growth or supersede a completed reading. It is read separately (provisionalEvidenceWhere) and
 *     may only TIGHTEN a safety state (effective = worse(completed, provisional)); surfaces label it as
 *     in progress.
 *   - FUTURE (periodStart > now): excluded entirely.
 */

/** Evidence-period domain cycles (Finance, Cash flow, Sales, Operations, SOP, Marketing). */
export const CURRENT_DIAGNOSIS_CYCLE_ORDER: [
  { snapshot: { periodEnd: "desc" } },
  { snapshot: { createdAt: "desc" } },
  { sequenceNumber: "desc" },
] = [{ snapshot: { periodEnd: "desc" } }, { snapshot: { createdAt: "desc" } }, { sequenceNumber: "desc" }];

/** Recovery cycles (numbered by `cycleNumber`). */
export const CURRENT_RECOVERY_CYCLE_ORDER: [
  { snapshot: { periodEnd: "desc" } },
  { snapshot: { createdAt: "desc" } },
  { cycleNumber: "desc" },
] = [{ snapshot: { periodEnd: "desc" } }, { snapshot: { createdAt: "desc" } }, { cycleNumber: "desc" }];

/**
 * Strategy cycles. A Strategy snapshot is a saved SCENARIO (an alternative plan), not a newer period of
 * the same evidence: the current evaluation is the scenario the owner evaluated last (selecting a
 * scenario is evaluating it), never whichever saved scenario has the latest assessment period.
 */
export const CURRENT_STRATEGY_CYCLE_ORDER: [{ sequenceNumber: "desc" }] = [{ sequenceNumber: "desc" }];

/** Only evidence whose period has ended by `now` can be current (see the module doc). */
export function currentEvidenceWhere(now: Date): { snapshot: { periodEnd: { lte: Date } } } {
  return { snapshot: { periodEnd: { lte: now } } };
}

/** The in-progress current period's evidence (PROVISIONAL, see the module doc): started, not yet ended. */
export function provisionalEvidenceWhere(now: Date): { snapshot: { periodStart: { lte: Date }; periodEnd: { gt: Date } } } {
  return { snapshot: { periodStart: { lte: now }, periodEnd: { gt: now } } };
}

export type EvidencePeriodState = "completed" | "provisional" | "future";

/** Where an evidence period sits relative to `now` (see the module doc); null when it carries no period. */
export function evidencePeriodState(
  period: { periodStart?: Date | string | null; periodEnd?: Date | string | null } | null | undefined,
  now: Date
): EvidencePeriodState | null {
  if (!period?.periodEnd) return null;
  const end = new Date(period.periodEnd).getTime();
  if (Number.isNaN(end)) return null;
  if (end <= now.getTime()) return "completed";
  const start = period.periodStart ? new Date(period.periodStart).getTime() : Number.NaN;
  return !Number.isNaN(start) && start <= now.getTime() ? "provisional" : "future";
}

/**
 * The in-progress period's latest reading (same shape as CURRENT_DIAGNOSIS_CYCLE_ORDER). Every read ordered
 * by it filters with provisionalEvidenceWhere(now) (governance: current-diagnosis-cycle.test.ts): it never
 * selects "the current cycle".
 */
export const PROVISIONAL_DIAGNOSIS_CYCLE_ORDER: [
  { snapshot: { periodEnd: "desc" } },
  { snapshot: { createdAt: "desc" } },
  { sequenceNumber: "desc" },
] = [{ snapshot: { periodEnd: "desc" } }, { snapshot: { createdAt: "desc" } }, { sequenceNumber: "desc" }];

/**
 * A metric snapshot table's own period filters (snapshots carry periodStart/periodEnd directly, not through
 * a cycle): COMPLETED — the period has ended by `now` (the only evidence a classification or trend rests
 * on); PROVISIONAL — started, not yet ended (labelled as in progress, never a completed trend point). A
 * period that has not started (genuinely future) matches neither.
 */
export function completedSnapshotWhere(now: Date): { periodEnd: { lte: Date } } {
  return { periodEnd: { lte: now } };
}
export function provisionalSnapshotWhere(now: Date): { periodStart: { lte: Date }; periodEnd: { gt: Date } } {
  return { periodStart: { lte: now }, periodEnd: { gt: now } };
}
