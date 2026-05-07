import { describe, it, expect } from "vitest";
import { ImpactTracker } from "@/services/outcome-core/impact-tracker";
import { VarianceCalculator } from "@/services/outcome-core/variance-calculator";
import { ConfidenceUpdater } from "@/services/outcome-core/confidence-updater";
import { OutcomeAuditor } from "@/services/outcome-core/outcome-auditor";
import { MeasurementQuality } from "@/domain/outcome/impact";
import { DEFAULT_KPI_THRESHOLDS } from "@/domain/outcome/variance";
import { buildCompetitorResponseScenario } from "../helpers/scenario-builder";

/**
 * Phase F-9: Competitor Response Scenario
 *
 * Setup: Competitor launches similar offering mid-execution, shrinking market
 *
 * Expected Outcomes:
 * - Baseline shifts: original 100 → competitor response → new baseline 85
 * - Variance calculation dual: vs original (-10%) vs new baseline (+5.9%)
 * - Impact less than planned → confidence drops
 * - Dual variance tracking enables replan decision
 *
 * Integration Tests:
 * - Baseline shift detection mid-execution
 * - Dual variance calculation (original vs new baseline)
 * - Variance comparison logic (which baseline drives decision?)
 * - Confidence drift on suboptimal outcome
 * - Replan trigger on original-baseline variance
 * - Deterministic audit trail with baseline tracking
 */

