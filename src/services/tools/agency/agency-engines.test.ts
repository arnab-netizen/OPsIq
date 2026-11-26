// @vitest-environment node
/**
 * Independent fixtures: every expected value below was worked out by hand (shown in the comments) BEFORE the engines were
 * run, so these tests check the formulas rather than echoing the implementation.
 */
import { describe, expect, it } from "vitest";
import { calculateClientProfitability, type ClientProfitabilityInput } from "./client-profitability";
import { calculateRetainerPricing } from "./retainer-pricing";
import { calculateUtilization } from "./utilization";
import { calculateScopeCreep } from "./scope-creep";
import { calculateHourlyRate } from "./hourly-rate";
import { calculateCapacity } from "./capacity";
import { feeForMargin, parseField, roundCents, safeDiv } from "./shared";

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error("expected ok result: " + JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
}

describe("client profitability", () => {
  // Revenue 12,000 less pass-through 2,000 => AGI 10,000. Staff: 40h x 55 = 2,200 plus 10h x 80 = 800 => 3,000; other 500 => cost 3,500.
  // Delivery profit 6,500 => margin 65%. 50 hours => earned 200/h; blended cost 3,000/50 = 60/h.
  const base: ClientProfitabilityInput = { revenue: 12000, passThrough: 2000, role1Hours: 40, role1Rate: 55, role2Hours: 10, role2Rate: 80, otherDirectCosts: 500, targetMarginPct: 70 };

  it("matches the hand-calculated fixture below target", () => {
    const { result: r } = ok(calculateClientProfitability(base));
    expect(r.agi).toBe(10000);
    expect(r.staffCost).toBe(3000);
    expect(r.deliveryCost).toBe(3500);
    expect(r.deliveryProfit).toBe(6500);
    expect(r.deliveryMargin).toBeCloseTo(0.65, 10);
    expect(r.effectiveHourlyRate).toBe(200);
    expect(r.blendedCostPerHour).toBe(60);
    // Target 70%: required AGI 3,500 / 0.3 = 11,666.67; fee increase 1,666.67; invoice adds pass-through 2,000.
    expect(r.requiredAgi).toBe(11666.67);
    expect(r.feeIncreaseNeeded).toBe(1666.67);
    expect(r.requiredInvoice).toBe(13666.67);
    // Target cost at current AGI 10,000 x 0.3 = 3,000 => reduce 500 => 500 / 60 = 8.3 hours.
    expect(r.costReductionNeeded).toBe(500);
    expect(r.hoursReductionEquivalent).toBe(8.3);
    expect(r.meetsTarget).toBe(false);
  });

  it("reports nothing to fix when already above target", () => {
    // Target 60%: required AGI 3,500 / 0.4 = 8,750, below the current 10,000, so no increase and no cost cut.
    const { result: r } = ok(calculateClientProfitability({ ...base, targetMarginPct: 60 }));
    expect(r.requiredAgi).toBe(8750);
    expect(r.feeIncreaseNeeded).toBe(0);
    expect(r.requiredInvoice).toBe(12000);
    expect(r.costReductionNeeded).toBe(0);
    expect(r.meetsTarget).toBe(true);
  });

  it("returns n/a values, not zero or infinity, when there is no income or no hours", () => {
    const { result: r } = ok(calculateClientProfitability({ ...base, revenue: 0, passThrough: 0, role1Hours: 0, role2Hours: 0, otherDirectCosts: 0 }));
    expect(r.deliveryMargin).toBeNull();
    expect(r.effectiveHourlyRate).toBeNull();
    expect(r.blendedCostPerHour).toBeNull();
    expect(r.hoursReductionEquivalent).toBeNull();
    expect(r.meetsTarget).toBeNull();
  });

  it("rejects pass-through larger than revenue instead of producing a negative AGI", () => {
    const r = calculateClientProfitability({ ...base, passThrough: 12001 });
    expect(r.ok).toBe(false);
  });

  it("keeps negative delivery profit visible", () => {
    const { result: r } = ok(calculateClientProfitability({ ...base, otherDirectCosts: 9000 }));
    expect(r.deliveryProfit).toBe(-2000);
    expect(r.deliveryMargin).toBeCloseTo(-0.2, 10);
  });

  it("rejects negative, NaN, Infinity and a 100% target", () => {
    for (const bad of [-1, NaN, Infinity]) expect(calculateClientProfitability({ ...base, revenue: bad }).ok).toBe(false);
    expect(calculateClientProfitability({ ...base, targetMarginPct: 100 }).ok).toBe(false);
  });

  it("does not drift on decimals", () => {
    // 100.10 - 0.10 = 100.00 exactly after cents rounding.
    const { result: r } = ok(calculateClientProfitability({ ...base, revenue: 100.1, passThrough: 0.1, role1Hours: 0, role2Hours: 0, otherDirectCosts: 0 }));
    expect(r.agi).toBe(100);
  });

  it("stays finite with very large values", () => {
    const { result: r } = ok(calculateClientProfitability({ ...base, revenue: 1e12, passThrough: 0, role1Hours: 1, role1Rate: 1, role2Hours: 0, role2Rate: 0, otherDirectCosts: 0 }));
    expect(Number.isFinite(r.agi)).toBe(true);
    expect(Number.isFinite(r.requiredInvoice as number)).toBe(true);
  });
});

