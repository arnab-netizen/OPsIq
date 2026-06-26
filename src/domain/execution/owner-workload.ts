/**
 * Module 9 — Owner Workload Protection (pure domain core).
 *
 * Prevents OpsIQ from manufacturing fake profit by making the owner absorb all the
 * work. Owner labour is counted as real cost AND capacity: an action that pushes
 * the owner past a sustainable load, or deepens owner-only dependency, is flagged,
 * and OpsIQ prefers delegation / SOP transfer / automation over owner firefighting.
 *
 * Audit found only a bottleneck-detector; this adds the owner load/dependency model
 * and delegation-path preference. Pure + deterministic.
 */

export enum OwnerLoadBand {
  UNDERUSED = "UNDERUSED",
  SUSTAINABLE = "SUSTAINABLE",
  HIGH = "HIGH",
  BOTTLENECK_RISK = "BOTTLENECK_RISK",
  UNSUSTAINABLE = "UNSUSTAINABLE",
}

/** Preferred ways to relieve owner load, in order of preference over firefighting. */
export enum OwnerReliefPath {
  DELEGATE = "DELEGATE",
  SOP_TRANSFER = "SOP_TRANSFER",
  AUTOMATE = "AUTOMATE",
  HIRE = "HIRE",
  NONE = "NONE",
}

export interface OwnerWorkloadInput {
  /** Minutes/day the owner currently spends on operations. */
  ownerMinutesPerDay: number;
  /** Sustainable owner capacity (minutes/day). */
  sustainableMinutesPerDay: number;
  ownerTasks?: number;
  /** Tasks only the owner can currently do (dependency). */
  ownerOnlyCriticalTasks?: number;
  /** Relief options available. */
  hasDelegatableTasks?: boolean;
  processStandardizable?: boolean;
  automatable?: boolean;
}

function n(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Owner daily load as a fraction of sustainable capacity (0 when no capacity defined). */
export function computeOwnerDailyLoad(i: OwnerWorkloadInput): number {
  const cap = n(i.sustainableMinutesPerDay);
  if (cap <= 0) return 0;
  return n(i.ownerMinutesPerDay) / cap;
}

export function classifyOwnerLoad(load: number): OwnerLoadBand {
  if (load < 0.5) return OwnerLoadBand.UNDERUSED;
  if (load < 0.8) return OwnerLoadBand.SUSTAINABLE;
  if (load < 0.95) return OwnerLoadBand.HIGH;
  if (load < 1.0) return OwnerLoadBand.BOTTLENECK_RISK;
  return OwnerLoadBand.UNSUSTAINABLE;
}

/** Owner is a bottleneck when overloaded OR too many tasks depend only on the owner. */
export function ownerBottleneckRisk(i: OwnerWorkloadInput): boolean {
  const band = classifyOwnerLoad(computeOwnerDailyLoad(i));
  const overloaded = band === OwnerLoadBand.BOTTLENECK_RISK || band === OwnerLoadBand.UNSUSTAINABLE;
  const tasks = n(i.ownerTasks);
  const ownerOnly = n(i.ownerOnlyCriticalTasks);
  const dependencyHeavy = tasks > 0 ? ownerOnly / tasks >= 0.5 : ownerOnly > 0;
  return overloaded || dependencyHeavy;
}

/** The preferred relief path; delegation/SOP/automation are preferred over hiring/firefighting. */
export function recommendReliefPath(i: OwnerWorkloadInput): OwnerReliefPath {
  if (!ownerBottleneckRisk(i)) return OwnerReliefPath.NONE;
  if (i.hasDelegatableTasks) return OwnerReliefPath.DELEGATE;
  if (i.processStandardizable) return OwnerReliefPath.SOP_TRANSFER;
  if (i.automatable) return OwnerReliefPath.AUTOMATE;
  return OwnerReliefPath.HIRE;
}

export interface OwnerWorkloadAssessment {
  dailyLoad: number;
  dailyLoadPct: number;
  band: OwnerLoadBand;
  bottleneckRisk: boolean;
  /** True when the owner is over a sustainable load. */
  overloaded: boolean;
  recommendedPath: OwnerReliefPath;
}

export function assessOwnerWorkload(i: OwnerWorkloadInput): OwnerWorkloadAssessment {
  const dailyLoad = computeOwnerDailyLoad(i);
  const band = classifyOwnerLoad(dailyLoad);
  return {
    dailyLoad,
    dailyLoadPct: Math.round(dailyLoad * 100),
    band,
    bottleneckRisk: ownerBottleneckRisk(i),
    overloaded: band === OwnerLoadBand.BOTTLENECK_RISK || band === OwnerLoadBand.UNSUSTAINABLE,
    recommendedPath: recommendReliefPath(i),
  };
}

/**
 * Would adding owner minutes (and optionally a new owner-only critical task) create
 * unsustainable owner dependency? Recommendations that do must be blocked/redesigned.
 */
export function wouldDeepenOwnerDependency(
  i: OwnerWorkloadInput,
  addedOwnerMinutes: number,
  addsOwnerOnlyCritical = false
): boolean {
  const projected: OwnerWorkloadInput = {
    ...i,
    ownerMinutesPerDay: n(i.ownerMinutesPerDay) + Math.max(addedOwnerMinutes, 0),
    ownerTasks: n(i.ownerTasks) + (addsOwnerOnlyCritical ? 1 : 0),
    ownerOnlyCriticalTasks: n(i.ownerOnlyCriticalTasks) + (addsOwnerOnlyCritical ? 1 : 0),
  };
  return ownerBottleneckRisk(projected);
}
