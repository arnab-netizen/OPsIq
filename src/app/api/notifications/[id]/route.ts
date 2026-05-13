/**
 * Notification Detail API
 *
 * Get individual notification and mark as read.
 */

import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import {
  getNotification,
  markAsRead,
} from "@/services/notifications/notification-service";

/**
 * GET /api/notifications/[id]
 * Get a specific notification
 */
export const GET = withEnforcementFull(async (
  request: NextRequest,
  ctx,
  params
) => {
  // Authenticate user (fail-closed)
  await withAuth();

  const { id } = params;

  if (!id) {
    throw new Error("Notification ID is required");
  }

  // Get workspace from header
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new Error("Workspace ID required (x-workspace-id header)");
  }

  // Verify user is member of workspace (fail-closed)
  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new Error("Unauthorized");
  }

  const notification = await getNotification(id);

  if (!notification) {
    throw new Error("Notification not found");
  }

  // Verify notification belongs to requesting workspace
  if (notification.workspaceId !== workspaceId) {
    throw new Error("Access denied");
  }

  return {
    success: true,
    notification,
  };
});

/**
 * PATCH /api/notifications/[id]/read
 * Mark notification as read
 */
export const PATCH = withEnforcementFull(async (
  request: NextRequest,
  ctx,
  params
) => {
  // Authenticate user (fail-closed)
  await withAuth();

  const { id } = params;

  if (!id) {
    throw new Error("Notification ID is required");
  }

  // Get workspace from header
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new Error("Workspace ID required (x-workspace-id header)");
  }

  // Verify user is member of workspace (fail-closed)
  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new Error("Unauthorized");
  }

  const notification = await getNotification(id);

  if (!notification) {
    throw new Error("Notification not found");
  }

  // Verify notification belongs to requesting workspace
  if (notification.workspaceId !== workspaceId) {
    throw new Error("Access denied");
  }

  markAsRead(id);

  return {
    success: true,
    message: "Notification marked as read",
  };
});
