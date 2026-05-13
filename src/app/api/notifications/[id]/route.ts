/**
 * Notification Detail API
 *
 * Get individual notification and mark as read.
 */

import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
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
  const { id } = params;

  if (!id) {
    throw new Error("Notification ID is required");
  }

  const notification = await getNotification(id);

  if (!notification) {
    throw new Error("Notification not found");
  }

  // Verify workspace access
  const requestedWorkspace = request.headers.get("x-workspace-id") || "default";
  if (notification.workspaceId !== requestedWorkspace) {
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
  const { id } = params;

  if (!id) {
    throw new Error("Notification ID is required");
  }

  // Verify notification exists and belongs to workspace
  const notification = await getNotification(id);
  if (!notification) {
    throw new Error("Notification not found");
  }

  const requestedWorkspace = request.headers.get("x-workspace-id") || "default";
  if (notification.workspaceId !== requestedWorkspace) {
    throw new Error("Access denied");
  }

  await markAsRead(id);

  return {
    success: true,
    message: "Notification marked as read",
  };
});
