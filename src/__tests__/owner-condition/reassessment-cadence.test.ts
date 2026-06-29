/**
 * Defect 5 (pre-training hardening) — adaptive reassessment cadence.
 *
 * CLAUDE.md mandates that review cadence tracks the business condition. A high-survival-risk
 * business (cash squeeze + complaints + capacity bottleneck) must get a weekly review; a stable
 * one keeps the monthly cadence. Pure function — no DB.
 */
import { describe, it, expect } from "vitest";
import { computeReassessmentCadence } from "@/services/owner-condition/business-condition.service";

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
