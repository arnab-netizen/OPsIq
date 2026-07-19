/**
 * Phase 4 — Resource Intelligence.
 *
 * Pure scoring layer over ResourcePool + ResourceAllocation data.
 * Computes utilization, detects over-allocation, and ranks objectives
 * by resource demand to surface bottlenecks.
 *
 * No DB, no I/O.
 */

export type ResourceType =
  | "BUDGET"
  | "TIME_HOURS"
  | "STAFF_CAPACITY"
  | "EQUIPMENT_CAPACITY"
  | "OWNER_ATTENTION";

export interface ResourcePoolSnapshot {
  poolId: string;
  resourceType: ResourceType;
  label: string;
  totalCapacity: number;
  unit: string;
  isActive: boolean;
  allocations: ResourceAllocationSnapshot[];
}

export interface ResourceAllocationSnapshot {
  allocationId: string;
  objectiveId: string;
  allocationAmount: number;
  priority: number;
  status: "ALLOCATED" | "RELEASED" | "CANCELLED";
}

export interface ResourceUtilization {
  poolId: string;
  resourceType: ResourceType;
  label: string;
  unit: string;
  totalCapacity: number;
  allocatedAmount: number;
  releasedAmount: number;
  availableAmount: number;
  utilizationPct: number; // 0..100
  overAllocated: boolean;
  objectiveCount: number;
  topObjectiveId: string | null;
}

export interface ResourceBottleneck {
  poolId: string;
  resourceType: ResourceType;
  label: string;
  utilizationPct: number;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  recommendation: string;
}

export interface ObjectiveResourceDemand {
  objectiveId: string;
  totalAllocated: number;
  poolCount: number;
  resourceTypes: ResourceType[];
  largestAllocation: { poolId: string; amount: number; unit: string } | null;
}

export interface ResourceIntelligenceView {
  utilization: ResourceUtilization[];
  bottlenecks: ResourceBottleneck[];
  objectiveDemands: ObjectiveResourceDemand[];
  totalPoolCount: number;
  overAllocatedCount: number;
  ownerAttentionRemaining: number | null; // remaining OWNER_ATTENTION capacity
}

/** Compute utilization metrics for a single resource pool. */
export function computePoolUtilization(pool: ResourcePoolSnapshot): ResourceUtilization {
  if (!pool.isActive) {
    return {
      poolId: pool.poolId,
      resourceType: pool.resourceType,
      label: pool.label,
      unit: pool.unit,
      totalCapacity: pool.totalCapacity,
      allocatedAmount: 0,
      releasedAmount: 0,
      availableAmount: pool.totalCapacity,
      utilizationPct: 0,
      overAllocated: false,
      objectiveCount: 0,
      topObjectiveId: null,
    };
  }

  const active = pool.allocations.filter((a) => a.status === "ALLOCATED");
  const released = pool.allocations.filter((a) => a.status === "RELEASED");

  const allocatedAmount = active.reduce((s, a) => s + a.allocationAmount, 0);
  const releasedAmount = released.reduce((s, a) => s + a.allocationAmount, 0);
  const availableAmount = Math.max(0, pool.totalCapacity - allocatedAmount);
  const utilizationPct = pool.totalCapacity > 0
    ? Math.min(100, Math.round((allocatedAmount / pool.totalCapacity) * 100))
    : 0;

  const topAllocation = active.sort((a, b) => b.allocationAmount - a.allocationAmount)[0] ?? null;

  return {
    poolId: pool.poolId,
    resourceType: pool.resourceType,
    label: pool.label,
    unit: pool.unit,
    totalCapacity: pool.totalCapacity,
    allocatedAmount,
    releasedAmount,
    availableAmount,
    utilizationPct,
    overAllocated: allocatedAmount > pool.totalCapacity,
    objectiveCount: active.length,
    topObjectiveId: topAllocation?.objectiveId ?? null,
  };
}

/** Identify bottleneck pools (utilization >= 75%). */
function detectBottlenecks(utilizations: ResourceUtilization[]): ResourceBottleneck[] {
  return utilizations
    .filter((u) => u.utilizationPct >= 75)
    .map((u): ResourceBottleneck => {
      let severity: ResourceBottleneck["severity"] = "MEDIUM";
      let recommendation = "Monitor allocation — approaching capacity.";

      if (u.overAllocated || u.utilizationPct >= 100) {
        severity = "CRITICAL";
        recommendation = "Over-allocated. Release or reject lower-priority objectives immediately.";
      } else if (u.utilizationPct >= 90) {
        severity = "HIGH";
        recommendation = "Near capacity. Pause new allocations until existing objectives complete.";
      }

      if (u.resourceType === "OWNER_ATTENTION") {
        recommendation = severity === "CRITICAL"
          ? "Owner is over-committed. Delegate or defer lower-priority tasks."
          : "Owner attention is constrained — prioritise decisions carefully.";
      }

      return {
        poolId: u.poolId,
        resourceType: u.resourceType,
        label: u.label,
        utilizationPct: u.utilizationPct,
        severity,
        recommendation,
      };
    })
    .sort((a, b) => {
      const rank: Record<ResourceBottleneck["severity"], number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
      return rank[a.severity] - rank[b.severity];
    });
}

/** Aggregate per-objective resource demand across all pools. */
function aggregateObjectiveDemands(pools: ResourcePoolSnapshot[]): ObjectiveResourceDemand[] {
  const demandMap = new Map<string, ObjectiveResourceDemand>();

  for (const pool of pools) {
    const active = pool.allocations.filter((a) => a.status === "ALLOCATED");
    for (const alloc of active) {
      const existing = demandMap.get(alloc.objectiveId);
      const newAmount = alloc.allocationAmount;

      if (!existing) {
        demandMap.set(alloc.objectiveId, {
          objectiveId: alloc.objectiveId,
          totalAllocated: newAmount,
          poolCount: 1,
          resourceTypes: [pool.resourceType],
          largestAllocation: { poolId: pool.poolId, amount: newAmount, unit: pool.unit },
        });
      } else {
        existing.totalAllocated += newAmount;
        existing.poolCount += 1;
        if (!existing.resourceTypes.includes(pool.resourceType)) {
          existing.resourceTypes.push(pool.resourceType);
        }
        if (
          existing.largestAllocation === null ||
          newAmount > existing.largestAllocation.amount
        ) {
          existing.largestAllocation = { poolId: pool.poolId, amount: newAmount, unit: pool.unit };
        }
      }
    }
  }

  return Array.from(demandMap.values()).sort((a, b) => b.totalAllocated - a.totalAllocated);
}

/**
 * Build the full resource intelligence view from raw pool + allocation snapshots.
 */
export function buildResourceIntelligence(pools: ResourcePoolSnapshot[]): ResourceIntelligenceView {
  const activePools = pools.filter((p) => p.isActive);
  const utilization = activePools.map(computePoolUtilization);
  const bottlenecks = detectBottlenecks(utilization);
  const objectiveDemands = aggregateObjectiveDemands(activePools);

  const ownerAttentionPool = utilization.find((u) => u.resourceType === "OWNER_ATTENTION");
  const ownerAttentionRemaining = ownerAttentionPool?.availableAmount ?? null;

  return {
    utilization,
    bottlenecks,
    objectiveDemands,
    totalPoolCount: activePools.length,
    overAllocatedCount: utilization.filter((u) => u.overAllocated).length,
    ownerAttentionRemaining,
  };
}
