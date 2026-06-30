/**
 * Maximum-reliability — business-math assurance gate tests.
 */
import { describe, it, expect } from "vitest";
import { assertBusinessMath, type MathDecision } from "@/behavioral-validation/max-reliability/business-math-gate";

describe("business-math assurance gate", () => {
  it("a missing required calculation fails", () => {
    const d: MathDecision = { kind: "contract", recommendation: "proceed", calculationTrace: [], n: { ratePerUnit: 100, fullyLoadedCost: 80, paymentTermsDays: 30 } };
    expect(assertBusinessMath(d).failures).toContain("missing required calculation (no calculation trace)");
  });

  it("a B2B contract below margin-after-terms cannot proceed", () => {
    const d: MathDecision = { kind: "contract", recommendation: "proceed", calculationTrace: ["margin after 90d terms"], n: { ratePerUnit: 100, fullyLoadedCost: 98, paymentTermsDays: 90, annualCostOfCapitalPct: 0.18 } };
    const r = assertBusinessMath(d);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /below margin after terms/.test(f))).toBe(true);
  });

  it("a ROAS-positive but net-negative ad spend fails (high-revenue/low-profit trap)", () => {
    // adRevenue 5x spend looks great, but 40% returns + 25% gross margin => net contribution < spend
    const d: MathDecision = { kind: "marketing", recommendation: "proceed", calculationTrace: ["net ROAS after refunds"], n: { adRevenue: 500000, adSpend: 100000, returnRate: 0.4, grossMarginPct: 0.25 } };
    const r = assertBusinessMath(d);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /net-negative/.test(f))).toBe(true);
    expect(r.computed.netRoas as number).toBeLessThanOrEqual(1);
  });

  it("an asset purchase without a payback fails", () => {
    const d: MathDecision = { kind: "asset", recommendation: "proceed", calculationTrace: ["payback"], n: { investment: 800000, monthlyIncrementalProfit: 0 } };
    expect(assertBusinessMath(d).failures).toContain("asset purchase without a payback period");
  });

  it("an expansion without cash runway fails", () => {
    const d: MathDecision = { kind: "expansion", recommendation: "proceed", calculationTrace: ["runway"], n: { capexAndWorkingCapital: 900000, availableCash: 200000, cash: 200000, monthlyNetBurn: 100000 } };
    const r = assertBusinessMath(d);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /cash runway/.test(f))).toBe(true);
  });

  it("staff hiring without utilization/cash proof fails", () => {
    const d: MathDecision = { kind: "hiring", recommendation: "proceed", calculationTrace: ["utilization"], n: { workHours: 120, availableHours: 300, cash: 50000, monthlyNetBurn: 80000 } };
    const r = assertBusinessMath(d);
    expect(r.ok).toBe(false);
  });

  it("a discount that drives margin negative fails", () => {
    const d: MathDecision = { kind: "discount", recommendation: "proceed", calculationTrace: ["margin after discount"], n: { discountedRevenue: 90, cogs: 110 } };
    const r = assertBusinessMath(d);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /margin negative/.test(f))).toBe(true);
  });

  it("a calculation trace that contradicts the proceed recommendation fails", () => {
    const d: MathDecision = { kind: "contract", recommendation: "proceed", calculationTrace: ["margin is negative after terms"], n: { ratePerUnit: 100, fullyLoadedCost: 70, paymentTermsDays: 10 } };
    expect(assertBusinessMath(d).failures).toContain("calculation trace contradicts the proceed recommendation");
  });

  it("a genuinely sound decision passes", () => {
    const contract: MathDecision = { kind: "contract", recommendation: "proceed", calculationTrace: ["margin after 30d terms = +14"], n: { ratePerUnit: 100, fullyLoadedCost: 80, paymentTermsDays: 30 } };
    expect(assertBusinessMath(contract).ok).toBe(true);
    const expansion: MathDecision = { kind: "expansion", recommendation: "proceed", calculationTrace: ["runway 120d, affordable"], n: { capexAndWorkingCapital: 200000, availableCash: 600000, cash: 600000, monthlyNetBurn: 100000 } };
    expect(assertBusinessMath(expansion).ok).toBe(true);
  });
});
