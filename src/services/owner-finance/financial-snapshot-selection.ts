/**
 * The ONE definition of which OwnerFinancialSnapshot OpsIQ treats as financial evidence.
 *
 * Two distinct concepts — never mixed:
 *
 *   A. Diagnosis-bound snapshot — the exact snapshot a Finance diagnosis ran on (`cycle.snapshot`,
 *      loaded through the cycle relation). Used to explain THAT diagnosis: its findings, actions,
 *      missing-data state and provenance. Never replaced by a "latest" lookup.
 *
 *   B. Current effective snapshot — the most current UNSUPERSEDED financial evidence for a business,
 *      for current operational decisions and gates (margin/cash gates, budget, re-diagnosis target,
 *      Now View providers). Selection semantics (the repository's amendment model,
 *      owner-finance/snapshot.service.ts amendSnapshot):
 *        - an amended snapshot is superseded (`supersededById` set) and is never current, even though
 *          its replacement copies its period and is inserted later;
 *        - "current" is the latest evidence PERIOD (`periodEnd`), never insertion time; `createdAt`
 *          and `id` only break ties deterministically between unsuperseded rows of the same period.
 *        - a snapshot whose period has not ENDED by `now` (future-dated) is not current evidence.
 *      Always scoped to one business in one workspace — never workspace-wide.
 *
 * Every owner-advice/gating read of "the latest" financial snapshot must use
 * `currentEffectiveFinancialSnapshotQuery` (enforced by
 * src/__tests__/governance/financial-snapshot-selection.test.ts).
 */

export interface FinancialSnapshotScope {
  workspaceId: string;
  businessId: string;
}

type SelectShape = Record<string, true>;

/** The query `currentEffectiveFinancialSnapshotQuery` builds (for dependency-injected readers). */
export interface CurrentEffectiveSnapshotQuery<S extends SelectShape = SelectShape> {
  where: { workspaceId: string; businessId: string; supersededById: null; periodEnd: { lte: Date } };
  orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }, { id: "desc" }];
  select: S;
}

export function currentEffectiveFinancialSnapshotQuery(scope: FinancialSnapshotScope, select?: undefined, now?: Date): {
  where: { workspaceId: string; businessId: string; supersededById: null; periodEnd: { lte: Date } };
  orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }, { id: "desc" }];
};
export function currentEffectiveFinancialSnapshotQuery<S extends SelectShape>(
  scope: FinancialSnapshotScope,
  select: S,
  now?: Date
): {
  where: { workspaceId: string; businessId: string; supersededById: null; periodEnd: { lte: Date } };
  orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }, { id: "desc" }];
  select: S;
};
export function currentEffectiveFinancialSnapshotQuery<S extends SelectShape>(scope: FinancialSnapshotScope, select?: S, now: Date = new Date()) {
  return {
    // A snapshot for a period that has not ended by `now` is never the current effective one: a future
    // period would otherwise sort first and hide the present figures.
    where: { workspaceId: scope.workspaceId, businessId: scope.businessId, supersededById: null, periodEnd: { lte: now } },
    orderBy: [{ periodEnd: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }] as [
      { periodEnd: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    ...(select ? { select } : {}),
  };
}

/**
 * The in-progress current period's financial snapshot (started, not yet ended, not amended) — PROVISIONAL
 * evidence (current-diagnosis-cycle.ts): shown and diagnosable, labelled as in progress, but never the
 * current effective snapshot (currentEffectiveFinancialSnapshotQuery) and never a completed reading.
 */
export function inProgressFinancialSnapshotQuery<S extends SelectShape>(scope: FinancialSnapshotScope, select: S | undefined, now: Date) {
  return {
    where: { workspaceId: scope.workspaceId, businessId: scope.businessId, supersededById: null, periodStart: { lte: now }, periodEnd: { gt: now } },
    orderBy: [{ periodEnd: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }] as [
      { periodEnd: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    ...(select ? { select } : {}),
  };
}
