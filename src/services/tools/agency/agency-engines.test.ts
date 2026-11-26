// @vitest-environment node
/**
 * Independent fixtures: every expected value below was worked out by hand (shown in the comments) BEFORE the engines were
 * run, so these tests check the formulas rather than echoing the implementation.
 */
import { describe, expect, it } from "vitest";
import { calculateClientProfitability, type ClientProfitabilityInput } from "./client-profitability";
import { calculateRetainerPricing, type RetainerPricingInput } from "./retainer-pricing";
import { calculateUtilization } from "./utilization";
import { calculateScopeCreep } from "./scope-creep";
import { calculateHourlyRate } from "./hourly-rate";
import { calculateCapacity, type CapacityInput } from "./capacity";
import { RATIO_TOLERANCE, ceilCents, feeForMargin, moneyOrNull, parseField, roundCents, safeDiv, tooLarge } from "./shared";

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
    // Target 70%: minimum fee 3,500 / 0.3 = 11,666.67 (rounded up); fee to keep is the larger of that and today's 10,000;
    // increase 1,666.67; invoice adds the 2,000 pass-through back.
    expect(r.requiredAgi).toBe(11666.67);
    expect(r.retainedAgi).toBe(11666.67);
    expect(r.feeIncreaseNeeded).toBe(1666.67);
    expect(r.retainedInvoice).toBe(13666.67);
    // Target cost at current AGI 10,000 x 0.3 = 3,000 => reduce 500 => 500 / 60 = 8.3 hours, well within the 50 hours.
    expect(r.costReductionNeeded).toBe(500);
    expect(r.hoursReductionEquivalent).toBe(8.3);
    expect(r.hoursReductionExceedsAvailable).toBe(false);
    expect(r.meetsTarget).toBe(false);
    expect(r.zeroCostLabor).toBe(false);
  });

  it("never recommends lowering the fee when already above target", () => {
    // Target 60%: minimum fee 3,500 / 0.4 = 8,750 is below today's 10,000, so the fee to keep stays 10,000.
    const { result: r } = ok(calculateClientProfitability({ ...base, targetMarginPct: 60 }));
    expect(r.requiredAgi).toBe(8750);
    expect(r.retainedAgi).toBe(10000);
    expect(r.feeIncreaseNeeded).toBe(0);
    expect(r.retainedInvoice).toBe(12000);
    expect(r.costReductionNeeded).toBe(0);
    expect(r.meetsTarget).toBe(true);
  });

  describe("paired role cost validation (missing cost is never free labor)", () => {
    it("accepts an unused second role (no hours, no rate)", () => {
      // Only the main role: 40 x 55 = 2,200 + 500 = 2,700 => profit 7,300 => 73%.
      const { result: r } = ok(calculateClientProfitability({ ...base, role2Hours: 0, role2Rate: null }));
      expect(r.staffCost).toBe(2200);
      expect(r.deliveryProfit).toBe(7300);
      expect(r.deliveryMargin).toBeCloseTo(0.73, 10);
      expect(r.zeroCostLabor).toBe(false);
    });

    it("rejects positive second-role hours with a missing rate instead of treating the time as free", () => {
      const r = calculateClientProfitability({ ...base, role2Hours: 10, role2Rate: null });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toMatch(/second role/i);
    });

    it("accepts positive second-role hours with an explicitly entered zero rate, and flags it", () => {
      // 40 x 55 + 10 x 0 = 2,200 + 500 = 2,700 => 73%. The zero rate is the visitor's explicit statement, so it is allowed but warned.
      const { result: r } = ok(calculateClientProfitability({ ...base, role2Hours: 10, role2Rate: 0 }));
      expect(r.staffCost).toBe(2200);
      expect(r.deliveryMargin).toBeCloseTo(0.73, 10);
      expect(r.zeroCostLabor).toBe(true);
    });

    it("accepts positive hours with a positive rate (the fixture)", () => {
      expect(ok(calculateClientProfitability({ ...base, role2Hours: 10, role2Rate: 80 })).result.staffCost).toBe(3000);
    });

    it("rejects missing main-role cost when main-role hours are entered", () => {
      expect(calculateClientProfitability({ ...base, role1Rate: null }).ok).toBe(false);
    });

    it("accepts owner-delivered work at an explicit zero cash salary, flagged as overstating profit", () => {
      // Only other direct costs count: 500 => profit 9,500 => 95%. Looks great, which is exactly why it is flagged.
      const { result: r } = ok(calculateClientProfitability({ ...base, role1Rate: 0, role2Hours: 0, role2Rate: null }));
      expect(r.deliveryCost).toBe(500);
      expect(r.deliveryMargin).toBeCloseTo(0.95, 10);
      expect(r.zeroCostLabor).toBe(true);
    });

    it("lets an unused main role stay blank when there are no hours", () => {
      expect(ok(calculateClientProfitability({ ...base, role1Hours: 0, role1Rate: null, role2Hours: 0, role2Rate: null })).result.staffCost).toBe(0);
    });

    it("rejects contradictory or invalid inputs", () => {
      expect(calculateClientProfitability({ ...base, passThrough: 12001 }).ok).toBe(false);
      expect(calculateClientProfitability({ ...base, role1Rate: -1 }).ok).toBe(false);
      expect(calculateClientProfitability({ ...base, role2Rate: NaN, role2Hours: 0 }).ok).toBe(false);
      expect(calculateClientProfitability({ ...base, targetMarginPct: 100 }).ok).toBe(false);
      for (const bad of [-1, NaN, Infinity]) expect(calculateClientProfitability({ ...base, revenue: bad }).ok).toBe(false);
    });

    it("a missing cost can never produce a better margin than the explicit entry would", () => {
      // The blank case is an error (no result at all), so it cannot show 73% where the true margin with a real rate is lower.
      expect(calculateClientProfitability({ ...base, role2Hours: 10, role2Rate: null }).ok).toBe(false);
      expect(ok(calculateClientProfitability({ ...base, role2Hours: 10, role2Rate: 80 })).result.deliveryMargin).toBeCloseTo(0.65, 10);
    });
  });

  describe("target comparison uses unrounded values", () => {
    const at = (cost: number) => calculateClientProfitability({ revenue: 10000, passThrough: 0, role1Hours: 0, role1Rate: null, role2Hours: 0, role2Rate: null, otherDirectCosts: cost, targetMarginPct: 50 });

    it("49.96% misses a 50% target even though it rounds to 50.0%", () => {
      const { result: r } = ok(at(5004)); // (10,000 - 5,004) / 10,000 = 49.96%
      expect(r.deliveryMargin).toBeCloseTo(0.4996, 10);
      expect(r.meetsTarget).toBe(false);
    });

    it("exactly 50% meets it, and values just above and just below split correctly", () => {
      expect(ok(at(5000)).result.meetsTarget).toBe(true);
      expect(ok(at(4999.99)).result.meetsTarget).toBe(true); // 50.0001%
      expect(ok(at(5000.01)).result.meetsTarget).toBe(false); // 49.9999%
    });

    it("tolerates floating-point noise (documented tolerance 1e-9)", () => {
      // 0.7 - 0.42 = 0.27999999999999997, so the margin is 0.3999999999999999 against 0.4; the tolerance absorbs the 1e-16 error.
      const { result: r } = ok(calculateClientProfitability({ revenue: 0.7, passThrough: 0, role1Hours: 0, role1Rate: null, role2Hours: 0, role2Rate: null, otherDirectCosts: 0.42, targetMarginPct: 40 }));
      expect(r.deliveryMargin as number).toBeLessThan(0.4);
      expect(r.meetsTarget).toBe(true);
      expect(RATIO_TOLERANCE).toBe(1e-9);
    });
  });

  describe("further financial correctness", () => {
    it("says so when cutting hours alone cannot reach the target", () => {
      // Revenue 10,000; 10h x 100 = 1,000 staff + 8,000 other = 9,000 cost; target 50% => target cost 5,000 => cut 4,000,
      // which is 40 hours at 100/h but only 10 hours exist.
      const { result: r } = ok(calculateClientProfitability({ revenue: 10000, passThrough: 0, role1Hours: 10, role1Rate: 100, role2Hours: 0, role2Rate: null, otherDirectCosts: 8000, targetMarginPct: 50 }));
      expect(r.costReductionNeeded).toBe(4000);
      expect(r.hoursReductionExceedsAvailable).toBe(true);
      expect(r.hoursReductionEquivalent).toBeNull();
    });

    it("zero revenue gives n/a margin, a loss, and no invented rate", () => {
      const { result: r } = ok(calculateClientProfitability({ ...base, revenue: 0, passThrough: 0, role2Hours: 0, role2Rate: null, otherDirectCosts: 0 }));
      expect(r.deliveryMargin).toBeNull();
      expect(r.meetsTarget).toBeNull();
      expect(r.deliveryProfit).toBe(-2200);
      expect(r.effectiveHourlyRate).toBe(0);
    });

    it("zero delivery cost is 100% margin and needs no fee increase", () => {
      const { result: r } = ok(calculateClientProfitability({ ...base, role1Hours: 0, role1Rate: null, role2Hours: 0, role2Rate: null, otherDirectCosts: 0 }));
      expect(r.deliveryMargin).toBe(1);
      expect(r.requiredAgi).toBe(0);
      expect(r.feeIncreaseNeeded).toBe(0);
    });

    it("keeps negative margins visible", () => {
      const { result: r } = ok(calculateClientProfitability({ ...base, otherDirectCosts: 9000 }));
      expect(r.deliveryProfit).toBe(-2000);
      expect(r.deliveryMargin).toBeCloseTo(-0.2, 10);
    });

    it("returns n/a for rates with no hours and never Infinity", () => {
      const { result: r } = ok(calculateClientProfitability({ ...base, revenue: 0, passThrough: 0, role1Hours: 0, role1Rate: null, role2Hours: 0, role2Rate: null, otherDirectCosts: 0 }));
      expect(r.effectiveHourlyRate).toBeNull();
      expect(r.blendedCostPerHour).toBeNull();
    });

    it("does not drift on decimals", () => {
      const { result: r } = ok(calculateClientProfitability({ ...base, revenue: 100.1, passThrough: 0.1, role1Hours: 0, role1Rate: null, role2Hours: 0, role2Rate: null, otherDirectCosts: 0 }));
      expect(r.agi).toBe(100);
    });

    it("refuses amounts too large to be exact to the cent instead of showing a wrong last digit", () => {
      const r = calculateClientProfitability({ ...base, revenue: 1e12, passThrough: 0, role1Hours: 1e7, role1Rate: 1e12, role2Hours: 0, role2Rate: null, otherDirectCosts: 0 });
      expect(r.ok).toBe(false);
    });

    it("stays exact at the supported input limit when the products stay in range", () => {
      const { result: r } = ok(calculateClientProfitability({ ...base, revenue: 1e12, passThrough: 0, role1Hours: 1, role1Rate: 1, role2Hours: 0, role2Rate: null, otherDirectCosts: 0 }));
      expect(r.agi).toBe(1e12);
      expect(r.deliveryMargin).toBeCloseTo(1 - 1e-12, 12);
    });
  });
});

