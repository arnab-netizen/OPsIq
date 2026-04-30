import { db } from "@/lib/db";
import { getCache } from "@/services/cache/cache-factory";
import { logger } from "@/infra/logger";

export interface MetricsUpdate {
  problemType: string;
  actionTaken: string;
  success: boolean;
  actualOutcome: number;
  expectedOutcome: number;
}

export async function recordDecisionMetrics(
  workspaceId: string,
  metrics: MetricsUpdate
) {
  try {
    const learningRecord = await db.learningRecord.create({
      data: {
        workspaceId,
        problemType: metrics.problemType,
        actionTaken: metrics.actionTaken,
        success: metrics.success,
        impact: metrics.actualOutcome,
      },
    });

    invalidateMetricsCache(workspaceId, metrics.problemType);

    logger.info("Decision metrics recorded", {
      workspaceId,
      problemType: metrics.problemType,
      success: metrics.success,
      impact: metrics.actualOutcome,
      recordId: learningRecord.id,
    });

    return learningRecord;
  } catch (error) {
    logger.error("Failed to record decision metrics", {
      workspaceId,
      problemType: metrics.problemType,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function calculateSuccessMetrics(
  workspaceId: string,
  problemType: string
) {
  const records = await db.learningRecord.findMany({
    where: {
      workspaceId,
      problemType,
    },
  });

  if (records.length === 0) {
    return {
      totalDecisions: 0,
      successCount: 0,
      successRate: 0,
      variance: 0,
      avgImpact: 0,
      stdDeviation: 0,
    };
  }

  const successCount = records.filter((r: any) => r.success).length;
  const successRate = successCount / records.length;

  const avgImpact = records.reduce((sum: number, r: any) => sum + r.impact, 0) / records.length;
  const variance =
    records.reduce((sum: number, r: any) => sum + Math.pow(r.impact - avgImpact, 2), 0) / records.length;
  const stdDeviation = Math.sqrt(variance);

  return {
    totalDecisions: records.length,
    successCount,
    successRate,
    variance,
    avgImpact,
    stdDeviation,
  };
}

export async function getMetricsSnapshot(workspaceId: string) {
  const cache = getCache();
  const cacheKey = `metrics:workspace:${workspaceId}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const problemTypes = [
    "revenue_leak",
    "cost_overrun",
    "growth_block",
    "inefficiency",
  ];
  const metricsSnapshot: Record<string, any> = {};

  for (const problemType of problemTypes) {
    metricsSnapshot[problemType] = await calculateSuccessMetrics(
      workspaceId,
      problemType
    );
  }

  const snapshot = {
    workspaceId,
    generatedAt: new Date(),
    metrics: metricsSnapshot,
  };

  await cache.set(cacheKey, snapshot, 300);

  return snapshot;
}

export function invalidateMetricsCache(
  workspaceId: string,
  problemType: string
) {
  const cache = getCache();

  cache
    .delete(`metrics:workspace:${workspaceId}`)
    .catch((err) => {
      logger.warn("Failed to invalidate metrics cache", {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  cache
    .delete(`metrics:problem:${workspaceId}:${problemType}`)
    .catch((err) => {
      logger.warn("Failed to invalidate problem metrics cache", {
        workspaceId,
        problemType,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

export async function recalculateWorkspaceMetrics(workspaceId: string) {
  const cache = getCache();

  cache
    .flush(`^metrics:workspace:${workspaceId}`)
    .catch((err) => {
      logger.warn("Failed to flush workspace metrics cache", {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  return getMetricsSnapshot(workspaceId);
}
