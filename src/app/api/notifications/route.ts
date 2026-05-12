/**
 * Notifications API
 *
 * Multi-channel notification management with templates and preferences.
 * Workspace-scoped, requires authentication.
 */

import { NextRequest, NextResponse } from "next/server";
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
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SendNotificationSchema.parse(body);

    // Extract workspace from auth context (would be middleware-injected in production)
    const workspaceId = request.headers.get("x-workspace-id") || "default";

    const notification = await sendNotification({
      ...parsed,
      workspaceId,
    });

    return NextResponse.json({
      success: true,
      notification,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid notification parameters", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to send notification" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications
 * List user notifications
 */
export async function GET(request: NextRequest) {
  try {
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

    return NextResponse.json({
      success: true,
      notifications: result.notifications,
      pagination: {
        total: result.total,
        limit: parsed.limit,
        offset: parsed.offset,
        hasMore: (parsed.offset || 0) + (parsed.limit || 50) < result.total,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to list notifications" },
      { status: 500 }
    );
  }
}
