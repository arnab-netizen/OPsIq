import { MIN_POSITIVE, RATIO_TOLERANCE, ceilCents, complement, feeForMargin, moneyOrNull, roundCents, safeDiv, tooLarge, type CalcResult } from "./shared";

/**
 * Agency Retainer Pricing Calculator (pure).
 *
 *   Monthly delivery cost  = estimated hours x loaded cost per hour + other direct monthly costs
 *   Delivery break-even fee = monthly delivery cost                    (delivery margin 0%; NOT whole-agency break-even)
 *   Target agency fee       = delivery cost / (1 - target delivery margin), rounded UP to the cent so it never misses the target
 *   Client invoice          = agency fee + pass-through amounts billed to the client
 *
 * Whole-agency break-even also has to cover overhead (rent, management, software, sales); this tool deliberately does not.
 *
 * Sustainability of a proposed fee. At the target margin the fee allows a COST BUDGET = fee x (1 - target margin). The budget
 * pays other direct costs first, and whatever is left pays for delivery hours at the loaded cost per hour.
 */

export type RetainerPricingInput = {
  monthlyHours: number;
  costPerHour: number;
  otherDirectMonthly: number;
  passThroughMonthly: number;
  targetMarginPct: number;
  /** Optional: a fee already proposed or agreed. 0 means "not entered". */
  proposedFee: number;
};

export type MarginScenario = { marginPct: number; fee: number; invoice: number; effectiveHourlyRate: number | null; contribution: number };

/**
 * Why a proposed fee does or does not fund delivery hours at the target margin.
 *  - other_costs_exceed_budget: other direct costs alone are more than the cost budget, so no hours fit.
 *  - other_costs_equal_budget: other direct costs use exactly the whole budget, leaving zero hours.
 *  - hours_limited_by_cost: positive budget remains and hours cost money, so a finite number of hours fit.
 *  - hours_not_limited_by_cost: the hourly cost is 0 and the budget covers other costs, so cost does not limit hours
 *    (real delivery capacity still does; this is never "unlimited hours").
 */
export type SustainabilityState = "other_costs_exceed_budget" | "other_costs_equal_budget" | "hours_limited_by_cost" | "hours_not_limited_by_cost";

export type ProposedFeeAssessment = {
  fee: number;
  /** Cost budget at the target margin: fee x (1 - target margin). */
  costBudget: number;
  /** Budget left for delivery hours after other direct costs (negative when other costs exceed the budget). */
  laborBudget: number;
  state: SustainabilityState;
  /** Maximum delivery hours the budget supports; null unless state is hours_limited_by_cost (0 when other costs equal the budget). */
  maxSustainableHours: number | null;
  /** Whether the ACTUAL planned hours and costs reach the target margin at this fee (unrounded, within tolerance). */
  plannedHoursMeetTarget: boolean;
  /** Delivery margin at the planned hours; null if the fee is 0. */
  deliveryMargin: number | null;
  contribution: number;
};

export type RetainerPricingResult = {
  deliveryCost: number;
  breakEvenFee: number;
  targetFee: number;
  invoice: number;
  effectiveHourlyRate: number | null;
  contribution: number;
  annualFee: number;
  /** True when no cost was entered at all, so a target fee of 0 only reflects that nothing needs recovering. */
  zeroCostEntered: boolean;
  scenarios: MarginScenario[];
  proposed: ProposedFeeAssessment | null;
};

const SCENARIO_MARGINS = [30, 40, 50, 60] as const;

export function calculateRetainerPricing(i: RetainerPricingInput): CalcResult<{ result: RetainerPricingResult }> {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(i)) if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be a finite number that is 0 or more.`);
  if (i.targetMarginPct >= 100) errors.push("Target margin must be below 100%.");
  if (!(i.monthlyHours >= MIN_POSITIVE)) errors.push(`Estimated monthly delivery hours must be at least ${MIN_POSITIVE}.`);
  if (errors.length) return { ok: false, errors };

  const target = i.targetMarginPct / 100;
  const deliveryCost = i.monthlyHours * i.costPerHour + i.otherDirectMonthly;
  if (tooLarge(deliveryCost, i.proposedFee, i.passThroughMonthly)) return { ok: false, errors: ["These amounts are too large to calculate exactly to the cent. Reduce them."] };
  const targetFeeRaw = feeForMargin(deliveryCost, target) as number; // target < 1 validated above
  if (tooLarge(targetFeeRaw * 12)) return { ok: false, errors: ["The resulting fee is too large to show exactly. Reduce the amounts or lower the target margin."] };
  const targetFee = ceilCents(targetFeeRaw);

  const scenarioFor = (marginPct: number): MarginScenario => {
    const raw = feeForMargin(deliveryCost, marginPct / 100) as number;
    const fee = ceilCents(raw);
    const rate = moneyOrNull(safeDiv(fee, i.monthlyHours));
    return {
      marginPct,
      fee,
      invoice: roundCents(fee + i.passThroughMonthly),
      effectiveHourlyRate: rate === null ? null : ceilCents(rate),
      contribution: roundCents(fee - deliveryCost),
    };
  };

  let proposed: ProposedFeeAssessment | null = null;
  if (i.proposedFee > 0) {
    const costBudget = i.proposedFee * complement(target);
    const laborBudget = costBudget - i.otherDirectMonthly;
    const eps = RATIO_TOLERANCE * Math.max(1, costBudget);
    let state: SustainabilityState;
    let maxHours: number | null = null;
    if (laborBudget < -eps) {
      state = "other_costs_exceed_budget";
    } else if (laborBudget <= eps) {
      state = "other_costs_equal_budget";
      maxHours = 0;
    } else if (i.costPerHour > 0) {
      state = "hours_limited_by_cost";
      maxHours = Math.round((laborBudget / i.costPerHour) * 10) / 10;
    } else {
      state = "hours_not_limited_by_cost";
    }
    const margin = safeDiv(i.proposedFee - deliveryCost, i.proposedFee);
    proposed = {
      fee: roundCents(i.proposedFee),
      costBudget: roundCents(costBudget),
      laborBudget: roundCents(laborBudget),
      state,
      maxSustainableHours: maxHours,
      plannedHoursMeetTarget: deliveryCost <= costBudget + eps,
      deliveryMargin: margin,
      contribution: roundCents(i.proposedFee - deliveryCost),
    };
  }

  const rate = moneyOrNull(safeDiv(targetFee, i.monthlyHours));
  return {
    ok: true,
    result: {
      deliveryCost: roundCents(deliveryCost),
      breakEvenFee: ceilCents(deliveryCost),
      targetFee,
      invoice: roundCents(targetFee + i.passThroughMonthly),
      effectiveHourlyRate: rate === null ? null : ceilCents(rate),
      contribution: roundCents(targetFee - deliveryCost),
      annualFee: roundCents(targetFee * 12),
      zeroCostEntered: deliveryCost === 0,
      scenarios: SCENARIO_MARGINS.map(scenarioFor),
      proposed,
    },
  };
}
