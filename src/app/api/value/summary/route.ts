import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

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

export const GET = withEnforcementFull(async (request: NextRequest) => {
  // Get workspace context (fail closed if missing)
  const workspace = await requireWorkspaceContext();

  // Fetch all completed items with outcome data
  const items = await db.operatorItem.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      status: "done",
      firstCompletedAt: {
        not: null,
      },
      firstPositiveOutcomeAt: {
        not: null,
      },
    },
    orderBy: {
      firstCompletedAt: "desc",
    },
  });

  // Calculate time to value metrics
  const timeToValueMetrics: TimeToValueMetric[] = [];
  const timeToValueDays: number[] = [];

  for (const item of items) {
    if (item.firstCompletedAt && item.firstPositiveOutcomeAt) {
      const completedAt = new Date(item.firstCompletedAt);
      const positiveOutcomeAt = new Date(item.firstPositiveOutcomeAt);
      const timeToValueMs = positiveOutcomeAt.getTime() - completedAt.getTime();
      const timeToValueDaysValue = timeToValueMs / (1000 * 60 * 60 * 24);

      timeToValueMetrics.push({
        itemId: item.id,
        completedAt: item.firstCompletedAt.toISOString(),
        positiveOutcomeAt: item.firstPositiveOutcomeAt.toISOString(),
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
      workspaceId: workspace.workspaceId,
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
});