describe("retainer pricing", () => {
  // 40h x 55 + 300 = 2,500 cost. Target 50% => fee 5,000; invoice with 1,000 pass-through 6,000; rate 125; contribution 2,500; annual 60,000.
  const base = { monthlyHours: 40, costPerHour: 55, otherDirectMonthly: 300, passThroughMonthly: 1000, targetMarginPct: 50, proposedFee: 0 };

  it("matches the hand-calculated fixture", () => {
    const { result: r } = ok(calculateRetainerPricing(base));
    expect(r.deliveryCost).toBe(2500);
    expect(r.breakEvenFee).toBe(2500);
    expect(r.targetFee).toBe(5000);
    expect(r.invoice).toBe(6000);
    expect(r.effectiveHourlyRate).toBe(125);
    expect(r.contribution).toBe(2500);
    expect(r.annualFee).toBe(60000);
    expect(r.proposed).toBeNull();
  });

  it("computes the alternative margin scenarios (30/40/50/60%)", () => {
    const { result: r } = ok(calculateRetainerPricing(base));
    const by = Object.fromEntries(r.scenarios.map((s) => [s.marginPct, s]));
    // 2,500/0.7 = 3,571.43 ; /0.6 = 4,166.67 ; /0.5 = 5,000 ; /0.4 = 6,250
    expect(by[30]).toMatchObject({ fee: 3571.43, invoice: 4571.43, effectiveHourlyRate: 89.29, contribution: 1071.43 });
    expect(by[40]).toMatchObject({ fee: 4166.67, effectiveHourlyRate: 104.17, contribution: 1666.67 });
    expect(by[50]).toMatchObject({ fee: 5000, effectiveHourlyRate: 125, contribution: 2500 });
    expect(by[60]).toMatchObject({ fee: 6250, effectiveHourlyRate: 156.25, contribution: 3750 });
  });

  it("derives the maximum sustainable hours for a proposed fee", () => {
    // Fee 4,000 at a 50% target: room = 4,000 x 0.5 - 300 = 1,700 => 1,700 / 55 = 30.9 hours. Margin at 40h: 1,500/4,000 = 37.5%.
    const { result: r } = ok(calculateRetainerPricing({ ...base, proposedFee: 4000 }));
    expect(r.proposed?.maxSustainableHours).toBe(30.9);
    expect(r.proposed?.deliveryMargin).toBeCloseTo(0.375, 10);
    expect(r.proposed?.contribution).toBe(1500);
    expect(r.proposed?.sustainable).toBe(true);
  });

  it("says a fee is not sustainable when it cannot cover other direct costs at the target margin", () => {
    // 500 x 0.5 - 300 = -50 => no hours at all.
    const { result: r } = ok(calculateRetainerPricing({ ...base, proposedFee: 500 }));
    expect(r.proposed?.maxSustainableHours).toBeNull();
    expect(r.proposed?.sustainable).toBe(false);
  });

  it("rejects zero hours, 100% margin and invalid numbers", () => {
    expect(calculateRetainerPricing({ ...base, monthlyHours: 0 }).ok).toBe(false);
    expect(calculateRetainerPricing({ ...base, targetMarginPct: 100 }).ok).toBe(false);
    expect(calculateRetainerPricing({ ...base, costPerHour: NaN }).ok).toBe(false);
  });

  it("handles a target margin approaching 100% without Infinity", () => {
    const { result: r } = ok(calculateRetainerPricing({ ...base, targetMarginPct: 99.9 }));
    expect(r.targetFee).toBe(2500000);
  });
});

