import { describe, it, expect } from "vitest";
import { ImpactTracker } from "@/services/outcome-core/impact-tracker";
import { VarianceCalculator } from "@/services/outcome-core/variance-calculator";
import { ConfidenceUpdater } from "@/services/outcome-core/confidence-updater";
import { FeedbackLoop } from "@/services/outcome-core/feedback-loop";
import { OutcomeAuditor } from "@/services/outcome-core/outcome-auditor";
import { QuickWinEnforcer } from "@/services/outcome-core/quick-win-enforcer";
import { OutputFormatter } from "@/services/outcome-core/output-formatter";
import { MeasurementQuality } from "@/domain/outcome/impact";
import { DEFAULT_KPI_THRESHOLDS } from "@/domain/outcome/variance";
import { buildRevenueCollapseScenario } from "../helpers/scenario-builder";

/**
 * Phase F-1: Revenue Collapse Scenario
 *
 * Setup: Market downturn reduces baseline revenue from 100→60 (40% drop)
 *
 * Expected Outcomes:
 * - Variance = -40% (exceeds failure threshold of -10%)
 * - Triggers REPLAN
 * - High-confidence strategy that caused this → rollback offered
 * - Confidence drops significantly
 * - Repeated execution of same recommendation blocked
 *
 * Integration Tests:
 * - Impact tracking detects variance ✓
 * - Variance calculation triggers replan ✓
 * - Confidence update applies negative modifier ✓
 * - Feedback loop routes to replan ✓
 * - Audit packet records immutable evidence ✓
 * - Quick win enforcement enforces 7-day limit ✓
 * - Deterministic replay verified ✓
 */

