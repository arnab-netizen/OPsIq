import { MIN_POSITIVE, ceilCents, feeForMargin, moneyOrNull, roundCents, safeDiv, tooLarge, type CalcResult } from "./shared";

/**
 * Scope Creep and Overservicing Calculator (pure).
 *
 *   Original delivery cost   = planned hours x cost per hour + planned direct expenses
 *   Revised revenue          = agreed fee + approved change-order revenue
 *   Revised delivery cost    = (planned + unpriced extra hours) x cost per hour + planned + additional direct expenses
 *   Delivery margin          = (revenue - delivery cost) / revenue      (NOT net operating profit)
 *
 * Three different things are reported separately and are never added together:
 *   1. Additional delivery cost: the allocated cost of the extra hours and expenses (see the cash caveat below).
 *   2. Lost delivery profit: original delivery profit minus revised delivery profit. It equals the cost not recovered by
 *      change orders, so it is the SAME money as the absorbed cost, not a second loss.
 *   3. Hypothetical fee to preserve the original margin %: what would have had to be charged. An unrealised "what if".
 *
 * Cash caveat: the loaded cost per hour is an ALLOCATED cost. For salaried staff the extra hours may add no new cash outflow;
 * the result is then an opportunity cost (capacity used without being paid for), not extra cash spent. Extra expenses are cash.
 *
 * Margin erosion is returned unrounded; rounding is for display. Required prices round UP to the cent.
 */

export type ScopeCreepInput = {
  agreedFee: number;
  plannedHours: number;
  extraHours: number;
  costPerHour: number;
  plannedExpenses: number;
  extraExpenses: number;
  changeOrderRevenue: number;
  /** Margin to price a change order at, as a percentage 0-99.9. */
  changeOrderMarginPct: number;
};

export type ScopeCreepResult = {
  originalDeliveryCost: number;
  originalProfit: number;
  originalMargin: number | null;
  revisedRevenue: number;
  revisedDeliveryCost: number;
  revisedProfit: number;
  revisedMargin: number | null;
  /** Extra hours x rate + extra expenses. */
  additionalDeliveryCost: number;
  /** Additional delivery cost not recovered by the approved change order (negative if the change order exceeds it). */
  unrecoveredCost: number;
  /** Original margin minus revised margin, in percentage points, UNROUNDED; null when either margin is undefined. */
  marginErosionPoints: number | null;
  /** Original delivery profit minus revised delivery profit. Equals unrecoveredCost. */
  lostDeliveryProfit: number;
  /** Extra fee that would restore the original margin percentage on the revised cost (>= 0), rounded up; null when the original margin is not usable. */
  feeToPreserveMargin: number | null;
  /** Price for the extra work alone at the chosen change-order margin, rounded up. */
  changeOrderPrice: number | null;
  /** True when extra hours were entered at an explicit 0 cost per hour (no cost recognised for them). */
  zeroRateExtraHours: boolean;
};

export function calculateScopeCreep(i: ScopeCreepInput): CalcResult<{ result: ScopeCreepResult }> {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(i)) if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be a finite number that is 0 or more.`);
  if (i.changeOrderMarginPct >= 100) errors.push("Change-order margin must be below 100%.");
  if (!(i.agreedFee >= MIN_POSITIVE)) errors.push(`Agreed agency fee must be at least ${MIN_POSITIVE}.`);
  if (errors.length) return { ok: false, errors };

  const originalCost = i.plannedHours * i.costPerHour + i.plannedExpenses;
  const additionalCost = i.extraHours * i.costPerHour + i.extraExpenses;
  const revisedRevenue = i.agreedFee + i.changeOrderRevenue;
  const revisedCost = originalCost + additionalCost;
  if (tooLarge(originalCost, additionalCost, revisedRevenue, revisedCost)) return { ok: false, errors: ["These amounts are too large to calculate exactly to the cent. Reduce them."] };

  const originalProfit = i.agreedFee - originalCost;
  const originalMargin = safeDiv(originalProfit, i.agreedFee);
  const revisedProfit = revisedRevenue - revisedCost;
  const revisedMargin = safeDiv(revisedProfit, revisedRevenue);

  const m0 = originalMargin;
  const required = m0 !== null && m0 < 1 ? feeForMargin(revisedCost, m0) : null;
  const feeToPreserve = required === null || m0 === null || m0 < 0 ? null : roundCents(Math.max(0, ceilCents(required) - roundCents(revisedRevenue)));
  const co = feeForMargin(additionalCost, i.changeOrderMarginPct / 100);

  return {
    ok: true,
    result: {
      originalDeliveryCost: roundCents(originalCost),
      originalProfit: roundCents(originalProfit),
      originalMargin,
      revisedRevenue: roundCents(revisedRevenue),
      revisedDeliveryCost: roundCents(revisedCost),
      revisedProfit: roundCents(revisedProfit),
      revisedMargin,
      additionalDeliveryCost: roundCents(additionalCost),
      unrecoveredCost: roundCents(additionalCost - i.changeOrderRevenue),
      marginErosionPoints: originalMargin === null || revisedMargin === null ? null : (originalMargin - revisedMargin) * 100,
      lostDeliveryProfit: roundCents(originalProfit - revisedProfit),
      feeToPreserveMargin: feeToPreserve === null ? null : moneyOrNull(feeToPreserve),
      changeOrderPrice: co === null ? null : moneyOrNull(ceilCents(co)),
      zeroRateExtraHours: i.extraHours > 0 && i.costPerHour === 0,
    },
  };
}
