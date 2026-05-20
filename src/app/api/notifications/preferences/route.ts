/**
 * Notification Preferences API
 *
 * Manage user notification preferences: channels, frequency, quiet hours.
 */

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { z } from "zod";
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
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
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = nextRequest.headers.get("x-workspace-id");
    const userId = ctx.verifiedActorId;

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
  },
  { requireCapabilities: [CAPABILITIES.USER_VIEW], requireWorkspace: true }
);

/**
 * PATCH /api/notifications/preferences
 * Update user notification preferences
 */
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = nextRequest.headers.get("x-workspace-id");
    const userId = ctx.verifiedActorId;

    const body = await ctx.request!.json();
    const parsed = SetPreferencesSchema.parse(body);

    const preferences = await setPreferences({
      workspaceId,
      userId,
      ...parsed,
    });

    return {
      success: true,
      preferences,
    };
  },
  { requireCapabilities: [CAPABILITIES.USER_VIEW], requireWorkspace: true }
);
