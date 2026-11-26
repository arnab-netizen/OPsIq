import { feeForMargin, roundCents, roundPct, safeDiv, type CalcResult } from "./shared";

/**
 * Client Profitability Calculator (pure).
 *
 *   Agency gross income (AGI) = client revenue - pass-through expenses included in that revenue
 *   Direct delivery cost      = staff time cost (hours x loaded cost per hour, per role line) + other direct delivery costs
 *   Delivery profit           = AGI - direct delivery cost          (NOT net operating profit: no overhead is subtracted)
 *   Delivery margin           = delivery profit / AGI
 *
 * Double counting is prevented structurally: pass-through expenses only ever leave revenue (never delivery cost), and
 * "other direct delivery costs" must exclude staff time already counted through hours and rates.
 */

export type ClientProfitabilityInput = {
  revenue: number;
  passThrough: number;
  role1Hours: number;
  role1Rate: number;
  role2Hours: number;
  role2Rate: number;
  otherDirectCosts: number;
  /** Target delivery margin as a percentage, 0 to 99.9. */
  targetMarginPct: number;
};

export type ClientProfitabilityResult = {
  agi: number;
  staffCost: number;
  deliveryCost: number;
  deliveryProfit: number;
  /** Fraction, e.g. 0.4 for 40%; null when AGI is 0. */
  deliveryMargin: number | null;
  totalHours: number;
  /** AGI divided by delivery hours; null when no hours were entered. */
  effectiveHourlyRate: number | null;
  blendedCostPerHour: number | null;
  /** AGI needed to reach the target margin at the current delivery cost; null when the target is not computable. */
  requiredAgi: number | null;
  /** Extra agency fee needed (>= 0). */
  feeIncreaseNeeded: number | null;
  /** Total client invoice at the required fee (required AGI plus pass-through). */
  requiredInvoice: number | null;
  /** Delivery cost that would hit the target margin at the current AGI. */
  targetDeliveryCost: number;
  /** Reduction in delivery cost needed at the current AGI (>= 0). */
  costReductionNeeded: number;
  /** The same reduction expressed as delivery hours at the blended loaded cost; null when no staff hours or cost. */
  hoursReductionEquivalent: number | null;
  targetMargin: number;
  meetsTarget: boolean | null;
};

function bad(n: number): boolean {
  return !Number.isFinite(n) || n < 0;
}

export function calculateClientProfitability(i: ClientProfitabilityInput): CalcResult<{ result: ClientProfitabilityResult }> {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(i)) if (bad(v)) errors.push(`${k} must be a finite number that is 0 or more.`);
  if (i.targetMarginPct >= 100) errors.push("Target margin must be below 100%.");
  if (i.passThrough > i.revenue) errors.push("Pass-through expenses are larger than revenue, so agency gross income would be negative. Check that revenue includes them.");
  if (errors.length) return { ok: false, errors };

  const agi = i.revenue - i.passThrough;
  const staffCost = i.role1Hours * i.role1Rate + i.role2Hours * i.role2Rate;
  const deliveryCost = staffCost + i.otherDirectCosts;
  const deliveryProfit = agi - deliveryCost;
  const totalHours = i.role1Hours + i.role2Hours;
  const target = i.targetMarginPct / 100;

  const deliveryMargin = safeDiv(deliveryProfit, agi);
  const requiredAgi = feeForMargin(deliveryCost, target);
  const targetDeliveryCost = agi * (1 - target);
  const costReductionNeeded = Math.max(0, deliveryCost - targetDeliveryCost);
  const blendedCostPerHour = safeDiv(staffCost, totalHours);
  const hoursReductionEquivalent = blendedCostPerHour && blendedCostPerHour > 0 ? costReductionNeeded / blendedCostPerHour : null;

  return {
    ok: true,
    result: {
      agi: roundCents(agi),
      staffCost: roundCents(staffCost),
      deliveryCost: roundCents(deliveryCost),
      deliveryProfit: roundCents(deliveryProfit),
      deliveryMargin: deliveryMargin === null ? null : deliveryMargin,
      totalHours,
      effectiveHourlyRate: (() => {
        const r = safeDiv(agi, totalHours);
        return r === null ? null : roundCents(r);
      })(),
      blendedCostPerHour: blendedCostPerHour === null ? null : roundCents(blendedCostPerHour),
      requiredAgi: requiredAgi === null ? null : roundCents(requiredAgi),
      feeIncreaseNeeded: requiredAgi === null ? null : roundCents(Math.max(0, requiredAgi - agi)),
      requiredInvoice: requiredAgi === null ? null : roundCents(Math.max(requiredAgi, agi) + i.passThrough),
      targetDeliveryCost: roundCents(targetDeliveryCost),
      costReductionNeeded: roundCents(costReductionNeeded),
      hoursReductionEquivalent: hoursReductionEquivalent === null ? null : Math.round(hoursReductionEquivalent * 10) / 10,
      targetMargin: target,
      meetsTarget: deliveryMargin === null ? null : roundPct(deliveryMargin * 100) >= roundPct(i.targetMarginPct),
    },
  };
}
