import { classifyOperatorError } from "@/lib/operator-error-governance";
import { db } from "@/lib/db";
import { getCache } from "@/services/cache/cache-factory";
import { logger } from "@/infra/logger";
import { recordLearning } from "@/services/learning/store";

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
    await recordLearning({
      workspaceId,
      problemType: metrics.problemType,
      actionTaken: metrics.actionTaken,
      success: metrics.success,
      impact: metrics.actualOutcome,
      actorId: "system",
    });

    invalidateMetricsCache(workspaceId, metrics.problemType);

    logger.info("Decision metrics recorded", {
      workspaceId,
      problemType: metrics.problemType,
      success: metrics.success,
      impact: metrics.actualOutcome,
    });

    return { workspaceId, ...metrics };
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Failed to record decision metrics", {
      workspaceId,
      problemType: metrics.problemType,
      error: governed.operatorMessage,
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

  const successCount = records.filter((r: unknown) => r.success).length;
  const successRate = successCount / records.length;

  const avgImpact = records.reduce((sum: number, r: unknown) => sum + r.impact, 0) / records.length;
  const variance =
    records.reduce((sum: number, r: unknown) => sum + Math.pow(r.impact - avgImpact, 2), 0) / records.length;
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
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "load" });
      logger.warn("Failed to invalidate metrics cache", {
        workspaceId,
        error: governed.operatorMessage,
      });
    });

  cache
    .delete(`metrics:problem:${workspaceId}:${problemType}`)
    .catch((err) => {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "load" });
      logger.warn("Failed to invalidate problem metrics cache", {
        workspaceId,
        problemType,
        error: governed.operatorMessage,
      });
    });
}

export async function recalculateWorkspaceMetrics(workspaceId: string) {
  const cache = getCache();

  cache
    .flush(`^metrics:workspace:${workspaceId}`)
    .catch((err) => {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "load" });
      logger.warn("Failed to flush workspace metrics cache", {
        workspaceId,
        error: governed.operatorMessage,
      });
    });

  return getMetricsSnapshot(workspaceId);
}
