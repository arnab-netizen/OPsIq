import { describe, it, expect } from "vitest";
import {
  HealthStatus,
  ActionQueuePriority,
  validateActionQueueItem,
  validateActionQueueSummary,
  validateWorkspaceHealth,
  validateOwnerDashboardConfig,
  validateOwnerDashboardView,
} from "@/domain/owner-mode/owner-dashboard";

describe("Owner Dashboard Domain", () => {
  describe("validateActionQueueItem", () => {
    it("should accept valid action item", () => {
      const item = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Test Action",
        priority: ActionQueuePriority.HIGH,
        status: "in_progress" as const,
        blockerCount: 0,
      };
      const errors = validateActionQueueItem(item);
      expect(errors).toHaveLength(0);
    });

    it("should reject invalid action ID", () => {
      const item = {
        id: "invalid-id",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Test Action",
        priority: ActionQueuePriority.HIGH,
        status: "in_progress" as const,
        blockerCount: 0,
      };
      const errors = validateActionQueueItem(item);
      expect(errors).toContain("Invalid action ID format");
    });

    it("should reject missing action name", () => {
      const item = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "",
        priority: ActionQueuePriority.HIGH,
        status: "in_progress" as const,
        blockerCount: 0,
      };
      const errors = validateActionQueueItem(item);
      expect(errors).toContain("Action name required");
    });

    it("should reject negative blocker count", () => {
      const item = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Test Action",
        priority: ActionQueuePriority.HIGH,
        status: "in_progress" as const,
        blockerCount: -1,
      };
      const errors = validateActionQueueItem(item);
      expect(errors).toContain("blocker count must be non-negative");
    });
  });

  describe("validateActionQueueSummary", () => {
    it("should accept valid summary", () => {
      const summary = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        totalCount: 10,
        byStatus: { in_progress: 5, pending: 5 },
        byPriority: { high: 3, medium: 7 },
        overdueCount: 2,
        blockedCount: 1,
        completedThisWeek: 3,
        averageCompletionDays: 5,
        criticalActions: [],
        dueThisWeek: [],
      };
      const errors = validateActionQueueSummary(summary);
      expect(errors).toHaveLength(0);
    });

    it("should reject invalid workspace ID", () => {
      const summary = {
        workspaceId: "invalid",
        totalCount: 10,
        byStatus: {},
        byPriority: {},
        overdueCount: 2,
        blockedCount: 1,
        completedThisWeek: 3,
        averageCompletionDays: 5,
        criticalActions: [],
        dueThisWeek: [],
      };
      const errors = validateActionQueueSummary(summary);
      expect(errors).toContain("Invalid workspace ID format");
    });

    it("should reject negative total count", () => {
      const summary = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        totalCount: -1,
        byStatus: {},
        byPriority: {},
        overdueCount: 2,
        blockedCount: 1,
        completedThisWeek: 3,
        averageCompletionDays: 5,
        criticalActions: [],
        dueThisWeek: [],
      };
      const errors = validateActionQueueSummary(summary);
      expect(errors).toContain("Total count must be non-negative");
    });
  });

  describe("validateWorkspaceHealth", () => {
    it("should accept valid workspace health", () => {
      const health = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        assessedAt: new Date().toISOString(),
        overallStatus: HealthStatus.HEALTHY,
        engagementCount: 5,
        healthyEngagements: 4,
        atRiskEngagements: 1,
        criticalEngagements: 0,
        activeKPICount: 20,
        onTrackKPICount: 18,
        actionQueueSize: 15,
        overdueActionCount: 0,
        averageExecutionCertainty: 75,
        engagementHealthSnapshots: [],
        topRisks: [],
        recommendedActions: [],
      };
      const errors = validateWorkspaceHealth(health);
      expect(errors).toHaveLength(0);
    });

    it("should reject execution certainty > 100", () => {
      const health = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        assessedAt: new Date().toISOString(),
        overallStatus: HealthStatus.HEALTHY,
        engagementCount: 5,
        healthyEngagements: 4,
        atRiskEngagements: 1,
        criticalEngagements: 0,
        activeKPICount: 20,
        onTrackKPICount: 18,
        actionQueueSize: 15,
        overdueActionCount: 0,
        averageExecutionCertainty: 150,
        engagementHealthSnapshots: [],
        topRisks: [],
        recommendedActions: [],
      };
      const errors = validateWorkspaceHealth(health);
      expect(errors).toContain("Execution certainty must be 0-100");
    });

    it("should reject health snapshot count overflow", () => {
      const health = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        assessedAt: new Date().toISOString(),
        overallStatus: HealthStatus.HEALTHY,
        engagementCount: 2,
        healthyEngagements: 3,
        atRiskEngagements: 1,
        criticalEngagements: 0,
        activeKPICount: 20,
        onTrackKPICount: 18,
        actionQueueSize: 15,
        overdueActionCount: 0,
        averageExecutionCertainty: 75,
        engagementHealthSnapshots: [],
        topRisks: [],
        recommendedActions: [],
      };
      const errors = validateWorkspaceHealth(health);
      expect(errors).toContain("Health snapshot counts exceed total engagement count");
    });
  });

  describe("validateOwnerDashboardConfig", () => {
    it("should accept valid config", () => {
      const config = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        ownerId: "550e8400-e29b-41d4-a716-446655440001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        showCompletedActions: true,
        daysOfHistoryVisible: 30,
        actionPriorityThreshold: ActionQueuePriority.MEDIUM,
        healthStatusThreshold: HealthStatus.AT_RISK,
        enableBulkActions: true,
        enableAdvancedFiltering: true,
      };
      const errors = validateOwnerDashboardConfig(config);
      expect(errors).toHaveLength(0);
    });

    it("should reject zero daysOfHistoryVisible", () => {
      const config = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        ownerId: "550e8400-e29b-41d4-a716-446655440001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        showCompletedActions: true,
        daysOfHistoryVisible: 0,
        actionPriorityThreshold: ActionQueuePriority.MEDIUM,
        healthStatusThreshold: HealthStatus.AT_RISK,
        enableBulkActions: true,
        enableAdvancedFiltering: true,
      };
      const errors = validateOwnerDashboardConfig(config);
      expect(errors).toContain("Days of history visible must be positive");
    });

    it("should reject invalid owner ID", () => {
      const config = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        ownerId: "not-a-uuid",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        showCompletedActions: true,
        daysOfHistoryVisible: 30,
        actionPriorityThreshold: ActionQueuePriority.MEDIUM,
        healthStatusThreshold: HealthStatus.AT_RISK,
        enableBulkActions: true,
        enableAdvancedFiltering: true,
      };
      const errors = validateOwnerDashboardConfig(config);
      expect(errors).toContain("Invalid owner ID format");
    });
  });

  describe("validateOwnerDashboardView", () => {
    it("should accept valid complete view", () => {
      const view = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        config: {
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          ownerId: "550e8400-e29b-41d4-a716-446655440001",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          showCompletedActions: true,
          daysOfHistoryVisible: 30,
          actionPriorityThreshold: ActionQueuePriority.MEDIUM,
          healthStatusThreshold: HealthStatus.AT_RISK,
          enableBulkActions: true,
          enableAdvancedFiltering: true,
        },
        health: {
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          assessedAt: new Date().toISOString(),
          overallStatus: HealthStatus.HEALTHY,
          engagementCount: 5,
          healthyEngagements: 4,
          atRiskEngagements: 1,
          criticalEngagements: 0,
          activeKPICount: 20,
          onTrackKPICount: 18,
          actionQueueSize: 15,
          overdueActionCount: 0,
          averageExecutionCertainty: 75,
          engagementHealthSnapshots: [],
          topRisks: [],
          recommendedActions: [],
        },
        actionQueue: {
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          totalCount: 10,
          byStatus: { in_progress: 5, pending: 5 },
          byPriority: { high: 3, medium: 7 },
          overdueCount: 2,
          blockedCount: 1,
          completedThisWeek: 3,
          averageCompletionDays: 5,
          criticalActions: [],
          dueThisWeek: [],
        },
        recentKPIs: [],
      };
      const errors = validateOwnerDashboardView(view);
      expect(errors).toHaveLength(0);
    });

    it("should accumulate errors from all sub-validators", () => {
      const view = {
        workspaceId: "invalid",
        config: {
          workspaceId: "also-invalid",
          ownerId: "not-uuid",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          showCompletedActions: true,
          daysOfHistoryVisible: 0,
          actionPriorityThreshold: ActionQueuePriority.MEDIUM,
          healthStatusThreshold: HealthStatus.AT_RISK,
          enableBulkActions: true,
          enableAdvancedFiltering: true,
        },
        health: {
          workspaceId: "also-invalid",
          assessedAt: new Date().toISOString(),
          overallStatus: HealthStatus.HEALTHY,
          engagementCount: 2,
          healthyEngagements: 3,
          atRiskEngagements: 1,
          criticalEngagements: 0,
          activeKPICount: 20,
          onTrackKPICount: 18,
          actionQueueSize: 15,
          overdueActionCount: 0,
          averageExecutionCertainty: 150,
          engagementHealthSnapshots: [],
          topRisks: [],
          recommendedActions: [],
        },
        actionQueue: {
          workspaceId: "also-invalid",
          totalCount: -1,
          byStatus: {},
          byPriority: {},
          overdueCount: 2,
          blockedCount: 1,
          completedThisWeek: 3,
          averageCompletionDays: 5,
          criticalActions: [],
          dueThisWeek: [],
        },
        recentKPIs: [],
      };
      const errors = validateOwnerDashboardView(view);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain("Days of history visible must be positive");
      expect(errors).toContain("Execution certainty must be 0-100");
      expect(errors).toContain("Total count must be non-negative");
    });
  });
});