describe("utilization", () => {
  // 5 people x 160 paid = 800 ; available 5 x (160 - 16) = 720 ; delivery 540 => paid 67.5%, available 75%. Target 80% => 576 h; 36 h below; x 90 = 3,240.
  const base = { teamMembers: 5, paidHoursPerPerson: 160, leaveHoursPerPerson: 16, deliveryHours: 540, targetPct: 80, earnedRate: 90 };

  it("matches the hand-calculated fixture", () => {
    const { result: r } = ok(calculateUtilization(base));
    expect(r.paidCapacity).toBe(800);
    expect(r.availableCapacity).toBe(720);
    expect(r.paidUtilization).toBeCloseTo(0.675, 10);
    expect(r.availableUtilization).toBeCloseTo(0.75, 10);
    expect(r.targetDeliveryHours).toBe(576);
    expect(r.hoursVsTarget).toBe(-36);
    expect(r.hoursBelowTarget).toBe(36);
    expect(r.conditionalRevenueCapacity).toBe(3240);
    expect(r.overAvailableCapacity).toBe(false);
  });

  it("reports over-capacity as is and offers no revenue scenario", () => {
    const { result: r } = ok(calculateUtilization({ ...base, deliveryHours: 800 }));
    expect(r.availableUtilization).toBeCloseTo(800 / 720, 10);
    expect(r.overAvailableCapacity).toBe(true);
    expect(r.conditionalRevenueCapacity).toBeNull();
  });

  it("rejects no capacity, leave covering all paid hours, and 100% or 0% targets", () => {
    expect(calculateUtilization({ ...base, teamMembers: 0 }).ok).toBe(false);
    expect(calculateUtilization({ ...base, leaveHoursPerPerson: 160 }).ok).toBe(false);
    expect(calculateUtilization({ ...base, targetPct: 100 }).ok).toBe(false);
    expect(calculateUtilization({ ...base, targetPct: 0 }).ok).toBe(false);
    expect(calculateUtilization({ ...base, paidHoursPerPerson: -1 }).ok).toBe(false);
  });

  it("returns no revenue scenario when no rate is entered", () => {
    expect(ok(calculateUtilization({ ...base, earnedRate: 0 })).result.conditionalRevenueCapacity).toBeNull();
  });
});

