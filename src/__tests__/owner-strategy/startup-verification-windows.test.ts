/**
 * Unit tests for startup-verification-windows domain engine.
 * Verifies that window durations are derived from actual evidence, not hardcoded.
 */
import { describe, it, expect } from "vitest";
import { deriveVerificationWindows, type DeriveWindowsInput } from "@/domain/owner-strategy/startup-verification-windows";

const BASE: DeriveWindowsInput = {
  ideaName: "Test Idea",
  hypotheses: [],
  economics: null,
  kpis: [],
  validationPlan: null,
  taskCount: 4,
};

describe("deriveVerificationWindows", () => {
  it("returns at least one window even with no inputs", () => {
    const windows = deriveVerificationWindows(BASE);
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows[0].durationDays).toBeGreaterThanOrEqual(14);
  });

  it("window duration is max of hypothesis days, KPI cycle, and minimum 14", () => {
    const input: DeriveWindowsInput = {
      ...BASE,
      hypotheses: [{ expectedDurationDays: 21, hypothesisType: "DEMAND", requiresOwnerApproval: false }],
      kpis: [{ metricName: "revenue", reviewCadence: "WEEKLY" }],
    };
    const windows = deriveVerificationWindows(input);
    // max(21, 7, 14) = 21
    expect(windows[0].durationDays).toBe(21);
  });

  it("hypothesis duration dominates if longest", () => {
    const input: DeriveWindowsInput = {
      ...BASE,
      hypotheses: [
        { expectedDurationDays: 60, hypothesisType: "PRICING", requiresOwnerApproval: false },
        { expectedDurationDays: 30, hypothesisType: "DEMAND", requiresOwnerApproval: true },
      ],
      kpis: [{ metricName: "revenue", reviewCadence: "MONTHLY" }],
    };
    const windows = deriveVerificationWindows(input);
    // max(60, 30, 14) = 60
    expect(windows[0].durationDays).toBe(60);
  });

  it("creates break-even window when economics provided", () => {
    const input: DeriveWindowsInput = {
      ...BASE,
      economics: { breakEvenMonths: 3, cashRunwayMonths: 6, spendingLimitCents: null, fixedMonthlyCostCents: 500000 },
    };
    const windows = deriveVerificationWindows(input);
    const beWindow = windows.find((w) => w.windowLabel.includes("Break-Even"));
    expect(beWindow).toBeDefined();
    expect(beWindow!.durationDays).toBe(90); // 3 months × 30 days
  });

  it("creates cash survival window when runway is 12 months or less", () => {
    const input: DeriveWindowsInput = {
      ...BASE,
      economics: { breakEvenMonths: null, cashRunwayMonths: 4, spendingLimitCents: null, fixedMonthlyCostCents: null },
    };
    const windows = deriveVerificationWindows(input);
    const survivalWindow = windows.find((w) => w.windowLabel.includes("Cash Survival"));
    expect(survivalWindow).toBeDefined();
    expect(survivalWindow!.durationDays).toBe(Math.floor(4 * 30));
  });

  it("does NOT create cash survival window when runway > 12 months", () => {
    const input: DeriveWindowsInput = {
      ...BASE,
      economics: { breakEvenMonths: null, cashRunwayMonths: 18, spendingLimitCents: null, fixedMonthlyCostCents: null },
    };
    const windows = deriveVerificationWindows(input);
    const survivalWindow = windows.find((w) => w.windowLabel.includes("Cash Survival"));
    expect(survivalWindow).toBeUndefined();
  });

  it("failure criteria include stop conditions from validation plan", () => {
    const input: DeriveWindowsInput = {
      ...BASE,
      validationPlan: { experimentCount: 3, safetyLimits: ["spend < $1000"], stopConditions: ["conversion < 1%"] },
    };
    const windows = deriveVerificationWindows(input);
    const allFailure = windows.flatMap((w) => w.failureCriteria);
    expect(allFailure.some((f) => f.includes("conversion < 1%"))).toBe(true);
    expect(allFailure.some((f) => f.includes("spend < $1000"))).toBe(true);
  });

  it("spending limit appears in failure criteria when set", () => {
    const input: DeriveWindowsInput = {
      ...BASE,
      economics: { breakEvenMonths: null, cashRunwayMonths: null, spendingLimitCents: BigInt(200000), fixedMonthlyCostCents: null },
    };
    const windows = deriveVerificationWindows(input);
    const allFailure = windows.flatMap((w) => w.failureCriteria);
    expect(allFailure.some((f) => f.includes("$2000"))).toBe(true);
  });

  it("KPI names appear in metricsToMeasure", () => {
    const input: DeriveWindowsInput = {
      ...BASE,
      kpis: [
        { metricName: "customer_count", reviewCadence: "WEEKLY" },
        { metricName: "revenue", reviewCadence: "MONTHLY" },
      ],
    };
    const windows = deriveVerificationWindows(input);
    expect(windows[0].metricsToMeasure).toContain("customer_count");
    expect(windows[0].metricsToMeasure).toContain("revenue");
  });

  it("window label includes idea name", () => {
    const windows = deriveVerificationWindows({ ...BASE, ideaName: "My Idea" });
    expect(windows[0].windowLabel).toContain("My Idea");
  });

  it("derivationRationale is present and non-empty", () => {
    const windows = deriveVerificationWindows(BASE);
    windows.forEach((w) => {
      expect(w.derivationRationale).toBeTruthy();
      expect(typeof w.derivationRationale).toBe("string");
    });
  });

  it("provisional=true and low confidence when no timing evidence", () => {
    const windows = deriveVerificationWindows(BASE); // no hypotheses, no KPIs, no validation plan
    expect(windows[0].provisional).toBe(true);
    expect(windows[0].confidence).toBeLessThan(50);
    expect(windows[0].evidenceRequired.length).toBeGreaterThan(0);
  });

  it("provisional=false and higher confidence when hypotheses and KPIs present", () => {
    const input: DeriveWindowsInput = {
      ...BASE,
      hypotheses: [{ expectedDurationDays: 21, hypothesisType: "DEMAND", requiresOwnerApproval: false }],
      kpis: [{ metricName: "revenue", reviewCadence: "WEEKLY" }],
    };
    const windows = deriveVerificationWindows(input);
    expect(windows[0].provisional).toBe(false);
    expect(windows[0].confidence).toBeGreaterThanOrEqual(70);
    expect(windows[0].evidenceRequired.length).toBe(0);
  });

  it("reassessmentTrigger is present on every window", () => {
    const input: DeriveWindowsInput = {
      ...BASE,
      economics: { breakEvenMonths: 3, cashRunwayMonths: 4, spendingLimitCents: null, fixedMonthlyCostCents: 100000 },
    };
    const windows = deriveVerificationWindows(input);
    windows.forEach((w) => {
      expect(w.reassessmentTrigger).toBeTruthy();
    });
  });

  it("quarterly KPI cadence drives longer validation window", () => {
    const input: DeriveWindowsInput = {
      ...BASE,
      kpis: [{ metricName: "nps", reviewCadence: "QUARTERLY" }],
    };
    const windows = deriveVerificationWindows(input);
    expect(windows[0].durationDays).toBe(90);
  });
});
