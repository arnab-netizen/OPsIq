import { trackUsage } from "@/services/entitlement.service";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export interface UsageRecord {
  workspaceId: string;
  key: string;
  value: number;
  context?: Record<string, unknown>;
}

/**
 * Record usage of a capability
 * Fails open: logs errors but doesn't throw
 * Emits audit event for tracking and analytics
 */
export async function recordUsage(
  workspaceId: string,
  key: string,
  value: number = 1,
  context?: Record<string, unknown>
): Promise<void> {
  if (!workspaceId || !key) {
    logger.warn("recordUsage called with missing workspaceId or key", {
      workspaceId,
      key,
    });
    return;
  }

  try {
    // Track in entitlement system for billing
    await trackUsage(workspaceId, key, value);

    // Log capability usage for observability
    // TODO: Add capability-usage audit event type to domain/constants/audit-events.ts
  } catch (error) {
    // Fail open: usage tracking should not block operations
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Failed to record usage", {
      workspaceId,
      key,
      value,
      error: governed.operatorMessage,
    });
  }
}

/**
 * Record decision engine usage
 */
export async function recordDecisionEngineUsage(
  workspaceId: string,
  context?: Record<string, unknown>
): Promise<void> {
  return recordUsage(workspaceId, "decision_engine", 1, {
    type: "decision_execution",
    ...context,
  });
}

/**
 * Record recommendation generation usage
 */
export async function recordRecommendationUsage(
  workspaceId: string,
  recommendationCount: number = 1,
  context?: Record<string, unknown>
): Promise<void> {
  return recordUsage(workspaceId, "generate_recommendation", recommendationCount, {
    type: "recommendation_generation",
    ...context,
  });
}

/**
 * Record action execution usage
 */
export async function recordActionUsage(
  workspaceId: string,
  actionCount: number = 1,
  context?: Record<string, unknown>
): Promise<void> {
  return recordUsage(workspaceId, "action_create", actionCount, {
    type: "action_execution",
    ...context,
  });
}

/**
 * Record engagement creation usage
 */
export async function recordEngagementCreationUsage(
  workspaceId: string,
  context?: Record<string, unknown>
): Promise<void> {
  return recordUsage(workspaceId, "create_engagement", 1, {
    type: "engagement_creation",
    ...context,
  });
}