describe("scope creep", () => {
  // Fee 6,000; 40h x 55 = 2,200 cost => profit 3,800 => 63.33%. Extra 22h x 55 = 1,210 + 100 expenses = 1,310 extra cost; change order 500.
  // Revised revenue 6,500; revised cost 3,510; revised profit 2,990 => 46.0%. Erosion 17.3 points. Unrecovered 810. Fee to restore 63.33%: 3,510/0.36667 - 6,500 = 3,072.73. Change order at 50%: 2,620.
  const base = { agreedFee: 6000, plannedHours: 40, extraHours: 22, costPerHour: 55, plannedExpenses: 0, extraExpenses: 100, changeOrderRevenue: 500, changeOrderMarginPct: 50 };

  it("matches the hand-calculated fixture", () => {
    const { result: r } = ok(calculateScopeCreep(base));
    expect(r.originalDeliveryCost).toBe(2200);
    expect(r.originalProfit).toBe(3800);
    expect(r.originalMargin).toBeCloseTo(3800 / 6000, 10);
    expect(r.revisedRevenue).toBe(6500);
    expect(r.revisedDeliveryCost).toBe(3510);
    expect(r.revisedProfit).toBe(2990);
    expect(r.revisedMargin).toBeCloseTo(2990 / 6500, 10);
    expect(r.additionalDeliveryCost).toBe(1310);
    expect(r.unrecoveredCost).toBe(810);
    expect(r.marginErosionPoints).toBe(17.3);
    expect(r.feeToPreserveMargin).toBe(3072.73);
    expect(r.changeOrderPrice).toBe(2620);
  });

  it("shows that absorbed cost and lost delivery profit are the same money, not two separate losses", () => {
    const { result: r } = ok(calculateScopeCreep(base));
    expect(r.lostDeliveryProfit).toBe(r.unrecoveredCost);
  });

  it("has no erosion and nothing to preserve when no extra work happened", () => {
    const { result: r } = ok(calculateScopeCreep({ ...base, extraHours: 0, extraExpenses: 0, changeOrderRevenue: 0 }));
    expect(r.marginErosionPoints).toBe(0);
    expect(r.feeToPreserveMargin).toBe(0);
    expect(r.unrecoveredCost).toBe(0);
  });

  it("does not offer a margin-preserving fee when the original margin was already negative", () => {
    const { result: r } = ok(calculateScopeCreep({ ...base, agreedFee: 1000 }));
    expect(r.originalProfit).toBe(-1200);
    expect(r.feeToPreserveMargin).toBeNull();
  });

  it("rejects a zero fee and invalid numbers", () => {
    expect(calculateScopeCreep({ ...base, agreedFee: 0 }).ok).toBe(false);
    expect(calculateScopeCreep({ ...base, extraHours: -1 }).ok).toBe(false);
    expect(calculateScopeCreep({ ...base, changeOrderMarginPct: 100 }).ok).toBe(false);
  });
});

describe("agency hourly rate", () => {
  // Pool = 600,000 + 240,000 = 840,000. Billable = 12,000 x 70% = 8,400. Break-even 100/h. 20% margin => income 1,050,000 => 125/h; profit 210,000.
  const base = { annualPayroll: 600000, annualOverhead: 240000, annualCapacityHours: 12000, targetUtilizationPct: 70, targetOperatingMarginPct: 20 };

  it("matches the hand-calculated fixture", () => {
    const { result: r } = ok(calculateHourlyRate(base));
    expect(r.costPool).toBe(840000);
    expect(r.billableCapacity).toBe(8400);
    expect(r.breakEvenRate).toBe(100);
    expect(r.requiredIncome).toBe(1050000);
    expect(r.requiredRate).toBe(125);
    expect(r.targetProfit).toBe(210000);
  });

  it("computes the sensitivity table", () => {
    const { result: r } = ok(calculateHourlyRate(base));
    const by = Object.fromEntries(r.sensitivity.map((s) => [s.label, s.requiredRate]));
    expect(by["Utilization 10 points lower"]).toBe(145.83); // 1,050,000 / 7,200
    expect(by["Utilization 10 points higher"]).toBe(109.38); // 1,050,000 / 9,600 = 109.375
    expect(by["Costs 10% higher"]).toBe(137.5); // 924,000/0.8 = 1,155,000 / 8,400
    expect(by["Costs 10% lower"]).toBe(112.5); // 756,000/0.8 = 945,000 / 8,400
  });

  it("gives n/a for a sensitivity case that would push utilization to 100% or beyond", () => {
    const { result: r } = ok(calculateHourlyRate({ ...base, targetUtilizationPct: 95 }));
    expect(r.sensitivity.find((s) => s.label === "Utilization 10 points higher")?.requiredRate).toBeNull();
  });

  it("rejects zero capacity, 100% utilization, 100% margin and nothing to recover", () => {
    expect(calculateHourlyRate({ ...base, annualCapacityHours: 0 }).ok).toBe(false);
    expect(calculateHourlyRate({ ...base, targetUtilizationPct: 100 }).ok).toBe(false);
    expect(calculateHourlyRate({ ...base, targetOperatingMarginPct: 100 }).ok).toBe(false);
    expect(calculateHourlyRate({ ...base, annualPayroll: 0, annualOverhead: 0 }).ok).toBe(false);
  });
});

