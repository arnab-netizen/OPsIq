/**
 * Notification Service
 *
 * Multi-channel notification dispatch with templates, preferences, and
 * delivery tracking. Notification *records* (this file's storage layer) are
 * in-memory — that was never the defect and is unchanged by this fix.
 *
 * Channel delivery truthfulness (P0-01 — production trust/governance
 * closure): a notification must never be marked as successfully delivered
 * unless a real provider actually accepted it, or the channel is one whose
 * "delivery" IS local persistence (IN_APP):
 *  - EMAIL is sent via the real Resend provider
 *    (@/lib/integrations/email-provider, same provider alert-service.ts
 *    already uses for real alert email). A successful call means Resend
 *    ACCEPTED the message — Resend gives no synchronous inbox-delivery
 *    confirmation, so the resulting channel status is "sent", never
 *    "delivered". Missing RESEND_API_KEY or any provider error/throw fails
 *    that channel closed ("not_configured" / "failed" / "retryable") —
 *    never silently to a fabricated success.
 *  - IN_APP is "delivered" by construction: the notification record itself
 *    is what the in-app UI reads, so persisting it IS the delivery — no
 *    external transport exists to fail.
 *  - SMS and WEBHOOK have no real provider wired into this service today —
 *    no SMS provider exists anywhere in this codebase, and generic
 *    per-event webhook dispatch is a separate, not-yet-wired subsystem
 *    (@/services/webhooks.service). Both are honestly reported
 *    "not_configured"; nothing is sent and nothing claims otherwise.
 *
 * Previously, every channel's outcome was decided by
 * `Math.random() > 0.05` — a coin flip presented to callers as a real
 * delivery result. That has been removed entirely.
 */

import { z } from "zod";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getEmailProvider } from "@/lib/integrations/email-provider";

export enum NotificationChannel {
  EMAIL = "email",
  SMS = "sms",
  WEBHOOK = "webhook",
  IN_APP = "in_app",
}

export enum NotificationType {
  ACTION_COMPLETED = "action_completed",
  DECISION_NEEDED = "decision_needed",
  CRITICAL_ALERT = "critical_alert",
  WEEKLY_DIGEST = "weekly_digest",
  ENGAGEMENT_UPDATE = "engagement_update",
  EXPERIMENT_RESULT = "experiment_result",
}

/**
 * Truthful channel/notification delivery states (P0-01):
 *  - pending        — not yet attempted
 *  - sent           — a real provider ACCEPTED the message (not proof of
 *                      final inbox/endpoint delivery)
 *  - delivered      — delivery is actually proven (IN_APP only today:
 *                      storage IS delivery; reserved for email/SMS/webhook
 *                      once a provider delivery-confirmation callback is
 *                      wired — not claimed today)
 *  - failed         — the provider explicitly rejected the message, or a
 *                      non-retryable error occurred (e.g. no recipient
 *                      address on file)
 *  - retryable       — a transient error occurred; safe to retry
 *  - not_configured — no real provider is wired for this channel; nothing
 *                      was sent, and this is disclosed rather than hidden
 *  - unsubscribed   — the recipient opted out of this notification type;
 *                      nothing was sent, by the recipient's own choice
 */
export const ChannelDeliveryStatusSchema = z.enum([
  "pending",
  "sent",
  "delivered",
  "failed",
  "retryable",
  "not_configured",
  "unsubscribed",
]);
export type ChannelDeliveryStatus = z.infer<typeof ChannelDeliveryStatusSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  recipientId: z.string(),
  actorId: z.string().optional(),
  type: z.string(),
  channels: z.array(z.string()),
  subject: z.string(),
  body: z.string(),
  templateId: z.string().optional(),
  templateData: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  sendAt: z.date(),
  status: ChannelDeliveryStatusSchema,
  deliveryResults: z.array(
    z.object({
      channel: z.string(),
      status: ChannelDeliveryStatusSchema,
      sentAt: z.date(),
      error: z.string().optional(),
      providerMessageId: z.string().optional(),
    })
  ),
  createdAt: z.date(),
  updatedAt: z.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.nativeEnum(NotificationType),
  channels: z.array(z.nativeEnum(NotificationChannel)),
  subjectTemplate: z.string(),
  bodyTemplate: z.string(),
  variables: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NotificationTemplate = z.infer<typeof NotificationTemplateSchema>;

