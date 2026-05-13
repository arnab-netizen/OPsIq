/**
 * Notification Preferences API
 *
 * Manage user notification preferences: channels, frequency, quiet hours.
 */

import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
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
export const GET = withEnforcementFull(async (request: NextRequest) => {
  const workspaceId = request.headers.get("x-workspace-id") || "default";
  const userId = request.headers.get("x-user-id") || "anonymous";

  const preferences = await getPreferences(workspaceId, userId);

  return {
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
  };
});

/**
 * PATCH /api/notifications/preferences
 * Update user notification preferences
 */
export const PATCH = withEnforcementFull(async (request: NextRequest) => {
  const body = await request.json();
  const parsed = SetPreferencesSchema.parse(body);

  const workspaceId = request.headers.get("x-workspace-id") || "default";
  const userId = request.headers.get("x-user-id") || "anonymous";

  const preferences = await setPreferences({
    workspaceId,
    userId,
    ...parsed,
  });

  return {
    success: true,
    preferences,
  };
});
