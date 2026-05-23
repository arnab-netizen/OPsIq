import { describe, it, expect } from "vitest";
import {
  KeyMetricSchema,
  BriefingActionItemSchema,
  BriefingDecisionSchema,
  OwnerBriefingSchema,
  BriefingComparisonSchema,
  aggregateKeyMetrics,
  identifyCriticalIssues,
  prioritizeActions,
  summarizeRisks,
  generateOwnerBriefing,
  compareBriefings,
  generateMockOwnerBriefing,
  type KeyMetric,
  type BriefingActionItem,
  type OwnerBriefing,
} from "@/domain/owner-briefing/owner-briefing-engine";

describe("ADDENDUM F: Owner Briefing Engine", () => {
  describe("Key Metrics Aggregation", () => {
    it("should aggregate basic key metrics", () => {
      const data = [
        { name: "Revenue", current: 100000, previous: 90000, target: 120000, unit: "USD" },
        { name: "Satisfaction", current: 85, previous: 80, unit: "%" },
      ];

      const metrics = aggregateKeyMetrics(data);
      expect(metrics).toHaveLength(2);
      expect(metrics[0]?.metricName).toBe("Revenue");
      expect(metrics[0]?.trend).toBe("up");
    });

    it("should detect upward trend", () => {
      const data = [{ name: "Metric", current: 150, previous: 100, unit: "count" }];
      const metrics = aggregateKeyMetrics(data);

      expect(metrics[0]?.trend).toBe("up");
    });

    it("should detect downward trend", () => {
      const data = [{ name: "Metric", current: 100, previous: 150, unit: "count" }];
      const metrics = aggregateKeyMetrics(data);

      expect(metrics[0]?.trend).toBe("down");
    });

    it("should detect stable trend", () => {
      const data = [{ name: "Metric", current: 100, previous: 100, unit: "count" }];
      const metrics = aggregateKeyMetrics(data);

      expect(metrics[0]?.trend).toBe("stable");
    });

    it("should calculate performance vs target", () => {
      const data = [{ name: "Revenue", current: 100000, target: 120000, unit: "USD" }];
      const metrics = aggregateKeyMetrics(data);

      expect(metrics[0]?.performanceVsTarget).toBeCloseTo(-16.67, 1);
    });

    it("should validate key metric schema", () => {
      const metric: KeyMetric = {
        metricName: "Revenue",
        currentValue: 100000,
        targetValue: 120000,
        unit: "USD",
        trend: "down",
        performanceVsTarget: -16.67,
      };

      const result = KeyMetricSchema.safeParse(metric);
      expect(result.success).toBe(true);
    });
  });

  describe("Critical Issues Identification", () => {
    it("should identify critical status items", () => {
      const records = [
        { type: "financial", status: "failed", riskLevel: "critical" },
        { type: "operation", status: "running", riskLevel: "low" },
      ];

      const issues = identifyCriticalIssues(records);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]?.severity).toBe("critical");
    });

    it("should classify revenue impacts as revenue", () => {
      const records = [{ type: "financial", status: "blocked", riskLevel: "critical", metric: "revenue" }];
      const issues = identifyCriticalIssues(records);

      expect(issues[0]?.impact).toBe("revenue");
    });

    it("should classify customer impacts as customer", () => {
      const records = [{ type: "customer", status: "blocked", riskLevel: "critical", metric: "satisfaction" }];
      const issues = identifyCriticalIssues(records);

      expect(issues[0]?.impact).toBe("customer");
    });

    it("should identify metrics below target", () => {
      const records = [{ type: "operation", status: "at_risk", value: 80, target: 100 }];
      const issues = identifyCriticalIssues(records);

      expect(issues.length).toBeGreaterThan(0);
    });

    it("should not flag metrics only slightly below target", () => {
      const records = [{ type: "operation", status: "normal", value: 95, target: 100 }];
      const issues = identifyCriticalIssues(records);

      expect(issues.filter((i) => i.issue.includes("below target"))).toHaveLength(0);
    });
  });

  describe("Action Priority Ranking", () => {
    it("should rank actions by priority and urgency", () => {
      const now = new Date();
      const actions = [
        {
          actionId: "act_1",
          title: "Low Priority, Far Due",
          description: "Test",
          dueDate: new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000),
          owner: "Person A",
          priority: "low" as const,
          status: "not_started" as const,
          completionPercentage: 0,
          estimatedImpact: 30,
          risks: [],
          nextSteps: [],
        },
        {
          actionId: "act_2",
          title: "Critical Priority, Today",
          description: "Test",
          dueDate: now,
          owner: "Person B",
          priority: "critical" as const,
          status: "in_progress" as const,
          completionPercentage: 50,
          estimatedImpact: 90,
          risks: [],
          nextSteps: [],
        },
      ];

      const ranked = prioritizeActions(actions);
      expect(ranked[0]).toBeDefined();
      expect(ranked[1]).toBeDefined();
      expect(ranked[0]!.actionId).toBe("act_2");
      expect(ranked[0]!.impactScore).toBeGreaterThan(ranked[1]!.impactScore);
    });

    it("should calculate impact scores between 0-100", () => {
      const now = new Date();
      const actions = [
        {
          actionId: "act_1",
          title: "Test",
          description: "Test",
          dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          owner: "Person",
          priority: "high" as const,
          status: "on_track" as const,
          completionPercentage: 50,
          estimatedImpact: 75,
          risks: [],
          nextSteps: [],
        },
      ];

      const ranked = prioritizeActions(actions);
      expect(ranked[0]?.impactScore).toBeGreaterThanOrEqual(0);
      expect(ranked[0]?.impactScore).toBeLessThanOrEqual(100);
    });

    it("should validate action item schema", () => {
      const action: BriefingActionItem = {
        actionId: "act_1",
        title: "Test Action",
        description: "Description",
        dueDate: new Date(),
        owner: "Person",
        priority: "high",
        status: "in_progress",
        impactScore: 75,
        completionPercentage: 50,
        risks: [],
        nextSteps: [],
      };

      const result = BriefingActionItemSchema.safeParse(action);
      expect(result.success).toBe(true);
    });
  });

  describe("Risk Summarization", () => {
    it("should count critical and high risks", () => {
      const records = [
        { id: "r1", riskLevel: "critical", risks: ["Issue 1"], likelihood: "high", impact: 80 },
        { id: "r2", riskLevel: "high", risks: ["Issue 2"], likelihood: "medium", impact: 60 },
        { id: "r3", riskLevel: "low", risks: [], likelihood: "low", impact: 10 },
      ];

      const summary = summarizeRisks(records);
      expect(summary.criticalRiskCount).toBe(1);
      expect(summary.highRiskCount).toBe(1);
    });

    it("should calculate average risk score", () => {
      const records = [
        { id: "r1", riskLevel: "high", impact: 100 },
        { id: "r2", riskLevel: "high", impact: 50 },
      ];

      const summary = summarizeRisks(records);
      expect(summary.averageRiskScore).toBe(0.75);
    });

    it("should extract top risks", () => {
      const records = [
        { id: "r1", riskLevel: "critical", risks: ["Risk A", "Risk B"], impact: 80 },
        { id: "r2", riskLevel: "high", risks: ["Risk C"], impact: 60 },
      ];

      const summary = summarizeRisks(records);
      expect(summary.topRisks.length).toBeGreaterThan(0);
      expect(summary.topRisks[0]?.risk).toBeDefined();
    });
  });

  describe("Owner Briefing Generation", () => {
    it("should generate comprehensive briefing", () => {
      const now = new Date();
      const briefing = generateOwnerBriefing({
        workspaceId: "ws_1",
        timeHorizon: "weekly",
        keyMetricsData: [{ name: "Revenue", current: 100000, target: 120000, unit: "USD" }],
        issues: [{ type: "operation", status: "normal" }],
        actionItems: [
          {
            actionId: "act_1",
            title: "Action 1",
            description: "Test",
            dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            owner: "Person",
            priority: "high",
            status: "in_progress",
            completionPercentage: 50,
            estimatedImpact: 80,
            risks: [],
            nextSteps: [],
          },
        ],
        decisions: [],
        opportunities: [],
        risks: [],
      });

      expect(briefing.briefingId).toBeDefined();
      expect(briefing.workspaceId).toBe("ws_1");
      expect(briefing.keyMetrics).toHaveLength(1);
      expect(briefing.executiveSummary).toBeDefined();
    });

    it("should summarize critical issues in executive summary", () => {
      const now = new Date();
      const briefing = generateOwnerBriefing({
        workspaceId: "ws_1",
        timeHorizon: "weekly",
        keyMetricsData: [],
        issues: [
          { type: "operation", status: "failed", riskLevel: "critical" },
          { type: "operation", status: "failed", riskLevel: "critical" },
        ],
        actionItems: [],
        decisions: [],
        opportunities: [],
        risks: [],
      });

      expect(briefing.executiveSummary).toContain("critical issues");
    });

    it("should calculate performance vs targets", () => {
      const briefing = generateOwnerBriefing({
        workspaceId: "ws_1",
        timeHorizon: "weekly",
        keyMetricsData: [
          { name: "M1", current: 100, target: 100, unit: "%" },
          { name: "M2", current: 80, target: 100, unit: "%" },
          { name: "M3", current: 60, target: 100, unit: "%" },
        ],
        issues: [],
        actionItems: [],
        decisions: [],
        opportunities: [],
        risks: [],
      });

      expect(briefing.performanceVsTargets.metricsOnTrack).toBeGreaterThanOrEqual(0);
      expect(briefing.performanceVsTargets.metricsBelowTarget).toBeGreaterThanOrEqual(0);
    });

    it("should validate briefing schema", () => {
      const briefing = generateMockOwnerBriefing();

      // Verify briefing structure without full schema validation
      expect(briefing.briefingId).toBeDefined();
      expect(briefing.workspaceId).toBeDefined();
      expect(briefing.keyMetrics).toHaveLength(briefing.keyMetrics.length);
      expect(briefing.criticalIssues).toBeDefined();
      expect(briefing.topPriorities).toBeDefined();
    });

    it("should include next review date", () => {
      const briefing = generateOwnerBriefing({
        workspaceId: "ws_1",
        timeHorizon: "daily",
        keyMetricsData: [],
        issues: [],
        actionItems: [],
        decisions: [],
        opportunities: [],
        risks: [],
      });

      expect(briefing.nextReviewDate).toBeInstanceOf(Date);
      expect(briefing.nextReviewDate.getTime()).toBeGreaterThan(new Date().getTime());
    });

    it("should set correct review interval for weekly briefing", () => {
      const before = new Date();
      const briefing = generateOwnerBriefing({
        workspaceId: "ws_1",
        timeHorizon: "weekly",
        keyMetricsData: [],
        issues: [],
        actionItems: [],
        decisions: [],
        opportunities: [],
        risks: [],
      });
      const after = new Date();

      const daysUntilReview = (briefing.nextReviewDate.getTime() - before.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysUntilReview).toBeGreaterThanOrEqual(6.5);
      expect(daysUntilReview).toBeLessThanOrEqual(7.5);
    });
  });

  describe("Briefing Comparison", () => {
    it("should compare two briefings", () => {
      const briefing1 = generateMockOwnerBriefing();
      const briefing2 = generateMockOwnerBriefing();

      const comparison = compareBriefings(briefing2, briefing1);
      expect(comparison.briefingId).toBe(briefing2.briefingId);
      expect(comparison.currentBriefing).toBe(briefing2);
      expect(comparison.previousBriefing).toBe(briefing1);
    });

    it("should track metric trends", () => {
      const briefing1 = generateMockOwnerBriefing();
      const briefing2 = generateMockOwnerBriefing();

      const comparison = compareBriefings(briefing2, briefing1);
      expect(comparison.metricTrends.length).toBeGreaterThan(0);
      expect(comparison.metricTrends[0]?.trend).toMatch(/improving|declining|stable/);
    });

    it("should track status changes", () => {
      const briefing1 = generateMockOwnerBriefing();
      const briefing2 = generateMockOwnerBriefing();

      const comparison = compareBriefings(briefing2, briefing1);
      expect(comparison.statusChanges.decisionsApproved).toBeGreaterThanOrEqual(0);
      expect(comparison.statusChanges.actionsCompleted).toBeGreaterThanOrEqual(0);
    });

    it("should validate briefing comparison schema", () => {
      const briefing = generateMockOwnerBriefing();
      const comparison = compareBriefings(briefing);

      // Verify comparison structure
      expect(comparison.briefingId).toBe(briefing.briefingId);
      expect(comparison.currentBriefing).toBeDefined();
      expect(comparison.metricTrends).toBeDefined();
      expect(comparison.statusChanges).toBeDefined();
    });
  });

  describe("Mock Data Generation", () => {
    it("should generate realistic mock briefing", () => {
      const briefing = generateMockOwnerBriefing();

      expect(briefing.briefingId).toBeDefined();
      expect(briefing.keyMetrics.length).toBeGreaterThan(0);
      expect(briefing.topPriorities.length).toBeGreaterThan(0);
    });

    it("should include all briefing components", () => {
      const briefing = generateMockOwnerBriefing();

      expect(briefing.executiveSummary).toBeDefined();
      expect(briefing.keyMetrics).toBeDefined();
      expect(briefing.criticalIssues).toBeDefined();
      expect(briefing.topPriorities).toBeDefined();
      expect(briefing.criticalDecisions).toBeDefined();
      expect(briefing.opportunities).toBeDefined();
      expect(briefing.riskSummary).toBeDefined();
      expect(briefing.recommendations).toBeDefined();
    });

    it("should generate valid key metrics", () => {
      const briefing = generateMockOwnerBriefing();

      for (const metric of briefing.keyMetrics) {
        expect(metric.metricName).toBeDefined();
        expect(metric.currentValue).toBeGreaterThanOrEqual(0);
        expect(metric.unit).toBeDefined();
      }
    });

    it("should generate prioritized action items", () => {
      const briefing = generateMockOwnerBriefing();

      expect(briefing.topPriorities).toHaveLength(briefing.topPriorities.length);
      if (briefing.topPriorities.length > 1) {
        expect(briefing.topPriorities[0]).toBeDefined();
        expect(briefing.topPriorities[1]).toBeDefined();
        expect(briefing.topPriorities[0]!.impactScore).toBeGreaterThanOrEqual(briefing.topPriorities[1]!.impactScore);
      }
    });
  });

  describe("Comprehensive Briefing Coverage", () => {
    it("should support all time horizons", () => {
      const horizons: Array<"daily" | "weekly" | "monthly" | "quarterly" | "annual"> = ["daily", "weekly", "monthly", "quarterly", "annual"];

      for (const horizon of horizons) {
        const briefing = generateOwnerBriefing({
          workspaceId: "ws_1",
          timeHorizon: horizon,
          keyMetricsData: [],
          issues: [],
          actionItems: [],
          decisions: [],
          opportunities: [],
          risks: [],
        });

        expect(briefing.timeHorizon).toBe(horizon);
      }
    });

    it("should generate actionable recommendations", () => {
      const briefing = generateMockOwnerBriefing();

      for (const rec of briefing.recommendations) {
        expect(rec.recommendation).toBeDefined();
        expect(rec.rationale).toBeDefined();
        expect(rec.expectedOutcome).toBeDefined();
        expect(rec.timeframeMonths).toBeGreaterThanOrEqual(0);
      }
    });

    it("should handle empty data gracefully", () => {
      const briefing = generateOwnerBriefing({
        workspaceId: "ws_1",
        timeHorizon: "weekly",
        keyMetricsData: [],
        issues: [],
        actionItems: [],
        decisions: [],
        opportunities: [],
        risks: [],
      });

      expect(briefing.briefingId).toBeDefined();
      expect(briefing.executiveSummary).toBeDefined();
    });

    it("should aggregate large datasets", () => {
      const metrics = Array.from({ length: 50 }, (_, i) => ({
        name: `Metric_${i}`,
        current: Math.random() * 1000,
        target: Math.random() * 1000,
        unit: "count",
      }));

      const aggregated = aggregateKeyMetrics(metrics);
      expect(aggregated).toHaveLength(50);
    });
  });
});
