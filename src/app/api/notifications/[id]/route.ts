/**
 * Notification Detail API
 *
 * Get individual notification and mark as read.
 */

import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { NotFoundError } from "@/infra/errors";
import {
  getNotification,
  markAsRead,
} from "@/services/notifications/notification-service";
import { CAPABILITIES } from "@/domain/constants/capabilities";

/**
 * GET /api/notifications/[id]
 * Get a specific notification
 */
export const GET = withCanonicalEnforcement(async (
  ctx: CanonicalAuthContext,
  params: Record<string, string>
) => {
  const { id } = params;

  if (!id) {
    throw new Error("Notification ID is required");
  }

  const workspaceId = ctx.verifiedWorkspaceId;

  const notification = await getNotification(id);

  // Another workspace's notification is the same 404 as an unknown id (tenant non-disclosure).
  if (!notification || notification.workspaceId !== workspaceId) {
    throw new NotFoundError("Notification", id);
  }

  return {
    success: true,
    notification,
  };
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ACTION_VIEW] });

/**
 * PATCH /api/notifications/[id]/read
 * Mark notification as read
 */
export const PATCH = withCanonicalEnforcement(async (
  ctx: CanonicalAuthContext,
  params: Record<string, string>
) => {
  const { id } = params;

  if (!id) {
    throw new Error("Notification ID is required");
  }

  const workspaceId = ctx.verifiedWorkspaceId;

  const notification = await getNotification(id);

  // Another workspace's notification is the same 404 as an unknown id (tenant non-disclosure).
  if (!notification || notification.workspaceId !== workspaceId) {
    throw new NotFoundError("Notification", id);
  }

  markAsRead(id);

  return {
    success: true,
    message: "Notification marked as read",
  };
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ACTION_VIEW] });
