import { MIN_POSITIVE, roundCents, safeDiv, tooLarge, type CalcResult } from "./shared";

/**
 * Agency Billable Utilization Calculator (pure). Every ratio states its denominator.
 *
 *   Paid capacity       = team members x paid hours per person per month
 *   Available capacity  = team members x (paid hours - leave and holiday hours) per person per month
 *   Paid utilization    = delivery hours / paid capacity
 *   Available utilization = delivery hours / available capacity
 *   Target delivery hours = target utilization x available capacity
 *
 * "Delivery hours" means hours spent doing revenue-generating client work. It is NOT invoiced hours: invoiced-hour
 * realization (invoiced / delivered) is a different measure and is not mixed in here. Utilization above 100% is
 * reported as-is (over capacity), never clamped. 100% is not offered as a target.
 */

export type UtilizationInput = {
  teamMembers: number;
  paidHoursPerPerson: number;
  leaveHoursPerPerson: number;
  deliveryHours: number;
  /** Target as a percentage of AVAILABLE capacity, 1 to 99.9. */
  targetPct: number;
  /** Optional earned hourly rate for the conditional revenue scenario; 0 = not entered. */
  earnedRate: number;
};

export type UtilizationResult = {
  paidCapacity: number;
  availableCapacity: number;
  paidUtilization: number | null;
  availableUtilization: number | null;
  targetDeliveryHours: number;
  /** Delivery hours minus target hours: positive means above target, negative below. */
  hoursVsTarget: number;
  overAvailableCapacity: boolean;
  /** Hours below target (>= 0). */
  hoursBelowTarget: number;
  /** Conditional only: hours below target x earned rate. Assumes demand exists; not a forecast. */
  conditionalRevenueCapacity: number | null;
};

export function calculateUtilization(i: UtilizationInput): CalcResult<{ result: UtilizationResult }> {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(i)) if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be a finite number that is 0 or more.`);
  if (!(i.teamMembers >= MIN_POSITIVE)) errors.push(`Team size must be at least ${MIN_POSITIVE}.`);
  if (!(i.paidHoursPerPerson >= MIN_POSITIVE)) errors.push(`Paid hours per person must be at least ${MIN_POSITIVE}.`);
  if (i.leaveHoursPerPerson >= i.paidHoursPerPerson) errors.push("Leave and holiday hours must be less than paid hours, otherwise no capacity is available.");
  if (!(i.targetPct > 0 && i.targetPct < 100)) errors.push("Target utilization must be above 0% and below 100%.");
  if (errors.length) return { ok: false, errors };

  if (tooLarge(i.teamMembers * i.paidHoursPerPerson, i.deliveryHours * Math.max(1, i.earnedRate))) return { ok: false, errors: ["These figures are too large to calculate exactly. Reduce them."] };
  const paidCapacity = i.teamMembers * i.paidHoursPerPerson;
  const availableCapacity = i.teamMembers * (i.paidHoursPerPerson - i.leaveHoursPerPerson);
  const targetHours = (i.targetPct / 100) * availableCapacity;
  const vs = i.deliveryHours - targetHours;
  const below = Math.max(0, -vs);
  return {
    ok: true,
    result: {
      paidCapacity: Math.round(paidCapacity * 10) / 10,
      availableCapacity: Math.round(availableCapacity * 10) / 10,
      paidUtilization: safeDiv(i.deliveryHours, paidCapacity),
      availableUtilization: safeDiv(i.deliveryHours, availableCapacity),
      targetDeliveryHours: Math.round(targetHours * 10) / 10,
      hoursVsTarget: Math.round(vs * 10) / 10,
      overAvailableCapacity: i.deliveryHours > availableCapacity,
      hoursBelowTarget: Math.round(below * 10) / 10,
      conditionalRevenueCapacity: i.earnedRate > 0 && below > 0 ? roundCents(below * i.earnedRate) : null,
    },
  };
}
