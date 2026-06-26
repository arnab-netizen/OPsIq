/**
 * Module 8 — Employee Workload Model (pure domain core).
 *
 * Computes real utilization — counting task, travel, rework, and overtime time
 * against available (shift minus break) hours — and classifies it into bands so no
 * recommendation can push employees into overburden. The existing owner-operations
 * metrics give aggregate idle/utilization; this adds the per-employee band model
 * the audit found missing. Pure + deterministic.
 */

export enum WorkloadBand {
  UNDERUTILIZED = "UNDERUTILIZED",
  HEALTHY_UTILIZATION = "HEALTHY_UTILIZATION",
  HIGH_UTILIZATION = "HIGH_UTILIZATION",
  OVERBURDEN_RISK = "OVERBURDEN_RISK",
  UNSUSTAINABLE = "UNSUSTAINABLE",
}

export interface EmployeeWorkloadInput {
  /** Scheduled/available hours for the period. */
  shiftHours: number;
  breakHours?: number;
  taskHours?: number;
  travelHours?: number;
  reworkHours?: number;
  overtimeHours?: number;
}

function n(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Committed work time = task + travel + rework + overtime (all count toward load). */
export function committedHours(i: EmployeeWorkloadInput): number {
  return n(i.taskHours) + n(i.travelHours) + n(i.reworkHours) + n(i.overtimeHours);
}

/** Available work time = shift minus breaks. */
export function availableHours(i: EmployeeWorkloadInput): number {
  return Math.max(n(i.shiftHours) - n(i.breakHours), 0);
}

/** Utilization as a fraction (can exceed 1.0 with overtime). 0 when no availability. */
export function computeUtilization(i: EmployeeWorkloadInput): number {
  const avail = availableHours(i);
  if (avail <= 0) return 0;
  return committedHours(i) / avail;
}

/**
 * Classify utilization into a band. Thresholds:
 *   <0.50 underutilized · 0.50–<0.75 healthy · 0.75–<0.90 high ·
 *   0.90–<0.95 overburden risk · >=0.95 unsustainable.
 */
export function classifyUtilizationBand(utilization: number): WorkloadBand {
  if (utilization < 0.5) return WorkloadBand.UNDERUTILIZED;
  if (utilization < 0.75) return WorkloadBand.HEALTHY_UTILIZATION;
  if (utilization < 0.9) return WorkloadBand.HIGH_UTILIZATION;
  if (utilization < 0.95) return WorkloadBand.OVERBURDEN_RISK;
  return WorkloadBand.UNSUSTAINABLE;
}

export interface EmployeeWorkloadAssessment {
  utilization: number;
  utilizationPct: number;
  band: WorkloadBand;
  /** True for OVERBURDEN_RISK or UNSUSTAINABLE — recommendations must not add load. */
  overburdened: boolean;
  fatigueRisk: boolean;
}

/** Assess an employee's workload band, overburden, and fatigue risk. */
export function assessEmployeeWorkload(i: EmployeeWorkloadInput): EmployeeWorkloadAssessment {
  const utilization = computeUtilization(i);
  const band = classifyUtilizationBand(utilization);
  const avail = availableHours(i);
  const overtimeRatio = avail > 0 ? n(i.overtimeHours) / avail : 0;
  return {
    utilization,
    utilizationPct: Math.round(utilization * 100),
    band,
    overburdened: band === WorkloadBand.OVERBURDEN_RISK || band === WorkloadBand.UNSUSTAINABLE,
    fatigueRisk: utilization >= 0.95 || overtimeRatio >= 0.2,
  };
}

/** Would adding `extraHours` push the employee into overburden? (capacity guardrail) */
export function wouldOverburden(i: EmployeeWorkloadInput, extraHours: number): boolean {
  const avail = availableHours(i);
  if (avail <= 0) return true;
  const projected = (committedHours(i) + Math.max(extraHours, 0)) / avail;
  const band = classifyUtilizationBand(projected);
  return band === WorkloadBand.OVERBURDEN_RISK || band === WorkloadBand.UNSUSTAINABLE;
}