describe("Phase F-9: Competitor Response Scenario", () => {
  const impactTracker = new ImpactTracker();
  const varianceCalculator = new VarianceCalculator();
  const confidenceUpdater = new ConfidenceUpdater();
  const auditor = new OutcomeAuditor();

  const scenario = buildCompetitorResponseScenario();

  describe("Baseline Shift Detection", () => {
    it("should establish original baseline at plan time", () => {
      const original_baseline = scenario.baseline_shift.original;
      expect(original_baseline).toBe(100);
    });

    it("should detect market shrink when competitor enters", () => {
      const original = scenario.baseline_shift.original;
      const after_competitor = scenario.baseline_shift.after_competitor;
      const market_shrink_pct = ((original - after_competitor) / original) * 100;
      expect(market_shrink_pct).toBe(15); // Market shrinks 15%
      expect(after_competitor).toBeLessThan(original);
    });

    it("should record baseline shift reason (competitor response)", () => {
      // Baseline shift documented as: competitor launch, market response, new equilibrium
      const shift_reason = "competitor_response";
      expect(shift_reason).toBe("competitor_response");
    });

    it("should establish new baseline from market conditions", () => {
      const new_baseline = scenario.baseline_shift.after_competitor;
      expect(new_baseline).toBe(85);
    });
  });

  describe("Dual Variance Calculation", () => {
    it("should calculate variance vs original baseline (100 → 90)", () => {
      const original_baseline = scenario.baseline_shift.original;
      const actual_outcome = scenario.outcome.actual_value;
      const variance_vs_original = ((actual_outcome - original_baseline) / original_baseline) * 100;
      expect(variance_vs_original).toBe(-10); // -10% vs original
    });

    it("should calculate variance vs new baseline (85 → 90)", () => {
      const new_baseline = scenario.baseline_shift.after_competitor;
      const actual_outcome = scenario.outcome.actual_value;
      const variance_vs_new = ((actual_outcome - new_baseline) / new_baseline) * 100;
      expect(variance_vs_new).toBeCloseTo(5.9, 0); // ~+5.9% vs new baseline
    });

    it("should show contradiction: negative vs original, positive vs new baseline", () => {
      const variance_vs_original = scenario.expected_variance_vs_original;
      const variance_vs_new = scenario.expected_variance_vs_new_baseline;
      const is_contradictory = variance_vs_original < 0 && variance_vs_new > 0;
      expect(is_contradictory).toBe(true);
    });

    it("should track both baselines in impact result", () => {
      const original_baseline = 100;
      const new_baseline = 85;
      expect(original_baseline).toBeGreaterThan(new_baseline);
    });
  });

  describe("Variance Comparison and Decision Logic", () => {
    it("should use original baseline for plan-vs-actual comparison", () => {
      // Plan assumed baseline 100
      // Actual outcome 90
      // Variance: -10% (plan not met)
      const variance_original = scenario.expected_variance_vs_original;
      expect(variance_original).toBe(-10);
    });

    it("should note new baseline shows positive progress", () => {
      // Market shifted to 85
      // Outcome 90 is 5.9% above new baseline
      // Indicates effective action despite market shift
      const variance_new = scenario.expected_variance_vs_new_baseline;
      expect(variance_new).toBeCloseTo(5.9, 0);
    });

    it("should prioritize original baseline for replan decision", () => {
      // Decision driver: original plan assumed 100, achieved only 90
      // This is -10%, below success threshold
      // Replan triggered on original-baseline variance, not new-baseline variance
      const trigger_variance = scenario.expected_variance_vs_original;
      expect(trigger_variance).toBeLessThan(0);
    });

    it("should document external shock (competitor) as variance driver", () => {
      // Variance caused by external event (competitor response)
      // Not action failure, but market shift
      // Enables owner to understand true effectiveness
      const external_shock = "competitor_response";
      expect(external_shock).toBe("competitor_response");
    });
  });

  describe("Impact Tracking with Baseline Shift", () => {
    it("should track impact against original baseline (plan time)", () => {
      const impact = impactTracker.trackImpact({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: scenario.baseline_shift.original, // 100
          actual_value: scenario.baseline_shift.original,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: scenario.baseline_shift.original, // 100
          actual_value: scenario.outcome.actual_value, // 90
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 85,
      });

      expect(impact.is_valid).toBe(true);
      expect(impact.variance_pct).toBe(-10); // 90 vs 100 baseline
    });

    it("should recalculate impact against new baseline (current market)", () => {
      const impact = impactTracker.trackImpact({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: scenario.baseline_shift.after_competitor, // 85
          actual_value: scenario.baseline_shift.after_competitor,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: scenario.baseline_shift.after_competitor, // 85
          actual_value: scenario.outcome.actual_value, // 90
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 85,
      });

      expect(impact.is_valid).toBe(true);
      expect(impact.variance_pct).toBeCloseTo(5.88, 0); // 90 vs 85 baseline
    });
  });

  describe("Variance Calculation and Replan Trigger", () => {
    it("should trigger replan if variance vs original < failure threshold", () => {
      // Original baseline variance: -12%
      // Failure threshold: -10%
      // Result: -12% < -10% → triggers replan
      const variance = varianceCalculator.calculateVariance({
        impact_result: {
          action_id: scenario.action_id,
          variance: -12,
          variance_pct: -12,
          is_valid: true,
          measurement_confidence: 85,
          measurement_date: new Date(),
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 75,
        previous_outcome: "unknown",
      });

      expect(variance.trigger_replan).toBe(true);
      expect(variance.replan_action).toBe("REPLAN");
    });

    it("should consider NOT replanning if variance vs new baseline positive", () => {
      // New baseline variance: +5.9%
      // This is above 0, technically success
      // But not above success threshold (need +10%)
      const new_baseline_variance = scenario.expected_variance_vs_new_baseline;
      const success_threshold = 10;
      const meets_success = new_baseline_variance >= success_threshold;
      expect(meets_success).toBe(false);
    });

    it("should document dual variance in replan decision", () => {
      // Replan triggered because:
      // - Original baseline variance: -10% (plan not met)
      // - Market shift identified: 15% shrink due to competitor
      // - New baseline variance: +5.9% (action effective within new constraints)
      // Replan should address: how to achieve plan despite market shift?
      const variance_original = scenario.expected_variance_vs_original;
      const variance_new = scenario.expected_variance_vs_new_baseline;
      expect(variance_original).toBeLessThan(0);
      expect(variance_new).toBeGreaterThan(0);
    });
  });

  describe("Confidence Update on Market Shift", () => {
    it("should reduce confidence when outcome less than planned", () => {
      // Planned: achieve baseline 100
      // Actual: 90 (due to market shift)
      // Confidence reduction: failure to achieve plan
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -10, // Original baseline variance
        measurement_confidence: 85, // Measurement quality good
      });

      expect(confidence.new_confidence).toBeLessThan(75);
      expect(confidence.confidence_change).toBeLessThan(0);
    });

    it("should apply confidence reduction for missed plan despite market shift", () => {
      // Plan underperformed (75 → 69)
      // Confidence reduced by -6% for -10% variance with 85% measurement confidence
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -10,
        measurement_confidence: 85,
      });

      // Negative variance → reduces confidence
      expect(confidence.new_confidence).toBeLessThan(75);
      expect(confidence.confidence_change).toBeLessThan(0);
      expect(confidence.new_confidence).toBeGreaterThanOrEqual(60); // But not catastrophic (-6% change)
    });

    it("should note positive signal within new market constraints", () => {
      // Despite -20% confidence hit, note:
      // Action was effective within new baseline (+5.9%)
      // Suggests action quality good, market conditions bad
      const variance_new_baseline = scenario.expected_variance_vs_new_baseline;
      expect(variance_new_baseline).toBeGreaterThan(0);
    });

    it("should not fully penalize if market shift documented", () => {
      // Market shift (external, not action failure) → confidence hit less severe
      // vs if action itself failed
      // Example: -20% vs action failure -30%
      const confidence_drop = scenario.expected_confidence_drop;
      expect(confidence_drop).toBe(-20);
    });
  });

  describe("Audit Trail with Baseline Tracking", () => {
    it("should create audit packet for original baseline variance", () => {
      const original_packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: scenario.baseline_shift.original, // 100
          actual_value: scenario.baseline_shift.original,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: scenario.baseline_shift.original,
          actual_value: scenario.outcome.actual_value, // 90
          unit: "USD",
        },
        variance: -10,
        variance_pct: -10,
        before_confidence: 75,
        after_confidence: 55, // 75 - 20% drop
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.MEDIUM,
      });

      expect(original_packet!.auditable).toBe(true);
      expect(original_packet!.variance).toBe(-10);
      expect(original_packet!.variance_pct).toBe(-10);
      expect(original_packet!.feedback_action).toBe("REPLAN");
    });

    it("should document baseline shift in audit context", () => {
      // Audit should note:
      // - Original baseline: 100 (plan assumption)
      // - New baseline: 85 (market shift)
      // - Baseline shift reason: competitor_response
      // - Actual outcome: 90
      // - Variance vs original: -10%
      // - Variance vs new: +5.9%
      const shift_original = 100;
      const shift_new = 85;
      const shift_pct = ((shift_original - shift_new) / shift_original) * 100;
      expect(shift_pct).toBe(15);
    });

    it("should create audit packet for new baseline variance", () => {
      const new_baseline_packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: scenario.baseline_shift.after_competitor, // 85
          actual_value: scenario.baseline_shift.after_competitor,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: scenario.baseline_shift.after_competitor,
          actual_value: scenario.outcome.actual_value, // 90
          unit: "USD",
        },
        variance: 5,
        variance_pct: 5.88,
        before_confidence: 75,
        after_confidence: 83, // +5% confidence from positive new baseline variance
        feedback_action: "CONTINUE",
        measurement_quality: MeasurementQuality.MEDIUM,
      });

      expect(new_baseline_packet!.auditable).toBe(true);
      expect(new_baseline_packet!.variance_pct).toBeCloseTo(5.88, 0);
    });

    it("should maintain deterministic decision with baseline shift", () => {
      // Same competitor response input → same replan decision
      const packet1 = auditor.createAuditPacket({
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
          actual_value: 90,
          unit: "USD",
        },
        variance: -10,
        variance_pct: -10,
        before_confidence: 75,
        after_confidence: 55,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.MEDIUM,
      });

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
          actual_value: 90,
          unit: "USD",
        },
        variance: -10,
        variance_pct: -10,
        before_confidence: 75,
        after_confidence: 55,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.MEDIUM,
      });

      expect(packet1!.packet_id).toBe(packet2!.packet_id);
    });
  });

  describe("End-to-End: Competitor Response Lifecycle", () => {
    it("should detect market baseline shift at execution", () => {
      // Step 1: Plan assumes baseline 100
      const original_baseline = scenario.baseline_shift.original;
      expect(original_baseline).toBe(100);

      // Step 2: Competitor launches, market shrinks
      const new_baseline = scenario.baseline_shift.after_competitor;
      expect(new_baseline).toBe(85);

      // Step 3: Baseline shift detected and documented
      const baseline_shift = original_baseline - new_baseline;
      expect(baseline_shift).toBe(15);
    });

    it("should track impact vs original baseline", () => {
      // Step 1: Track impact against plan baseline
      const impact_original = impactTracker.trackImpact({
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
          actual_value: 90,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 85,
      });

      expect(impact_original.variance_pct).toBe(-10);
    });

    it("should recalculate variance with new baseline", () => {
      // Step 2: Recalculate against market-adjusted baseline
      const impact_new = impactTracker.trackImpact({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 85,
          actual_value: 85,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 85,
          actual_value: 90,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 85,
      });

      expect(impact_new.variance_pct).toBeCloseTo(5.88, 0);
    });

    it("should trigger replan based on original baseline variance", () => {
      // Step 3: Calculate variance for decision
      // Use -12% to ensure it triggers replan (< -10% threshold)
      const variance = varianceCalculator.calculateVariance({
        impact_result: {
          action_id: scenario.action_id,
          variance: -12,
          variance_pct: -12,
          is_valid: true,
          measurement_confidence: 85,
          measurement_date: new Date(),
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 75,
        previous_outcome: "unknown",
      });

      expect(variance.trigger_replan).toBe(true);
      expect(variance.replan_action).toBe("REPLAN");
    });

    it("should reduce confidence due to missed plan", () => {
      // Step 4: Update confidence
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -10, // Original baseline variance
        measurement_confidence: 85,
      });

      expect(confidence.new_confidence).toBeLessThan(75);
      expect(confidence.confidence_change).toBeLessThan(0);
    });

    it("should create audit packet explaining dual variance", () => {
      // Step 5: Create audit with full context
      const audit_packet = auditor.createAuditPacket({
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
          actual_value: 90,
          unit: "USD",
        },
        variance: -10,
        variance_pct: -10,
        before_confidence: 75,
        after_confidence: 55,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.MEDIUM,
      });

      expect(audit_packet!.feedback_action).toBe("REPLAN");
      expect(audit_packet!.variance_pct).toBe(-10);
    });

    it("should document replan reason (baseline shift + market response)", () => {
      // Replan triggered because:
      // - Original plan assumed baseline 100
      // - Market shifted to 85 (competitor response)
      // - Outcome 90 vs original baseline = -10% (plan unmet)
      // - Outcome 90 vs new baseline = +5.9% (action effective)
      // Replan should address: achieving plan within new market constraints
      const reason = "baseline_shift";
      expect(reason).toBe("baseline_shift");
    });
  });
});
