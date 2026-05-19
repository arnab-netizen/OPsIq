/**
 * GET/POST /api/owner/config
 * Retrieve or update owner dashboard configuration
 * Owner-only access (requires workspace owner capability)
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ForbiddenError } from "@/infra/errors";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { validateOwnerDashboardConfig, ActionQueuePriority, HealthStatus, OwnerDashboardConfig } from "@/domain/owner-mode/owner-dashboard";
import { z } from "zod/v4";

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

    return Response.json(toConfigDTO(config), { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
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
      return Response.json(
        { error: "Validation failed", details: validationErrors },
        { status: 400 }
      );
    }

    configStore.set(`${workspaceId}:${userId}`, updated);

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_CONFIG_UPDATED,
      workspaceId,
      actorId: userId,
      entityType: "owner_config",
      entityId: workspaceId,
      payload: validated,
    ,
    requestId: randomUUID()
  };

    return Response.json(toConfigDTO(updated), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}, { requireCapabilities: ["OWNER_MANAGE"] });