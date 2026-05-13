/**
 * Notifications API
 *
 * Multi-channel notification management with templates and preferences.
 * Workspace-scoped, requires authentication.
 */

import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
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
export const POST = withEnforcementFull(async (request: NextRequest) => {
  const body = await request.json();
  const parsed = SendNotificationSchema.parse(body);

  // Extract workspace from auth context (would be middleware-injected in production)
  const workspaceId = request.headers.get("x-workspace-id") || "default";

  const notification = await sendNotification({
    ...parsed,
    workspaceId,
  });

  return {
    success: true,
    notification,
  };
});

/**
 * GET /api/notifications
 * List user notifications
 */
export const GET = withEnforcementFull(async (request: NextRequest) => {
  const params = {
    limit: request.nextUrl.searchParams.get("limit")
      ? parseInt(request.nextUrl.searchParams.get("limit")!)
      : undefined,
    offset: request.nextUrl.searchParams.get("offset")
      ? parseInt(request.nextUrl.searchParams.get("offset")!)
      : undefined,
    status: (request.nextUrl.searchParams.get("status") as any) || undefined,
  };

  const parsed = ListNotificationsSchema.parse(params);

  // Extract workspace and user from auth context
  const workspaceId = request.headers.get("x-workspace-id") || "default";
  const userId = request.headers.get("x-user-id") || "anonymous";

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
});
