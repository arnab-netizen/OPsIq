/**
 * Notification Service
 *
 * Provides multi-channel notifications (email, SMS, webhook) with templates
 * and delivery tracking. Mock-backed for non-DB environments.
 */

import { z } from "zod";
import { createHash } from "crypto";

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

export const NotificationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  recipientId: z.string(),
  type: z.string(),
  channels: z.array(z.string()),
  subject: z.string(),
  body: z.string(),
  templateId: z.string().optional(),
  templateData: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  sendAt: z.date(),
  status: z.enum(["pending", "sending", "sent", "failed", "bounced"]),
  deliveryResults: z.array(
    z.object({
      channel: z.string(),
      status: z.enum(["success", "failed", "bounced", "unsubscribed"]),
      sentAt: z.date(),
      error: z.string().optional(),
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

// Configurable channel delivery simulator for testing
type ChannelDeliverySimulator = (channel: NotificationChannel, recipientId: string) => boolean | Promise<boolean>;

const defaultChannelDeliverySimulator: ChannelDeliverySimulator = () => {
  return Math.random() > 0.05;
};

let channelDeliverySimulator: ChannelDeliverySimulator = defaultChannelDeliverySimulator;

export function _setChannelDeliverySimulatorForTesting(simulator: ChannelDeliverySimulator): void {
  channelDeliverySimulator = simulator;
}

export function _resetChannelDeliverySimulatorForTesting(): void {
  channelDeliverySimulator = defaultChannelDeliverySimulator;
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

  // Check if notification type is unsubscribed
  if (prefs?.unsubscribedTypes?.includes(notification.type as NotificationType)) {
    validated.status = "sent";
    validated.deliveryResults = [];
    validated.updatedAt = new Date();
    notificationStore.set(id, validated);
    return validated;
  }

  // Simulate delivery through each channel
  const deliveryResults: Array<{
    channel: NotificationChannel;
    status: "success" | "failed" | "bounced" | "unsubscribed";
    sentAt: Date;
    error?: string;
  }> = [];
  for (const channel of activeChannels) {
    const result = await simulateChannelDelivery(channel as NotificationChannel, validated);
    deliveryResults.push(result);
  }

  validated.deliveryResults = deliveryResults;
  validated.status = deliveryResults.every((r) => r.status === "success") ? "sent" : "failed";
  validated.updatedAt = new Date();

  notificationStore.set(id, validated);
  return validated;
}

/**
 * Simulate delivery to a specific channel
 */
async function simulateChannelDelivery(
  channel: NotificationChannel,
  notification: Notification
): Promise<{
  channel: NotificationChannel;
  status: "success" | "failed" | "bounced" | "unsubscribed";
  sentAt: Date;
  error?: string;
}> {
  // Use configurable simulator (default: 95% success rate)
  const success = await channelDeliverySimulator(channel, notification.recipientId);

  if (!success) {
    return {
      channel,
      status: "failed",
      sentAt: new Date(),
      error: "Simulated delivery failure",
    };
  }

  // Check for unsubscribe simulation based on recipient ID
  if (notification.recipientId.includes("unsubscribed")) {
    return {
      channel,
      status: "unsubscribed",
      sentAt: new Date(),
    };
  }

  return {
    channel,
    status: "success",
    sentAt: new Date(),
  };
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
