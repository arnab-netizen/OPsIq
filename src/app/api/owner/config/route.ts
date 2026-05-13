/**
 * GET/POST /api/owner/config
 * Retrieve or update owner dashboard configuration
 * Owner-only access (requires workspace owner capability)
 */

import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { validateOwnerDashboardConfig, ActionQueuePriority, HealthStatus, OwnerDashboardConfig } from "@/domain/owner-mode/owner-dashboard";
import type { NextRequest } from "next/server";
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

export const GET = withEnforcementFull(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.OWNER_VIEW,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    const stored = configStore.get(`${workspaceId}:${session.user.id}`);
    const config = stored || defaultConfig(workspaceId, session.user.id);

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
});

export const POST = withEnforcementFull(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.OWNER_MANAGE,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    const body = await request.json();
    const validated = configUpdateSchema.parse(body);

    const existing = configStore.get(`${workspaceId}:${session.user.id}`) || defaultConfig(workspaceId, session.user.id);

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
      ownerId: session.user.id,
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

    configStore.set(`${workspaceId}:${session.user.id}`, updated);

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_CONFIG_UPDATED,
      workspaceId,
      actorId: session.user.id,
      entityType: "owner_config",
      entityId: workspaceId,
      payload: validated,
    });

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
});
