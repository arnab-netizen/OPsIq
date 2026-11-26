import { safeDiv, type CalcResult } from "./shared";

/**
 * Agency Capacity Planning Calculator (pure). One pooled-capacity view: it does NOT treat different skills as
 * interchangeable, so use it per team or discipline (for example design and paid media separately) when skills differ.
 *
 *   Target delivery capacity = staff x available monthly hours per person x target utilization
 *   Remaining capacity       = target capacity - committed client workload       (negative = shortfall)
 *   Additional whole clients = floor(max(0, remaining) / workload per new client)
 *   FTE needed               = hours short of target capacity / (available monthly hours x target utilization)
 *
 * "Available monthly hours" must already exclude leave and holidays. This tool does not say whether to hire: a shortfall
 * in hours is not evidence of paying demand or of the cash to fund a hire.
 */

export type CapacityInput = {
  staff: number;
  availableHoursPerPerson: number;
  /** Target delivery utilization as a percentage of available hours, 1 to 99.9. */
  targetPct: number;
  committedHours: number;
  hoursPerNewClient: number;
  /** Optional: number of new clients you are considering. 0 = none. */
  plannedNewClients: number;
};

export type CapacityResult = {
  targetCapacity: number;
  committedHours: number;
  remaining: number;
  shortfall: boolean;
  /** null when hours per new client is 0 (undefined). */
  additionalClientsSupportable: number | null;
  /** Hours of capacity per FTE at the target utilization. */
  hoursPerFte: number;
  /** FTEs short for current commitments alone (>= 0). */
  fteShortCurrent: number;
  /** FTEs short for current commitments plus the planned new clients (>= 0); null when no clients planned. */
  fteShortWithPlanned: number | null;
};

const r1 = (n: number): number => Math.round(n * 10) / 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;

export function calculateCapacity(i: CapacityInput): CalcResult<{ result: CapacityResult }> {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(i)) if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be a finite number that is 0 or more.`);
  if (!(i.staff > 0)) errors.push("Delivery staff must be more than 0.");
  if (!(i.availableHoursPerPerson > 0)) errors.push("Available monthly hours per person must be more than 0.");
  if (!(i.targetPct > 0 && i.targetPct < 100)) errors.push("Target utilization must be above 0% and below 100%.");
  if (!Number.isInteger(i.plannedNewClients)) errors.push("Planned new clients must be a whole number.");
  if (errors.length) return { ok: false, errors };

  const hoursPerFte = i.availableHoursPerPerson * (i.targetPct / 100);
  const target = i.staff * hoursPerFte;
  const remaining = target - i.committedHours;
  const clientsRaw = safeDiv(Math.max(0, remaining), i.hoursPerNewClient);
  const shortCurrent = Math.max(0, -remaining) / hoursPerFte;
  const withPlanned = Math.max(0, i.committedHours + i.plannedNewClients * i.hoursPerNewClient - target) / hoursPerFte;

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
      fteShortWithPlanned: i.plannedNewClients > 0 ? r2(withPlanned) : null,
    },
  };
}
