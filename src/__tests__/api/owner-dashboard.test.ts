import { describe, it, expect, beforeEach } from "vitest";
import { calculateWorkspaceHealth, summarizeActionQueue, buildOwnerDashboardView, DashboardServiceError } from "@/services/owner-mode/dashboard.service";
import { HealthStatus, ActionQueuePriority, KPISummary } from "@/domain/owner-mode/owner-dashboard";

describe("Owner Dashboard Service", () => {
  const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";
  const mockUserId = "550e8400-e29b-41d4-a716-446655440001";
  const context = { workspaceId: mockWorkspaceId, userId: mockUserId };

  describe("calculateWorkspaceHealth", () => {
    it("should return healthy status with all engagements healthy", async () => {
      const snapshots = [
        { engagementId: "e1", status: "healthy" as const, kpiOnTrackCount: 8, kpiTotalCount: 10 },
        { engagementId: "e2", status: "healthy" as const, kpiOnTrackCount: 9, kpiTotalCount: 10 },
      ];

      const health = await calculateWorkspaceHealth(context, snapshots);

      expect(health.workspaceId).toBe(mockWorkspaceId);
      expect(health.overallStatus).toBe(HealthStatus.IMPROVING);
      expect(health.healthyEngagements).toBe(2);
      expect(health.criticalEngagements).toBe(0);
    });

    it("should return at_risk status with multiple at-risk engagements", async () => {
      const snapshots = [
        { engagementId: "e1", status: "at_risk" as const, kpiOnTrackCount: 4, kpiTotalCount: 10 },
        { engagementId: "e2", status: "at_risk" as const, kpiOnTrackCount: 5, kpiTotalCount: 10 },
        { engagementId: "e3", status: "at_risk" as const, kpiOnTrackCount: 3, kpiTotalCount: 10 },
      ];

      const health = await calculateWorkspaceHealth(context, snapshots);

      expect(health.overallStatus).toBe(HealthStatus.AT_RISK);
      expect(health.atRiskEngagements).toBe(3);
    });

    it("should return critical status if any engagement is critical", async () => {
      const snapshots = [
        { engagementId: "e1", status: "healthy" as const, kpiOnTrackCount: 9, kpiTotalCount: 10 },
        { engagementId: "e2", status: "critical" as const, kpiOnTrackCount: 2, kpiTotalCount: 10 },
      ];

      const health = await calculateWorkspaceHealth(context, snapshots);

      expect(health.overallStatus).toBe(HealthStatus.CRITICAL);
      expect(health.criticalEngagements).toBe(1);
      expect(health.topRisks.length).toBeGreaterThan(0);
    });

    it("should aggregate KPI metrics correctly", async () => {
      const snapshots = [
        { engagementId: "e1", status: "healthy" as const, kpiOnTrackCount: 8, kpiTotalCount: 10 },
        { engagementId: "e2", status: "healthy" as const, kpiOnTrackCount: 7, kpiTotalCount: 10 },
      ];

      const health = await calculateWorkspaceHealth(context, snapshots);

      expect(health.activeKPICount).toBe(20);
      expect(health.onTrackKPICount).toBe(15);
    });

    it("should identify top risks when engagements are critical/at-risk", async () => {
      const snapshots = [
        { engagementId: "e1", status: "critical" as const, kpiOnTrackCount: 1, kpiTotalCount: 10 },
        { engagementId: "e2", status: "critical" as const, kpiOnTrackCount: 2, kpiTotalCount: 10 },
        { engagementId: "e3", status: "at_risk" as const, kpiOnTrackCount: 5, kpiTotalCount: 10 },
      ];

      const health = await calculateWorkspaceHealth(context, snapshots);

      expect(health.topRisks.length).toBeGreaterThan(0);
      expect(health.topRisks.some((r) => r.includes("critical"))).toBe(true);
    });

    it("should generate recommended actions based on status", async () => {
      const snapshots = [
        { engagementId: "e1", status: "critical" as const, kpiOnTrackCount: 1, kpiTotalCount: 10 },
      ];

      const health = await calculateWorkspaceHealth(context, snapshots);

      expect(health.recommendedActions.length).toBeGreaterThan(0);
      expect(health.recommendedActions[0]).toMatch(/emergency|triage/i);
    });
  });

  describe("summarizeActionQueue", () => {
    it("should aggregate actions by status and priority", async () => {
      const actions = [
        {
          id: "a1",
          engagementId: "e1",
          name: "Task 1",
          status: "in_progress",
          priority: "high",
          blockerCount: 0,
        },
        {
          id: "a2",
          engagementId: "e1",
          name: "Task 2",
          status: "pending",
          priority: "critical",
          blockerCount: 1,
        },
      ];

      const summary = await summarizeActionQueue(context, actions);

      expect(summary.totalCount).toBe(2);
      expect(summary.byStatus.in_progress).toBe(1);
      expect(summary.byPriority.high).toBe(1);
      expect(summary.byPriority.critical).toBe(1);
    });

    it("should identify overdue actions", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const actions = [
        {
          id: "a1",
          engagementId: "e1",
          name: "Overdue Task",
          status: "pending",
          priority: "high",
          dueDate: yesterday,
          blockerCount: 0,
        },
      ];

      const summary = await summarizeActionQueue(context, actions);

      expect(summary.overdueCount).toBe(1);
    });

    it("should identify critical actions", async () => {
      const actions = [
        {
          id: "a1",
          engagementId: "e1",
          name: "Critical Task",
          status: "pending",
          priority: "critical",
          blockerCount: 2,
        },
      ];

      const summary = await summarizeActionQueue(context, actions);

      expect(summary.criticalActions.length).toBe(1);
      expect(summary.criticalActions[0].priority).toBe("critical");
    });

    it("should count blocked actions correctly", async () => {
      const actions = [
        { id: "a1", engagementId: "e1", name: "Task 1", status: "pending", priority: "high", blockerCount: 2 },
        { id: "a2", engagementId: "e1", name: "Task 2", status: "pending", priority: "high", blockerCount: 1 },
      ];

      const summary = await summarizeActionQueue(context, actions);

      expect(summary.blockedCount).toBe(3);
    });

    it("should include actions due this week in dueThisWeek", async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();

      const actions = [
        {
          id: "a1",
          engagementId: "e1",
          name: "Due Soon",
          status: "pending",
          priority: "high",
          dueDate: tomorrow,
          blockerCount: 0,
        },
      ];

      const summary = await summarizeActionQueue(context, actions);

      expect(summary.dueThisWeek.length).toBe(1);
    });
  });

  describe("buildOwnerDashboardView", () => {
    it("should construct complete dashboard view", async () => {
      const config = {
        workspaceId: mockWorkspaceId,
        ownerId: mockUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        showCompletedActions: true,
        daysOfHistoryVisible: 30,
        actionPriorityThreshold: ActionQueuePriority.MEDIUM,
        healthStatusThreshold: HealthStatus.AT_RISK,
        enableBulkActions: true,
        enableAdvancedFiltering: true,
      };

      const health = {
        workspaceId: mockWorkspaceId,
        assessedAt: new Date().toISOString(),
        overallStatus: HealthStatus.HEALTHY,
        engagementCount: 1,
        healthyEngagements: 1,
        atRiskEngagements: 0,
        criticalEngagements: 0,
        activeKPICount: 10,
        onTrackKPICount: 8,
        actionQueueSize: 5,
        overdueActionCount: 0,
        averageExecutionCertainty: 75,
        engagementHealthSnapshots: [],
        topRisks: [],
        recommendedActions: [],
      };

      const actionQueue = {
        workspaceId: mockWorkspaceId,
        totalCount: 5,
        byStatus: { pending: 3, in_progress: 2 },
        byPriority: { high: 2, medium: 3 },
        overdueCount: 0,
        blockedCount: 0,
        completedThisWeek: 1,
        averageCompletionDays: 7,
        criticalActions: [],
        dueThisWeek: [],
      };

      const kpis: KPISummary[] = [];

      const view = await buildOwnerDashboardView(context, config, health, actionQueue, kpis);

      expect(view.workspaceId).toBe(mockWorkspaceId);
      expect(view.config).toEqual(config);
      expect(view.health).toEqual(health);
      expect(view.actionQueue).toEqual(actionQueue);
      expect(view.recentKPIs).toEqual([]);
    });

    it("should fail validation if view data is invalid", async () => {
      const invalidConfig = {
        workspaceId: "invalid-uuid",
        ownerId: mockUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        showCompletedActions: true,
        daysOfHistoryVisible: 0,
        actionPriorityThreshold: ActionQueuePriority.MEDIUM,
        healthStatusThreshold: HealthStatus.AT_RISK,
        enableBulkActions: true,
        enableAdvancedFiltering: true,
      };

      const health = {
        workspaceId: mockWorkspaceId,
        assessedAt: new Date().toISOString(),
        overallStatus: HealthStatus.HEALTHY,
        engagementCount: 1,
        healthyEngagements: 1,
        atRiskEngagements: 0,
        criticalEngagements: 0,
        activeKPICount: 10,
        onTrackKPICount: 8,
        actionQueueSize: 5,
        overdueActionCount: 0,
        averageExecutionCertainty: 75,
        engagementHealthSnapshots: [],
        topRisks: [],
        recommendedActions: [],
      };

      const actionQueue = {
        workspaceId: mockWorkspaceId,
        totalCount: 5,
        byStatus: {},
        byPriority: {},
        overdueCount: 0,
        blockedCount: 0,
        completedThisWeek: 0,
        averageCompletionDays: 0,
        criticalActions: [],
        dueThisWeek: [],
      };

      try {
        await buildOwnerDashboardView(context, invalidConfig as any, health, actionQueue, []);
        expect.fail("Should have thrown validation error");
      } catch (error) {
        expect(error).toBeInstanceOf(DashboardServiceError);
        expect((error as DashboardServiceError).code).toBe("VALIDATION_FAILED");
      }
    });
  });

  describe("DashboardServiceError", () => {
    it("should construct error with code and message", () => {
      const error = new DashboardServiceError("TEST_ERROR", "Test error message");

      expect(error.code).toBe("TEST_ERROR");
      expect(error.message).toBe("Test error message");
      expect(error).toBeInstanceOf(Error);
    });

    it("DashboardServiceError code is accessible as string", () => {
      const error = new DashboardServiceError("MY_CODE", "msg");
      expect(typeof error.code).toBe("string");
      expect(error.code).toBe("MY_CODE");
    });

    it("DashboardServiceError preserves different codes", () => {
      const e1 = new DashboardServiceError("VALIDATION_FAILED", "bad input");
      const e2 = new DashboardServiceError("SERVICE_ERROR", "internal");
      expect(e1.code).toBe("VALIDATION_FAILED");
      expect(e2.code).toBe("SERVICE_ERROR");
    });
  });

  describe("calculateWorkspaceHealth — edge cases", () => {
    it("should handle empty snapshots array", async () => {
      const health = await calculateWorkspaceHealth(context, []);
      expect(health.workspaceId).toBe(mockWorkspaceId);
      expect(health.healthyEngagements).toBe(0);
      expect(health.criticalEngagements).toBe(0);
      expect(health.atRiskEngagements).toBe(0);
    });

    it("should count all engagement types from single snapshot", async () => {
      const snapshots = [
        { engagementId: "e1", status: "at_risk" as const, kpiOnTrackCount: 5, kpiTotalCount: 10 },
      ];
      const health = await calculateWorkspaceHealth(context, snapshots);
      expect(health.atRiskEngagements).toBe(1);
      expect(health.healthyEngagements).toBe(0);
    });
  });

  describe("summarizeActionQueue — edge cases", () => {
    it("should return zero totalCount for empty actions", async () => {
      const summary = await summarizeActionQueue(context, []);
      expect(summary.totalCount).toBe(0);
    });

    it("should return empty criticalActions for empty actions", async () => {
      const summary = await summarizeActionQueue(context, []);
      expect(summary.criticalActions).toHaveLength(0);
    });
  });
});
