import { feeForMargin, roundCents, safeDiv, type CalcResult } from "./shared";

/**
 * Agency Hourly Rate Calculator (pure). Result is an EARNED AVERAGE rate: agency gross income per billable delivery
 * hour. It is not a rate-card (advertised) rate; discounts, fixed-fee projects and unbilled time pull earned below card.
 *
 *   Annual cost pool          = delivery payroll and employer costs + agency overhead   (each counted once)
 *   Annual billable capacity  = available delivery capacity (already net of leave) x target utilization  (applied once)
 *   Break-even earned rate    = cost pool / billable capacity
 *   Required annual income    = cost pool / (1 - target operating margin)
 *   Required earned rate      = required annual income / billable capacity
 *   Target operating profit   = required annual income - cost pool
 *
 * Operating margin here is a share of agency gross income. Pass-through costs belong outside this tool.
 */

export type HourlyRateInput = {
  annualPayroll: number;
  annualOverhead: number;
  /** Annual delivery hours available AFTER leave and holidays. */
  annualCapacityHours: number;
  /** Percentage of available capacity expected to be billable delivery work, 1 to 99.9. */
  targetUtilizationPct: number;
  /** Percentage of agency gross income to keep as operating profit, 0 to 99.9. */
  targetOperatingMarginPct: number;
};

export type RateSensitivity = { label: string; utilizationPct: number; costChangePct: number; requiredRate: number | null };

export type HourlyRateResult = {
  costPool: number;
  billableCapacity: number;
  breakEvenRate: number | null;
  requiredIncome: number;
  requiredRate: number | null;
  targetProfit: number;
  sensitivity: RateSensitivity[];
};

function requiredRateFor(i: HourlyRateInput, utilPct: number, costFactor: number): number | null {
  if (!(utilPct > 0 && utilPct < 100)) return null;
  const pool = (i.annualPayroll + i.annualOverhead) * costFactor;
  const income = feeForMargin(pool, i.targetOperatingMarginPct / 100);
  if (income === null) return null;
  const rate = safeDiv(income, i.annualCapacityHours * (utilPct / 100));
  return rate === null ? null : roundCents(rate);
}

export function calculateHourlyRate(i: HourlyRateInput): CalcResult<{ result: HourlyRateResult }> {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(i)) if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be a finite number that is 0 or more.`);
  if (!(i.annualCapacityHours > 0)) errors.push("Annual available delivery capacity must be more than 0 hours.");
  if (!(i.targetUtilizationPct > 0 && i.targetUtilizationPct < 100)) errors.push("Target utilization must be above 0% and below 100%.");
  if (i.targetOperatingMarginPct >= 100) errors.push("Target operating margin must be below 100%.");
  if (!(i.annualPayroll + i.annualOverhead > 0)) errors.push("Enter payroll or overhead so there is a cost to recover.");
  if (errors.length) return { ok: false, errors };

  const pool = i.annualPayroll + i.annualOverhead;
  const billable = i.annualCapacityHours * (i.targetUtilizationPct / 100);
  const income = feeForMargin(pool, i.targetOperatingMarginPct / 100) as number;
  const be = safeDiv(pool, billable);
  const req = safeDiv(income, billable);
  const u = i.targetUtilizationPct;

  const sensitivity: RateSensitivity[] = [
    { label: "Your inputs", utilizationPct: u, costChangePct: 0, requiredRate: requiredRateFor(i, u, 1) },
    { label: "Utilization 10 points lower", utilizationPct: u - 10, costChangePct: 0, requiredRate: requiredRateFor(i, u - 10, 1) },
    { label: "Utilization 10 points higher", utilizationPct: u + 10, costChangePct: 0, requiredRate: requiredRateFor(i, u + 10, 1) },
    { label: "Costs 10% higher", utilizationPct: u, costChangePct: 10, requiredRate: requiredRateFor(i, u, 1.1) },
    { label: "Costs 10% lower", utilizationPct: u, costChangePct: -10, requiredRate: requiredRateFor(i, u, 0.9) },
  ];

  return {
    ok: true,
    result: {
      costPool: roundCents(pool),
      billableCapacity: Math.round(billable * 10) / 10,
      breakEvenRate: be === null ? null : roundCents(be),
      requiredIncome: roundCents(income),
      requiredRate: req === null ? null : roundCents(req),
      targetProfit: roundCents(income - pool),
      sensitivity,
    },
  };
}
