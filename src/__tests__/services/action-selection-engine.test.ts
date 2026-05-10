/**
 * Tests for Action Selection Engine (Phase 6 Slice 4)
 */

import { describe, it, expect } from "vitest";
import { ActionSelectionEngine } from "@/services/action-selection-engine";
import {
  Recommendation,
  RecommendationCategory,
  RecommendationStatus,
  PriorityLevel,
  ImpactDimension,
  EffortScale,
  ConfidenceLevel,
} from "@/domain/recommendation/recommendation";

// Helper to create test recommendation
function createTestRec(overrides?: Partial<Recommendation>): Recommendation {
  return {
    id: `rec-${Date.now()}-${Math.random()}`,
    workspaceId: "test-workspace",
    category: RecommendationCategory.SURVIVAL,
    status: RecommendationStatus.PENDING,
    title: "Test Recommendation",
    summary: "Test summary",
    detailed_rationale: "Test rationale",
    expected_outcome: "Test outcome",
    success_criteria: ["Test criteria"],
    priority_score: {
      impact_score: 80,
      urgency_score: 80,
      confidence_score: 80,
      effort_score: 30,
      risk_score: 30,
      constraint_friction: 1.0,
      composite_priority: 1000,
      priority_level: PriorityLevel.HIGH,
    },
    impact_assessments: [
      {
        dimension: ImpactDimension.SURVIVAL,
        baseline: 10,
        projected: 50,
        improvement_percent: 40,
        confidence: ConfidenceLevel.HIGH,
        supporting_evidence: [],
      },
    ],
    urgency: {
      is_time_sensitive: true,
      window_days: 30,
      penalty_if_delayed_percent: 20,
      rationale: "Test urgency",
    },
    risk_assessment: {
      execution_risk: "low",
      market_risk: "low",
      financial_risk: "low",
      customer_risk: "low",
      total_risk_level: "low",
      mitigations: [],
    },
    action_items: [
      {
        id: "action-1",
        title: "Action 1",
        description: "Test action",
        estimated_effort: EffortScale.MEDIUM,
        estimated_hours: 20,
        dependencies: [],
        is_parallel_safe: true,
        success_criteria: ["Test success"],
      },
    ],
    resource_requirements: [],
    constraints: [],
    estimated_total_hours: 20,
    evidence: [],
    created_at: new Date(),
    created_by: "test-user",
    version: 1,
    is_approved: false,
    ...overrides,
  };
}

