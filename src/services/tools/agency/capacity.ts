import { MIN_POSITIVE, safeDiv, tooLarge, type CalcResult } from "./shared";

/**
 * Agency Capacity Planning Calculator (pure). One pooled-capacity view: it does NOT treat different skills as
 * interchangeable, so use it per team or discipline (for example design and paid media separately) when skills differ.
 *
 *   Target delivery capacity = staff x available monthly hours per person x target utilization
 *   Remaining capacity       = target capacity - committed client workload       (negative = shortfall)
 *   Additional whole clients = floor(max(0, remaining) / workload per new client)
 *   FTE short                = hours above target capacity / (available monthly hours x target utilization)
 *
 * "Available monthly hours" must already exclude leave and holidays. The result describes HOURS, not whether to hire: a
 * shortfall in hours is not evidence of paying demand or of the cash to fund a hire, and spare hours are not a promise that
 * clients can be won.
 *
 * Workload per new client is `null` when left blank. A planned-client assessment (and the clients-that-fit figure) is only
 * produced when that workload is positive; a blank or zero workload withholds it instead of letting "0 hours" make any number
 * of clients appear to fit.
 */

export type CapacityInput = {
  staff: number;
  availableHoursPerPerson: number;
  /** Target delivery utilization as a percentage of available hours, 1 to 99.9. */
  targetPct: number;
  committedHours: number;
  /** null = left blank. */
  hoursPerNewClient: number | null;
  /** Optional: number of new clients you are considering. 0 = none. */
  plannedNewClients: number;
};

export type PlannedAssessment = "not_requested" | "withheld_workload_missing_or_zero" | "assessed";

export type CapacityResult = {
  targetCapacity: number;
  committedHours: number;
  remaining: number;
  shortfall: boolean;
  /** null unless a positive workload per client was entered. */
  additionalClientsSupportable: number | null;
  /** Hours of capacity per FTE at the target utilization. */
  hoursPerFte: number;
  /** FTEs short for current commitments alone (>= 0). */
  fteShortCurrent: number;
  plannedAssessment: PlannedAssessment;
  /** Hours above (positive) or below (negative) target capacity if the planned clients were added; null unless assessed. */
  plannedHoursOverTarget: number | null;
  /** FTEs short with the planned clients (>= 0); null unless assessed. */
  fteShortWithPlanned: number | null;
};

const r1 = (n: number): number => Math.round(n * 10) / 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;

export function calculateCapacity(i: CapacityInput): CalcResult<{ result: CapacityResult }> {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(i)) if (v !== null && (!Number.isFinite(v) || v < 0)) errors.push(`${k} must be a finite number that is 0 or more.`);
  if (!(i.staff >= MIN_POSITIVE)) errors.push(`Delivery staff must be at least ${MIN_POSITIVE}.`);
  if (!(i.availableHoursPerPerson >= MIN_POSITIVE)) errors.push(`Available monthly hours per person must be at least ${MIN_POSITIVE}.`);
  if (!(i.targetPct > 0 && i.targetPct < 100)) errors.push("Target utilization must be above 0% and below 100%.");
  if (!Number.isInteger(i.plannedNewClients)) errors.push("Planned new clients must be a whole number.");
  // A workload that is positive but below the shared minimum divisor would turn spare hours into an absurd client count.
  if (i.hoursPerNewClient !== null && i.hoursPerNewClient > 0 && i.hoursPerNewClient < MIN_POSITIVE) errors.push(`Workload per additional client must be 0 (to withhold) or at least ${MIN_POSITIVE} hours.`);
  if (errors.length) return { ok: false, errors };
  if (tooLarge(i.staff * i.availableHoursPerPerson, i.committedHours)) return { ok: false, errors: ["These figures are too large to calculate exactly. Reduce them."] };

  const hoursPerFte = i.availableHoursPerPerson * (i.targetPct / 100);
  const target = i.staff * hoursPerFte;
  const remaining = target - i.committedHours;
  const workloadOk = i.hoursPerNewClient !== null && i.hoursPerNewClient > 0;
  const clientsRaw = workloadOk ? safeDiv(Math.max(0, remaining), i.hoursPerNewClient as number) : null;
  const shortCurrent = Math.max(0, -remaining) / hoursPerFte;

  const planned: PlannedAssessment = i.plannedNewClients <= 0 ? "not_requested" : workloadOk ? "assessed" : "withheld_workload_missing_or_zero";
  const over = planned === "assessed" ? i.committedHours + i.plannedNewClients * (i.hoursPerNewClient as number) - target : null;

  return {
    ok: true,
    result: {
      targetCapacity: r1(target),
      committedHours: r1(i.committedHours),
      remaining: r1(remaining),
      shortfall: remaining < 0,
      additionalClientsSupportable: clientsRaw === null ? null : Math.floor(clientsRaw + 1e-9),
      hoursPerFte: r1(hoursPerFte),
      fteShortCurrent: r2(shortCurrent),
      plannedAssessment: planned,
      plannedHoursOverTarget: over === null ? null : r1(over),
      fteShortWithPlanned: over === null ? null : r2(Math.max(0, over) / hoursPerFte),
    },
  };
}
