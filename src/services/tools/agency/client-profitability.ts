import { RATIO_TOLERANCE, ceilCents, complement, feeForMargin, moneyOrNull, roundCents, safeDiv, tooLarge, type CalcResult } from "./shared";

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
 *
 * Missing cost is never free labor. A cost rate is `null` when the visitor left it blank and a number (including 0) when they
 * typed it. Hours entered without a rate are an ERROR; an explicit 0 rate is accepted and flagged (`zeroCostLabor`) because it
 * means the time is unpaid in cash terms (for example an owner without a salary), which overstates profit if that time has a
 * real cost.
 *
 * All target decisions use unrounded values; rounding is for display only. RATIO_TOLERANCE (1e-9) absorbs floating-point
 * error and is far smaller than any displayed digit.
 */

export type ClientProfitabilityInput = {
  revenue: number;
  passThrough: number;
  role1Hours: number;
  /** null = left blank. */
  role1Rate: number | null;
  role2Hours: number;
  /** null = left blank. */
  role2Rate: number | null;
  otherDirectCosts: number;
  /** Target delivery margin as a percentage, 0 to 99.9. */
  targetMarginPct: number;
};

export type ClientProfitabilityResult = {
  agi: number;
  staffCost: number;
  deliveryCost: number;
  deliveryProfit: number;
  /** Unrounded fraction, e.g. 0.4 for 40%; null when AGI is 0. */
  deliveryMargin: number | null;
  totalHours: number;
  /** AGI divided by delivery hours; null when no hours were entered. For a fixed fee this is what the fee works out to per hour. */
  effectiveHourlyRate: number | null;
  blendedCostPerHour: number | null;
  /** Mathematically required AGI (minimum fee) to reach the target at the current delivery cost, rounded UP to the cent. */
  requiredAgi: number | null;
  /** Fee to keep: the larger of the required fee and today's fee (a fee is never recommended downward). */
  retainedAgi: number | null;
  /** Extra agency fee needed (>= 0). */
  feeIncreaseNeeded: number | null;
  /** Total client invoice at the retained fee (retained AGI plus pass-through). */
  retainedInvoice: number | null;
  /** Delivery cost that would hit the target margin at the current AGI. */
  targetDeliveryCost: number;
  /** Reduction in delivery cost needed at the current AGI (>= 0). */
  costReductionNeeded: number;
  /** The same reduction as delivery hours at the blended loaded cost; null when unavailable or when it exceeds all delivery hours. */
  hoursReductionEquivalent: number | null;
  /** True when the cost reduction needed is larger than all staff cost, so cutting hours alone cannot reach the target. */
  hoursReductionExceedsAvailable: boolean;
  /** True when staff time was entered at an explicit 0 cost rate. */
  zeroCostLabor: boolean;
  targetMargin: number;
  /** Unrounded comparison with the target (within RATIO_TOLERANCE); null when margin is undefined. */
  meetsTarget: boolean | null;
};

function bad(n: number | null): boolean {
  return n !== null && (!Number.isFinite(n) || n < 0);
}

export function calculateClientProfitability(i: ClientProfitabilityInput): CalcResult<{ result: ClientProfitabilityResult }> {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(i)) if (bad(v as number | null)) errors.push(`${k} must be a finite number that is 0 or more.`);
  if (i.targetMarginPct >= 100) errors.push("Target margin must be below 100%.");
  if (i.passThrough > i.revenue) errors.push("Pass-through expenses are larger than revenue, so agency gross income would be negative. Check that revenue includes them.");
  if (i.role1Hours > 0 && i.role1Rate === null) errors.push("Enter a loaded cost per hour for the main team. If the time genuinely costs nothing in cash, enter 0 and read the warning.");
  if (i.role2Hours > 0 && i.role2Rate === null) errors.push("Enter a loaded cost per hour for the second role. A blank rate is not treated as free labor; enter 0 only if that time truly has no cost.");
  if (errors.length) return { ok: false, errors };

  const rate1 = i.role1Rate ?? 0; // only reachable when role1Hours is 0
  const rate2 = i.role2Rate ?? 0; // only reachable when role2Hours is 0
  const agi = i.revenue - i.passThrough;
  const staffCost = i.role1Hours * rate1 + i.role2Hours * rate2;
  const deliveryCost = staffCost + i.otherDirectCosts;
  if (tooLarge(agi, staffCost, deliveryCost, i.revenue)) return { ok: false, errors: ["These amounts are too large to calculate exactly to the cent. Reduce them."] };

  const deliveryProfit = agi - deliveryCost;
  const totalHours = i.role1Hours + i.role2Hours;
  const target = i.targetMarginPct / 100;

  const deliveryMargin = safeDiv(deliveryProfit, agi);
  const requiredRaw = feeForMargin(deliveryCost, target);
  const targetDeliveryCost = agi * complement(target);
  const costReductionNeeded = Math.max(0, deliveryCost - targetDeliveryCost);
  const blendedCostPerHour = safeDiv(staffCost, totalHours);
  const hoursEquivalent = blendedCostPerHour && blendedCostPerHour > 0 ? costReductionNeeded / blendedCostPerHour : null;
  const exceeds = hoursEquivalent !== null && hoursEquivalent > totalHours + 1e-9;

  const requiredAgi = requiredRaw === null ? null : moneyOrNull(ceilCents(requiredRaw));
  const retainedAgi = requiredAgi === null ? null : Math.max(requiredAgi, roundCents(agi));
  const zeroCostLabor = (i.role1Hours > 0 && rate1 === 0) || (i.role2Hours > 0 && rate2 === 0);

  return {
    ok: true,
    result: {
      agi: roundCents(agi),
      staffCost: roundCents(staffCost),
      deliveryCost: roundCents(deliveryCost),
      deliveryProfit: roundCents(deliveryProfit),
      deliveryMargin,
      totalHours,
      effectiveHourlyRate: (() => {
        const r = moneyOrNull(safeDiv(agi, totalHours));
        return r === null ? null : roundCents(r);
      })(),
      blendedCostPerHour: blendedCostPerHour === null ? null : roundCents(blendedCostPerHour),
      requiredAgi,
      retainedAgi,
      feeIncreaseNeeded: requiredAgi === null || retainedAgi === null ? null : Math.max(0, roundCents(retainedAgi - roundCents(agi))),
      retainedInvoice: retainedAgi === null ? null : roundCents(retainedAgi + i.passThrough),
      targetDeliveryCost: roundCents(targetDeliveryCost),
      costReductionNeeded: roundCents(costReductionNeeded),
      hoursReductionEquivalent: hoursEquivalent === null || exceeds ? null : Math.round(hoursEquivalent * 10) / 10,
      hoursReductionExceedsAvailable: exceeds,
      zeroCostLabor,
      targetMargin: target,
      meetsTarget: deliveryMargin === null ? null : deliveryMargin >= target - RATIO_TOLERANCE,
    },
  };
}
