/**
 * Notification Preferences API
 *
 * Manage user notification preferences: channels, frequency, quiet hours.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  setPreferences,
  getPreferences,
  NotificationChannel,
  NotificationType,
} from "@/services/notifications/notification-service";

const SetPreferencesSchema = z.object({
  channels: z.record(
    z.nativeEnum(NotificationChannel),
    z.boolean()
  ),
  unsubscribedTypes: z.array(z.nativeEnum(NotificationType)).optional(),
  frequency: z.enum(["real_time", "daily_digest", "weekly_digest", "never"]).default("real_time"),
  quietHours: z.object({
    enabled: z.boolean(),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(23),
    timezone: z.string().default("UTC"),
  }).optional(),
});

/**
 * GET /api/notifications/preferences
 * Get user notification preferences
 */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.headers.get("x-workspace-id") || "default";
    const userId = request.headers.get("x-user-id") || "anonymous";

    const preferences = await getPreferences(workspaceId, userId);

    return NextResponse.json({
      success: true,
      preferences: preferences || {
        workspaceId,
        userId,
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: true,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        },
        frequency: "real_time",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get preferences" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications/preferences
 * Update user notification preferences
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SetPreferencesSchema.parse(body);

    const workspaceId = request.headers.get("x-workspace-id") || "default";
    const userId = request.headers.get("x-user-id") || "anonymous";

    const preferences = await setPreferences({
      workspaceId,
      userId,
      ...parsed,
    });

    return NextResponse.json({
      success: true,
      preferences,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid preferences", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
