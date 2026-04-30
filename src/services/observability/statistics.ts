/**
 * Observability Statistics Service
 * Aggregates lifecycle metrics from persisted real data only
 * All queries workspace-scoped and bounded by time
 */

import { db } from "@/lib/db";

export interface LifecycleCount {
  stage: string;
  status: string;
  count: number;
}

export interface BlockReasonCount {
  reason: string;
  count: number;
}

export interface StageDuration {
  stage: string;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  count: number;
}

export interface RecentFailure {
  id: string;
  stage: string;
  status: string;
  reason: string | null;
  occurredAt: Date;
  durationMs: number | null;
}

export interface ObservabilitySummary {
  workspace: {
    workspaceId: string;
  };
  period: {
    last24h: {
      lifecycleCounts: LifecycleCount[];
      errorCount: number;
      blockCount: number;
      blockReasons: BlockReasonCount[];
      stageDurations: StageDuration[];
      slowestStage: StageDuration | null;
      recentFailures: RecentFailure[];
    };
    last7d: {
      lifecycleCounts: LifecycleCount[];
      errorCount: number;
      blockCount: number;
      blockReasons: BlockReasonCount[];
      stageDurations: StageDuration[];
      slowestStage: StageDuration | null;
      recentFailures: RecentFailure[];
    };
  };
}

/**
 * Aggregate statistics for a time period
 */
async function aggregateForPeriod(
  workspaceId: string,
  sinceDate: Date
): Promise<{
  lifecycleCounts: LifecycleCount[];
  errorCount: number;
  blockCount: number;
  blockReasons: BlockReasonCount[];
  stageDurations: StageDuration[];
  slowestStage: StageDuration | null;
  recentFailures: RecentFailure[];
}> {
  const events = await db.decisionLifecycle.findMany({
    where: {
      workspaceId,
      occurredAt: {
        gte: sinceDate,
      },
    },
    orderBy: {
      occurredAt: "desc",
    },
  });

  // Count lifecycle events by stage and status
  const lifecycleCounts: Record<string, LifecycleCount> = {};
  events.forEach((event: typeof events[number]) => {
    const key = `${event.stage}:${event.status}`;
    if (!lifecycleCounts[key]) {
      lifecycleCounts[key] = {
        stage: event.stage,
        status: event.status,
        count: 0,
      };
    }
    lifecycleCounts[key].count++;
  });

  // Count errors and blocks
  const errorCount = events.filter((e: typeof events[number]) => e.status === "error").length;
  const blockCount = events.filter((e: typeof events[number]) => e.status === "blocked").length;

  // Count block reasons
  const blockReasonCounts: Record<string, BlockReasonCount> = {};
  events
    .filter((e: typeof events[number]) => e.status === "blocked" && e.reason)
    .forEach((event: typeof events[number]) => {
      const reason = event.reason || "Unknown";
      if (!blockReasonCounts[reason]) {
        blockReasonCounts[reason] = {
          reason,
          count: 0,
        };
      }
      blockReasonCounts[reason].count++;
    });

  // Calculate stage durations
  const stageDurationStats: Record<string, StageDuration> = {};
  events.forEach((event: typeof events[number]) => {
    if (event.durationMs !== null && event.durationMs >= 0) {
      if (!stageDurationStats[event.stage]) {
        stageDurationStats[event.stage] = {
          stage: event.stage,
          avgDurationMs: 0,
          minDurationMs: event.durationMs,
          maxDurationMs: event.durationMs,
          count: 0,
        };
      }
      const stats = stageDurationStats[event.stage];
      stats.avgDurationMs = (stats.avgDurationMs * stats.count + event.durationMs) / (stats.count + 1);
      stats.minDurationMs = Math.min(stats.minDurationMs, event.durationMs);
      stats.maxDurationMs = Math.max(stats.maxDurationMs, event.durationMs);
      stats.count++;
    }
  });

  // Round average durations
  Object.values(stageDurationStats).forEach((stat) => {
    stat.avgDurationMs = Math.round(stat.avgDurationMs);
  });

  // Find slowest stage by average duration
  const stageDurations = Object.values(stageDurationStats);
  const slowestStage =
    stageDurations.length > 0
      ? stageDurations.reduce((max, curr) =>
          curr.avgDurationMs > max.avgDurationMs ? curr : max
        )
      : null;

  // Get recent failures (errors and blocks)
  const recentFailures = events
    .filter((e: typeof events[number]) => e.status === "error" || e.status === "blocked")
    .slice(0, 10)
    .map((e: typeof events[number]) => ({
      id: e.id,
      stage: e.stage,
      status: e.status,
      reason: e.reason,
      occurredAt: e.occurredAt,
      durationMs: e.durationMs,
    }));

  return {
    lifecycleCounts: Object.values(lifecycleCounts),
    errorCount,
    blockCount,
    blockReasons: Object.values(blockReasonCounts),
    stageDurations,
    slowestStage,
    recentFailures,
  };
}

/**
 * Get observability summary for last 24h and 7d
 */
export async function getObservabilitySummary(
  workspaceId: string
): Promise<ObservabilitySummary> {
  const now = new Date();

  // Calculate time boundaries
  const last24hDate = new Date(now);
  last24hDate.setHours(last24hDate.getHours() - 24);

  const last7dDate = new Date(now);
  last7dDate.setDate(last7dDate.getDate() - 7);

  // Aggregate for both periods
  const [last24h, last7d] = await Promise.all([
    aggregateForPeriod(workspaceId, last24hDate),
    aggregateForPeriod(workspaceId, last7dDate),
  ]);

  return {
    workspace: {
      workspaceId,
    },
    period: {
      last24h,
      last7d,
    },
  };
}