describe("capacity planning", () => {
  // 6 x 140 x 80% = 672 target hours (112 per FTE). Committed 600 => 72 left => floor(72/25) = 2 clients. 4 planned: 600 + 100 - 672 = 28 => 0.25 FTE.
  const base = { staff: 6, availableHoursPerPerson: 140, targetPct: 80, committedHours: 600, hoursPerNewClient: 25, plannedNewClients: 4 };

  it("matches the hand-calculated fixture", () => {
    const { result: r } = ok(calculateCapacity(base));
    expect(r.targetCapacity).toBe(672);
    expect(r.hoursPerFte).toBe(112);
    expect(r.remaining).toBe(72);
    expect(r.shortfall).toBe(false);
    expect(r.additionalClientsSupportable).toBe(2);
    expect(r.fteShortCurrent).toBe(0);
    expect(r.fteShortWithPlanned).toBe(0.25);
  });

  it("reports a shortfall in hours and FTE, without recommending hiring", () => {
    const { result: r } = ok(calculateCapacity({ ...base, committedHours: 700, plannedNewClients: 0 }));
    expect(r.remaining).toBe(-28);
    expect(r.shortfall).toBe(true);
    expect(r.additionalClientsSupportable).toBe(0);
    expect(r.fteShortCurrent).toBe(0.25);
    expect(r.fteShortWithPlanned).toBeNull();
  });

  it("returns n/a clients when workload per client is 0 (undefined), not infinity", () => {
    expect(ok(calculateCapacity({ ...base, hoursPerNewClient: 0 })).result.additionalClientsSupportable).toBeNull();
  });

  it("rejects zero staff, zero hours, 100% target and fractional client counts", () => {
    expect(calculateCapacity({ ...base, staff: 0 }).ok).toBe(false);
    expect(calculateCapacity({ ...base, availableHoursPerPerson: 0 }).ok).toBe(false);
    expect(calculateCapacity({ ...base, targetPct: 100 }).ok).toBe(false);
    expect(calculateCapacity({ ...base, plannedNewClients: 1.5 }).ok).toBe(false);
  });
});

describe("shared validation", () => {
  const money = { kind: "money", required: true } as const;

  it("treats blank required fields as missing, never as zero", () => {
    expect(parseField("", money, "Revenue")).toMatchObject({ ok: false, reason: "missing" });
    expect(parseField("   ", money, "Revenue")).toMatchObject({ ok: false, reason: "missing" });
  });

  it("uses the default only for optional blanks", () => {
    expect(parseField("", { kind: "money", required: false, defaultWhenBlank: 0 }, "Other")).toEqual({ ok: true, value: 0 });
  });

  it("rejects unreadable text, NaN, Infinity, negatives and over-limit values without clamping", () => {
    for (const raw of ["abc", "1,000", "$5", "NaN", "Infinity", "-1", "1e13"]) {
      expect(parseField(raw, money, "Revenue").ok).toBe(false);
    }
    expect(parseField("5", money, "Revenue", true).ok).toBe(false);
  });

  it("enforces percent bounds and exclusive minimums and whole counts", () => {
    expect(parseField("100", { kind: "percent", required: true }, "Margin").ok).toBe(false);
    expect(parseField("99.9", { kind: "percent", required: true }, "Margin").ok).toBe(true);
    expect(parseField("0", { kind: "hours", required: true, exclusiveMin: true }, "Hours").ok).toBe(false);
    expect(parseField("1.5", { kind: "count", required: true }, "Clients").ok).toBe(false);
  });

  it("normalises -0 and accepts decimals", () => {
    expect(Object.is((parseField("-0", money, "x") as { value: number }).value, 0)).toBe(true);
    expect(parseField("12.34", money, "x")).toEqual({ ok: true, value: 12.34 });
  });

  it("safeDiv and feeForMargin never return Infinity or NaN", () => {
    expect(safeDiv(1, 0)).toBeNull();
    expect(safeDiv(NaN, 1)).toBeNull();
    expect(feeForMargin(100, 1)).toBeNull();
    expect(feeForMargin(100, 0.5)).toBe(200);
    expect(roundCents(-0.004)).toBe(0);
    expect(roundCents(1.005 + 0.0000001)).toBe(1.01);
  });
});
