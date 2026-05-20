/**
 * Notifications API
 *
 * Multi-channel notification management with templates and preferences.
 * Workspace-scoped, requires authentication.
 */

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { z } from "zod";
import {
  sendNotification,
  listUserNotifications,
  NotificationChannel,
  NotificationType,
} from "@/services/notifications/notification-service";

const SendNotificationSchema = z.object({
  recipientId: z.string(),
  type: z.nativeEnum(NotificationType),
  channels: z.array(z.nativeEnum(NotificationChannel)),
  subject: z.string(),
  body: z.string(),
  templateId: z.string().optional(),
  templateData: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
  sendAt: z.string().datetime().transform(v => new Date(v)),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ListNotificationsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50).optional(),
  offset: z.number().int().min(0).default(0).optional(),
  status: z.enum(["pending", "sending", "sent", "failed", "bounced"]).optional(),
});

/**
 * POST /api/notifications
 * Send a notification
 */
export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  if (!ctx.request) {
    throw new Error("Request object not available");
  }

  const body = await ctx.request.json();
  const parsed = SendNotificationSchema.parse(body);

  const workspaceId = ctx.verifiedWorkspaceId;

  const notification = await sendNotification({
    ...parsed,
    workspaceId,
  });

  return {
    success: true,
    notification,
  };
}, { requireCapabilities: [CAPABILITIES.USER_VIEW], requireWorkspace: true });

/**
 * GET /api/notifications
 * List user notifications
 */
export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  if (!ctx.request) {
    throw new Error("Request object not available");
  }

  const params = {
    limit: ctx.request.nextUrl.searchParams.get("limit")
      ? parseInt(ctx.request.nextUrl.searchParams.get("limit")!)
      : undefined,
    offset: ctx.request.nextUrl.searchParams.get("offset")
      ? parseInt(ctx.request.nextUrl.searchParams.get("offset")!)
      : undefined,
    status: (ctx.request.nextUrl.searchParams.get("status") as any) || undefined,
  };

  const parsed = ListNotificationsSchema.parse(params);

  const workspaceId = ctx.verifiedWorkspaceId;
  const userId = ctx.verifiedActorId;

  const result = await listUserNotifications(workspaceId, userId, parsed);

  return {
    success: true,
    notifications: result.notifications,
    pagination: {
      total: result.total,
      limit: parsed.limit,
      offset: parsed.offset,
      hasMore: (parsed.offset || 0) + (parsed.limit || 50) < result.total,
    },
  };
}, { requireCapabilities: [CAPABILITIES.USER_VIEW], requireWorkspace: true });