export const NotificationPreferencesSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  channels: z.record(z.nativeEnum(NotificationChannel), z.boolean()),
  unsubscribedTypes: z.array(z.nativeEnum(NotificationType)).optional(),
  frequency: z.enum(["real_time", "daily_digest", "weekly_digest", "never"]).default("real_time"),
  quietHours: z
    .object({
      enabled: z.boolean(),
      startHour: z.number().min(0).max(23),
      endHour: z.number().min(0).max(23),
      timezone: z.string().default("UTC"),
    })
    .optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

// In-memory store for notifications
const notificationStore = new Map<string, Notification>();
const templateStore = new Map<string, NotificationTemplate>();
const preferencesStore = new Map<string, NotificationPreferences>();

type ChannelDeliveryResult = {
  channel: NotificationChannel;
  status: ChannelDeliveryStatus;
  sentAt: Date;
  error?: string;
  providerMessageId?: string;
};

function isRetryableProviderError(error: unknown): boolean {
  const msg = String(error);
  return /429|500|502|503|504|timeout|ECONNRESET|ETIMEDOUT|network/i.test(msg);
}

/**
 * Deliver a notification to one channel and report a TRUTHFUL outcome.
 * See the file header for exactly what each channel can and cannot prove.
 */
async function deliverToChannel(
  channel: NotificationChannel,
  notification: Pick<Notification, "workspaceId" | "recipientId" | "subject" | "body">
): Promise<ChannelDeliveryResult> {
  const sentAt = new Date();

  if (channel === NotificationChannel.IN_APP) {
    // Storing the notification record IS the delivery for in-app — there is
    // no external transport that can fail, so this is genuinely "delivered".
    return { channel, status: "delivered", sentAt };
  }

  if (channel === NotificationChannel.EMAIL) {
    const provider = getEmailProvider();
    if (!provider) {
      return {
        channel,
        status: "not_configured",
        sentAt,
        error: "RESEND_API_KEY is not configured — email delivery is unavailable",
      };
    }

    const recipient = await db.user
      .findFirst({
        where: {
          id: notification.recipientId,
          workspaceMemberships: { some: { workspaceId: notification.workspaceId, isActive: true } },
        },
        select: { email: true },
      })
      .catch(() => null);

    if (!recipient?.email) {
      return {
        channel,
        status: "failed",
        sentAt,
        error: "recipient has no email address in this workspace",
      };
    }

    try {
      const result = await provider.send({
        to: recipient.email,
        subject: notification.subject,
        html: notification.body,
      });
      // Resend accepted the message — that is proof of acceptance, not proof
      // of inbox delivery, so this is "sent", never "delivered".
      return { channel, status: "sent", sentAt, providerMessageId: result.id };
    } catch (error) {
      return {
        channel,
        status: isRetryableProviderError(error) ? "retryable" : "failed",
        sentAt,
        error: String(error),
      };
    }
  }

  // SMS and WEBHOOK: no real delivery provider is wired into this service.
  // Disclose that honestly instead of pretending the message went out.
  return {
    channel,
    status: "not_configured",
    sentAt,
    error: `No delivery provider is configured for channel "${channel}"`,
  };
}

function aggregateDeliveryStatus(results: ChannelDeliveryResult[]): ChannelDeliveryStatus {
  if (results.length === 0) return "not_configured";
  const statuses = new Set(results.map((r) => r.status));
  if (statuses.size === 1) return results[0]!.status;
  if (statuses.has("failed")) return "failed";
  if (statuses.has("retryable")) return "retryable";
  if (statuses.has("sent") || statuses.has("delivered")) return "sent";
  return "not_configured";
}

/**
 * Send a notification through specified channels
 */
