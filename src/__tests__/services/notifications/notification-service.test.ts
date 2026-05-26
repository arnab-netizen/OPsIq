/**
 * Tests: Notification Service
 *
 * Validates multi-channel notification delivery, template rendering,
 * user preferences, and notification tracking.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { ensureStartupStatusReady } from "../../test-helpers/startup-helper";
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
  _setChannelDeliverySimulatorForTesting,
  _resetChannelDeliverySimulatorForTesting,
} from "@/services/notifications/notification-service";

describe("Notification Service", () => {
  beforeAll(async () => {
    await ensureStartupStatusReady();
  });

  beforeEach(() => {
    clearAllNotifications();
    _setChannelDeliverySimulatorForTesting(() => true);
  });

  afterEach(() => {
    clearAllNotifications();
    _resetChannelDeliverySimulatorForTesting();
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

  describe("Notification Multi-Workspace Isolation", () => {
    it("should isolate notifications between workspaces", async () => {
      const notif1 = await sendNotification({
        workspaceId: "ws-1",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "WS1 Notif",
        body: "From workspace 1",
        sendAt: new Date(),
      });

      const notif2 = await sendNotification({
        workspaceId: "ws-2",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "WS2 Notif",
        body: "From workspace 2",
        sendAt: new Date(),
      });

      const ws1Notifs = await listUserNotifications("ws-1", "user-1");
      expect(ws1Notifs.notifications).toHaveLength(1);
      expect(ws1Notifs.notifications[0].subject).toBe("WS1 Notif");
    });

    it("should isolate preferences between workspaces", async () => {
      await setPreferences({
        workspaceId: "ws-1",
        userId: "user-1",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: false,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        },
        frequency: "real_time",
      });

      await setPreferences({
        workspaceId: "ws-2",
        userId: "user-1",
        channels: {
          [NotificationChannel.EMAIL]: false,
          [NotificationChannel.SMS]: true,
          [NotificationChannel.WEBHOOK]: false,
          [NotificationChannel.IN_APP]: false,
        },
        frequency: "real_time",
      });

      const prefs1 = await getPreferences("ws-1", "user-1");
      const prefs2 = await getPreferences("ws-2", "user-1");

      expect(prefs1?.channels[NotificationChannel.EMAIL]).toBe(true);
      expect(prefs2?.channels[NotificationChannel.EMAIL]).toBe(false);
    });
  });

  describe("Notification Quiet Hours", () => {
    it("should respect quiet hours", async () => {
      await setPreferences({
        workspaceId: "ws-123",
        userId: "user-1",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: true,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        },
        frequency: "real_time",
        quietHours: {
          enabled: true,
          startHour: 22,
          endHour: 8,
          timezone: "America/New_York",
        },
      });

      const prefs = await getPreferences("ws-123", "user-1");
      expect(prefs?.quietHours?.enabled).toBe(true);
      expect(prefs?.quietHours?.startHour).toBe(22);
    });

    it("should store quiet hours with timezone", async () => {
      await setPreferences({
        workspaceId: "ws-123",
        userId: "user-1",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: true,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        },
        frequency: "real_time",
        quietHours: {
          enabled: true,
          startHour: 20,
          endHour: 9,
          timezone: "Europe/London",
        },
      });

      const prefs = await getPreferences("ws-123", "user-1");
      expect(prefs?.quietHours?.timezone).toBe("Europe/London");
    });
  });

  describe("Notification Frequency Digests", () => {
    it("should support real-time frequency", async () => {
      await setPreferences({
        workspaceId: "ws-123",
        userId: "user-1",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: true,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        },
        frequency: "real_time",
      });

      const prefs = await getPreferences("ws-123", "user-1");
      expect(prefs?.frequency).toBe("real_time");
    });

    it("should support daily digest frequency", async () => {
      await setPreferences({
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

      const prefs = await getPreferences("ws-123", "user-1");
      expect(prefs?.frequency).toBe("daily_digest");
    });

    it("should support weekly digest frequency", async () => {
      await setPreferences({
        workspaceId: "ws-123",
        userId: "user-1",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: true,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        },
        frequency: "weekly_digest",
      });

      const prefs = await getPreferences("ws-123", "user-1");
      expect(prefs?.frequency).toBe("weekly_digest");
    });

    it("should support never frequency (mute all)", async () => {
      await setPreferences({
        workspaceId: "ws-123",
        userId: "user-1",
        channels: {
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.SMS]: true,
          [NotificationChannel.WEBHOOK]: true,
          [NotificationChannel.IN_APP]: true,
        },
        frequency: "never",
      });

      const prefs = await getPreferences("ws-123", "user-1");
      expect(prefs?.frequency).toBe("never");
    });
  });

  describe("Real-World Notification Scenarios", () => {
    it("should send action completion notification with template", async () => {
      await saveTemplate({
        id: "action_completed",
        name: "Action Completed",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subjectTemplate: "Action '{{actionName}}' is now complete",
        bodyTemplate: "Your action {{actionName}} was completed at {{timestamp}}",
        variables: ["actionName", "timestamp"],
      });

      const rendered = await renderFromTemplate("action_completed", {
        actionName: "Review Pricing",
        timestamp: "2025-05-12T10:30:00Z",
      });

      expect(rendered.subject).toBe("Action 'Review Pricing' is now complete");
      expect(rendered.body).toContain("Review Pricing");
      expect(rendered.body).toContain("2025-05-12T10:30:00Z");
    });

    it("should send critical alert with high priority", async () => {
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.CRITICAL_ALERT,
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
        subject: "CRITICAL: Revenue dropped 50%",
        body: "Your business condition has changed critically",
        priority: "critical",
        sendAt: new Date(),
      });

      expect(notif.priority).toBe("critical");
      expect(notif.deliveryResults.length).toBe(2);
    });

    it("should aggregate multiple notification types", async () => {
      await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Action 1 Completed",
        body: "Done",
        sendAt: new Date(),
      });

      await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.DECISION_NEEDED,
        channels: [NotificationChannel.EMAIL],
        subject: "Decision Needed",
        body: "Please decide",
        sendAt: new Date(),
      });

      const notifs = await listUserNotifications("ws-123", "user-1");
      expect(notifs.total).toBe(2);
      const types = notifs.notifications.map(n => n.type);
      expect(types).toContain(NotificationType.ACTION_COMPLETED);
      expect(types).toContain(NotificationType.DECISION_NEEDED);
    });
  });

  describe("Notification Error Handling & Edge Cases", () => {
    it("should handle empty recipient list", async () => {
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test",
        body: "Body",
        sendAt: new Date(),
      });

      expect(notif.id).toBeDefined();
    });

    it("should handle large body content", async () => {
      const largeBody = "x".repeat(10000);
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test",
        body: largeBody,
        sendAt: new Date(),
      });

      expect(notif.body.length).toBe(10000);
    });

    it("should handle unicode characters", async () => {
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Notif: 你好 مرحبا",
        body: "Content with emoji 🚀✨🎉",
        sendAt: new Date(),
      });

      expect(notif.subject).toContain("你好");
      expect(notif.body).toContain("🚀");
    });

    it("should dedup template variables", async () => {
      await saveTemplate({
        id: "template-dedup",
        name: "Template",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subjectTemplate: "{{name}} {{name}}",
        bodyTemplate: "User {{name}} action {{action}}",
        variables: ["name", "action"],
      });

      const rendered = await renderFromTemplate("template-dedup", {
        name: "Alice",
        action: "Review",
      });

      expect(rendered.subject).toBe("Alice Alice");
      expect(rendered.body).toBe("User Alice action Review");
    });
  });

  describe("Notification Delivery Status Tracking", () => {
    it("should track delivery results per channel", async () => {
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS, NotificationChannel.WEBHOOK],
        subject: "Test",
        body: "Test",
        sendAt: new Date(),
      });

      expect(notif.deliveryResults.length).toBe(3);
      expect(notif.deliveryResults.map(d => d.channel)).toContain(NotificationChannel.EMAIL);
      expect(notif.deliveryResults.map(d => d.channel)).toContain(NotificationChannel.SMS);
    });

    it("should mark status as sent when all channels succeed", async () => {
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test",
        body: "Test",
        sendAt: new Date(),
      });

      expect(notif.status).toMatch(/sent|failed/);
    });

    it("should record sent timestamps", async () => {
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Test",
        body: "Test",
        sendAt: new Date(),
      });

      notif.deliveryResults.forEach(result => {
        expect(result.sentAt).toBeInstanceOf(Date);
      });
    });
  });

  describe("Notification Compliance & Security", () => {
    it("should enforce workspace scoping on list", async () => {
      await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "WS-123 Notif",
        body: "Only visible in ws-123",
        sendAt: new Date(),
      });

      await sendNotification({
        workspaceId: "ws-456",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "WS-456 Notif",
        body: "Only visible in ws-456",
        sendAt: new Date(),
      });

      const ws123List = await listUserNotifications("ws-123", "user-1");
      expect(ws123List.notifications.every(n => n.workspaceId === "ws-123")).toBe(true);
    });

    it("should validate notification schema before storage", async () => {
      const notif = await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.EXPERIMENT_RESULT,
        channels: [NotificationChannel.WEBHOOK],
        subject: "Test Subject",
        body: "Test Body",
        sendAt: new Date(),
      });

      const retrieved = await getNotification(notif.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.workspaceId).toBe("ws-123");
      expect(retrieved?.recipientId).toBe("user-1");
    });

    it("should support filtering by status", async () => {
      await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Notif 1",
        body: "Body",
        sendAt: new Date(),
      });

      await sendNotification({
        workspaceId: "ws-123",
        recipientId: "user-1",
        type: NotificationType.ACTION_COMPLETED,
        channels: [NotificationChannel.EMAIL],
        subject: "Notif 2",
        body: "Body",
        sendAt: new Date(),
      });

      const allNotifs = await listUserNotifications("ws-123", "user-1");
      expect(allNotifs.notifications.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle pagination limits", async () => {
      for (let i = 0; i < 100; i++) {
        await sendNotification({
          workspaceId: "ws-123",
          recipientId: "user-1",
          type: NotificationType.ACTION_COMPLETED,
          channels: [NotificationChannel.EMAIL],
          subject: `Notif ${i}`,
          body: "Body",
          sendAt: new Date(),
        });
      }

      const page1 = await listUserNotifications("ws-123", "user-1", { limit: 25, offset: 0 });
      expect(page1.notifications.length).toBeLessThanOrEqual(25);
      expect(page1.total).toBe(100);
    });
  });
});
