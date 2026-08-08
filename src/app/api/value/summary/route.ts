import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { db } from "@/lib/db";

interface TimeToValueMetric {
  itemId: string;
  completedAt: string;
  positiveOutcomeAt: string;
  timeToValueMs: number;
  timeToValueDays: number;
}

interface ValueSummary {
  workspace: {
    workspaceId: string;
  };
  metrics: {
    totalCompleted: number;
    withPositiveOutcome: number;
    averageTimeToValueMs: number;
    averageTimeToValueDays: number;
    minTimeToValueDays: number | null;
    maxTimeToValueDays: number | null;
    medianTimeToValueDays: number | null;
  };
  distribution: {
    withinOneDay: number;
    oneToSevenDays: number;
    oneToThirtyDays: number;
    overThirtyDays: number;
  };
  items: TimeToValueMetric[];
}

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    // Fetch all completed items. firstCompletedAt / firstPositiveOutcomeAt are
    // set when the status transitions to "done" and when a positive outcome is
    // recorded respectively. Items with null timestamps are included but produce
    // no time-to-value entry (they have no measurable window yet).
    const items = await db.operatorItem.findMany({
      where: {
        workspaceId,
        status: "done",
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

  // Calculate time to value metrics
  const timeToValueMetrics: TimeToValueMetric[] = [];
  const timeToValueDays: number[] = [];

  for (const item of items) {
    // Use dedicated timestamps when populated; fall back to executedAt / updatedAt
    // for items completed before the firstCompletedAt column was added.
    const completedTs = item.firstCompletedAt ?? item.executedAt ?? null;
    const outcomeTs = item.firstPositiveOutcomeAt ?? null;

    if (completedTs && outcomeTs) {
      const completedAt = new Date(completedTs);
      const positiveOutcomeAt = new Date(outcomeTs);
      const timeToValueMs = positiveOutcomeAt.getTime() - completedAt.getTime();
      const timeToValueDaysValue = timeToValueMs / (1000 * 60 * 60 * 24);

      timeToValueMetrics.push({
        itemId: item.id,
        completedAt: completedAt.toISOString(),
        positiveOutcomeAt: positiveOutcomeAt.toISOString(),
        timeToValueMs,
        timeToValueDays: timeToValueDaysValue,
      });

      timeToValueDays.push(timeToValueDaysValue);
    }
  }

  // Calculate statistics
  const totalCompleted = items.length;
  const withPositiveOutcome = timeToValueMetrics.length;
  const averageTimeToValueMs =
    withPositiveOutcome > 0
      ? timeToValueMetrics.reduce((sum, m) => sum + m.timeToValueMs, 0) / withPositiveOutcome
      : 0;
  const averageTimeToValueDays = averageTimeToValueMs / (1000 * 60 * 60 * 24);

  // Calculate min/max
  const sortedDays = timeToValueDays.sort((a, b) => a - b);
  const minTimeToValueDays = sortedDays.length > 0 ? sortedDays[0] : null;
  const maxTimeToValueDays = sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : null;

  // Calculate median
  let medianTimeToValueDays: number | null = null;
  if (sortedDays.length > 0) {
    const mid = Math.floor(sortedDays.length / 2);
    medianTimeToValueDays =
      sortedDays.length % 2 !== 0
        ? sortedDays[mid]
        : (sortedDays[mid - 1] + sortedDays[mid]) / 2;
  }

  // Distribution
  const distribution = {
    withinOneDay: timeToValueDays.filter((d) => d <= 1).length,
    oneToSevenDays: timeToValueDays.filter((d) => d > 1 && d <= 7).length,
    oneToThirtyDays: timeToValueDays.filter((d) => d > 7 && d <= 30).length,
    overThirtyDays: timeToValueDays.filter((d) => d > 30).length,
  };

  const summary: ValueSummary = {
    workspace: {
      workspaceId,
    },
    metrics: {
      totalCompleted,
      withPositiveOutcome,
      averageTimeToValueMs,
      averageTimeToValueDays,
      minTimeToValueDays,
      maxTimeToValueDays,
      medianTimeToValueDays,
    },
    distribution,
    items: timeToValueMetrics,
  };

    return summary;
  },
  { requireCapabilities: ["ENGAGEMENT_VIEW"], requireWorkspace: true }
);
