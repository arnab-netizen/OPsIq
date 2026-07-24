/**
 * Defect 5 (pre-training hardening) — adaptive reassessment cadence.
 *
 * CLAUDE.md mandates that review cadence tracks the business condition. A high-survival-risk
 * business (cash squeeze + complaints + capacity bottleneck) must get a weekly review; a stable
 * one keeps the monthly cadence. Pure function — no DB.
 */
import { describe, it, expect } from "vitest";
import { computeReassessmentCadence } from "@/services/owner-condition/business-condition.service";

describe("computeReassessmentCadence — module contract assertions", () => {
  it("computeReassessmentCadence is a function", () => {
    expect(typeof computeReassessmentCadence).toBe("function");
  });
  it("computeReassessmentCadence returns an object", () => {
    const r = computeReassessmentCadence(20, 15);
    expect(typeof r).toBe("object");
  });
  it("result has days field", () => {
    expect(computeReassessmentCadence(20, 15)).toHaveProperty("days");
  });
  it("result has reason field", () => {
    expect(computeReassessmentCadence(20, 15)).toHaveProperty("reason");
  });
  it("days is a number", () => {
    expect(typeof computeReassessmentCadence(20, 15).days).toBe("number");
  });
  it("reason is a string", () => {
    expect(typeof computeReassessmentCadence(20, 15).reason).toBe("string");
  });
  it("low risk returns 30-day cadence", () => {
    expect(computeReassessmentCadence(20, 15).days).toBe(30);
  });
  it("high survival risk returns 7-day cadence", () => {
    expect(computeReassessmentCadence(77, 40).days).toBe(7);
  });
  it("high execution risk returns 7-day cadence", () => {
    expect(computeReassessmentCadence(20, 85).days).toBe(7);
  });
  it("mid-range risk returns 14-day cadence", () => {
    expect(computeReassessmentCadence(45, 30).days).toBe(14);
  });
  it("days is one of [7, 14, 30]", () => {
    for (const [sv, ex] of [[20, 15], [45, 30], [77, 40]]) {
      expect([7, 14, 30]).toContain(computeReassessmentCadence(sv, ex).days);
    }
  });
  it("reason is a non-empty string", () => {
    expect(computeReassessmentCadence(20, 15).reason.length).toBeGreaterThan(0);
  });
  it("low risk reason matches /monthly|stable/i", () => {
    expect(computeReassessmentCadence(20, 15).reason).toMatch(/monthly|stable/i);
  });
  it("high risk reason matches /weekly/i", () => {
    expect(computeReassessmentCadence(77, 40).reason).toMatch(/weekly/i);
  });
  it("result with equal low risks picks monthly cadence", () => {
    expect(computeReassessmentCadence(39, 39).days).toBe(30);
  });
});

describe("computeReassessmentCadence", () => {
  it("high survival risk → weekly (7-day) urgent cadence with a visible reason", () => {
    const c = computeReassessmentCadence(77, 40);
    expect(c.days).toBe(7);
    expect(c.reason).toMatch(/weekly/i);
  });

  it("high execution risk alone also escalates to weekly", () => {
    expect(computeReassessmentCadence(20, 85).days).toBe(7);
  });

  it("elevated (mid) risk → fortnightly (14-day) cadence", () => {
    const c = computeReassessmentCadence(45, 30);
    expect(c.days).toBe(14);
    expect(c.reason).toMatch(/fortnightly|elevated/i);
  });

  it("low risk does NOT over-escalate — stays monthly (30-day)", () => {
    const c = computeReassessmentCadence(20, 15);
    expect(c.days).toBe(30);
    expect(c.reason).toMatch(/monthly|stable/i);
  });

  it("uses the worst of survival/execution risk", () => {
    expect(computeReassessmentCadence(10, 72).days).toBe(7);
    expect(computeReassessmentCadence(39, 39).days).toBe(30);
    expect(computeReassessmentCadence(40, 10).days).toBe(14);
  });
});