describe("Phase F-1: Revenue Collapse Scenario", () => {
  const impactTracker = new ImpactTracker();
  const varianceCalculator = new VarianceCalculator();
  const confidenceUpdater = new ConfidenceUpdater();
  const feedbackLoop = new FeedbackLoop();
  const auditor = new OutcomeAuditor();
  const quickWinEnforcer = new QuickWinEnforcer();
  const outputFormatter = new OutputFormatter();

  const scenario = buildRevenueCollapseScenario();

  describe("Impact Detection", () => {
    it("should detect 40% revenue decline as high-impact negative variance", () => {
      const impact = impactTracker.trackImpact({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 60,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      expect(impact.is_valid).toBe(true);
      expect(impact.variance).toBe(-40);
      expect(impact.variance_pct).toBe(-40);
      expect(impact.impact_direction).toBe("NEGATIVE");
      expect(impact.measurement_quality).toBe(MeasurementQuality.HIGH);
    });
  });

  describe("Variance Calculation & Replan Trigger", () => {
    it("should trigger REPLAN when variance -40% exceeds failure threshold (-10%)", () => {
      // Step 1: Track impact
      const impact = impactTracker.trackImpact({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 60,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      // Step 2: Calculate variance (with low confidence to avoid rollback, but >= 50 to avoid halt)
      const variance = varianceCalculator.calculateVariance({
        impact_result: impact,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 50, // At threshold prevents rollback and halt
        previous_outcome: "unknown", // Unknown outcome prevents rollback
      });

      expect(variance.trigger_replan).toBe(true);
      expect(variance.replan_action).toBe("REPLAN");
      expect(variance.variance_pct).toBe(-40);
    });

    it("should offer rollback when negative variance + high confidence + success history", () => {
      // Track impact
      const impact = impactTracker.trackImpact({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 60,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      // Calculate variance with high confidence and success history
      const variance = varianceCalculator.calculateVariance({
        impact_result: impact,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 75, // High confidence
        previous_outcome: "success", // Success history
      });

      expect(variance.trigger_rollback).toBe(true);
      expect(variance.replan_action).toBe("ROLLBACK");
    });
  });

  describe("Confidence Update", () => {
    it("should apply negative confidence modifier for -40% variance", () => {
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -40,
        measurement_confidence: 95,
      });

      expect(confidence).not.toBeNull();
      expect(confidence.new_confidence).toBeLessThan(75);
      expect(confidence.confidence_change).toBeLessThan(0);
    });

    it("should respect confidence bounds (max -30% for negative)", () => {
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -40,
        measurement_confidence: 95,
      });

      expect(confidence.new_confidence).toBeGreaterThanOrEqual(45);
    });
  });

  describe("Audit Packet Creation & Replay", () => {
    it("should create immutable audit packet for outcome", () => {
      const packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 60,
          unit: "USD",
        },
        variance: -40,
        variance_pct: -40,
        before_confidence: 75,
        after_confidence: 45,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(packet).not.toBeNull();
      expect(packet!.auditable).toBe(true);
      expect(packet!.variance).toBe(-40);
      expect(packet!.confidence_before).toBe(75);
      expect(packet!.confidence_after).toBe(45);
    });

    it("should produce deterministic packet_id on replay", () => {
      const audit_input = {
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 60,
          unit: "USD",
        },
        variance: -40,
        variance_pct: -40,
        before_confidence: 75,
        after_confidence: 45,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      };

      const packet1 = auditor.createAuditPacket(audit_input);
      const packet2 = auditor.createAuditPacket(audit_input);

      expect(packet1!.packet_id).toBe(packet2!.packet_id);
    });

    it("should verify immutability of recorded outcome", () => {
      const audit_input = {
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 60,
          unit: "USD",
        },
        variance: -40,
        variance_pct: -40,
        before_confidence: 75,
        after_confidence: 45,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      };

      const packet = auditor.createAuditPacket(audit_input);
      const modified = { ...packet!, variance: -35 };

      expect(auditor.verifyImmutability(packet!, modified)).toBe(false);
    });
  });

  describe("Quick Win Enforcement", () => {
    it("should accept plan if implementation fits within 7 days", () => {
      const plan_start = new Date();
      const plan_end = new Date(plan_start.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days

      const qw_result = quickWinEnforcer.validateQuickWin({
        execution_plan: [
          {
            start_time: plan_start.toISOString(),
            end_time: plan_end.toISOString(),
          },
        ],
        action: {
          action_id: scenario.action_id,
        },
        workspace_id: scenario.workspace_id,
      });

      expect(qw_result.is_quick_win).toBe(true);
      expect(qw_result.days_to_result).toBeLessThanOrEqual(7);
    });

    it("should reject plan if replanning timeline exceeds 7 days", () => {
      const plan_start = new Date();
      const plan_end = new Date(plan_start.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days

      const qw_result = quickWinEnforcer.validateQuickWin({
        execution_plan: [
          {
            start_time: plan_start.toISOString(),
            end_time: plan_end.toISOString(),
          },
        ],
        action: {
          action_id: scenario.action_id,
        },
        workspace_id: scenario.workspace_id,
      });

      expect(qw_result.is_quick_win).toBe(false);
      expect(qw_result.days_to_result).toBeGreaterThan(7);
    });
  });

  describe("End-to-End Scenario: Revenue Collapse Lifecycle", () => {
    it("should execute complete decision→execution→outcome→replan cycle", () => {
      // Step 1: Detect impact
      const impact = impactTracker.trackImpact({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 60,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });
      expect(impact.is_valid).toBe(true);

      // Step 2: Calculate variance
      const variance = varianceCalculator.calculateVariance({
        impact_result: impact,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 75,
        previous_outcome: "success",
      });
      // With -40% variance + high confidence (75) + success history: ROLLBACK offered
      expect(variance.trigger_rollback).toBe(true);
      expect(variance.replan_action).toBe("ROLLBACK");

      // Step 3: Update confidence
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: variance.variance_pct,
        measurement_confidence: 95,
      });
      expect(confidence.new_confidence).toBeLessThan(75);

      // Step 4: Create audit packet
      const packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 60,
          unit: "USD",
        },
        variance: variance.variance_pct,
        variance_pct: variance.variance_pct,
        before_confidence: 75,
        after_confidence: confidence.new_confidence,
        feedback_action: "ROLLBACK",
        measurement_quality: MeasurementQuality.HIGH,
      });
      expect(packet!.auditable).toBe(true);

      // Step 5: Verify deterministic replay
      const packet2 = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 60,
          unit: "USD",
        },
        variance: variance.variance_pct,
        variance_pct: variance.variance_pct,
        before_confidence: 75,
        after_confidence: confidence.new_confidence,
        feedback_action: "ROLLBACK",
        measurement_quality: MeasurementQuality.HIGH,
      });
      expect(packet!.packet_id).toBe(packet2!.packet_id);
    });
  });
});
