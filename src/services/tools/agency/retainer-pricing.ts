import { feeForMargin, roundCents, safeDiv, type CalcResult } from "./shared";

/**
 * Agency Retainer Pricing Calculator (pure).
 *
 *   Monthly delivery cost  = estimated hours x loaded cost per hour + other direct monthly costs
 *   Delivery break-even fee = monthly delivery cost                    (delivery margin 0%; NOT whole-agency break-even)
 *   Target agency fee       = delivery cost / (1 - target delivery margin)
 *   Client invoice          = agency fee + pass-through amounts billed to the client
 *
 * Whole-agency break-even also has to cover overhead (rent, management, software, sales); this tool deliberately does not.
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

export type RetainerPricingResult = {
  deliveryCost: number;
  breakEvenFee: number;
  targetFee: number;
  invoice: number;
  effectiveHourlyRate: number | null;
  contribution: number;
  annualFee: number;
  scenarios: MarginScenario[];
  /** Present only when a proposed fee was entered. */
  proposed: null | {
    fee: number;
    deliveryMargin: number | null;
    contribution: number;
    /** Hours the proposed fee can sustain at the target margin; null when the fee cannot cover other direct costs at that margin. */
    maxSustainableHours: number | null;
    sustainable: boolean;
  };
};

const SCENARIO_MARGINS = [30, 40, 50, 60] as const;

export function calculateRetainerPricing(i: RetainerPricingInput): CalcResult<{ result: RetainerPricingResult }> {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(i)) if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be a finite number that is 0 or more.`);
  if (i.targetMarginPct >= 100) errors.push("Target margin must be below 100%.");
  if (!(i.monthlyHours > 0)) errors.push("Estimated monthly delivery hours must be more than 0.");
  if (errors.length) return { ok: false, errors };

  const target = i.targetMarginPct / 100;
  const deliveryCost = i.monthlyHours * i.costPerHour + i.otherDirectMonthly;
  const targetFee = feeForMargin(deliveryCost, target) as number; // target < 1 is validated above

  const scenarioFor = (marginPct: number): MarginScenario => {
    const fee = feeForMargin(deliveryCost, marginPct / 100) as number;
    const rate = safeDiv(fee, i.monthlyHours);
    return {
      marginPct,
      fee: roundCents(fee),
      invoice: roundCents(fee + i.passThroughMonthly),
      effectiveHourlyRate: rate === null ? null : roundCents(rate),
      contribution: roundCents(fee - deliveryCost),
    };
  };

  let proposed: RetainerPricingResult["proposed"] = null;
  if (i.proposedFee > 0) {
    const room = i.proposedFee * (1 - target) - i.otherDirectMonthly;
    const hours = i.costPerHour > 0 ? room / i.costPerHour : null;
    proposed = {
      fee: roundCents(i.proposedFee),
      deliveryMargin: safeDiv(i.proposedFee - deliveryCost, i.proposedFee),
      contribution: roundCents(i.proposedFee - deliveryCost),
      maxSustainableHours: hours === null || room <= 0 ? null : Math.round(hours * 10) / 10,
      sustainable: room > 0 && i.costPerHour > 0,
    };
  }

  const rate = safeDiv(targetFee, i.monthlyHours);
  return {
    ok: true,
    result: {
      deliveryCost: roundCents(deliveryCost),
      breakEvenFee: roundCents(deliveryCost),
      targetFee: roundCents(targetFee),
      invoice: roundCents(targetFee + i.passThroughMonthly),
      effectiveHourlyRate: rate === null ? null : roundCents(rate),
      contribution: roundCents(targetFee - deliveryCost),
      annualFee: roundCents(targetFee * 12),
      scenarios: SCENARIO_MARGINS.map(scenarioFor),
      proposed,
    },
  };
}
