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
 * Evidence for a period that has not ENDED by `now` is never a current reading: a future-dated period
 * would otherwise sort first and hide the present one. Every read ordered by CURRENT_DIAGNOSIS_CYCLE_ORDER
 * or CURRENT_RECOVERY_CYCLE_ORDER also filters with currentEvidenceWhere(now) (same governance test).
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
