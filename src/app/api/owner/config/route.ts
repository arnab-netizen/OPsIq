/**
 * GET/POST /api/owner/config
 * Retrieve or update owner dashboard configuration
 * Owner-only access (requires workspace owner capability)
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ForbiddenError, BadRequestError, AppError } from "@/infra/errors";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { validateOwnerDashboardConfig, ActionQueuePriority, HealthStatus, OwnerDashboardConfig } from "@/domain/owner-mode/owner-dashboard";
import { z } from "zod/v4";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const configUpdateSchema = z.object({
  showCompletedActions: z.boolean().optional(),
  daysOfHistoryVisible: z.number().int().positive().optional(),
  actionPriorityThreshold: z.enum(["critical", "high", "medium", "low"]).optional(),
  healthStatusThreshold: z.enum(["critical", "at_risk", "healthy", "improving"]).optional(),
  enableBulkActions: z.boolean().optional(),
  enableAdvancedFiltering: z.boolean().optional(),
  customFilters: z.record(z.string(), z.unknown()).optional(),
});

function toConfigDTO(config: OwnerDashboardConfig) {
  return {
    workspaceId: config.workspaceId,
    ownerId: config.ownerId,
    showCompletedActions: config.showCompletedActions,
    daysOfHistoryVisible: config.daysOfHistoryVisible,
    actionPriorityThreshold: config.actionPriorityThreshold,
    healthStatusThreshold: config.healthStatusThreshold,
    enableBulkActions: config.enableBulkActions,
    enableAdvancedFiltering: config.enableAdvancedFiltering,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

const defaultConfig = (workspaceId: string, userId: string): OwnerDashboardConfig => ({
  workspaceId,
  ownerId: userId,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  showCompletedActions: true,
  daysOfHistoryVisible: 30,
  actionPriorityThreshold: ActionQueuePriority.MEDIUM,
  healthStatusThreshold: HealthStatus.AT_RISK,
  enableBulkActions: true,
  enableAdvancedFiltering: true,
});

// In-memory store for demo (replace with DB in production)
const configStore = new Map<string, OwnerDashboardConfig>();

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  if (!ctx.request) {
    throw new Error("Request object not available");
  }

  const workspaceId = ctx.verifiedWorkspaceId;
  const userId = ctx.verifiedActorId;

  const membership = await enforceWorkspaceScoping(ctx.request, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    const stored = configStore.get(`${workspaceId}:${userId}`);
    const config = stored || defaultConfig(workspaceId, userId);

    return toConfigDTO(config);
  } catch (error) {
    if (error instanceof Error) {
      const governed = classifyOperatorError(error, { context: "load" });
      throw new BadRequestError(governed.operatorMessage);
    }
    throw new AppError(
      "INTERNAL_ERROR",
      "Internal server error",
      500,
      {
        telemetryClass: "INTERNAL_ERROR",
        auditClass: "INTERNAL_ERROR",
        severity: "HIGH",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: true,
        mutationAllowed: false,
      }
    );
  }
}, { requireCapabilities: ["OWNER_VIEW"] });

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  if (!ctx.request) {
    throw new Error("Request object not available");
  }

  const workspaceId = ctx.verifiedWorkspaceId;
  const userId = ctx.verifiedActorId;

  const membership = await enforceWorkspaceScoping(ctx.request, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    const body = await ctx.request.json();
    const validated = configUpdateSchema.parse(body);

    const existing = configStore.get(`${workspaceId}:${userId}`) || defaultConfig(workspaceId, userId);

    const priorityMap: Record<string, ActionQueuePriority> = {
      critical: ActionQueuePriority.CRITICAL,
      high: ActionQueuePriority.HIGH,
      medium: ActionQueuePriority.MEDIUM,
      low: ActionQueuePriority.LOW,
    };

    const healthMap: Record<string, HealthStatus> = {
      critical: HealthStatus.CRITICAL,
      at_risk: HealthStatus.AT_RISK,
      healthy: HealthStatus.HEALTHY,
      improving: HealthStatus.IMPROVING,
    };

    const updated: OwnerDashboardConfig = {
      ...existing,
      showCompletedActions: validated.showCompletedActions ?? existing.showCompletedActions,
      daysOfHistoryVisible: validated.daysOfHistoryVisible ?? existing.daysOfHistoryVisible,
      actionPriorityThreshold: validated.actionPriorityThreshold
        ? priorityMap[validated.actionPriorityThreshold]
        : existing.actionPriorityThreshold,
      healthStatusThreshold: validated.healthStatusThreshold
        ? healthMap[validated.healthStatusThreshold]
        : existing.healthStatusThreshold,
      enableBulkActions: validated.enableBulkActions ?? existing.enableBulkActions,
      enableAdvancedFiltering: validated.enableAdvancedFiltering ?? existing.enableAdvancedFiltering,
      customFilters: validated.customFilters ?? existing.customFilters,
      workspaceId,
      ownerId: userId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const validationErrors = validateOwnerDashboardConfig(updated);
    if (validationErrors.length > 0) {
      throw new BadRequestError("Validation failed: " + validationErrors.join(", "));
    }

    configStore.set(`${workspaceId}:${userId}`, updated);

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_CONFIG_UPDATED,
      workspaceId,
      actorId: userId,
      entityType: "owner_config",
      entityId: workspaceId,
      payload: validated,
    });

    return toConfigDTO(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError("Validation error: " + error.issues.map(i => i.message).join(", "));
    }
    if (error instanceof Error) {
      const governed = classifyOperatorError(error, { context: "form" });
      throw new BadRequestError(governed.operatorMessage);
    }
    throw new AppError(
      "INTERNAL_ERROR",
      "Internal server error",
      500,
      {
        telemetryClass: "INTERNAL_ERROR",
        auditClass: "INTERNAL_ERROR",
        severity: "HIGH",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: true,
        mutationAllowed: false,
      }
    );
  }
}, { requireCapabilities: ["OWNER_MANAGE"] });
