/**
 * The domain dashboards' action list for the current cycle, under the SAME read-time continuity rule the
 * canonical candidate builder applies (readTimeContinuity, action-continuity.ts): a never-engaged proposal
 * is never listed beside the owner's engaged or completed work for the same continuity key as a second piece
 * of live work.
 *
 * Listed, in order: the current cycle's own actions (minus suppressed duplicates); the owner's engaged work
 * on earlier cycles (flagged when the current diagnosis no longer raises its finding — finish or cancel it);
 * completed work on earlier cycles that stands against a duplicate proposal (history: `completedEarlier`).
 */
import { ENGAGED_ACTION_STATUSES, continuityKey, readTimeContinuity, type ReadTimeContinuityAction } from "@/domain/founder-recovery/action-continuity";

/** Prior work a dashboard reads for continuity: engaged anywhere, or completed for a finding the cycle raises. */
export function dashboardPriorWorkWhere(scope: { businessId: string; workspaceId: string }, currentCycleId: string, raisedCodes: readonly string[], now: Date, byLinkedFinding = false) {
  return {
    ...scope,
    cycleId: { not: currentCycleId },
    // Never work on a cycle of a period that has not started (a future plan is not the owner's work yet).
    cycle: { snapshot: { periodStart: { lte: now } } },
    OR: [
      { status: { in: [...ENGAGED_ACTION_STATUSES] } },
      byLinkedFinding
        ? { status: "completed", finding: { code: { in: [...raisedCodes] } } }
        : { status: "completed", findingCode: { in: [...raisedCodes] } },
    ],
  };
}

export type DashboardContinuityRow<A> = A & {
  carriedFromCycleSequence?: number;
  /** false when the current diagnosis no longer raises this engaged work's finding (finish or cancel it). */
  stillFlaggedByLatestDiagnosis?: boolean;
  /** Completed on an earlier cycle: history that stands against a duplicate proposal (never a step). */
  completedEarlier?: boolean;
};

export function dashboardContinuityActions<A extends ReadTimeContinuityAction & { recommendationCode?: string | null }>(
  cycle: { id: string; createdAt?: Date | string | null; snapshot?: { periodStart?: Date | string | null; periodEnd?: Date | string | null } | null; findings: ReadonlyArray<{ code: string }> },
  own: readonly A[],
  prior: readonly A[],
  codeOf: (a: A) => string | null,
  sequenceOf: (a: A) => number | undefined
): Array<DashboardContinuityRow<A>> {
  const raised = new Set(cycle.findings.map((f) => f.code));
  const r = readTimeContinuity<A>(
    { id: cycle.id, createdAt: cycle.createdAt ?? null, periodStart: cycle.snapshot?.periodStart ?? null, periodEnd: cycle.snapshot?.periodEnd ?? null, raisedCodes: raised },
    own,
    prior,
    (a) => {
      const code = codeOf(a);
      return code === null ? null : continuityKey({ findingCode: code, recommendationCode: a.recommendationCode ?? null });
    },
    codeOf
  );
  const engagedElsewhere = prior.filter((a) => r.followed.includes(a) || r.notRaised.includes(a));
  return [
    ...r.own,
    ...engagedElsewhere.map((a) => ({
      ...a,
      carriedFromCycleSequence: sequenceOf(a),
      stillFlaggedByLatestDiagnosis: (() => {
        const code = codeOf(a);
        return code !== null && raised.has(code);
      })(),
    })),
    ...r.completedEarlier.map((a) => ({ ...a, carriedFromCycleSequence: sequenceOf(a), completedEarlier: true })),
  ];
}

/**
 * Whether the snapshot a domain page would diagnose has already been diagnosed, and on what: the page shows
 * that diagnosis (labelled provisional when its period is in progress) instead of prompting a re-run of the
 * same evidence. `current` is false once the snapshot changed after the diagnosis (then a re-run is needed).
 */
export interface SnapshotDiagnosisState {
  cycleId: string;
  diagnosedAt: string;
  state: string | null;
  current: boolean;
}

export function snapshotDiagnosisState(
  snapshot: { updatedAt?: Date | string | null; createdAt?: Date | string | null } | null | undefined,
  cycle: { id: string; createdAt: Date | string } | null | undefined,
  state: string | null | undefined
): SnapshotDiagnosisState | null {
  if (!snapshot || !cycle) return null;
  const changedAt = new Date((snapshot.updatedAt ?? snapshot.createdAt ?? 0) as Date | string).getTime();
  const diagnosedAt = new Date(cycle.createdAt).getTime();
  return { cycleId: cycle.id, diagnosedAt: new Date(diagnosedAt).toISOString(), state: state ?? null, current: diagnosedAt >= changedAt };
}
