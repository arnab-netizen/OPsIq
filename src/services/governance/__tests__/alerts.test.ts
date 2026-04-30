import { describe, it, expect, beforeEach } from "vitest";
import { evaluateGovernanceAlerts } from "../alerts";
import { GovernanceMetrics } from "../metrics";
import { ObservabilitySummary } from "@/services/observability/statistics";
import { GOVERNANCE_ALERT_THRESHOLDS } from "../alert-config";

describe("PHASE 5.6: Governance Alert Rules", () => {
  const testWorkspaceId = "ws-test-123";

  const createMockMetrics = (overrides: Partial<GovernanceMetrics> = {}): GovernanceMetrics => ({
    workspace: { workspaceId: testWorkspaceId },
    period: { days: 30, startDate: new Date().toISOString(), endDate: new Date().toISOString() },
    summary: { totalDecisions: 100, approvedCount: 80, blockedCount: 20 },
    blockRates: {
      overallBlockRate: 20,
      guardrailBlockRate: 50,
      decisionGateBlockRate: 30,
      dependencyValidationBlockRate: 20,
    },
    confidence: { avgConfidenceApproved: 0.8, avgConfidenceBlocked: 0.5 },
    impact: {
      approvedExpectedImpact: 100000,
      blockedExpectedImpact: 50000,
      realizedImpact: 95000,
      lossFromMisses: 5000,
    },
    ...overrides,
  });

  const createMockSummary = (period: "last24h" | "last7d" = "last24h"): ObservabilitySummary => ({
    workspace: { workspaceId: testWorkspaceId },
    period: {
      last24h: {
        lifecycleCounts: [
          { stage: "RECEIVED", status: "success", count: 95 },
          { stage: "ERRORED", status: "error", count: 5 },
        ],
        errorCount: 5,
        blockCount: 10,
        blockReasons: [
          { reason: "Guardrails violation", count: 6 },
          { reason: "Low confidence", count: 4 },
        ],
        stageDurations: [
          {
            stage: "RECEIVED",
            avgDurationMs: 50,
            minDurationMs: 10,
            maxDurationMs: 100,
            count: 95,
          },
          {
            stage: "NORMALIZED",
            avgDurationMs: 150,
            minDurationMs: 50,
            maxDurationMs: 500,
            count: 90,
          },
        ],
        slowestStage: {
          stage: "NORMALIZED",
          avgDurationMs: 150,
          minDurationMs: 50,
          maxDurationMs: 500,
          count: 90,
        },
        recentFailures: [],
      },
      last7d: {
        lifecycleCounts: [
          { stage: "RECEIVED", status: "success", count: 660 },
          { stage: "ERRORED", status: "error", count: 40 },
        ],
        errorCount: 40,
        blockCount: 100,
        blockReasons: [
          { reason: "Guardrails violation", count: 60 },
          { reason: "Low confidence", count: 40 },
        ],
        stageDurations: [
          {
            stage: "RECEIVED",
            avgDurationMs: 50,
            minDurationMs: 10,
            maxDurationMs: 100,
            count: 660,
          },
        ],
        slowestStage: null,
        recentFailures: [],
      },
    },
  });

  describe("No alerts in normal state", () => {
    it("should generate no alerts when all metrics are within thresholds", () => {
      const metrics = createMockMetrics({
        blockRates: {
          overallBlockRate: 10,
          guardrailBlockRate: 30,
          decisionGateBlockRate: 40,
          dependencyValidationBlockRate: 30,
        },
        confidence: { avgConfidenceApproved: 0.8, avgConfidenceBlocked: 0.6 },
      });
      const summary = createMockSummary("last24h");

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary);

      expect(alerts.period.alerts).toHaveLength(0);
      expect(alerts.period.hasAlerts).toBe(false);
      expect(alerts.period.alertCount).toBe(0);
    });
  });

  describe("Overall block rate alert", () => {
    it("should alert when overall block rate exceeds threshold", () => {
      const metrics = createMockMetrics({
        blockRates: {
          overallBlockRate: 25, // Above threshold of 20
          guardrailBlockRate: 30,
          decisionGateBlockRate: 40,
          dependencyValidationBlockRate: 30,
        },
      });
      const summary = createMockSummary();

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary);

      expect(alerts.period.alerts).toHaveLength(1);
      expect(alerts.period.alerts[0].rule).toBe("OVERALL_BLOCK_RATE");
      expect(alerts.period.alerts[0].severity).toBe("warning");
      expect(alerts.period.alerts[0].current).toBe(25);
      expect(alerts.period.alerts[0].threshold).toBe(GOVERNANCE_ALERT_THRESHOLDS.overallBlockRateThreshold);
    });

    it("should not alert when overall block rate equals threshold", () => {
      const metrics = createMockMetrics({
        blockRates: {
          overallBlockRate: 20, // Exactly at threshold
          guardrailBlockRate: 30,
          decisionGateBlockRate: 40,
          dependencyValidationBlockRate: 30,
        },
      });
      const summary = createMockSummary();

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary);

      expect(alerts.period.alerts).toHaveLength(0);
    });
  });

  describe("Guardrail block rate alert", () => {
    it("should alert when guardrail block rate exceeds threshold", () => {
      const metrics = createMockMetrics({
        blockRates: {
          overallBlockRate: 10,
          guardrailBlockRate: 60, // Above threshold of 50
          decisionGateBlockRate: 25,
          dependencyValidationBlockRate: 15,
        },
      });
      const summary = createMockSummary();

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary);

      expect(alerts.period.alerts).toHaveLength(1);
      expect(alerts.period.alerts[0].rule).toBe("GUARDRAIL_BLOCK_RATE");
      expect(alerts.period.alerts[0].severity).toBe("warning");
      expect(alerts.period.alerts[0].current).toBe(60);
    });
  });

  describe("Low blocked confidence alert (critical)", () => {
    it("should alert critically when avg confidence in blocked decisions is too low", () => {
      const metrics = createMockMetrics({
        confidence: { avgConfidenceApproved: 0.8, avgConfidenceBlocked: 0.25 }, // Below 0.3 threshold
      });
      const summary = createMockSummary();

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary);

      expect(alerts.period.alerts).toHaveLength(1);
      expect(alerts.period.alerts[0].rule).toBe("LOW_BLOCKED_CONFIDENCE");
      expect(alerts.period.alerts[0].severity).toBe("critical");
      expect(alerts.period.alerts[0].current).toBe(0.25);
    });

    it("should not alert when null confidence in blocked decisions", () => {
      const metrics = createMockMetrics({
        confidence: { avgConfidenceApproved: 0.8, avgConfidenceBlocked: null }, // No blocked decisions
      });
      const summary = createMockSummary();

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary);

      expect(alerts.period.alerts.filter((a) => a.rule === "LOW_BLOCKED_CONFIDENCE")).toHaveLength(0);
    });

    it("should not alert when confidence at threshold", () => {
      const metrics = createMockMetrics({
        confidence: { avgConfidenceApproved: 0.8, avgConfidenceBlocked: 0.3 }, // Exactly at threshold
      });
      const summary = createMockSummary();

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary);

      expect(alerts.period.alerts.filter((a) => a.rule === "LOW_BLOCKED_CONFIDENCE")).toHaveLength(0);
    });
  });

  describe("Error rate alert (critical)", () => {
    it("should alert critically when error rate exceeds threshold", () => {
      const metrics = createMockMetrics();
      const summary = createMockSummary("last24h");
      // 5 errors out of 100 total = 5% error rate
      // But summary shows 5 errors out of 100, which is 5% (at threshold)
      // Change to 6 errors to exceed 5% threshold

      summary.period.last24h.errorCount = 6;
      summary.period.last24h.lifecycleCounts[1].count = 6;

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary, GOVERNANCE_ALERT_THRESHOLDS, "last24h");

      const errorAlert = alerts.period.alerts.find((a) => a.rule === "ERROR_RATE");
      expect(errorAlert).toBeDefined();
      expect(errorAlert?.severity).toBe("critical");
      expect(errorAlert?.current).toBeGreaterThan(5);
    });

    it("should calculate error rate correctly", () => {
      const metrics = createMockMetrics();
      const summary = createMockSummary("last24h");
      summary.period.last24h.errorCount = 10;
      summary.period.last24h.lifecycleCounts = [
        { stage: "RECEIVED", status: "success", count: 90 },
        { stage: "ERRORED", status: "error", count: 10 },
      ];

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary, GOVERNANCE_ALERT_THRESHOLDS, "last24h");

      const errorAlert = alerts.period.alerts.find((a) => a.rule === "ERROR_RATE");
      expect(errorAlert?.current).toBe(10); // 10% error rate
    });
  });

  describe("Slow run rate alert (info)", () => {
    it("should alert at info level when slow run rate exceeds threshold", () => {
      const metrics = createMockMetrics();
      const summary = createMockSummary("last24h");
      // 20 slow runs out of 100 = 20% slow run rate (exceeds 10% threshold)
      summary.period.last24h.stageDurations = [
        {
          stage: "NORMALIZED",
          avgDurationMs: 600, // Above 500ms threshold
          minDurationMs: 550,
          maxDurationMs: 650,
          count: 20, // 20 runs that are slow
        },
        {
          stage: "RECEIVED",
          avgDurationMs: 50,
          minDurationMs: 10,
          maxDurationMs: 100,
          count: 80,
        },
      ];
      summary.period.last24h.slowestStage = {
        stage: "NORMALIZED",
        avgDurationMs: 600,
        minDurationMs: 550,
        maxDurationMs: 650,
        count: 20,
      };

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary, GOVERNANCE_ALERT_THRESHOLDS, "last24h");

      const slowAlert = alerts.period.alerts.find((a) => a.rule === "SLOW_RUN_RATE");
      expect(slowAlert).toBeDefined();
      expect(slowAlert?.severity).toBe("info");
      expect(slowAlert?.current).toBeGreaterThan(10);
    });

    it("should not count runs below slow threshold", () => {
      const metrics = createMockMetrics();
      const summary = createMockSummary("last24h");
      // All runs are fast
      summary.period.last24h.stageDurations = [
        {
          stage: "RECEIVED",
          avgDurationMs: 50,
          minDurationMs: 10,
          maxDurationMs: 100,
          count: 100,
        },
      ];
      summary.period.last24h.slowestStage = null;

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary, GOVERNANCE_ALERT_THRESHOLDS, "last24h");

      expect(alerts.period.alerts.filter((a) => a.rule === "SLOW_RUN_RATE")).toHaveLength(0);
    });
  });

  describe("Multiple alerts", () => {
    it("should generate multiple alerts when multiple thresholds are exceeded", () => {
      const metrics = createMockMetrics({
        blockRates: {
          overallBlockRate: 30, // Exceeds 20
          guardrailBlockRate: 70, // Exceeds 50
          decisionGateBlockRate: 20,
          dependencyValidationBlockRate: 10,
        },
        confidence: { avgConfidenceApproved: 0.8, avgConfidenceBlocked: 0.2 }, // Below 0.3
      });
      const summary = createMockSummary("last24h");
      summary.period.last24h.errorCount = 15; // 15% error rate, exceeds 5%
      summary.period.last24h.lifecycleCounts = [
        { stage: "RECEIVED", status: "success", count: 85 },
        { stage: "ERRORED", status: "error", count: 15 },
      ];

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary, GOVERNANCE_ALERT_THRESHOLDS, "last24h");

      expect(alerts.period.alerts.length).toBeGreaterThan(2);
      expect(alerts.period.hasAlerts).toBe(true);
      expect(alerts.period.alertCount).toBeGreaterThan(2);
    });

    it("should count severity levels correctly", () => {
      const metrics = createMockMetrics({
        blockRates: {
          overallBlockRate: 30, // warning
          guardrailBlockRate: 20,
          decisionGateBlockRate: 40,
          dependencyValidationBlockRate: 40,
        },
        confidence: { avgConfidenceApproved: 0.8, avgConfidenceBlocked: 0.2 }, // critical
      });
      const summary = createMockSummary("last24h");
      summary.period.last24h.errorCount = 10;
      summary.period.last24h.lifecycleCounts = [
        { stage: "RECEIVED", status: "success", count: 90 },
        { stage: "ERRORED", status: "error", count: 10 },
      ];

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary, GOVERNANCE_ALERT_THRESHOLDS, "last24h");

      expect(alerts.period.criticalCount).toBeGreaterThan(0);
      expect(alerts.period.warningCount).toBeGreaterThan(0);
    });
  });

  describe("Period selection", () => {
    it("should evaluate last24h period when specified", () => {
      const metrics = createMockMetrics({
        blockRates: {
          overallBlockRate: 25,
          guardrailBlockRate: 30,
          decisionGateBlockRate: 40,
          dependencyValidationBlockRate: 30,
        },
      });
      const summary = createMockSummary();

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary, GOVERNANCE_ALERT_THRESHOLDS, "last24h");

      expect(alerts.period.timeRange).toBe("last24h");
      expect(alerts.period.alerts.length).toBeGreaterThan(0);
    });

    it("should evaluate last7d period when specified", () => {
      const metrics = createMockMetrics({
        blockRates: {
          overallBlockRate: 25,
          guardrailBlockRate: 30,
          decisionGateBlockRate: 40,
          dependencyValidationBlockRate: 30,
        },
      });
      const summary = createMockSummary("last7d");

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary, GOVERNANCE_ALERT_THRESHOLDS, "last7d");

      expect(alerts.period.timeRange).toBe("last7d");
    });
  });

  describe("Empty/edge cases", () => {
    it("should handle zero total events gracefully", () => {
      const metrics = createMockMetrics({
        summary: { totalDecisions: 0, approvedCount: 0, blockedCount: 0 },
      });
      const summary = createMockSummary("last24h");
      summary.period.last24h.lifecycleCounts = [];

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary, GOVERNANCE_ALERT_THRESHOLDS, "last24h");

      expect(alerts.period.alerts).toBeDefined();
      expect(Array.isArray(alerts.period.alerts)).toBe(true);
    });

    it("should include workspace ID in response", () => {
      const metrics = createMockMetrics();
      const summary = createMockSummary();

      const alerts = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary);

      expect(alerts.workspace.workspaceId).toBe(testWorkspaceId);
    });

    it("should set hasAlerts flag correctly", () => {
      const metricsGood = createMockMetrics({
        blockRates: {
          overallBlockRate: 5,
          guardrailBlockRate: 10,
          decisionGateBlockRate: 40,
          dependencyValidationBlockRate: 50,
        },
      });
      const alertsGood = evaluateGovernanceAlerts(testWorkspaceId, metricsGood, createMockSummary());

      expect(alertsGood.period.hasAlerts).toBe(false);

      const metricsBad = createMockMetrics({
        blockRates: {
          overallBlockRate: 30,
          guardrailBlockRate: 30,
          decisionGateBlockRate: 40,
          dependencyValidationBlockRate: 30,
        },
      });
      const alertsBad = evaluateGovernanceAlerts(testWorkspaceId, metricsBad, createMockSummary());

      expect(alertsBad.period.hasAlerts).toBe(true);
    });
  });

  describe("Deterministic behavior", () => {
    it("should produce identical output for identical inputs", () => {
      const metrics = createMockMetrics({
        blockRates: {
          overallBlockRate: 25,
          guardrailBlockRate: 60,
          decisionGateBlockRate: 20,
          dependencyValidationBlockRate: 20,
        },
        confidence: { avgConfidenceApproved: 0.8, avgConfidenceBlocked: 0.2 },
      });
      const summary = createMockSummary();

      const alerts1 = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary);
      const alerts2 = evaluateGovernanceAlerts(testWorkspaceId, metrics, summary);

      expect(alerts1.period.alerts).toHaveLength(alerts2.period.alerts.length);
      expect(alerts1.period.alertCount).toBe(alerts2.period.alertCount);
      expect(alerts1.period.criticalCount).toBe(alerts2.period.criticalCount);
    });

    it("should not have side effects on metrics or summary objects", () => {
      const metrics = createMockMetrics();
      const summary = createMockSummary();
      const metricsBefore = JSON.stringify(metrics);
      const summaryBefore = JSON.stringify(summary);

      evaluateGovernanceAlerts(testWorkspaceId, metrics, summary);

      expect(JSON.stringify(metrics)).toBe(metricsBefore);
      expect(JSON.stringify(summary)).toBe(summaryBefore);
    });
  });
});
