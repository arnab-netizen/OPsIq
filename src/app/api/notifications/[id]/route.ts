/**
 * Notification Detail API
 *
 * Get individual notification and mark as read.
 */

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  getNotification,
  markAsRead,
} from "@/services/notifications/notification-service";

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

  if (!notification) {
    throw new Error("Notification not found");
  }

  // Verify notification belongs to requesting workspace
  if (notification.workspaceId !== workspaceId) {
    throw new UnauthorizedError("Access denied");
  }

  return {
    success: true,
    notification,
  };
}, { requireCapabilities: [CAPABILITIES.USER_VIEW], requireWorkspace: true });

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

  if (!notification) {
    throw new Error("Notification not found");
  }

  // Verify notification belongs to requesting workspace
  if (notification.workspaceId !== workspaceId) {
    throw new UnauthorizedError("Access denied");
  }

  markAsRead(id);

  return {
    success: true,
    message: "Notification marked as read",
  };
}, { requireCapabilities: [CAPABILITIES.USER_VIEW], requireWorkspace: true });
