/**
 * Phase 4 — Resource Pool and Allocation service.
 *
 * CRUD for ResourcePool and ResourceAllocation.
 * Workspace isolation enforced. Audit events emitted atomically.
 * Prevents over-allocation via capacity check before allocation.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError, ConflictError } from "@/infra/errors";
import type { Prisma } from "@/generated/prisma/client";

export type ResourceType =
  | "BUDGET"
  | "TIME_HOURS"
  | "STAFF_CAPACITY"
  | "EQUIPMENT_CAPACITY"
  | "OWNER_ATTENTION";

const VALID_RESOURCE_TYPES: ResourceType[] = [
  "BUDGET", "TIME_HOURS", "STAFF_CAPACITY", "EQUIPMENT_CAPACITY", "OWNER_ATTENTION",
];

function validateResourceType(t: string): asserts t is ResourceType {
  if (!VALID_RESOURCE_TYPES.includes(t as ResourceType)) {
    throw new ValidationError(`Invalid resourceType: ${t}`);
  }
}

export interface CreateResourcePoolInput {
  workspaceId: string;
  actorId: string;
  resourceType: ResourceType;
  label: string;
  totalCapacity: number;
  unit: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

export interface AllocateResourceInput {
  workspaceId: string;
  actorId: string;
  poolId: string;
  objectiveId: string;
  allocationAmount: number;
  priority?: number;
  idempotencyKey?: string | null;
}

export async function createResourcePool(input: CreateResourcePoolInput) {
  validateResourceType(input.resourceType);

  if (input.totalCapacity <= 0) {
    throw new ValidationError("totalCapacity must be positive");
  }
  if (input.label.trim().length === 0) {
    throw new ValidationError("label cannot be empty");
  }

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const pool = await tx.resourcePool.create({
      data: {
        workspaceId: input.workspaceId,
        resourceType: input.resourceType,
        label: input.label.trim(),
        totalCapacity: input.totalCapacity,
        unit: input.unit.trim(),
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        isActive: true,
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_RESOURCE_POOL_CREATED,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "ResourcePool",
        entityId: pool.id,
        payload: { resourceType: input.resourceType, totalCapacity: input.totalCapacity, unit: input.unit },
      },
      tx,
    );

    return pool;
  });
}

export async function allocateResource(input: AllocateResourceInput) {
  if (input.allocationAmount <= 0) {
    throw new ValidationError("allocationAmount must be positive");
  }

  type PoolRow = { id: string; total_capacity: number; unit: string };

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Idempotency: if an allocation with this key already exists, return it.
    if (input.idempotencyKey) {
      const dup = await tx.resourceAllocation.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (dup) return dup;
    }

    // Lock the pool row FOR UPDATE — prevents concurrent over-allocation
    // between the capacity check and the allocation insert.
    const pools = await tx.$queryRaw<PoolRow[]>`
      SELECT id, total_capacity, unit
      FROM "resource_pools"
      WHERE id = ${input.poolId}::uuid
        AND workspace_id = ${input.workspaceId}::uuid
        AND is_active = true
      FOR UPDATE
    `;
    if (!pools[0]) throw new NotFoundError("ResourcePool", input.poolId);
    const pool = pools[0];

    // Verify objective belongs to workspace inside same tx
    const objective = await tx.businessObjective.findFirst({
      where: { id: input.objectiveId, workspaceId: input.workspaceId },
    });
    if (!objective) throw new NotFoundError("BusinessObjective", input.objectiveId);

    // Aggregate existing allocations while pool row is locked
    const agg = await tx.resourceAllocation.aggregate({
      where: { poolId: input.poolId, workspaceId: input.workspaceId, status: "ALLOCATED" },
      _sum: { allocationAmount: true },
    });
    const totalAllocated = agg._sum.allocationAmount ?? 0;

    if (totalAllocated + input.allocationAmount > pool.total_capacity) {
      throw new ConflictError(
        `Allocation would exceed pool capacity. Available: ${pool.total_capacity - totalAllocated} ${pool.unit}`,
      );
    }

    const allocation = await tx.resourceAllocation.create({
      data: {
        workspaceId: input.workspaceId,
        poolId: input.poolId,
        objectiveId: input.objectiveId,
        allocationAmount: input.allocationAmount,
        priority: input.priority ?? 50,
        status: "ALLOCATED",
        allocatedBy: input.actorId,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_RESOURCE_ALLOCATED,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "ResourceAllocation",
        entityId: allocation.id,
        payload: {
          poolId: input.poolId,
          objectiveId: input.objectiveId,
          amount: input.allocationAmount,
          unit: pool.unit,
        },
      },
      tx,
    );

    return allocation;
  });
}

export async function releaseAllocation(
  workspaceId: string,
  actorId: string,
  allocationId: string,
) {
  const allocation = await db.resourceAllocation.findFirst({
    where: { id: allocationId, workspaceId },
  });
  if (!allocation) throw new NotFoundError("ResourceAllocation", allocationId);
  if (allocation.status !== "ALLOCATED") {
    throw new ValidationError(`Allocation is already ${allocation.status}`);
  }

  if (allocation.allocationAmount < 0) {
    throw new ValidationError("Allocation has negative amount — cannot release");
  }

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.resourceAllocation.update({
      where: { id: allocationId },
      data: { status: "RELEASED", releasedAt: new Date() },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_RESOURCE_RELEASED,
        workspaceId,
        actorId,
        entityType: "ResourceAllocation",
        entityId: allocationId,
        payload: { poolId: allocation.poolId, objectiveId: allocation.objectiveId },
      },
      tx,
    );

    return updated;
  });
}

export async function listResourcePools(workspaceId: string, activeOnly = true) {
  return db.resourcePool.findMany({
    where: { workspaceId, ...(activeOnly ? { isActive: true } : {}) },
    include: {
      allocations: {
        where: { status: "ALLOCATED" },
        select: { id: true, objectiveId: true, allocationAmount: true, priority: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getResourcePoolUtilization(workspaceId: string, poolId: string) {
  const pool = await db.resourcePool.findFirst({
    where: { id: poolId, workspaceId },
    include: { allocations: { where: { status: "ALLOCATED" } } },
  });
  if (!pool) throw new NotFoundError("ResourcePool", poolId);

  const allocated = pool.allocations.reduce((s: number, a: (typeof pool.allocations)[number]) => s + a.allocationAmount, 0);
  return {
    poolId: pool.id,
    totalCapacity: pool.totalCapacity,
    allocated,
    available: Math.max(0, pool.totalCapacity - allocated),
    utilizationPct: pool.totalCapacity > 0
      ? Math.min(100, Math.round((allocated / pool.totalCapacity) * 100))
      : 0,
  };
}
