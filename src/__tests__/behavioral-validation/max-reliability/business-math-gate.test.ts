/**
 * Maximum-reliability — business-math assurance gate tests.
 */
import { describe, it, expect } from "vitest";
import { assertBusinessMath, type MathDecision } from "@/behavioral-validation/max-reliability/business-math-gate";

describe("business-math-gate — module contract assertions", () => {
  it("assertBusinessMath is a function", () => { expect(typeof assertBusinessMath).toBe("function"); });
  it("assertBusinessMath with empty trace returns an object", () => { expect(typeof assertBusinessMath({ kind: "contract", recommendation: "proceed", calculationTrace: [], n: {} })).toBe("object"); });
  it("assertBusinessMath result has ok field", () => { expect(assertBusinessMath({ kind: "contract", recommendation: "proceed", calculationTrace: [], n: {} })).toHaveProperty("ok"); });
  it("assertBusinessMath result has failures field", () => { expect(assertBusinessMath({ kind: "contract", recommendation: "proceed", calculationTrace: [], n: {} })).toHaveProperty("failures"); });
  it("assertBusinessMath result has computed field", () => { expect(assertBusinessMath({ kind: "contract", recommendation: "proceed", calculationTrace: [], n: {} })).toHaveProperty("computed"); });
  it("assertBusinessMath with empty trace gives ok false", () => { expect(assertBusinessMath({ kind: "contract", recommendation: "proceed", calculationTrace: [], n: {} }).ok).toBe(false); });
  it("assertBusinessMath failures is an array", () => { expect(Array.isArray(assertBusinessMath({ kind: "contract", recommendation: "proceed", calculationTrace: [], n: {} }).failures)).toBe(true); });
  it("assertBusinessMath sound expansion gives ok true", () => { expect(assertBusinessMath({ kind: "expansion", recommendation: "proceed", calculationTrace: ["runway 120d, affordable"], n: { capexAndWorkingCapital: 200000, availableCash: 600000, cash: 600000, monthlyNetBurn: 100000 } }).ok).toBe(true); });
  it("assertBusinessMath trace contradiction flags failure", () => { expect(assertBusinessMath({ kind: "contract", recommendation: "proceed", calculationTrace: ["margin is negative after terms"], n: { ratePerUnit: 100, fullyLoadedCost: 70, paymentTermsDays: 10 } }).failures).toContain("calculation trace contradicts the proceed recommendation"); });
  it("assertBusinessMath hiring with low cash fails", () => { expect(assertBusinessMath({ kind: "hiring", recommendation: "proceed", calculationTrace: ["utilization"], n: { workHours: 120, availableHours: 300, cash: 50000, monthlyNetBurn: 80000 } }).ok).toBe(false); });
  it("assertBusinessMath discount negative margin fails", () => { expect(assertBusinessMath({ kind: "discount", recommendation: "proceed", calculationTrace: ["margin after discount"], n: { discountedRevenue: 90, cogs: 110 } }).ok).toBe(false); });
  it("assertBusinessMath sound contract gives ok true", () => { expect(assertBusinessMath({ kind: "contract", recommendation: "proceed", calculationTrace: ["margin after 30d terms = +14"], n: { ratePerUnit: 100, fullyLoadedCost: 80, paymentTermsDays: 30 } }).ok).toBe(true); });
  it("assertBusinessMath asset without payback fails", () => { expect(assertBusinessMath({ kind: "asset", recommendation: "proceed", calculationTrace: ["payback"], n: { investment: 800000, monthlyIncrementalProfit: 0 } }).ok).toBe(false); });
  it("assertBusinessMath marketing net-negative fails", () => { expect(assertBusinessMath({ kind: "marketing", recommendation: "proceed", calculationTrace: ["net ROAS after refunds"], n: { adRevenue: 500000, adSpend: 100000, returnRate: 0.4, grossMarginPct: 0.25 } }).ok).toBe(false); });
});

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
