/**
 * Module 10 — Capacity & Bottleneck outputs (pure domain core).
 *
 * The repo already has capacity-status gating and a bottleneck engine; the audit
 * found the derived OUTPUTS missing: revenue ceiling at current capacity, growth
 * capacity available, available buffer, and the expansion trigger. This computes
 * them from per-resource utilization and the binding bottleneck. Pure + deterministic.
 *
 * Hard rules encoded: no growth at/above the safe utilization cap; no normal plan
 * at 100% utilization (that is the bottleneck, not headroom).
 */

export interface CapacityResource {
  type: string;
  /** Current utilization as a fraction (0..1+, can exceed 1 when over capacity). */
  utilization: number;
}

export interface CapacityInput {
  resources: CapacityResource[];
  /** Revenue currently produced at the current utilization. */
  currentRevenue: number;
  /** Highest utilization considered safe for steady-state planning (default 0.85). */
  safeUtilization?: number;
  /** Utilization at/above which capacity expansion should be triggered (default 0.85). */
  expansionThreshold?: number;
}

export interface CapacityAssessment {
  bottleneckResource: string | null;
  bottleneckUtilization: number;
  /** Theoretical revenue at 100% of the bottleneck (null when utilization is 0). */
  revenueCeiling: number | null;
  /** Revenue achievable at the safe utilization cap (null when utilization is 0). */
  safeRevenueCeiling: number | null;
  /** Headroom revenue before hitting the safe cap (0 when already at/over it). */
  growthCapacityRevenue: number;
  /** Utilization headroom before the safe cap (0 when at/over). */
  availableBuffer: number;
  /** True when capacity expansion should be triggered. */
  expansionTriggered: boolean;
  /** True only when there is real room to grow within the safe cap. */
  growthSafe: boolean;
}

function clampNonNeg(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Identify the binding bottleneck (highest-utilization resource). */
export function findBottleneck(resources: CapacityResource[]): CapacityResource | null {
  if (!resources || resources.length === 0) return null;
  return resources.reduce((max, r) => (r.utilization > max.utilization ? r : max), resources[0]);
}

/** Assess capacity: bottleneck, ceilings, growth headroom, and expansion trigger. */
export function assessCapacity(input: CapacityInput): CapacityAssessment {
  const safe = input.safeUtilization ?? 0.85;
  const expansionThreshold = input.expansionThreshold ?? 0.85;
  const revenue = clampNonNeg(input.currentRevenue);
  const bottleneck = findBottleneck(input.resources);
  const util = bottleneck ? Math.max(bottleneck.utilization, 0) : 0;

  let revenueCeiling: number | null = null;
  let safeRevenueCeiling: number | null = null;
  if (util > 0) {
    revenueCeiling = revenue / util;
    safeRevenueCeiling = revenue * (safe / util);
  }

  const growthCapacityRevenue = safeRevenueCeiling != null ? Math.max(safeRevenueCeiling - revenue, 0) : 0;
  const availableBuffer = Math.max(safe - util, 0);
  const growthSafe = util > 0 ? util < safe : true;

  return {
    bottleneckResource: bottleneck ? bottleneck.type : null,
    bottleneckUtilization: util,
    revenueCeiling,
    safeRevenueCeiling,
    growthCapacityRevenue,
    availableBuffer,
    expansionTriggered: util >= expansionThreshold,
    growthSafe,
  };
}

/**
 * Can the business absorb `additionalRevenue` within the safe capacity cap?
 * Fail-closed: when utilization is unknown (0) we cannot prove headroom for a
 * specific revenue increase against a zero base, so treat a positive ask as unsafe.
 */
export function canAbsorbRevenueGrowth(input: CapacityInput, additionalRevenue: number): boolean {
  const add = clampNonNeg(additionalRevenue);
  if (add === 0) return true;
  const a = assessCapacity(input);
  if (a.bottleneckUtilization <= 0) return false;
  if (!a.growthSafe) return false;
  return add <= a.growthCapacityRevenue;
}