export async function sendNotification(
  notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "deliveryResults" | "status" | "priority"> & { priority?: "low" | "normal" | "high" | "critical" }
): Promise<Notification> {
  const id = generateNotificationId();
  const now = new Date();

  const fullNotification = {
    ...notification,
    id,
    status: "pending",
    priority: notification.priority || "normal",
    createdAt: now,
    updatedAt: now,
    deliveryResults: [],
  };

  // Validate notification (simplified - full validation in production)
  const validated = fullNotification as Notification;

  // Get user preferences
  const prefKey = `${notification.workspaceId}:${notification.recipientId}`;
  const prefs = preferencesStore.get(prefKey);

  // Filter channels based on preferences
  const activeChannels = notification.channels.filter((channel) => {
    if (!prefs) return true; // No prefs = send to all
    const ch = channel as NotificationChannel;
    return prefs.channels[ch] ?? true; // Default to true if not explicitly set
  });

  // Check if notification type is unsubscribed — nothing is sent, and this
  // must not be reported as "sent" (it previously was).
  if (prefs?.unsubscribedTypes?.includes(notification.type as NotificationType)) {
    validated.status = "unsubscribed";
    validated.deliveryResults = [];
    validated.updatedAt = new Date();
    notificationStore.set(id, validated);
    return validated;
  }

  const deliveryResults: ChannelDeliveryResult[] = [];
  for (const channel of activeChannels) {
    const result = await deliverToChannel(channel as NotificationChannel, validated);
    deliveryResults.push(result);

    if (result.status === "sent" || result.status === "delivered") {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.NOTIFICATION_SENT,
        workspaceId: validated.workspaceId,
        actorId: validated.actorId,
        entityType: "notification",
        entityId: id,
        payload: {
          channel: result.channel,
          type: validated.type,
          status: result.status,
          providerMessageId: result.providerMessageId,
        },
        visibility: "internal",
      }).catch((auditError) => {
        logger.error("Failed to emit audit event for notification delivery", {
          notificationId: id,
          channel: result.channel,
          error: String(auditError),
        });
      });
    }
  }

  validated.deliveryResults = deliveryResults;
  validated.status = aggregateDeliveryStatus(deliveryResults);
  validated.updatedAt = new Date();

  notificationStore.set(id, validated);
  return validated;
}

/**
 * Get notification status
 */
export async function getNotification(notificationId: string): Promise<Notification | null> {
  return notificationStore.get(notificationId) || null;
}

/**
 * List notifications for a user
 */
export async function listUserNotifications(
  workspaceId: string,
  userId: string,
  options?: { limit?: number; offset?: number; status?: Notification["status"] }
): Promise<{ notifications: Notification[]; total: number }> {
  const allNotifications = Array.from(notificationStore.values()).filter(
    (n) => n.workspaceId === workspaceId && n.recipientId === userId
  );

  const filtered = options?.status ? allNotifications.filter((n) => n.status === options.status) : allNotifications;

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  return {
    notifications: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}

/**
 * Create or update notification template
 */
export async function saveTemplate(template: Omit<NotificationTemplate, "createdAt" | "updatedAt">): Promise<NotificationTemplate> {
  const now = new Date();
  const existing = templateStore.get(template.id);

  const fullTemplate: NotificationTemplate = {
    ...template,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  NotificationTemplateSchema.parse(fullTemplate);
  templateStore.set(template.id, fullTemplate);
  return fullTemplate;
}

/**
 * Get notification template
 */
export async function getTemplate(templateId: string): Promise<NotificationTemplate | null> {
  return templateStore.get(templateId) || null;
}

/**
 * Render notification from template
 */
export async function renderFromTemplate(
  templateId: string,
  data: Record<string, unknown>
): Promise<{ subject: string; body: string }> {
  const template = templateStore.get(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const subject = renderTemplate(template.subjectTemplate, data);
  const body = renderTemplate(template.bodyTemplate, data);

  return { subject, body };
}

/**
 * Simple template rendering (replace {{variable}} with values)
 */
function renderTemplate(template: string, data: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, "g"), String(value));
  }
  return result;
}

/**
 * Set user notification preferences
 */
export async function setPreferences(preferences: Omit<NotificationPreferences, "createdAt" | "updatedAt">): Promise<NotificationPreferences> {
  const now = new Date();
  const existing = preferencesStore.get(`${preferences.workspaceId}:${preferences.userId}`);

  const fullPrefs: NotificationPreferences = {
    ...preferences,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  NotificationPreferencesSchema.parse(fullPrefs);
  const key = `${preferences.workspaceId}:${preferences.userId}`;
  preferencesStore.set(key, fullPrefs);
  return fullPrefs;
}

/**
 * Get user notification preferences
 */
export async function getPreferences(workspaceId: string, userId: string): Promise<NotificationPreferences | null> {
  return preferencesStore.get(`${workspaceId}:${userId}`) || null;
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string): Promise<void> {
  const notif = notificationStore.get(notificationId);
  if (notif) {
    notif.updatedAt = new Date();
  }
}

/**
 * Generate a unique notification ID
 */
function generateNotificationId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `notif_${timestamp}_${randomPart}`;
}

/**
 * Clear all notifications (for testing)
 */
export function clearAllNotifications(): void {
  notificationStore.clear();
  templateStore.clear();
  preferencesStore.clear();
}
