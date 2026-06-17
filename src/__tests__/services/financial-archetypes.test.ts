import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import { designInterventions } from "@/services/consulting-engine/intervention-design-engine";
import {
  ConfidenceLevel,
  DiagnosisType,
  DiagnosisConfidence,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";

/** E1: financial-health archetypes (cash/liquidity, unit economics, margin). */

function ev(partial: Partial<EvidenceItem> & { finding: string }): EvidenceItem {
  return {
    id: crypto.randomUUID(),
    dimension: "financial_health",
    finding: partial.finding,
    confidence: partial.confidence ?? ConfidenceLevel.HIGH,
    source: "test",
    timestamp: new Date("2026-06-17T00:00:00Z"),
    isCritical: partial.isCritical ?? true,
    supportingData: partial.supportingData,
    ...partial,
  } as EvidenceItem;
}

describe("E1 financial archetypes", () => {
  it("cash runway archetype triggers on liquidity/runway evidence", () => {
    const r = diagnoseRootCause(
      [ev({ finding: "Cash runway only 2 months; burning cash", supportingData: { cashRunwayMonths: 2 } })],
      "We may run out of cash."
    );
    expect(r.primaryRootCause.type).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
    expect(r.confidence).not.toBe(DiagnosisConfidence.INSUFFICIENT_EVIDENCE);
  });

  it("unit economics archetype triggers on negative contribution / cost>price", () => {
    const r = diagnoseRootCause(
      [ev({ finding: "Negative contribution margin per order", supportingData: { price: 10, variableCost: 14 } })],
      "Every sale loses money."
    );
    expect(r.primaryRootCause.type).toBe(DiagnosisType.UNIT_ECONOMICS_FAILURE);
  });

  it("margin erosion archetype triggers on profit decline / negative operating margin", () => {
    const r = diagnoseRootCause(
      [ev({ finding: "Q1 profit down 28% year-over-year", supportingData: { profitChangePercent: -28 } })],
      "Profitability is sliding."
    );
    expect(r.primaryRootCause.type).toBe(DiagnosisType.MARGIN_EROSION);
  });

  it("generic financial evidence does NOT trigger a financial archetype (stays abstained)", () => {
    const r = diagnoseRootCause(
      [ev({ finding: "Business facing performance challenge per case definition", supportingData: { packType: "synthetic" } })],
      "Something is wrong."
    );
    expect(r.primaryRootCause.type).toBe(DiagnosisType.UNKNOWN);
    expect(r.confidence).toBe(DiagnosisConfidence.INSUFFICIENT_EVIDENCE);
  });

  it("positive unit economics does NOT trigger unit-economics failure", () => {
    const r = diagnoseRootCause(
      [ev({ finding: "Healthy contribution per member", supportingData: { price: 40, variableCost: 4, contribution: 36 } })],
      "Members are profitable."
    );
    expect(r.primaryRootCause.type).not.toBe(DiagnosisType.UNIT_ECONOMICS_FAILURE);
  });

  it("financial archetype first action is low-cost and reversible (has fallback)", () => {
    const r = diagnoseRootCause(
      [ev({ finding: "Negative operating margin and rising input cost", supportingData: { operatingMargin: -8 } })],
      "Margins are negative."
    );
    const interventions = designInterventions(r.primaryRootCause, []);
    const first = interventions[0];
    expect(["MINIMAL", "LOW"]).toContain(first.estimatedCostBand);
    expect(first.estimatedTotalDays).toBeLessThanOrEqual(14);
    expect(first.fallbackPlan.length).toBeGreaterThan(0);
    expect(["CONTAINMENT", "STABILIZATION"]).toContain(first.class);
  });
});