describe("retainer pricing", () => {
  // 40h x 55 + 300 = 2,500 cost. Target 50% => fee 5,000; invoice with 1,000 pass-through 6,000; rate 125; contribution 2,500; annual 60,000.
  const base: RetainerPricingInput = { monthlyHours: 40, costPerHour: 55, otherDirectMonthly: 300, passThroughMonthly: 1000, targetMarginPct: 50, proposedFee: 0 };

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
    expect(r.zeroCostEntered).toBe(false);
  });

  it("computes the alternative margin scenarios (30/40/50/60%), rounding required fees up", () => {
    const { result: r } = ok(calculateRetainerPricing(base));
    const by = Object.fromEntries(r.scenarios.map((s) => [s.marginPct, s]));
    // 2,500/0.7 = 3,571.428... => 3,571.43 ; /0.6 = 4,166.666... => 4,166.67 ; /0.5 = 5,000 ; /0.4 = 6,250
    expect(by[30]).toMatchObject({ fee: 3571.43, invoice: 4571.43, effectiveHourlyRate: 89.29, contribution: 1071.43 });
    expect(by[40]).toMatchObject({ fee: 4166.67, effectiveHourlyRate: 104.17, contribution: 1666.67 });
    expect(by[50]).toMatchObject({ fee: 5000, effectiveHourlyRate: 125, contribution: 2500 });
    expect(by[60]).toMatchObject({ fee: 6250, effectiveHourlyRate: 156.25, contribution: 3750 });
  });

  it("a required fee rounded up never misses the target margin", () => {
    for (const cost of [1234.5678, 99.99, 0.07, 2500]) {
      const fee = ceilCents(feeForMargin(cost, 0.4) as number);
      expect((fee - cost) / fee).toBeGreaterThanOrEqual(0.4 - RATIO_TOLERANCE);
    }
  });

  describe("sustainability of a proposed fee", () => {
    it("positive remaining budget with positive hourly cost: finite hours, planned hours checked", () => {
      // Fee 4,000 at 50%: budget 2,000; other 300 => 1,700 left => 1,700 / 55 = 30.9 hours. Planned cost 2,500 exceeds the 2,000 budget.
      const { result: r } = ok(calculateRetainerPricing({ ...base, proposedFee: 4000 }));
      expect(r.proposed).toMatchObject({ costBudget: 2000, laborBudget: 1700, state: "hours_limited_by_cost", maxSustainableHours: 30.9, plannedHoursMeetTarget: false, contribution: 1500 });
      expect(r.proposed?.deliveryMargin).toBeCloseTo(0.375, 10);
    });

    it("planned hours exactly at the limit meet the target", () => {
      // Fee 5,000: budget 2,500; other 300 => 2,200 / 55 = 40.0 hours, exactly the planned 40.
      const { result: r } = ok(calculateRetainerPricing({ ...base, proposedFee: 5000 }));
      expect(r.proposed).toMatchObject({ state: "hours_limited_by_cost", maxSustainableHours: 40, plannedHoursMeetTarget: true });
    });

    it("other direct costs exceed the cost budget: no hours fit, and it says why", () => {
      // Fee 500: budget 250 < other 300.
      const { result: r } = ok(calculateRetainerPricing({ ...base, proposedFee: 500 }));
      expect(r.proposed).toMatchObject({ costBudget: 250, laborBudget: -50, state: "other_costs_exceed_budget", maxSustainableHours: null, plannedHoursMeetTarget: false });
    });

    it("other direct costs exactly equal the cost budget: zero hours, not 'fails to cover'", () => {
      // Fee 600: budget 300 = other 300.
      const { result: r } = ok(calculateRetainerPricing({ ...base, proposedFee: 600 }));
      expect(r.proposed).toMatchObject({ costBudget: 300, laborBudget: 0, state: "other_costs_equal_budget", maxSustainableHours: 0 });
    });

    it("zero hourly cost with the other costs covered: not limited by cost, never 'unlimited hours'", () => {
      // Rate 0: delivery cost is only the 300; fee 4,000 budget 2,000 covers it. The planned hours meet the target.
      const { result: r } = ok(calculateRetainerPricing({ ...base, costPerHour: 0, proposedFee: 4000 }));
      expect(r.proposed).toMatchObject({ state: "hours_not_limited_by_cost", maxSustainableHours: null, plannedHoursMeetTarget: true });
    });

    it("zero hourly cost does not hide other costs that exceed the budget", () => {
      const { result: r } = ok(calculateRetainerPricing({ ...base, costPerHour: 0, proposedFee: 500 }));
      expect(r.proposed?.state).toBe("other_costs_exceed_budget");
    });

    it("never claims costs are uncovered when they are covered", () => {
      // At 4,000 the other costs (300) are well inside the 2,000 budget, so the state must not be the 'exceed' state.
      expect(ok(calculateRetainerPricing({ ...base, proposedFee: 4000 })).result.proposed?.state).not.toBe("other_costs_exceed_budget");
    });
  });

  it("flags a zero-cost entry instead of presenting a 0 fee as a recommendation", () => {
    const { result: r } = ok(calculateRetainerPricing({ ...base, costPerHour: 0, otherDirectMonthly: 0 }));
    expect(r.zeroCostEntered).toBe(true);
    expect(r.targetFee).toBe(0);
  });

  it("rejects zero or tiny hours, 100% margin and invalid numbers", () => {
    expect(calculateRetainerPricing({ ...base, monthlyHours: 0 }).ok).toBe(false);
    expect(calculateRetainerPricing({ ...base, monthlyHours: 0.001 }).ok).toBe(false);
    expect(calculateRetainerPricing({ ...base, targetMarginPct: 100 }).ok).toBe(false);
    expect(calculateRetainerPricing({ ...base, costPerHour: NaN }).ok).toBe(false);
  });

  it("handles a very small positive divisor without a misleading rate", () => {
    // 0.01 hours of 1e12 other cost: the implied hourly rate (about 2e14) is outside the exact range, so it is n/a, not a number.
    const { result: r } = ok(calculateRetainerPricing({ ...base, monthlyHours: 0.01, costPerHour: 0, otherDirectMonthly: 1e12 }));
    expect(r.effectiveHourlyRate).toBeNull();
  });

  it("refuses a target margin near 100% when the fee leaves the exact range", () => {
    expect(calculateRetainerPricing({ ...base, targetMarginPct: 99.9, costPerHour: 0, otherDirectMonthly: 1e12 }).ok).toBe(false);
    expect(ok(calculateRetainerPricing({ ...base, targetMarginPct: 99.9 })).result.targetFee).toBe(2500000);
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

  it("rejects no capacity, tiny capacity, leave covering all paid hours, and 100% or 0% targets", () => {
    expect(calculateUtilization({ ...base, teamMembers: 0 }).ok).toBe(false);
    expect(calculateUtilization({ ...base, teamMembers: 0.001 }).ok).toBe(false);
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
  // Revised revenue 6,500; revised cost 3,510; revised profit 2,990 => 46.0%. Erosion 17.333... points. Unrecovered 810.
  // Fee to restore 63.33%: 3,510 / 0.36667 = 9,572.727.. => 9,572.73 (up), minus 6,500 = 3,072.73. Change order at 50%: 2,620.
  const base = { agreedFee: 6000, plannedHours: 40, extraHours: 22, costPerHour: 55, plannedExpenses: 0, extraExpenses: 100, changeOrderRevenue: 500, changeOrderMarginPct: 50 };

  it("matches the hand-calculated fixture, with erosion returned unrounded", () => {
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
    expect(r.marginErosionPoints).toBeCloseTo(17.3333333, 5);
    expect(r.feeToPreserveMargin).toBe(3072.73);
    expect(r.changeOrderPrice).toBe(2620);
    expect(r.zeroRateExtraHours).toBe(false);
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

  it("flags extra hours entered at a zero cost so erosion is not silently understated", () => {
    const { result: r } = ok(calculateScopeCreep({ ...base, costPerHour: 0 }));
    expect(r.zeroRateExtraHours).toBe(true);
  });

  it("rejects a zero fee, a tiny fee and invalid numbers", () => {
    expect(calculateScopeCreep({ ...base, agreedFee: 0 }).ok).toBe(false);
    expect(calculateScopeCreep({ ...base, agreedFee: 0.001 }).ok).toBe(false);
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

  it("computes the sensitivity table, rounding required rates up", () => {
    const { result: r } = ok(calculateHourlyRate(base));
    const by = Object.fromEntries(r.sensitivity.map((s) => [s.label, s.requiredRate]));
    expect(by["Utilization 10 points lower"]).toBe(145.84); // 1,050,000 / 7,200 = 145.8333.. rounded UP
    expect(by["Utilization 10 points higher"]).toBe(109.38); // 1,050,000 / 9,600 = 109.375
    expect(by["Costs 10% higher"]).toBe(137.5); // 924,000/0.8 = 1,155,000 / 8,400
    expect(by["Costs 10% lower"]).toBe(112.5); // 756,000/0.8 = 945,000 / 8,400
  });

  it("gives n/a for a sensitivity case that would push utilization to 100% or beyond", () => {
    const { result: r } = ok(calculateHourlyRate({ ...base, targetUtilizationPct: 95 }));
    expect(r.sensitivity.find((s) => s.label === "Utilization 10 points higher")?.requiredRate).toBeNull();
  });

  it("rejects zero or tiny capacity, 100% utilization, 100% margin and nothing to recover", () => {
    expect(calculateHourlyRate({ ...base, annualCapacityHours: 0 }).ok).toBe(false);
    expect(calculateHourlyRate({ ...base, annualCapacityHours: 0.001 }).ok).toBe(false);
    expect(calculateHourlyRate({ ...base, targetUtilizationPct: 100 }).ok).toBe(false);
    expect(calculateHourlyRate({ ...base, targetOperatingMarginPct: 100 }).ok).toBe(false);
    expect(calculateHourlyRate({ ...base, annualPayroll: 0, annualOverhead: 0 }).ok).toBe(false);
  });

  it("returns n/a, not a misleading number, when a tiny capacity pushes the rate out of range", () => {
    // Cost pool 2e12 over 0.007 billable hours => about 3.6e14 per hour, outside the exact range.
    const { result: r } = ok(calculateHourlyRate({ ...base, annualPayroll: 1e12, annualOverhead: 1e12, annualCapacityHours: 0.01 }));
    expect(r.requiredRate).toBeNull();
    expect(r.breakEvenRate).toBeNull();
  });

  it("a tiny but valid capacity gives a finite, exact-range figure rather than an error", () => {
    const { result: r } = ok(calculateHourlyRate({ ...base, annualCapacityHours: 0.01 }));
    expect(Number.isFinite(r.requiredRate as number)).toBe(true);
  });
});

describe("capacity planning", () => {
  // 6 x 140 x 80% = 672 target hours (112 per FTE). Committed 600 => 72 left => floor(72/25) = 2 clients. 4 planned: 600 + 100 - 672 = 28 => 0.25 FTE.
  const base: CapacityInput = { staff: 6, availableHoursPerPerson: 140, targetPct: 80, committedHours: 600, hoursPerNewClient: 25, plannedNewClients: 4 };

  it("matches the hand-calculated fixture", () => {
    const { result: r } = ok(calculateCapacity(base));
    expect(r.targetCapacity).toBe(672);
    expect(r.hoursPerFte).toBe(112);
    expect(r.remaining).toBe(72);
    expect(r.shortfall).toBe(false);
    expect(r.additionalClientsSupportable).toBe(2);
    expect(r.fteShortCurrent).toBe(0);
    expect(r.plannedAssessment).toBe("assessed");
    expect(r.plannedHoursOverTarget).toBe(28);
    expect(r.fteShortWithPlanned).toBe(0.25);
  });

  describe("planned-client workload validation", () => {
    it("withholds the planned-client assessment when the workload is missing", () => {
      const { result: r } = ok(calculateCapacity({ ...base, hoursPerNewClient: null }));
      expect(r.plannedAssessment).toBe("withheld_workload_missing_or_zero");
      expect(r.fteShortWithPlanned).toBeNull();
      expect(r.plannedHoursOverTarget).toBeNull();
      expect(r.additionalClientsSupportable).toBeNull();
    });

    it("withholds it when the workload is zero, instead of saying the clients fit", () => {
      const { result: r } = ok(calculateCapacity({ ...base, hoursPerNewClient: 0 }));
      expect(r.plannedAssessment).toBe("withheld_workload_missing_or_zero");
      expect(r.fteShortWithPlanned).toBeNull();
      expect(r.additionalClientsSupportable).toBeNull();
    });

    it("rejects a negative workload", () => {
      expect(calculateCapacity({ ...base, hoursPerNewClient: -5 }).ok).toBe(false);
    });

    it("assesses with a positive workload, including a shortfall", () => {
      const { result: r } = ok(calculateCapacity({ ...base, plannedNewClients: 10 }));
      // 600 + 250 - 672 = 178 over => 178 / 112 = 1.5893 => 1.59 FTE
      expect(r.plannedAssessment).toBe("assessed");
      expect(r.plannedHoursOverTarget).toBe(178);
      expect(r.fteShortWithPlanned).toBe(1.59);
    });

    it("does not request an assessment when no clients are planned, even with no workload entered", () => {
      const { result: r } = ok(calculateCapacity({ ...base, plannedNewClients: 0, hoursPerNewClient: null }));
      expect(r.plannedAssessment).toBe("not_requested");
      expect(r.fteShortWithPlanned).toBeNull();
    });
  });

  it("reports a shortfall in hours and FTE, without recommending hiring", () => {
    const { result: r } = ok(calculateCapacity({ ...base, committedHours: 700, plannedNewClients: 0 }));
    expect(r.remaining).toBe(-28);
    expect(r.shortfall).toBe(true);
    expect(r.additionalClientsSupportable).toBe(0);
    expect(r.fteShortCurrent).toBe(0.25);
    expect(r.fteShortWithPlanned).toBeNull();
  });

  it("rejects zero or tiny staff and hours, 100% target and fractional client counts", () => {
    expect(calculateCapacity({ ...base, staff: 0 }).ok).toBe(false);
    expect(calculateCapacity({ ...base, staff: 0.001 }).ok).toBe(false);
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

  it("distinguishes an optional blank from an explicitly typed zero", () => {
    const opt = { kind: "money", required: false, defaultWhenBlank: 0 } as const;
    expect(parseField("", opt, "Other")).toEqual({ ok: true, value: 0, blank: true });
    expect(parseField("0", opt, "Other")).toEqual({ ok: true, value: 0, blank: false });
  });

  it("rejects unreadable text, NaN, Infinity, negatives and over-limit values without clamping", () => {
    for (const raw of ["abc", "1,000", "$5", "NaN", "Infinity", "-1", "1e13"]) {
      expect(parseField(raw, money, "Revenue").ok).toBe(false);
    }
    expect(parseField("5", money, "Revenue", true).ok).toBe(false);
  });

  it("enforces percent bounds, the minimum divisor and whole counts", () => {
    expect(parseField("100", { kind: "percent", required: true }, "Margin").ok).toBe(false);
    expect(parseField("99.9", { kind: "percent", required: true }, "Margin").ok).toBe(true);
    expect(parseField("0.001", { kind: "hours", required: true, min: 0.01 }, "Hours").ok).toBe(false);
    expect(parseField("0.01", { kind: "hours", required: true, min: 0.01 }, "Hours").ok).toBe(true);
    expect(parseField("1.5", { kind: "count", required: true }, "Clients").ok).toBe(false);
  });

  it("normalises -0 and accepts decimals", () => {
    expect(Object.is((parseField("-0", money, "x") as { value: number }).value, 0)).toBe(true);
    expect(parseField("12.34", money, "x")).toEqual({ ok: true, value: 12.34, blank: false });
  });

  it("safeDiv, feeForMargin and moneyOrNull never return Infinity, NaN or an out-of-range money value", () => {
    expect(safeDiv(1, 0)).toBeNull();
    expect(safeDiv(NaN, 1)).toBeNull();
    expect(feeForMargin(100, 1)).toBeNull();
    expect(feeForMargin(100, 0.5)).toBe(200);
    expect(moneyOrNull(1e14)).toBeNull();
    expect(moneyOrNull(Infinity)).toBeNull();
    expect(moneyOrNull(12.5)).toBe(12.5);
    expect(tooLarge(9e13)).toBe(false);
    expect(tooLarge(9.1e13)).toBe(true);
    expect(roundCents(-0.004)).toBe(0);
  });

  it("ceilCents rounds required amounts up and absorbs floating-point noise", () => {
    expect(ceilCents(4166.666666666667)).toBe(4166.67);
    expect(ceilCents(100.004)).toBe(100.01);
    expect(ceilCents(100)).toBe(100);
    expect(ceilCents(0.1 + 0.2)).toBe(0.3);
    expect(ceilCents(0)).toBe(0);
  });
});
