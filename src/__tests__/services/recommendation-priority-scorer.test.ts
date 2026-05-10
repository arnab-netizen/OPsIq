/**
 * Tests for Recommendation Priority Scorer Engine (Phase 6 Slice 3)
 */

import { describe, it, expect } from "vitest";
import { RecommendationPriorityScorerEngine } from "@/services/recommendation-priority-scorer";
import {
  Recommendation,
  RecommendationCategory,
  RecommendationStatus,
  PriorityLevel,
  ImpactDimension,
  EffortScale,
  ConfidenceLevel,
} from "@/domain/recommendation/recommendation";

// Helper to create a test recommendation
function createTestRecommendation(overrides?: Partial<Recommendation>): Recommendation {
  return {
    id: `test-rec-${Date.now()}`,
    workspaceId: "test-workspace",
    category: RecommendationCategory.SURVIVAL,
    status: RecommendationStatus.PENDING,
    title: "Test Recommendation",
    summary: "Test summary",
    detailed_rationale: "Test rationale",
    expected_outcome: "Test outcome",
    success_criteria: ["Test criteria"],
    priority_score: {
      impact_score: 0,
      urgency_score: 0,
      confidence_score: 0,
      effort_score: 0,
      risk_score: 0,
      constraint_friction: 0,
      composite_priority: 0,
      priority_level: PriorityLevel.MEDIUM,
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
        dependencies: [],
        is_parallel_safe: true,
        success_criteria: ["Test success"],
      },
    ],
    resource_requirements: [],
    constraints: [],
    evidence: [
      {
        type: "KPI",
        source: "Test",
        finding: "Test finding",
        measured_at: new Date(),
        confidence: ConfidenceLevel.HIGH,
      },
    ],
    created_at: new Date(),
    created_by: "test-user",
    version: 1,
    is_approved: false,
    ...overrides,
  };
}

