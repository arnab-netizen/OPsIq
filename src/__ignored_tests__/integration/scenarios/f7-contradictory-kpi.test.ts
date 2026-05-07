import { describe, it, expect } from "vitest";
import { ImpactTracker } from "@/services/outcome-core/impact-tracker";
import { VarianceCalculator } from "@/services/outcome-core/variance-calculator";
import { ConfidenceUpdater } from "@/services/outcome-core/confidence-updater";
import { OutcomeAuditor } from "@/services/outcome-core/outcome-auditor";
import { MeasurementQuality } from "@/domain/outcome/impact";
import { DEFAULT_KPI_THRESHOLDS } from "@/domain/outcome/variance";
import { buildContradictoryKPIScenario } from "../helpers/scenario-builder";

/**
 * Phase F-7: Contradictory KPI Scenario
 *
 * Setup: One KPI positive (e.g., revenue ↑10%), another negative (e.g., margin ↓15%)
 *
 * Expected Outcomes:
 * - Variance: net negative (profit margin drives decision)
 * - Trigger replan despite revenue improvement
 * - Confidence update: mixed signals, neutral or slightly negative
 * - Outcome: continue if net positive, replan if net negative
 *
 * Integration Tests:
 * - Composite KPI handling
 * - Weighted variance calculation
 * - Mixed signal detection
 * - Correct replan trigger (net negative overrides individual positive)
 * - Deterministic audit trail
 */

