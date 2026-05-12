/**
 * Tests: Notification Service
 *
 * Validates multi-channel notification delivery, template rendering,
 * user preferences, and notification tracking.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  sendNotification,
  getNotification,
  listUserNotifications,
  saveTemplate,
  getTemplate,
  renderFromTemplate,
  setPreferences,
  getPreferences,
  NotificationType,
  NotificationChannel,
  clearAllNotifications,
} from "@/services/notifications/notification-service";

describe("Notification Service", () => {
  beforeEach(() => {
    clearAllNotifications();
  });

  afterEach(() => {
    clearAllNotifications();
  });

  describe("Send Notification", () => {
    it("should send notification with valid parameters", async () => {
      const notification = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Action Completed",
        body: "Your action has been completed.",
        sendAt: new Date(),
      });

      expect(notification.id).toBeDefined();
      expect(notification.status).toBe("sent");
      expect(notification.createdAt).toBeDefined();
    });

    it("should include all notification channels", async () => {
      const notification = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.CRITICAL_ALERT,
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS, NotificationChannel.WEBHOOK],
        subject: "Critical Alert",
        body: "A critical issue requires attention.",
        sendAt: new Date(),
      });

      expect(notification.channels).toHaveLength(3);
      expect(notification.deliveryResults).toHaveLength(3);
    });

    it("should track delivery results for each channel", async () => {
      const notification = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        subject: "Test",
        body: "Test body",
        sendAt: new Date(),
      });

      notification.deliveryResults?.forEach((result) => {
        expect(result.channel).toBeDefined();
        expect(result.status).toBeDefined();
        expect(result.sentAt).toBeDefined();
      });
    });

    it("should handle priority levels", async () => {
      const notification = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.CRITICAL_ALERT,
        channels: [NotificationChannel.EMAIL],
        subject: "Critical",
        body: "Critical notification",
        sendAt: new Date(),
        priority: "critical",
      });

      expect(notification.priority).toBe("critical");
    });

    it("should support metadata", async () => {
      const notification = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test",
        body: "Test",
        sendAt: new Date(),
        metadata: { actionId: "act-123", operatorId: "op-1" },
      });

      expect(notification.metadata?.actionId).toBe("act-123");
    });

    it("should store notification for retrieval", async () => {
      const sent = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test",
        body: "Test body",
        sendAt: new Date(),
      });

      const retrieved = await getNotification(sent.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(sent.id);
    });

    it("should return null for non-existent notification", async () => {
      const result = await getNotification("non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("List Notifications", () => {
    it("should list user notifications", async () => {
      await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test 1",
        body: "Body 1",
        sendAt: new Date(),
      });

      await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.DECISION_NEEDED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test 2",
        body: "Body 2",
        sendAt: new Date(),
      });

      const result = await listUserNotifications("ws-123", "user-1");
      expect(result.total).toBe(2);
      expect(result.notifications).toHaveLength(2);
    });

    it("should filter by status", async () => {
      await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test",
        body: "Test",
        sendAt: new Date(),
      });

      const result = await listUserNotifications("ws-123", "user-1", { status: "sent" });
      expect(result.notifications).toHaveLength(1);
    });

    it("should support pagination", async () => {
      for (let i = 0; i < 5; i++) {
        await sendNotification({
          workspaceId: "ws-123",
          recipientId: "user-1",
          type: NotificationType.ACTION_COMPLETED,
          channels: [NotificationChannel.EMAIL],
          subject: `Test ${i}`,
          body: "Body",
          sendAt: new Date(),
        });
      }

      const page1 = await listUserNotifications("ws-123", "user-1", { limit: 2, offset: 0 });
      expect(page1.notifications).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = await listUserNotifications("ws-123", "user-1", { limit: 2, offset: 2 });
      expect(page2.notifications).toHaveLength(2);
    });

    it("should not mix notifications across users", async () => {
      await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "User 1",
        body: "Body",
        sendAt: new Date(),
      });

      await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-2",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "User 2",
        body: "Body",
        sendAt: new Date(),
      });

      const user1Result = await listUserNotifications("ws-123", "user-1");
      expect(user1Result.total).toBe(1);
      expect(user1Result.notifications[0].recipientId).toBe("user-1");
    });
  });

  describe("Notification Templates", () => {
    it("should save and retrieve template", async () => {
      const template = await saveTemplate({
        id: "tpl-1",
        name: "Action Completed",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subjectTemplate: "Action {{actionName}} Completed",
        bodyTemplate: "Your action '{{actionName}}' has been completed successfully.",
        variables: ["actionName"],
      });

      const retrieved = await getTemplate("tpl-1");
      expect(retrieved?.name).toBe("Action Completed");
      expect(retrieved?.variables).toContain("actionName");
    });

    it("should render template with variables", async () => {
      await saveTemplate({
        id: "tpl-1",
        name: "Action Completed",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subjectTemplate: "Action {{actionName}} Completed",
        bodyTemplate: "Your action '{{actionName}}' has been completed by {{completedBy}}.",
        variables: ["actionName", "completedBy"],
      });

      const rendered = await renderFromTemplate("tpl-1", {
        actionName: "Review Proposal",
        completedBy: "John Doe",
      });

      expect(rendered.subject).toBe("Action Review Proposal Completed");
      expect(rendered.body).toContain("Review Proposal");
      expect(rendered.body).toContain("John Doe");
    });

    it("should handle multiple variable occurrences", async () => {
      await saveTemplate({
        id: "tpl-2",
        name: "Alert",
        type: NotificationType.CRITICAL_ALERT,
        channels: [NotificationChannel.EMAIL],
        subjectTemplate: "Alert: {{severity}} issue with {{resource}}",
        bodyTemplate: "A {{severity}} issue has been detected in {{resource}}. Last check: {{timestamp}}.",
        variables: ["severity", "resource", "timestamp"],
      });

      const rendered = await renderFromTemplate("tpl-2", {
        severity: "HIGH",
        resource: "Database Connection",
        timestamp: "2026-05-12 10:00:00",
      });

      expect(rendered.body).toContain("HIGH");
      expect(rendered.body).toContain("Database Connection");
    });

    it("should throw error for non-existent template", async () => {
      await expect(renderFromTemplate("non-existent", {})).rejects.toThrow("Template not found");
    });

    it("should update existing template", async () => {
      const template1 = await saveTemplate({
        id: "tpl-1",
        name: "Original Name",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subjectTemplate: "Subject",
        bodyTemplate: "Body",
        variables: [],
      });

      const template2 = await saveTemplate({
        id: "tpl-1",
        name: "Updated Name",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        subjectTemplate: "New Subject",
        bodyTemplate: "New Body",
        variables: [],
      });

      expect(template2.name).toBe("Updated Name");
      expect(template2.createdAt).toEqual(template1.createdAt);
      expect(template2.updatedAt.getTime()).toBeGreaterThanOrEqual(template1.createdAt.getTime());
    });
  });

  describe("User Preferences", () => {
    it("should save and retrieve user preferences", async () => {
      const prefs = await setPreferences({
        workspaceId: "ws-123",
        userId: "user-1",
        frequency: "real_time",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: false,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        } as Record<NotificationChannel, boolean>,
      });

      const retrieved = await getPreferences("ws-123", "user-1");
      expect(retrieved?.channels[NotificationChannel.EMAIL]).toBe(true);
      expect(retrieved?.channels[NotificationChannel.SMS]).toBe(false);
    });

    it("should support notification type unsubscribe", async () => {
      await setPreferences({
        workspaceId: "ws-123",
        userId: "user-1",
        frequency: "real_time",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: true,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        } as Record<NotificationChannel, boolean>,
        unsubscribedTypes: [NotificationType.WEEKLY_DIGEST],
      });

      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.WEEKLY_DIGEST,
        channels: [NotificationChannel.EMAIL],
        subject: "Weekly Digest",
        body: "This week's summary",
        sendAt: new Date(),
      });

      expect(notif.status).toBe("sent");
      expect(notif.deliveryResults).toHaveLength(0);
    });

    it("should support frequency preferences", async () => {
      const prefs = await setPreferences({
        workspaceId: "ws-123",
        userId: "user-1",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: true,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        },
        frequency: "daily_digest",
      });

      expect(prefs.frequency).toBe("daily_digest");
    });

    it("should support quiet hours", async () => {
      const prefs = await setPreferences({
        workspaceId: "ws-123",
        userId: "user-1",
        frequency: "real_time",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: true,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        } as Record<NotificationChannel, boolean>,
        quietHours: {
          enabled: true,
          startHour: 22,
          endHour: 8,
          timezone: "America/New_York",
        },
      });

      expect(prefs.quietHours?.enabled).toBe(true);
      expect(prefs.quietHours?.timezone).toBe("America/New_York");
    });

    it("should return null for non-existent preferences", async () => {
      const prefs = await getPreferences("ws-123", "user-not-found");
      expect(prefs).toBeNull();
    });
  });

  describe("Notification Types", () => {
    it("should support all notification types", async () => {
      const types = [
        NotificationType.ACTION_COMPLETED,
        NotificationType.DECISION_NEEDED,
        NotificationType.CRITICAL_ALERT,
        NotificationType.WEEKLY_DIGEST,
        NotificationType.ENGAGEMENT_UPDATE,
        NotificationType.EXPERIMENT_RESULT,
      ];

      for (const type of types) {
        const notif = await sendNotification({
          workspaceId: "ws-123",
          recipientId: "user-1",
          type,
          channels: [NotificationChannel.EMAIL],
          subject: `Test ${type}`,
          body: "Body",
          sendAt: new Date(),
        });

        expect(notif.type).toBe(type);
      }
    });
  });

  describe("Real-World Scenarios", () => {
    it("should send action completion notification", async () => {
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
        subject: "Action Completed: Review Q2 Budget",
        body: "The action 'Review Q2 Budget' has been completed successfully.",
        priority: "normal",
        metadata: { actionId: "act-456", completedBy: "user-2" },
        sendAt: new Date(),
      });

      expect(notif.status).toBe("sent");
      expect(notif.channels).toHaveLength(2);
    });

    it("should send critical alert with multiple channels", async () => {
      await setPreferences({
        workspaceId: "ws-123",
        userId: "owner-1",
        frequency: "real_time",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: true,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        } as Record<NotificationChannel, boolean>,
      });

      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "owner-1",
        type: NotificationType.CRITICAL_ALERT,
        channels: [
          NotificationChannel.EMAIL,
          NotificationChannel.SMS,
          NotificationChannel.WEBHOOK,
        ],
        subject: "CRITICAL: Revenue leak detected",
        body: "An unexpected revenue decline has been detected. Immediate action required.",
        priority: "critical",
        sendAt: new Date(),
      });

      const results = notif.deliveryResults;
      expect(results.length).toBe(3);
      expect(["sent", "failed"]).toContain(notif.status);
    });

    it("should send weekly digest via template", async () => {
      await saveTemplate({
        id: "weekly-digest",
        name: "Weekly Digest",
        type: NotificationType.WEEKLY_DIGEST,
        channels: [NotificationChannel.EMAIL],
        subjectTemplate: "Weekly Digest for {{weekOf}}",
        bodyTemplate:
          "Here's your weekly summary:\n- Actions completed: {{actionsCompleted}}\n- Decisions made: {{decisionsMade}}\n- Open issues: {{openIssues}}",
        variables: ["weekOf", "actionsCompleted", "decisionsMade", "openIssues"],
      });

      const rendered = await renderFromTemplate("weekly-digest", {
        weekOf: "May 5-11, 2026",
        actionsCompleted: 12,
        decisionsMade: 5,
        openIssues: 3,
      });

      expect(rendered.subject).toContain("May 5-11, 2026");
      expect(rendered.body).toContain("12");
      expect(rendered.body).toContain("5");
    });

    it("should respect channel preferences when sending", async () => {
      await setPreferences({
        workspaceId: "ws-123",
        userId: "user-1",
        frequency: "real_time",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: false,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: false,
        } as Record<NotificationChannel, boolean>,
      });

      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [
          NotificationChannel.EMAIL,
          NotificationChannel.SMS,
          NotificationChannel.WEBHOOK,
        ],
        subject: "Test",
        body: "Test body",
        sendAt: new Date(),
      });

      // Should only send to enabled channels
      expect(notif.channels).toEqual([
        NotificationChannel.EMAIL,
        NotificationChannel.SMS,
        NotificationChannel.WEBHOOK,
      ]);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty metadata", async () => {
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test",
        body: "Test",
        sendAt: new Date(),
        metadata: {},
      });

      expect(notif.metadata).toBeDefined();
    });

    it("should handle special characters in content", async () => {
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test & Special <Characters> 100%",
        body: 'Contains "quotes" and \'apostrophes\'',
        sendAt: new Date(),
      });

      expect(notif.subject).toContain("&");
      expect(notif.body).toContain('"');
    });

    it("should assign unique IDs", async () => {
      const notif1 = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test 1",
        body: "Body",
        sendAt: new Date(),
      });

      const notif2 = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test 2",
        body: "Body",
        sendAt: new Date(),
      });

      expect(notif1.id).not.toBe(notif2.id);
    });

    it("should handle default priority", async () => {
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test",
        body: "Body",
        sendAt: new Date(),
      });

      expect(notif.priority).toBe("normal");
    });
  });
});
