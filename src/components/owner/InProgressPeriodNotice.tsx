/**
 * A domain page's notice that the snapshot it would diagnose is for the IN-PROGRESS current period (the
 * dashboard's `latestSnapshotPeriodState` — current-diagnosis-cycle.ts): those figures are provisional. They
 * may flag a worsening, but they never clear a problem, never approve growth and are never a completed
 * reading. It distinguishes what actually exists — a completed reading below or none yet, and whether the
 * in-progress figures were diagnosed (with what result) — and never claims a reading that does not exist.
 * Presentation only.
 */
export function InProgressPeriodNotice({
  periodState,
  periodEnd,
  hasCompletedReading = false,
  diagnosis = null,
  // P1-4: only Cash/Finance actually consumes provisional evidence in canonical safety arbitration
  // (current-cash-finance-reading.ts worst-of). Sales, Operations, Execution, Marketing and Recovery do
  // not — their diagnosis engines never read an in-progress snapshot into the safety/gate decision, so
  // this notice must not claim they do. Pass true only for a domain whose provisional-evidence consumption
  // is actually implemented and tested.
  provisionalSafetyImplemented = false,
}: {
  periodState: string | null | undefined;
  periodEnd?: string | Date | null;
  /** The page shows a diagnosis of a COMPLETED period (its current reading). */
  hasCompletedReading?: boolean;
  /** The in-progress figures' own diagnosis, when they were diagnosed (current: not changed since). */
  diagnosis?: { diagnosedAt: string; state: string | null; current: boolean } | null;
  /** True only for Cash/Finance, where safety arbitration actually reads provisional evidence. */
  provisionalSafetyImplemented?: boolean;
}) {
  if (periodState !== "provisional") return null;
  const end = periodEnd ? new Date(periodEnd) : null;
  const label = end && !Number.isNaN(end.getTime()) ? ` (period ending ${end.toISOString().slice(0, 10)})` : "";
  const diagnosed = diagnosis?.current ? diagnosis : null;
  const result = diagnosed
    ? ` They were diagnosed on ${diagnosed.diagnosedAt.slice(0, 10)}${diagnosed.state ? ` and currently show ${diagnosed.state.replace(/_/g, " ").toLowerCase()}` : ""} — a provisional result until the period ends.`
    : " They have not been diagnosed yet; a diagnosis of them is provisional until the period ends.";
  const behaviorClause = provisionalSafetyImplemented
    ? " OpsIQ uses in-progress figures only to flag a worsening — never to clear a problem or approve growth — until the period ends; where they are worse than the completed reading, OpsIQ's safety checks already apply them."
    : " These figures cover a period still in progress. They are shown as provisional and do not replace the latest completed-period evidence used for overall decisions.";
  const noCompletedBehaviorClause = provisionalSafetyImplemented
    ? ` They have not been diagnosed yet; a diagnosis of them is provisional until the period ends. OpsIQ uses them only to flag a worsening, never to clear a problem or approve growth.`
    : " These are provisional figures for the current period. OpsIQ will not treat them as completed-period evidence.";
  return (
    <p data-testid="in-progress-period-notice" className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
      {hasCompletedReading
        ? `Your latest figures${label} are for a period that is still in progress.${behaviorClause}${provisionalSafetyImplemented ? result : ""} The reading below is from the latest completed period.`
        : `Your only figures here${label} are for a period that is still in progress, so there is no completed reading yet.${provisionalSafetyImplemented ? result : noCompletedBehaviorClause}`}
    </p>
  );
}
