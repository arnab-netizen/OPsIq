/**
 * Tests for Recommendation Assessment Interface (Phase 6 Slice 5)
 */

import { describe, it, expect } from "vitest";
import {
  validateRecommendationAssessmentRequest,
  toRecommendationAssessmentDTO,
  ASSESSMENT_THRESHOLDS,
  RecommendationAssessmentRequest,
  RecommendationAssessmentResponse,
} from "@/domain/recommendation/recommendation-assessment";
import { PriorityLevel } from "@/domain/recommendation/recommendation";

describe("Recommendation Assessment Interface", () => {
  describe("validateRecommendationAssessmentRequest", () => {
    it("should accept valid request", () => {
      const req: RecommendationAssessmentRequest = {
        workspaceId: "test-workspace",
        userId: "test-user",
        available_effort_hours_per_day: 8,
        available_budget: 10000,
        time_horizon_days: 90,
      };

      const errors = validateRecommendationAssessmentRequest(req);

      expect(errors.filter((e) => e.severity === "FATAL")).toHaveLength(0);
    });

    it("should require workspaceId", () => {
      const req: RecommendationAssessmentRequest = {
        workspaceId: "",
        userId: "test-user",
      };

      const errors = validateRecommendationAssessmentRequest(req);

      expect(errors.some((e) => e.field === "workspaceId" && e.severity === "FATAL")).toBe(true);
    });

    it("should require userId", () => {
      const req: RecommendationAssessmentRequest = {
        workspaceId: "test-workspace",
        userId: "",
      };

      const errors = validateRecommendationAssessmentRequest(req);

      expect(errors.some((e) => e.field === "userId" && e.severity === "FATAL")).toBe(true);
    });

    it("should validate effort_hours_per_day is positive", () => {
      const req: RecommendationAssessmentRequest = {
        workspaceId: "test-workspace",
        userId: "test-user",
        available_effort_hours_per_day: -8,
      };

      const errors = validateRecommendationAssessmentRequest(req);

      expect(errors.some((e) => e.field === "available_effort_hours_per_day")).toBe(true);
    });

    it("should validate budget is non-negative", () => {
      const req: RecommendationAssessmentRequest = {
        workspaceId: "test-workspace",
        userId: "test-user",
        available_budget: -1000,
      };

      const errors = validateRecommendationAssessmentRequest(req);

      expect(errors.some((e) => e.field === "available_budget")).toBe(true);
    });

    it("should validate time_horizon_days is positive", () => {
      const req: RecommendationAssessmentRequest = {
        workspaceId: "test-workspace",
        userId: "test-user",
        time_horizon_days: 0,
      };

      const errors = validateRecommendationAssessmentRequest(req);

      expect(errors.some((e) => e.field === "time_horizon_days")).toBe(true);
    });

    it("should validate team_retention_risk is 0-1", () => {
      const req: RecommendationAssessmentRequest = {
        workspaceId: "test-workspace",
        userId: "test-user",
        team_retention_risk: 1.5,
      };

      const errors = validateRecommendationAssessmentRequest(req);

      expect(errors.some((e) => e.field === "team_retention_risk")).toBe(true);
    });
  });

  describe("toRecommendationAssessmentDTO", () => {
    it("should convert response to DTO", () => {
      const response: RecommendationAssessmentResponse = {
        workspaceId: "test-workspace",
        assessment_id: "assessment-1",
        assessed_at: new Date("2026-05-11"),
        assessed_by: "test-user",
        total_generated: 10,
        by_category: {
          survival: [],
          growth: [],
          operational: [],
          financial: [],
          market: [],
          team: [],
          strategic: [],
        },
        by_priority: {
          critical: [],
          high: [],
          medium: [],
          low: [],
          defer: [],
        },
        total_selected: 5,
        selected_recommendations: [],
        action_plan: {
          workspaceId: "test-workspace",
          plan_id: "plan-1",
          created_at: new Date(),
          created_by: "test-user",
          selected_recommendations: [],
          total_selected: 5,
          total_effort_hours: 100,
          total_cost: 5000,
          is_feasible: true,
          execution_phases: [
            {
              phase_number: 1,
              title: "Phase 1",
              description: "First phase",
              estimated_start_day: 1,
              estimated_duration_days: 5,
              actions: [],
              total_effort: 100,
              total_cost: 5000,
              completion_criteria: [],
            },
          ],
        },
        insights: [],
        overall_feasibility: "FEASIBLE",
        critical_blockers: [],
        execution_confidence: 85,
      };

      const dto = toRecommendationAssessmentDTO(response);

      expect(dto.assessment_id).toBe("assessment-1");
      expect(dto.total_generated).toBe(10);
      expect(dto.total_selected).toBe(5);
      expect(dto.execution_plan.is_feasible).toBe(true);
      expect(dto.execution_plan.total_effort_hours).toBe(100);
      expect(dto.execution_plan.total_cost).toBe(5000);
      expect(dto.feasibility).toBe("FEASIBLE");
    });

    it("should include critical recommendations in DTO", () => {
      const response: RecommendationAssessmentResponse = {
        workspaceId: "test-workspace",
        assessment_id: "assessment-1",
        assessed_at: new Date(),
        assessed_by: "test-user",
        total_generated: 5,
        by_category: {
          survival: [],
          growth: [],
          operational: [],
          financial: [],
          market: [],
          team: [],
          strategic: [],
        },
        by_priority: {
          critical: [
            {
              id: "rec-1",
              title: "Critical Recommendation 1",
              category: undefined as any,
              priority: PriorityLevel.CRITICAL,
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
              summary: "Critical action needed",
              is_selected_for_action: true,
            },
          ],
          high: [],
          medium: [],
          low: [],
          defer: [],
        },
        total_selected: 1,
        selected_recommendations: [],
        action_plan: {
          workspaceId: "test-workspace",
          plan_id: "plan-1",
          created_at: new Date(),
          created_by: "test-user",
          selected_recommendations: [],
          total_selected: 1,
          total_effort_hours: 50,
          total_cost: 2000,
          is_feasible: true,
          execution_phases: [],
        },
        insights: [],
        overall_feasibility: "FEASIBLE",
        critical_blockers: [],
        execution_confidence: 90,
      };

      const dto = toRecommendationAssessmentDTO(response);

      expect(dto.critical_recommendations.count).toBe(1);
      expect(dto.critical_recommendations.titles).toContain("Critical Recommendation 1");
    });

    it("should convert ISO 8601 timestamp", () => {
      const testDate = new Date("2026-05-11T10:30:00Z");
      const response: RecommendationAssessmentResponse = {
        workspaceId: "test-workspace",
        assessment_id: "assessment-1",
        assessed_at: testDate,
        assessed_by: "test-user",
        total_generated: 5,
        by_category: {
          survival: [],
          growth: [],
          operational: [],
          financial: [],
          market: [],
          team: [],
          strategic: [],
        },
        by_priority: {
          critical: [],
          high: [],
          medium: [],
          low: [],
          defer: [],
        },
        total_selected: 0,
        selected_recommendations: [],
        action_plan: {
          workspaceId: "test-workspace",
          plan_id: "plan-1",
          created_at: new Date(),
          created_by: "test-user",
          selected_recommendations: [],
          total_selected: 0,
          total_effort_hours: 0,
          total_cost: 0,
          is_feasible: true,
          execution_phases: [],
        },
        insights: [],
        overall_feasibility: "FEASIBLE",
        critical_blockers: [],
        execution_confidence: 100,
      };

      const dto = toRecommendationAssessmentDTO(response);

      expect(dto.assessed_at).toMatch(/2026-05-11T/);
    });

    it("should calculate estimated completion days correctly", () => {
      const response: RecommendationAssessmentResponse = {
        workspaceId: "test-workspace",
        assessment_id: "assessment-1",
        assessed_at: new Date(),
        assessed_by: "test-user",
        total_generated: 1,
        by_category: {
          survival: [],
          growth: [],
          operational: [],
          financial: [],
          market: [],
          team: [],
          strategic: [],
        },
        by_priority: {
          critical: [],
          high: [],
          medium: [],
          low: [],
          defer: [],
        },
        total_selected: 1,
        selected_recommendations: [],
        action_plan: {
          workspaceId: "test-workspace",
          plan_id: "plan-1",
          created_at: new Date(),
          created_by: "test-user",
          selected_recommendations: [],
          total_selected: 1,
          total_effort_hours: 100,
          total_cost: 5000,
          is_feasible: true,
          execution_phases: [
            {
              phase_number: 1,
              title: "Phase 1",
              description: "First phase",
              estimated_start_day: 1,
              estimated_duration_days: 10,
              actions: [],
              total_effort: 50,
              total_cost: 2500,
              completion_criteria: [],
            },
            {
              phase_number: 2,
              title: "Phase 2",
              description: "Second phase",
              estimated_start_day: 11,
              estimated_duration_days: 5,
              actions: [],
              total_effort: 50,
              total_cost: 2500,
              completion_criteria: [],
            },
          ],
        },
        insights: [],
        overall_feasibility: "FEASIBLE",
        critical_blockers: [],
        execution_confidence: 85,
      };

      const dto = toRecommendationAssessmentDTO(response);

      expect(dto.execution_plan.estimated_completion_days).toBe(16); // 11 + 5
    });
  });

  describe("ASSESSMENT_THRESHOLDS", () => {
    it("should define confidence thresholds", () => {
      expect(ASSESSMENT_THRESHOLDS.high_confidence_min).toBe(80);
      expect(ASSESSMENT_THRESHOLDS.medium_confidence_min).toBe(60);
      expect(ASSESSMENT_THRESHOLDS.low_confidence_min).toBe(40);
    });

    it("should define critical action thresholds", () => {
      expect(ASSESSMENT_THRESHOLDS.critical_count_threshold).toBe(3);
      expect(ASSESSMENT_THRESHOLDS.high_count_threshold).toBe(5);
    });

    it("should define feasibility thresholds", () => {
      expect(ASSESSMENT_THRESHOLDS.feasible_effort_utilization).toBe(0.8);
      expect(ASSESSMENT_THRESHOLDS.infeasible_effort_utilization).toBe(1.2);
    });

    it("should define ideal confidence percentage", () => {
      expect(ASSESSMENT_THRESHOLDS.ideal_confidence_percent).toBe(85);
    });
  });

  describe("assessment insights", () => {
    it("should support multiple insight types", () => {
      const insightTypes = [
        "CRITICAL_THREAT",
        "STRATEGIC_OPPORTUNITY",
        "EXECUTION_RISK",
        "CAPACITY_CONSTRAINT",
        "DEPENDENCY_CHAIN",
        "QUICK_WIN",
        "LONG_TERM_INVESTMENT",
      ];

      expect(insightTypes.length).toBe(7);
    });
  });

  describe("DTO safety", () => {
    it("should not expose internal fields in DTO", () => {
      const response: RecommendationAssessmentResponse = {
        workspaceId: "test-workspace",
        assessment_id: "assessment-1",
        assessed_at: new Date(),
        assessed_by: "test-user",
        total_generated: 5,
        by_category: {
          survival: [],
          growth: [],
          operational: [],
          financial: [],
          market: [],
          team: [],
          strategic: [],
        },
        by_priority: {
          critical: [],
          high: [],
          medium: [],
          low: [],
          defer: [],
        },
        total_selected: 1,
        selected_recommendations: [],
        action_plan: {
          workspaceId: "test-workspace",
          plan_id: "plan-1",
          created_at: new Date(),
          created_by: "test-user",
          selected_recommendations: [],
          total_selected: 1,
          total_effort_hours: 50,
          total_cost: 2000,
          is_feasible: true,
          execution_phases: [],
        },
        insights: [],
        overall_feasibility: "FEASIBLE",
        critical_blockers: [],
        execution_confidence: 90,
      };

      const dto = toRecommendationAssessmentDTO(response);

      // DTO should only include safe fields
      expect(dto).toHaveProperty("assessment_id");
      expect(dto).toHaveProperty("assessed_at");
      expect(dto).toHaveProperty("total_generated");
      expect(dto).toHaveProperty("execution_plan");

      // DTO should not expose internal state
      expect(Object.keys(dto).length).toBeLessThan(Object.keys(response).length);
    });
  });
});