describe("RecommendationPriorityScorerEngine", () => {
  describe("scoreRecommendation", () => {
    it("should score a recommendation with high impact and high urgency as CRITICAL", () => {
      const rec = createTestRecommendation({
        impact_assessments: [
          {
            dimension: ImpactDimension.SURVIVAL,
            baseline: 10,
            projected: 50,
            improvement_percent: 40, // High impact
            confidence: ConfidenceLevel.VERY_HIGH,
            supporting_evidence: [],
          },
        ],
        urgency: {
          is_time_sensitive: true,
          window_days: 5, // Critical urgency
          penalty_if_delayed_percent: 50,
          rationale: "Survival critical",
        },
        action_items: [
          {
            id: "action-1",
            title: "Action 1",
            description: "Test action",
            estimated_effort: EffortScale.MINIMAL, // Low effort
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
        ],
        risk_assessment: {
          execution_risk: "low",
          market_risk: "low",
          financial_risk: "low",
          customer_risk: "low",
          total_risk_level: "low",
          mitigations: [],
        },
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.impact_score).toBe(100);
      expect(score.urgency_score).toBe(100);
      expect(score.effort_score).toBe(1); // MINIMAL = 1
      expect(score.risk_score).toBeLessThan(10); // LOW risk should be very low
      expect([PriorityLevel.CRITICAL, PriorityLevel.HIGH]).toContain(score.priority_level);
      expect(score.composite_priority).toBeGreaterThan(1000);
    });

    it("should score a recommendation with medium impact and medium urgency consistently", () => {
      const rec = createTestRecommendation({
        impact_assessments: [
          {
            dimension: ImpactDimension.REVENUE,
            baseline: 100,
            projected: 110,
            improvement_percent: 10, // Medium impact
            confidence: ConfidenceLevel.MEDIUM,
            supporting_evidence: [],
          },
        ],
        urgency: {
          is_time_sensitive: true,
          window_days: 60, // Medium urgency
          penalty_if_delayed_percent: 10,
          rationale: "Standard timeline",
        },
        action_items: [
          {
            id: "action-1",
            title: "Action 1",
            description: "Test action",
            estimated_effort: EffortScale.MEDIUM,
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
        ],
        risk_assessment: {
          execution_risk: "medium",
          market_risk: "medium",
          financial_risk: "low",
          customer_risk: "low",
          total_risk_level: "medium",
          mitigations: [],
        },
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      // Should have valid scores
      expect(score.impact_score).toBeGreaterThan(0);
      expect(score.urgency_score).toBeGreaterThan(0);
      expect(score.composite_priority).toBeGreaterThan(0);
      expect(score.priority_level).toBeDefined();
    });

    it("should score a recommendation with low effort higher than one with high effort", () => {
      const baseRec = createTestRecommendation({
        impact_assessments: [
          {
            dimension: ImpactDimension.SURVIVAL,
            baseline: 10,
            projected: 50,
            improvement_percent: 40,
            confidence: ConfidenceLevel.VERY_HIGH,
            supporting_evidence: [],
          },
        ],
        urgency: {
          is_time_sensitive: true,
          window_days: 10,
          penalty_if_delayed_percent: 50,
          rationale: "Survival critical",
        },
        risk_assessment: {
          execution_risk: "low",
          market_risk: "low",
          financial_risk: "low",
          customer_risk: "low",
          total_risk_level: "low",
          mitigations: [],
        },
      });

      const recLowEffort = {
        ...baseRec,
        action_items: [
          {
            id: "action-1",
            title: "Action 1",
            description: "Quick fix",
            estimated_effort: EffortScale.MINIMAL,
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
        ],
      };

      const recHighEffort = {
        ...baseRec,
        action_items: [
          {
            id: "action-1",
            title: "Action 1",
            description: "Complex project",
            estimated_effort: EffortScale.VERY_LARGE,
            dependencies: ["other-action"],
            is_parallel_safe: false,
            success_criteria: [],
          },
        ],
      };

      const scoreLow = RecommendationPriorityScorerEngine.scoreRecommendation(recLowEffort);
      const scoreHigh = RecommendationPriorityScorerEngine.scoreRecommendation(recHighEffort);

      expect(scoreLow.composite_priority).toBeGreaterThan(scoreHigh.composite_priority);
      expect(scoreLow.effort_score).toBeLessThan(scoreHigh.effort_score);
    });

    it("should lower priority when constraints are present", () => {
      const recNoConstraints = createTestRecommendation({
        impact_assessments: [
          {
            dimension: ImpactDimension.SURVIVAL,
            baseline: 10,
            projected: 50,
            improvement_percent: 40,
            confidence: ConfidenceLevel.VERY_HIGH,
            supporting_evidence: [],
          },
        ],
        constraints: [],
      });

      const recWithConstraints = createTestRecommendation({
        impact_assessments: [
          {
            dimension: ImpactDimension.SURVIVAL,
            baseline: 10,
            projected: 50,
            improvement_percent: 40,
            confidence: ConfidenceLevel.VERY_HIGH,
            supporting_evidence: [],
          },
        ],
        constraints: [
          {
            type: "OWNER_AVAILABILITY",
            severity: "high",
            description: "Owner unavailable",
            mitigation: "Hire contractor",
          },
        ],
      });

      const scoreNoConstraints = RecommendationPriorityScorerEngine.scoreRecommendation(recNoConstraints);
      const scoreWithConstraints = RecommendationPriorityScorerEngine.scoreRecommendation(recWithConstraints);

      expect(scoreNoConstraints.composite_priority).toBeGreaterThan(scoreWithConstraints.composite_priority);
    });

    it("should require workspaceId", () => {
      const rec = createTestRecommendation({
        workspaceId: "",
      });

      expect(() => {
        RecommendationPriorityScorerEngine.scoreRecommendation(rec);
      }).toThrow("workspaceId");
    });

    it("should handle recommendations with no impact assessments", () => {
      const rec = createTestRecommendation({
        impact_assessments: [],
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.impact_score).toBe(50); // Default medium
      expect(score.composite_priority).toBeGreaterThan(0);
    });

    it("should classify HIGH when impact and urgency are both high", () => {
      const rec = createTestRecommendation({
        impact_assessments: [
          {
            dimension: ImpactDimension.SURVIVAL,
            baseline: 10,
            projected: 60,
            improvement_percent: 50,
            confidence: ConfidenceLevel.VERY_HIGH,
            supporting_evidence: [],
          },
        ],
        urgency: {
          is_time_sensitive: true,
          window_days: 3, // Critical urgency
          penalty_if_delayed_percent: 100,
          rationale: "Survival critical",
        },
        action_items: [
          {
            id: "action-1",
            title: "Action 1",
            description: "Emergency action",
            estimated_effort: EffortScale.SMALL,
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
        ],
        risk_assessment: {
          execution_risk: "low",
          market_risk: "low",
          financial_risk: "low",
          customer_risk: "low",
          total_risk_level: "low",
          mitigations: [],
        },
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect([PriorityLevel.CRITICAL, PriorityLevel.HIGH]).toContain(score.priority_level);
      expect(score.composite_priority).toBeGreaterThan(100);
    });
  });

  describe("scoreAndRankRecommendations", () => {
    it("should rank recommendations by composite priority descending", () => {
      const criticalRec = createTestRecommendation({
        id: "critical-1",
        impact_assessments: [
          {
            dimension: ImpactDimension.SURVIVAL,
            baseline: 10,
            projected: 50,
            improvement_percent: 40,
            confidence: ConfidenceLevel.VERY_HIGH,
            supporting_evidence: [],
          },
        ],
        urgency: {
          is_time_sensitive: true,
          window_days: 5,
          penalty_if_delayed_percent: 50,
          rationale: "Critical",
        },
        action_items: [
          {
            id: "action-1",
            title: "Action",
            description: "Test",
            estimated_effort: EffortScale.MINIMAL,
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
        ],
        risk_assessment: {
          execution_risk: "low",
          market_risk: "low",
          financial_risk: "low",
          customer_risk: "low",
          total_risk_level: "low",
          mitigations: [],
        },
      });

      const lowRec = createTestRecommendation({
        id: "low-1",
        impact_assessments: [
          {
            dimension: ImpactDimension.REVENUE,
            baseline: 100,
            projected: 102,
            improvement_percent: 2,
            confidence: ConfidenceLevel.LOW,
            supporting_evidence: [],
          },
        ],
        urgency: {
          is_time_sensitive: false,
          rationale: "Not urgent",
        },
        action_items: [
          {
            id: "action-1",
            title: "Action",
            description: "Test",
            estimated_effort: EffortScale.VERY_LARGE,
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
        ],
      });

      const ranked = RecommendationPriorityScorerEngine.scoreAndRankRecommendations([lowRec, criticalRec]);

      expect(ranked[0].id).toBe("critical-1");
      expect(ranked[1].id).toBe("low-1");
    });

    it("should score all recommendations in the list", () => {
      const recs = [
        createTestRecommendation({ id: "rec-1" }),
        createTestRecommendation({ id: "rec-2" }),
        createTestRecommendation({ id: "rec-3" }),
      ];

      const ranked = RecommendationPriorityScorerEngine.scoreAndRankRecommendations(recs);

      expect(ranked).toHaveLength(3);
      expect(ranked.every((r) => r.priority_score.composite_priority >= 0)).toBe(true);
    });
  });

  describe("filterByPriority", () => {
    it("should filter recommendations by priority level", () => {
      const rec1 = createTestRecommendation({
        id: "rec-1",
        impact_assessments: [
          {
            dimension: ImpactDimension.SURVIVAL,
            baseline: 10,
            projected: 50,
            improvement_percent: 40,
            confidence: ConfidenceLevel.VERY_HIGH,
            supporting_evidence: [],
          },
        ],
        urgency: {
          is_time_sensitive: true,
          window_days: 5,
          penalty_if_delayed_percent: 50,
          rationale: "Critical",
        },
        action_items: [
          {
            id: "action-1",
            title: "Action",
            description: "Test",
            estimated_effort: EffortScale.MINIMAL,
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
        ],
        risk_assessment: {
          execution_risk: "low",
          market_risk: "low",
          financial_risk: "low",
          customer_risk: "low",
          total_risk_level: "low",
          mitigations: [],
        },
      });

      const rec2 = createTestRecommendation({
        id: "rec-2",
        impact_assessments: [
          {
            dimension: ImpactDimension.REVENUE,
            baseline: 100,
            projected: 102,
            improvement_percent: 2,
            confidence: ConfidenceLevel.LOW,
            supporting_evidence: [],
          },
        ],
        urgency: {
          is_time_sensitive: false,
          rationale: "Not urgent",
        },
        action_items: [
          {
            id: "action-1",
            title: "Action",
            description: "Test",
            estimated_effort: EffortScale.VERY_LARGE,
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
        ],
      });

      const score1 = RecommendationPriorityScorerEngine.scoreRecommendation(rec1);
      const score2 = RecommendationPriorityScorerEngine.scoreRecommendation(rec2);

      const allRecs: Recommendation[] = [
        { ...rec1, priority_score: score1 },
        { ...rec2, priority_score: score2 },
      ];

      // Filter by the priority level of the first recommendation
      const filtered = RecommendationPriorityScorerEngine.filterByPriority(allRecs, score1.priority_level);

      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((r) => r.priority_score.priority_level === score1.priority_level)).toBe(true);
    });
  });

  describe("getCriticalAndHighPriority", () => {
    it("should return only CRITICAL and HIGH priority recommendations", () => {
      const recs: Recommendation[] = [];

      // Create recommendations across all priority levels
      for (let i = 0; i < 5; i++) {
        const rec = createTestRecommendation({
          id: `rec-${i}`,
          impact_assessments: [
            {
              dimension: ImpactDimension.SURVIVAL,
              baseline: 10,
              projected: 10 + i * 10,
              improvement_percent: i * 10,
              confidence: i > 2 ? ConfidenceLevel.HIGH : ConfidenceLevel.LOW,
              supporting_evidence: [],
            },
          ],
          urgency: {
            is_time_sensitive: i < 3,
            window_days: i < 3 ? 30 - i * 10 : undefined,
            penalty_if_delayed_percent: i * 10,
            rationale: "Test",
          },
          action_items: [
            {
              id: "action-1",
              title: "Action",
              description: "Test",
              estimated_effort: [EffortScale.MINIMAL, EffortScale.SMALL, EffortScale.MEDIUM, EffortScale.LARGE, EffortScale.VERY_LARGE][i],
              dependencies: [],
              is_parallel_safe: true,
              success_criteria: [],
            },
          ],
        });

        const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);
        recs.push({ ...rec, priority_score: score });
      }

      const criticalAndHigh = RecommendationPriorityScorerEngine.getCriticalAndHighPriority(recs);

      // Verify that all returned recommendations are CRITICAL or HIGH
      if (criticalAndHigh.length > 0) {
        expect(criticalAndHigh.every((r) => r.priority_score.priority_level === PriorityLevel.CRITICAL || r.priority_score.priority_level === PriorityLevel.HIGH)).toBe(true);
      }
    });
  });

  describe("validateWorkspaceId", () => {
    it("should throw if workspaceId is empty", () => {
      const rec = createTestRecommendation();

      expect(() => {
        RecommendationPriorityScorerEngine.validateWorkspaceId("", rec);
      }).toThrow("workspaceId");
    });

    it("should throw if recommendation workspace does not match", () => {
      const rec = createTestRecommendation({
        workspaceId: "workspace-1",
      });

      expect(() => {
        RecommendationPriorityScorerEngine.validateWorkspaceId("workspace-2", rec);
      }).toThrow("workspace mismatch");
    });

    it("should not throw if workspaceIds match", () => {
      const rec = createTestRecommendation({
        workspaceId: "workspace-1",
      });

      expect(() => {
        RecommendationPriorityScorerEngine.validateWorkspaceId("workspace-1", rec);
      }).not.toThrow();
    });
  });

  describe("impact score calculation", () => {
    it("should classify as critical (100) when improvement >= 30%", () => {
      const rec = createTestRecommendation({
        impact_assessments: [
          {
            dimension: ImpactDimension.SURVIVAL,
            baseline: 10,
            projected: 50,
            improvement_percent: 40,
            confidence: ConfidenceLevel.VERY_HIGH,
            supporting_evidence: [],
          },
        ],
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.impact_score).toBe(100);
    });

    it("should classify as high (85) when improvement 15-29%", () => {
      const rec = createTestRecommendation({
        impact_assessments: [
          {
            dimension: ImpactDimension.REVENUE,
            baseline: 100,
            projected: 120,
            improvement_percent: 20,
            confidence: ConfidenceLevel.HIGH,
            supporting_evidence: [],
          },
        ],
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.impact_score).toBe(85);
    });

    it("should average multiple impact assessments", () => {
      const rec = createTestRecommendation({
        impact_assessments: [
          {
            dimension: ImpactDimension.REVENUE,
            baseline: 100,
            projected: 120,
            improvement_percent: 20,
            confidence: ConfidenceLevel.HIGH,
            supporting_evidence: [],
          },
          {
            dimension: ImpactDimension.PROFITABILITY,
            baseline: 10,
            projected: 50,
            improvement_percent: 40,
            confidence: ConfidenceLevel.HIGH,
            supporting_evidence: [],
          },
        ],
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.impact_score).toBeGreaterThan(80);
    });
  });

  describe("urgency score calculation", () => {
    it("should return 100 for critical urgency (< 7 days)", () => {
      const rec = createTestRecommendation({
        urgency: {
          is_time_sensitive: true,
          window_days: 3,
          penalty_if_delayed_percent: 50,
          rationale: "Critical",
        },
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.urgency_score).toBe(100);
    });

    it("should return 80 for high urgency (7-30 days)", () => {
      const rec = createTestRecommendation({
        urgency: {
          is_time_sensitive: true,
          window_days: 20,
          penalty_if_delayed_percent: 30,
          rationale: "High",
        },
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.urgency_score).toBe(80);
    });

    it("should return 20 for non-time-sensitive urgency", () => {
      const rec = createTestRecommendation({
        urgency: {
          is_time_sensitive: false,
          rationale: "Not urgent",
        },
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.urgency_score).toBe(20);
    });
  });

  describe("effort score calculation", () => {
    it("should score MINIMAL effort as lowest effort value", () => {
      const rec = createTestRecommendation({
        action_items: [
          {
            id: "action-1",
            title: "Quick fix",
            description: "Minimal effort",
            estimated_effort: EffortScale.MINIMAL,
            dependencies: [],
            is_parallel_safe: true,
            success_criteria: [],
          },
        ],
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.effort_score).toBe(1);
    });

    it("should score VERY_LARGE effort as highest effort value", () => {
      const rec = createTestRecommendation({
        action_items: [
          {
            id: "action-1",
            title: "Complex project",
            description: "Very large effort",
            estimated_effort: EffortScale.VERY_LARGE,
            dependencies: ["other"],
            is_parallel_safe: false,
            success_criteria: [],
          },
        ],
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.effort_score).toBe(95);
    });
  });

  describe("risk score calculation", () => {
    it("should score low risk as very low value", () => {
      const rec = createTestRecommendation({
        risk_assessment: {
          execution_risk: "low",
          market_risk: "low",
          financial_risk: "low",
          customer_risk: "low",
          total_risk_level: "low",
          mitigations: [],
        },
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.risk_score).toBeLessThan(10);
    });

    it("should score critical risk as very high value", () => {
      const rec = createTestRecommendation({
        risk_assessment: {
          execution_risk: "critical",
          market_risk: "high",
          financial_risk: "high",
          customer_risk: "high",
          total_risk_level: "critical",
          mitigations: [],
        },
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.risk_score).toBeGreaterThanOrEqual(80);
    });
  });

  describe("constraint friction calculation", () => {
    it("should return 1.0 with no constraints", () => {
      const rec = createTestRecommendation({
        constraints: [],
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.constraint_friction).toBe(1.0);
    });

    it("should multiply friction by 2.0 for each high-severity constraint", () => {
      const recOne = createTestRecommendation({
        constraints: [
          {
            type: "OWNER_AVAILABILITY",
            severity: "high",
            description: "Owner unavailable",
          },
        ],
      });

      const recTwo = createTestRecommendation({
        constraints: [
          {
            type: "OWNER_AVAILABILITY",
            severity: "high",
            description: "Owner unavailable",
          },
          {
            type: "FINANCIAL",
            severity: "high",
            description: "No budget",
          },
        ],
      });

      const scoreOne = RecommendationPriorityScorerEngine.scoreRecommendation(recOne);
      const scoreTwo = RecommendationPriorityScorerEngine.scoreRecommendation(recTwo);

      expect(scoreOne.constraint_friction).toBe(2.0);
      expect(scoreTwo.constraint_friction).toBe(4.0);
    });

    it("should cap friction at 10.0", () => {
      const rec = createTestRecommendation({
        constraints: Array(10)
          .fill(null)
          .map((_, i) => ({
            type: "OWNER_AVAILABILITY" as const,
            severity: "high" as const,
            description: `Constraint ${i}`,
          })),
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.constraint_friction).toBeLessThanOrEqual(10.0);
    });
  });

  describe("confidence score calculation", () => {
    it("should average evidence confidence levels", () => {
      const rec = createTestRecommendation({
        evidence: [
          {
            type: "KPI",
            source: "Source 1",
            finding: "Finding 1",
            measured_at: new Date(),
            confidence: ConfidenceLevel.VERY_HIGH,
          },
          {
            type: "FEEDBACK",
            source: "Source 2",
            finding: "Finding 2",
            measured_at: new Date(),
            confidence: ConfidenceLevel.HIGH,
          },
        ],
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.confidence_score).toBeGreaterThan(85);
    });

    it("should default to 50 with no evidence", () => {
      const rec = createTestRecommendation({
        evidence: [],
      });

      const score = RecommendationPriorityScorerEngine.scoreRecommendation(rec);

      expect(score.confidence_score).toBe(50);
    });
  });
});