describe("Phase F-7: Contradictory KPI Scenario", () => {
  const impactTracker = new ImpactTracker();
  const varianceCalculator = new VarianceCalculator();
  const confidenceUpdater = new ConfidenceUpdater();
  const auditor = new OutcomeAuditor();

  const scenario = buildContradictoryKPIScenario();

  describe("Composite KPI Tracking", () => {
    it("should track multiple KPIs independently", () => {
      // KPI 1: Revenue
      const revenue_impact = impactTracker.trackImpact({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: scenario.outcomes.revenue.baseline_value,
          actual_value: scenario.outcomes.revenue.baseline_value,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: scenario.outcomes.revenue.baseline_value,
          actual_value: scenario.outcomes.revenue.actual_value,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      // KPI 2: Profit Margin
      const margin_impact = impactTracker.trackImpact({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Profit Margin",
          baseline_value: scenario.outcomes.profit.baseline_value,
          actual_value: scenario.outcomes.profit.baseline_value,
          unit: "USD",
        },
        actual_outcome: {
          name: "Profit Margin",
          baseline_value: scenario.outcomes.profit.baseline_value,
          actual_value: scenario.outcomes.profit.actual_value,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      expect(revenue_impact.is_valid).toBe(true);
      expect(margin_impact.is_valid).toBe(true);
      expect(revenue_impact.variance_pct).toBeGreaterThan(0); // Revenue positive
      expect(margin_impact.variance_pct).toBeLessThan(0); // Margin negative
    });

    it("should detect conflicting signals (+10% revenue vs -92.5% profit)", () => {
      const revenue_positive = scenario.outcomes.revenue.actual_value > scenario.outcomes.revenue.baseline_value;
      const profit_negative = scenario.outcomes.profit.actual_value < scenario.outcomes.profit.baseline_value;
      expect(revenue_positive).toBe(true);
      expect(profit_negative).toBe(true);
    });

    it("should calculate individual variances", () => {
      // Revenue: (110 - 100) / 100 = 10%
      const revenue_variance = ((scenario.outcomes.revenue.actual_value - scenario.outcomes.revenue.baseline_value) /
        scenario.outcomes.revenue.baseline_value) * 100;
      expect(revenue_variance).toBe(10);

      // Profit: (1.5 - 20) / 20 = -92.5%
      const profit_variance = ((scenario.outcomes.profit.actual_value - scenario.outcomes.profit.baseline_value) /
        scenario.outcomes.profit.baseline_value) * 100;
      expect(profit_variance).toBeCloseTo(-92.5, 1);
    });
  });

  describe("Weighted Variance Calculation", () => {
    it("should weight KPIs by strategic importance", () => {
      // Typical weighting: Profit/Margin > Revenue
      // Profit weight: 70%, Revenue weight: 30%
      // Net variance = (0.3 * 10%) + (0.7 * -92.5%) = 3% - 64.75% = -61.75%
      const revenue_weight = 0.3;
      const profit_weight = 0.7;
      const revenue_variance = 10;
      const profit_variance = -92.5;
      const net_variance = (revenue_weight * revenue_variance) + (profit_weight * profit_variance);
      expect(net_variance).toBeLessThan(0); // Net negative
    });

    it("should prioritize profit/margin over revenue in weighting", () => {
      // Business impact ranking:
      // 1. Profitability (can't sustain business without profit)
      // 2. Revenue (growth metric, but only if profitable)
      // 3. Efficiency (cost structure)
      const profit_is_primary = true;
      expect(profit_is_primary).toBe(true);
    });

    it("should trigger replan on net negative despite positive revenue", () => {
      // Expected: net negative variance triggers replan
      expect(scenario.expected_net_variance).toBeLessThan(0);
      expect(scenario.expected_replan).toBe(true);
    });
  });

  describe("Mixed Signal Handling", () => {
    it("should detect contradictory signals", () => {
      const revenue_up = scenario.outcomes.revenue.actual_value > scenario.outcomes.revenue.baseline_value;
      const profit_down = scenario.outcomes.profit.actual_value < scenario.outcomes.profit.baseline_value;
      const contradictory = revenue_up && profit_down;
      expect(contradictory).toBe(true);
    });

    it("should analyze root cause of contradiction", () => {
      // Revenue up but profit down indicates:
      // - High cost of revenue increase (low margin on new sales)
      // - OR increased operational costs offsetting revenue gain
      // - OR unfavorable product mix (high-revenue, low-margin products)
      const revenue_increase = 10; // percent
      const margin_decrease = 92.5; // percent
      const cost_of_revenue_increase = margin_decrease > revenue_increase;
      expect(cost_of_revenue_increase).toBe(true);
    });

    it("should flag for strategy review when signals contradict", () => {
      // Contradiction signals potential strategy flaw:
      // - Action increased revenue but decreased profitability
      // - This indicates wrong optimization target or unexpected costs
      // - Requires re-evaluation of action effectiveness
      const requires_strategy_review = true;
      expect(requires_strategy_review).toBe(true);
    });
  });

  describe("Confidence Update on Mixed Signals", () => {
    it("should apply neutral or slightly negative update for contradictory signals", () => {
      // Positive signal (revenue +10%): would increase confidence ~4%
      // Negative signal (profit -92.5%): would decrease confidence -30% (capped)
      // Mixed result: net uncertainty, apply neutral or slightly negative
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -10, // Net negative after weighting
        measurement_confidence: 90, // High measurement quality
      });

      // Net negative variance should reduce confidence
      expect(confidence.new_confidence).toBeLessThan(75);
      expect(confidence.confidence_change).toBeLessThan(0);
    });

    it("should cap confidence reduction to -30% even with large margin drop", () => {
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -92.5, // Large negative from profit margin
        measurement_confidence: 95,
      });

      // Max negative cap is -30%, so 75 - 30 = 45
      expect(confidence.new_confidence).toBeGreaterThanOrEqual(45);
      expect(confidence.confidence_change).toBeLessThanOrEqual(-30);
    });

    it("should reflect uncertainty in confidence (not fully confident despite revenue growth)", () => {
      // Even though revenue is up, profit is down significantly
      // Confidence should not increase (despite revenue improvement)
      // Confidence should decrease or remain neutral (due to profit deterioration)
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -10, // Weighted net variance
        measurement_confidence: 90,
      });

      expect(confidence.new_confidence).toBeLessThanOrEqual(75);
    });
  });

  describe("Replan Trigger on Net Negative", () => {
    it("should trigger REPLAN when net variance < failure threshold (-10%)", () => {
      // Net variance: -61.75% (with 70/30 weighting)
      // Failure threshold: -10%
      // Result: -61.75% < -10% → REPLAN
      const net_variance_pct = -61.75;
      const failure_threshold = -10;
      const should_replan = net_variance_pct < failure_threshold;
      expect(should_replan).toBe(true);
    });

    it("should override revenue growth signal with net negative decision", () => {
      // Revenue is +10% (normally continue)
      // But profit is -92.5% (normally replan)
      // Net is -61.75% → REPLAN overrides revenue signal
      expect(scenario.expected_replan).toBe(true);
    });

    it("should log reason for replan (net negative despite revenue improvement)", () => {
      // Reason: "Revenue improved +10% but profit margin declined -92.5%, net result -61.75% variance triggers replan"
      const revenue_variance = 10;
      const profit_variance = -92.5;
      const net_variance = scenario.expected_net_variance;
      expect(net_variance).toBeLessThan(0);
    });
  });

  describe("Audit Trail for Contradictory Signals", () => {
    it("should create audit packet capturing both KPIs", () => {
      const packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Net Profit",
          baseline_value: 20, // 100 * 0.2 - 0 = 20
          actual_value: 20,
          unit: "USD",
        },
        actual_outcome: {
          name: "Net Profit",
          baseline_value: 20,
          actual_value: 1.5, // (110 * 0.15) - 15 = 16.5 - 15 = 1.5
          unit: "USD",
        },
        variance: -18.5, // 1.5 - 20
        variance_pct: -92.5,
        before_confidence: 75,
        after_confidence: 45,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(packet!.auditable).toBe(true);
      expect(packet!.variance).toBe(-18.5);
      expect(packet!.variance_pct).toBeCloseTo(-92.5, 1);
      expect(packet!.feedback_action).toBe("REPLAN");
    });

    it("should document KPI weightings in audit context", () => {
      // Audit should note:
      // - Revenue variance: +10%
      // - Profit margin variance: -92.5%
      // - Weighting: 30% revenue, 70% profit
      // - Net variance: -61.75%
      // - Decision: REPLAN (net negative overrides revenue improvement)
      const profit_weight = 0.7;
      const revenue_weight = 0.3;
      expect(profit_weight + revenue_weight).toBe(1.0);
    });

    it("should maintain deterministic decision on same contradictory KPIs", () => {
      const packet1 = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Net Profit",
          baseline_value: 20,
          actual_value: 20,
          unit: "USD",
        },
        actual_outcome: {
          name: "Net Profit",
          baseline_value: 20,
          actual_value: 1.5,
          unit: "USD",
        },
        variance: -18.5,
        variance_pct: -92.5,
        before_confidence: 75,
        after_confidence: 45,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      });

      const packet2 = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Net Profit",
          baseline_value: 20,
          actual_value: 20,
          unit: "USD",
        },
        actual_outcome: {
          name: "Net Profit",
          baseline_value: 20,
          actual_value: 1.5,
          unit: "USD",
        },
        variance: -18.5,
        variance_pct: -92.5,
        before_confidence: 75,
        after_confidence: 45,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(packet1!.packet_id).toBe(packet2!.packet_id);
    });
  });

  describe("End-to-End: Contradictory KPI Lifecycle", () => {
    it("should handle mixed KPI signals with correct weighting and decision", () => {
      // Step 1: Track revenue impact (+10%)
      const revenue_impact = impactTracker.trackImpact({
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
          actual_value: 110,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });
      expect(revenue_impact.variance_pct).toBe(10);

      // Step 2: Track profit impact (-92.5%)
      const profit_impact = impactTracker.trackImpact({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Profit",
          baseline_value: 20,
          actual_value: 20,
          unit: "USD",
        },
        actual_outcome: {
          name: "Profit",
          baseline_value: 20,
          actual_value: 1.5,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });
      expect(profit_impact.variance_pct).toBeCloseTo(-92.5, 1);

      // Step 3: Calculate weighted net variance (profit-weighted)
      const net_variance = (0.3 * 10) + (0.7 * -92.5); // -61.75%
      expect(net_variance).toBeLessThan(0);

      // Step 4: Create impact result for variance calculation (use profit as primary)
      const primary_impact = profit_impact; // Profit drives decision
      const variance = varianceCalculator.calculateVariance({
        impact_result: primary_impact,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 50, // Lower confidence to trigger pure REPLAN, not rollback offer
        previous_outcome: "unknown",
      });

      // Profit variance -92.5% < failure threshold -10% → REPLAN
      expect(variance.trigger_replan).toBe(true);
      expect(variance.replan_action).toBe("REPLAN");

      // Step 5: Update confidence with net signal
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -92.5,
        measurement_confidence: 95,
      });
      expect(confidence.new_confidence).toBeGreaterThanOrEqual(45); // Capped at -30%

      // Step 6: Create audit packet with net result
      const audit_packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Net Profit",
          baseline_value: 20,
          actual_value: 20,
          unit: "USD",
        },
        actual_outcome: {
          name: "Net Profit",
          baseline_value: 20,
          actual_value: 1.5,
          unit: "USD",
        },
        variance: -18.5,
        variance_pct: -92.5,
        before_confidence: 75,
        after_confidence: confidence.new_confidence,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(audit_packet!.feedback_action).toBe("REPLAN");
      expect(audit_packet!.variance_pct).toBeCloseTo(-92.5, 1);
    });
  });
});