describe("ActionSelectionEngine", () => {
  describe("selectActions", () => {
    it("should require workspaceId", () => {
      const rec = createTestRec();

      expect(() => {
        ActionSelectionEngine.selectActions([rec], {
          workspaceId: "",
          userId: "user-1",
        });
      }).toThrow("workspaceId");
    });

    it("should select CRITICAL priority recommendations first", () => {
      const critical = createTestRec({
        id: "critical-1",
        priority_score: {
          impact_score: 100,
          urgency_score: 100,
          confidence_score: 100,
          effort_score: 1,
          risk_score: 5,
          constraint_friction: 1.0,
          composite_priority: 2000,
          priority_level: PriorityLevel.CRITICAL,
        },
        estimated_total_hours: 10,
      });

      const medium = createTestRec({
        id: "medium-1",
        priority_score: {
          impact_score: 50,
          urgency_score: 50,
          confidence_score: 50,
          effort_score: 50,
          risk_score: 50,
          constraint_friction: 1.0,
          composite_priority: 100,
          priority_level: PriorityLevel.MEDIUM,
        },
        estimated_total_hours: 30,
      });

      const plan = ActionSelectionEngine.selectActions([medium, critical], {
        workspaceId: "test-workspace",
        userId: "user-1",
        available_effort_hours_per_day: 8,
        time_horizon_days: 90,
      });

      expect(plan.selected_recommendations[0].recommendation_id).toBe("critical-1");
      expect(plan.total_selected).toBeGreaterThan(0);
    });

    it("should respect effort capacity constraints", () => {
      const rec1 = createTestRec({
        id: "rec-1",
        estimated_total_hours: 60,
        priority_score: {
          impact_score: 80,
          urgency_score: 80,
          confidence_score: 80,
          effort_score: 30,
          risk_score: 30,
          constraint_friction: 1.0,
          composite_priority: 500,
          priority_level: PriorityLevel.HIGH,
        },
      });

      const rec2 = createTestRec({
        id: "rec-2",
        estimated_total_hours: 60,
        priority_score: {
          impact_score: 60,
          urgency_score: 60,
          confidence_score: 60,
          effort_score: 40,
          risk_score: 40,
          constraint_friction: 1.0,
          composite_priority: 300,
          priority_level: PriorityLevel.MEDIUM,
        },
      });

      const plan = ActionSelectionEngine.selectActions([rec1, rec2], {
        workspaceId: "test-workspace",
        userId: "user-1",
        available_effort_hours_per_day: 8,
        time_horizon_days: 10, // 80 hours total capacity
      });

      expect(plan.total_effort_hours).toBeLessThanOrEqual(80);
      expect(plan.total_selected).toBeGreaterThan(0);
      expect(plan.total_selected).toBeLessThanOrEqual(2);
    });

    it("should respect budget constraints", () => {
      const rec1 = createTestRec({
        id: "rec-1",
        estimated_total_cost: 5000,
        estimated_total_hours: 20,
      });

      const rec2 = createTestRec({
        id: "rec-2",
        estimated_total_cost: 6000,
        estimated_total_hours: 20,
      });

      const plan = ActionSelectionEngine.selectActions([rec1, rec2], {
        workspaceId: "test-workspace",
        userId: "user-1",
        available_budget: 8000,
      });

      expect(plan.total_cost).toBeLessThanOrEqual(8000);
    });

    it("should mark plan as feasible when within constraints", () => {
      const rec = createTestRec({
        estimated_total_hours: 20,
        estimated_total_cost: 5000,
      });

      const plan = ActionSelectionEngine.selectActions([rec], {
        workspaceId: "test-workspace",
        userId: "user-1",
        available_effort_hours_per_day: 8,
        available_budget: 10000,
        time_horizon_days: 90,
      });

      expect(plan.is_feasible).toBe(true);
      expect(plan.feasibility_gaps).toEqual([]);
    });

    it("should mark plan as infeasible when effort exceeds capacity", () => {
      const rec = createTestRec({
        estimated_total_hours: 100,
        priority_score: {
          impact_score: 100,
          urgency_score: 100,
          confidence_score: 100,
          effort_score: 1,
          risk_score: 5,
          constraint_friction: 1.0,
          composite_priority: 2000,
          priority_level: PriorityLevel.CRITICAL,
        },
      });

      const plan = ActionSelectionEngine.selectActions([rec], {
        workspaceId: "test-workspace",
        userId: "user-1",
        available_effort_hours_per_day: 2,
        time_horizon_days: 30, // 60 hours capacity, CRITICAL rec is 100 hours
      });

      // CRITICAL rec is force-included even if over capacity
      expect(plan.total_selected).toBeGreaterThan(0);
      expect(plan.total_effort_hours).toBeGreaterThan(60); // Over capacity
      expect(plan.is_feasible).toBe(false);
      expect(plan.feasibility_gaps.some((g) => g.includes("Effort shortage"))).toBe(true);
    });

    it("should mark plan as infeasible when budget exceeds capacity", () => {
      const rec = createTestRec({
        estimated_total_cost: 10000,
        priority_score: {
          impact_score: 100,
          urgency_score: 100,
          confidence_score: 100,
          effort_score: 1,
          risk_score: 5,
          constraint_friction: 1.0,
          composite_priority: 2000,
          priority_level: PriorityLevel.CRITICAL,
        },
      });

      const plan = ActionSelectionEngine.selectActions([rec], {
        workspaceId: "test-workspace",
        userId: "user-1",
        available_budget: 5000,
      });

      // CRITICAL rec is force-included even if over budget
      expect(plan.total_selected).toBeGreaterThan(0);
      expect(plan.total_cost).toBeGreaterThan(5000); // Over capacity
      expect(plan.is_feasible).toBe(false);
      expect(plan.feasibility_gaps.some((g) => g.includes("Budget shortage"))).toBe(true);
    });

    it("should create execution phases from sequenced recommendations", () => {
      const recs = [
        createTestRec({
          id: "rec-1",
          estimated_total_hours: 20,
          priority_score: {
            impact_score: 100,
            urgency_score: 100,
            confidence_score: 100,
            effort_score: 1,
            risk_score: 5,
            constraint_friction: 1.0,
            composite_priority: 2000,
            priority_level: PriorityLevel.CRITICAL,
          },
        }),
        createTestRec({
          id: "rec-2",
          estimated_total_hours: 20,
          priority_score: {
            impact_score: 80,
            urgency_score: 80,
            confidence_score: 80,
            effort_score: 30,
            risk_score: 30,
            constraint_friction: 1.0,
            composite_priority: 1000,
            priority_level: PriorityLevel.HIGH,
          },
        }),
      ];

      const plan = ActionSelectionEngine.selectActions(recs, {
        workspaceId: "test-workspace",
        userId: "user-1",
        available_effort_hours_per_day: 8,
        time_horizon_days: 90,
        resolve_dependencies: true,
      });

      expect(plan.execution_phases.length).toBeGreaterThan(0);
      expect(plan.execution_phases[0].phase_number).toBe(1);
    });

    it("should set plan metadata correctly", () => {
      const rec = createTestRec();

      const plan = ActionSelectionEngine.selectActions([rec], {
        workspaceId: "test-workspace",
        userId: "test-user",
      });

      expect(plan.workspaceId).toBe("test-workspace");
      expect(plan.created_by).toBe("test-user");
      expect(plan.created_at).toBeInstanceOf(Date);
      expect(plan.plan_id).toMatch(/^plan-test-workspace-/);
    });

    it("should count selected recommendations correctly", () => {
      const recs = [
        createTestRec({ id: "rec-1" }),
        createTestRec({ id: "rec-2" }),
        createTestRec({ id: "rec-3" }),
      ];

      const plan = ActionSelectionEngine.selectActions(recs, {
        workspaceId: "test-workspace",
        userId: "user-1",
        available_effort_hours_per_day: 100, // Large capacity
      });

      expect(plan.total_selected).toBe(3);
    });
  });

  describe("effort estimation", () => {
    it("should use estimated_total_hours if provided", () => {
      const rec = createTestRec({
        estimated_total_hours: 50,
        action_items: [
          {
            id: "action-1",
            title: "Action 1",
            description: "Test",
            estimated_effort: EffortScale.MINIMAL,
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
        ],
      });

      const plan = ActionSelectionEngine.selectActions([rec], {
        workspaceId: "test-workspace",
        userId: "user-1",
      });

      expect(plan.selected_recommendations[0].committed_effort_hours).toBe(50);
    });

    it("should estimate effort from action items if not provided", () => {
      const rec = createTestRec({
        estimated_total_hours: undefined,
        action_items: [
          {
            id: "action-1",
            title: "Action 1",
            description: "MEDIUM effort",
            estimated_effort: EffortScale.MEDIUM,
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
          {
            id: "action-2",
            title: "Action 2",
            description: "SMALL effort",
            estimated_effort: EffortScale.SMALL,
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
        ],
      });

      const plan = ActionSelectionEngine.selectActions([rec], {
        workspaceId: "test-workspace",
        userId: "user-1",
      });

      expect(plan.selected_recommendations[0].committed_effort_hours).toBeGreaterThan(0);
    });
  });

  describe("priority sorting", () => {
    it("should rank CRITICAL > HIGH > MEDIUM > LOW", () => {
      const recs = [
        createTestRec({
          id: "low",
          priority_score: {
            impact_score: 20,
            urgency_score: 20,
            confidence_score: 20,
            effort_score: 50,
            risk_score: 50,
            constraint_friction: 1.0,
            composite_priority: 10,
            priority_level: PriorityLevel.LOW,
          },
        }),
        createTestRec({
          id: "critical",
          priority_score: {
            impact_score: 100,
            urgency_score: 100,
            confidence_score: 100,
            effort_score: 1,
            risk_score: 5,
            constraint_friction: 1.0,
            composite_priority: 2000,
            priority_level: PriorityLevel.CRITICAL,
          },
        }),
        createTestRec({
          id: "medium",
          priority_score: {
            impact_score: 50,
            urgency_score: 50,
            confidence_score: 50,
            effort_score: 50,
            risk_score: 50,
            constraint_friction: 1.0,
            composite_priority: 100,
            priority_level: PriorityLevel.MEDIUM,
          },
        }),
        createTestRec({
          id: "high",
          priority_score: {
            impact_score: 80,
            urgency_score: 80,
            confidence_score: 80,
            effort_score: 30,
            risk_score: 30,
            constraint_friction: 1.0,
            composite_priority: 1000,
            priority_level: PriorityLevel.HIGH,
          },
        }),
      ];

      const plan = ActionSelectionEngine.selectActions(recs, {
        workspaceId: "test-workspace",
        userId: "user-1",
        available_effort_hours_per_day: 100,
      });

      const ids = plan.selected_recommendations.map((r) => r.recommendation_id);
      expect(ids[0]).toBe("critical");
      expect(ids[1]).toBe("high");
      expect(ids.indexOf("medium")).toBeGreaterThan(ids.indexOf("high"));
    });
  });

  describe("execution phases", () => {
    it("should assign phase numbers to recommendations", () => {
      const recs = [
        createTestRec({
          id: "rec-1",
          estimated_total_hours: 20,
        }),
        createTestRec({
          id: "rec-2",
          estimated_total_hours: 20,
        }),
      ];

      const plan = ActionSelectionEngine.selectActions(recs, {
        workspaceId: "test-workspace",
        userId: "user-1",
        available_effort_hours_per_day: 4,
        resolve_dependencies: true,
      });

      expect(plan.selected_recommendations.every((r) => r.phase > 0)).toBe(true);
    });

    it("should estimate phase completion dates", () => {
      const rec = createTestRec({
        estimated_total_hours: 20,
      });

      const plan = ActionSelectionEngine.selectActions([rec], {
        workspaceId: "test-workspace",
        userId: "user-1",
        available_effort_hours_per_day: 10,
      });

      if (plan.execution_phases.length > 0) {
        const phase = plan.execution_phases[0];
        expect(phase.estimated_start_day).toBeGreaterThan(0);
        expect(phase.estimated_duration_days).toBeGreaterThan(0);
      }
    });
  });

  describe("validateWorkspaceId", () => {
    it("should throw if workspaceId is empty", () => {
      const rec = createTestRec();
      const plan = ActionSelectionEngine.selectActions([rec], {
        workspaceId: "test-workspace",
        userId: "user-1",
      });

      expect(() => {
        ActionSelectionEngine.validateWorkspaceId("", plan);
      }).toThrow("workspaceId");
    });

    it("should throw if plan workspace does not match", () => {
      const rec = createTestRec();
      const plan = ActionSelectionEngine.selectActions([rec], {
        workspaceId: "workspace-1",
        userId: "user-1",
      });

      expect(() => {
        ActionSelectionEngine.validateWorkspaceId("workspace-2", plan);
      }).toThrow("workspace mismatch");
    });

    it("should not throw if workspaceIds match", () => {
      const rec = createTestRec();
      const plan = ActionSelectionEngine.selectActions([rec], {
        workspaceId: "test-workspace",
        userId: "user-1",
      });

      expect(() => {
        ActionSelectionEngine.validateWorkspaceId("test-workspace", plan);
      }).not.toThrow();
    });
  });
});
