/**
 * Calibration learning loop DB proof
 *
 * Verifies calculateDecisionAccuracy + computeCalibration deterministic math.
 * 9 required test cases per 30-point directive item 10.
 */

import { describe, it, expect } from "vitest";
import { calculateDecisionAccuracy } from "@/services/operator/accuracy";
import { computeCalibration } from "@/services/calibration/engine";
import type { OperatorItem } from "@/domain/operator/types";

function item(expected: number, actual: number, overrides: Partial<OperatorItem> = {}): OperatorItem {
  const acc = calculateDecisionAccuracy(expected, actual);
  return {
    id: "test",
    problem: "p",
    action: "a",
    impactExpected: expected,
    impactLow: expected * 0.5,
    impactHigh: expected * 1.5,
    confidence: 0.8,
    priorityScore: 10,
    status: "done",
    dueAt: null,
    blockingDependencies: [],
    expectedOutcome: "test",
    actualOutcome: "success",
    actualOutcomeValue: actual,
    outcomeDelta: actual - expected,
    decisionAccuracy: acc.accuracy,
    decisionError: acc.error,
    outcomeNotes: "",
    createdAt: new Date().toISOString(),
    workspaceId: "ws-test",
    ...overrides,
  } as OperatorItem;
}

describe("Calibration learning loop — 9-case proof", () => {
  describe("calculateDecisionAccuracy unit math", () => {
    it("case 1 — perfect: expected=1000, actual=1000 → accuracy=1.0, error=0", () => {
      const r = calculateDecisionAccuracy(1000, 1000);
      expect(r.valid).toBe(true);
      expect(r.accuracy).toBe(1.0);
      expect(r.error).toBe(0);
    });

    it("case 2 — overperform: expected=500, actual=750 → accuracy=1.5, error=250", () => {
      const r = calculateDecisionAccuracy(500, 750);
      expect(r.valid).toBe(true);
      expect(r.accuracy).toBe(1.5);
      expect(r.error).toBe(250);
    });

    it("case 3 — underperform: expected=1000, actual=700 → accuracy=0.7, error=-300", () => {
      const r = calculateDecisionAccuracy(1000, 700);
      expect(r.valid).toBe(true);
      expect(r.accuracy).toBe(0.7);
      expect(r.error).toBe(-300);
    });

    it("case 4 — zero expected: accuracy=null, error=actual (division guard)", () => {
      const r = calculateDecisionAccuracy(0, 500);
      expect(r.valid).toBe(true);
      expect(r.accuracy).toBeNull();
      expect(r.error).toBe(500);
    });

    it("case 5 — null expected: valid=false", () => {
      const r = calculateDecisionAccuracy(null, 500);
      expect(r.valid).toBe(false);
      expect(r.accuracy).toBeNull();
    });

    it("case 6 — null actual: valid=false", () => {
      const r = calculateDecisionAccuracy(1000, null);
      expect(r.valid).toBe(false);
      expect(r.accuracy).toBeNull();
    });

    it("case 7 — negative expected: expected=-100, actual=-80 → accuracy=0.8, error=20", () => {
      const r = calculateDecisionAccuracy(-100, -80);
      expect(r.valid).toBe(true);
      expect(r.accuracy).toBe(0.8);
      expect(r.error).toBe(20);
    });

    it("case 8 — fractional: expected=10.5, actual=11.025 → accuracy=1.05, error≈0.53", () => {
      const r = calculateDecisionAccuracy(10.5, 11.025);
      expect(r.valid).toBe(true);
      expect(r.accuracy).toBeCloseTo(1.05, 4);
      expect(r.error).toBeCloseTo(0.525, 1);
    });

    it("case 9 — large numbers: expected=1000000, actual=999999 → accuracy≈0.999999, error=-1", () => {
      const r = calculateDecisionAccuracy(1000000, 999999);
      expect(r.valid).toBe(true);
      expect(r.accuracy).toBeCloseTo(0.999999, 4);
      expect(r.error).toBe(-1);
    });
  });

  describe("computeCalibration aggregation", () => {
    it("aggregates accuracy and error across multiple completed items", () => {
      const items = [
        item(1000, 1000),
        item(500, 750),
        item(1000, 700),
      ];
      const result = computeCalibration(items);
      expect(result.valid).toBe(true);
      expect(result.itemsAnalyzed).toBe(3);
      expect(result.avgAccuracy).toBeCloseTo((1.0 + 1.5 + 0.7) / 3, 2);
      expect(result.avgError).toBeCloseTo((0 + 250 - 300) / 3, 2);
    });

    it("successRate=100 (%) when all items meet or exceed expected", () => {
      const items = [item(500, 600), item(500, 500), item(500, 1000)];
      const result = computeCalibration(items);
      expect(result.successRate).toBe(100);
    });

    it("successRate=0 (%) when no items meet expected", () => {
      const items = [item(1000, 500), item(1000, 999)];
      const result = computeCalibration(items);
      expect(result.successRate).toBe(0);
    });

    it("valid=false for empty array", () => {
      const result = computeCalibration([]);
      expect(result.valid).toBe(false);
    });

    it("deterministic — same inputs produce same output", () => {
      const items = [item(1000, 800), item(500, 600)];
      const r1 = computeCalibration(items);
      const r2 = computeCalibration(items);
      expect(r1.avgAccuracy).toBe(r2.avgAccuracy);
      expect(r1.avgError).toBe(r2.avgError);
    });
  });
});
