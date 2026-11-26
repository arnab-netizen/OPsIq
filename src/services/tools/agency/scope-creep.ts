import { feeForMargin, roundCents, safeDiv, type CalcResult } from "./shared";

/**
 * Scope Creep and Overservicing Calculator (pure).
 *
 *   Original delivery cost   = planned hours x cost per hour + planned direct expenses
 *   Revised revenue          = agreed fee + approved change-order revenue
 *   Revised delivery cost    = (planned + unpriced extra hours) x cost per hour + planned + additional direct expenses
 *   Delivery margin          = (revenue - delivery cost) / revenue      (NOT net operating profit)
 *
 * Three different things are reported separately and are never added together:
 *   1. Additional delivery cost: cash cost of the extra hours and expenses actually incurred.
 *   2. Lost delivery profit: original delivery profit minus revised delivery profit.
 *   3. Hypothetical fee to preserve the original margin: what would have had to be charged. This is an unrealised
 *      "what if", not money that existed.
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
  /** Additional delivery cost not recovered by the approved change order (can be negative if the change order exceeds it). */
  unrecoveredCost: number;
  /** Original margin minus revised margin, in percentage points; null when either margin is undefined. */
  marginErosionPoints: number | null;
  /** Original delivery profit minus revised delivery profit. */
  lostDeliveryProfit: number;
  /** Extra fee that would restore the original margin on the revised cost (>= 0); null when the original margin is not usable. */
  feeToPreserveMargin: number | null;
  /** Price for the extra work alone at the chosen change-order margin. */
  changeOrderPrice: number | null;
};

export function calculateScopeCreep(i: ScopeCreepInput): CalcResult<{ result: ScopeCreepResult }> {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(i)) if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be a finite number that is 0 or more.`);
  if (i.changeOrderMarginPct >= 100) errors.push("Change-order margin must be below 100%.");
  if (!(i.agreedFee > 0)) errors.push("Agreed agency fee must be more than 0.");
  if (errors.length) return { ok: false, errors };

  const originalCost = i.plannedHours * i.costPerHour + i.plannedExpenses;
  const originalProfit = i.agreedFee - originalCost;
  const originalMargin = safeDiv(originalProfit, i.agreedFee);

  const revisedRevenue = i.agreedFee + i.changeOrderRevenue;
  const additionalCost = i.extraHours * i.costPerHour + i.extraExpenses;
  const revisedCost = originalCost + additionalCost;
  const revisedProfit = revisedRevenue - revisedCost;
  const revisedMargin = safeDiv(revisedProfit, revisedRevenue);

  const m0 = originalMargin;
  const required = m0 !== null && m0 < 1 ? feeForMargin(revisedCost, m0) : null;
  const feeToPreserve = required === null || m0 === null || m0 < 0 ? null : Math.max(0, required - revisedRevenue);

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
      marginErosionPoints: originalMargin === null || revisedMargin === null ? null : Math.round((originalMargin - revisedMargin) * 1000) / 10,
      lostDeliveryProfit: roundCents(originalProfit - revisedProfit),
      feeToPreserveMargin: feeToPreserve === null ? null : roundCents(feeToPreserve),
      changeOrderPrice: co === null ? null : roundCents(co),
    },
  };
}
