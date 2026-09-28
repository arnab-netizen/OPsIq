/**
 * A domain page's notice that its latest snapshot is for the IN-PROGRESS current period (the dashboard's
 * `latestSnapshotPeriodState` — current-diagnosis-cycle.ts): those figures are provisional. They may flag a
 * worsening, but they never clear a problem, never approve growth and are never the completed reading the
 * page's diagnosis is built on. Presentation only.
 */
export function InProgressPeriodNotice({ periodState, periodEnd }: { periodState: string | null | undefined; periodEnd?: string | Date | null }) {
  if (periodState !== "provisional") return null;
  const end = periodEnd ? new Date(periodEnd) : null;
  const label = end && !Number.isNaN(end.getTime()) ? ` (period ending ${end.toISOString().slice(0, 10)})` : "";
  return (
    <p data-testid="in-progress-period-notice" className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
      Your latest figures{label} are for a period that is still in progress. OpsIQ treats them as provisional: they can flag a
      worsening, but they cannot clear a problem or approve growth until the period ends. The reading below is from the latest
      completed period.
    </p>
  );
}
