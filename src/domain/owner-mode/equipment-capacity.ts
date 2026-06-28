/**
 * Jarvis 360 Slice 7 — equipment capacity rules (pure).
 *
 * Audit finding: capacity was advisory and never gated growth; there was no
 * equipment/maintenance model. These rules turn equipment state into a capacity
 * status and a growth gate: a down or maintenance-overdue machine, or saturated
 * utilization, blocks/cautions a growth recommendation. No DB/I-O.
 */

export type CapacityStatus = "safe" | "caution" | "high_risk" | "blocked";

const RANK: Record<CapacityStatus, number> = { safe: 0, caution: 1, high_risk: 2, blocked: 3 };

export const HIGH_UTILIZATION = 0.95;
export const CAUTION_UTILIZATION = 0.85;

export interface EquipmentRecord {
  utilization: number | null;
  downtimeState: string; // "up" | "down"
  maintenanceDueAt: Date | null;
  status: string; // "operational" | "out_of_service" | ...
}

export interface CapacityAssessment {
  status: CapacityStatus;
  reason: string;
  bottleneck: boolean;
}

/** Assess one equipment's capacity contribution at `now`. */
export function assessEquipmentCapacity(eq: EquipmentRecord, now: Date): CapacityAssessment {
  if (eq.downtimeState === "down" || eq.status === "out_of_service") {
    return { status: "blocked", reason: "Equipment is down / out of service.", bottleneck: true };
  }
  if (eq.maintenanceDueAt && eq.maintenanceDueAt.getTime() <= now.getTime()) {
    return { status: "blocked", reason: "Maintenance is overdue.", bottleneck: true };
  }
  if (eq.utilization == null) {
    return { status: "caution", reason: "Utilization is unknown.", bottleneck: false };
  }
  if (eq.utilization >= HIGH_UTILIZATION) {
    return { status: "high_risk", reason: `Utilization ${Math.round(eq.utilization * 100)}% is at the ceiling.`, bottleneck: true };
  }
  if (eq.utilization >= CAUTION_UTILIZATION) {
    return { status: "caution", reason: `Utilization ${Math.round(eq.utilization * 100)}% is high.`, bottleneck: false };
  }
  return { status: "safe", reason: "Spare capacity available.", bottleneck: false };
}

export function worseCapacity(a: CapacityStatus, b: CapacityStatus): CapacityStatus {
  return RANK[a] >= RANK[b] ? a : b;
}

export interface FleetCapacityResult {
  status: CapacityStatus;
  reason: string;
  bottlenecks: string[];
}

/**
 * Worst-case capacity across the equipment fleet. With no equipment records the
 * result is `safe` (a non-equipment business is not gated by this rule).
 */
export function assessFleetCapacity(equipment: Array<EquipmentRecord & { name: string }>, now: Date): FleetCapacityResult {
  if (equipment.length === 0) return { status: "safe", reason: "No equipment tracked.", bottlenecks: [] };
  let status: CapacityStatus = "safe";
  let reason = "Spare capacity available.";
  const bottlenecks: string[] = [];
  for (const eq of equipment) {
    const a = assessEquipmentCapacity(eq, now);
    if (a.bottleneck) bottlenecks.push(eq.name);
    if (RANK[a.status] > RANK[status]) {
      status = a.status;
      reason = `${eq.name}: ${a.reason}`;
    }
  }
  return { status, reason, bottlenecks };
}

/** Growth is unsafe when fleet capacity is high_risk or blocked. */
export function capacityBlocksGrowth(status: CapacityStatus): boolean {
  return RANK[status] >= RANK.high_risk;
}
