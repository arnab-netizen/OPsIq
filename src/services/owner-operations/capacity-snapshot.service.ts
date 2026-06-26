/**
 * Module 10 — capacity/bottleneck snapshot persistence.
 *
 * Computes capacity ceiling / growth headroom / expansion trigger via the proven
 * capacity-ceiling domain and persists a workspace-scoped snapshot. DI.
 */

import { assessCapacity, type CapacityInput } from "@/domain/execution/capacity-ceiling";

export interface CapacitySnapshotInput extends CapacityInput {
  workspaceId: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

export interface PersistedCapacity {
  workspaceId: string;
  bottleneckResource: string | null;
  bottleneckUtilization: number;
  revenueCeiling: number | null;
  safeRevenueCeiling: number | null;
  growthCapacityRevenue: number;
  availableBuffer: number;
  expansionTriggered: boolean;
  growthSafe: boolean;
}

interface CapDb {
  ownerCapacitySnapshot: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args: { where: { workspaceId: string }; orderBy?: unknown }): Promise<PersistedCapacity[]>;
  };
}

export interface CapDeps {
  db: CapDb;
  uuid: () => string;
}

async function resolveDefaultDeps(): Promise<CapDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as CapDb, uuid: () => randomUUID() };
}

/** Compute + persist a capacity snapshot (workspace-scoped). */
export async function saveCapacitySnapshot(input: CapacitySnapshotInput, injected?: CapDeps): Promise<PersistedCapacity> {
  const deps = injected ?? (await resolveDefaultDeps());
  const a = assessCapacity(input);
  const persisted: PersistedCapacity = {
    workspaceId: input.workspaceId,
    bottleneckResource: a.bottleneckResource,
    bottleneckUtilization: a.bottleneckUtilization,
    revenueCeiling: a.revenueCeiling,
    safeRevenueCeiling: a.safeRevenueCeiling,
    growthCapacityRevenue: a.growthCapacityRevenue,
    availableBuffer: a.availableBuffer,
    expansionTriggered: a.expansionTriggered,
    growthSafe: a.growthSafe,
  };
  await deps.db.ownerCapacitySnapshot.create({
    data: {
      id: deps.uuid(),
      workspaceId: input.workspaceId,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      currentRevenue: input.currentRevenue,
      safeUtilization: input.safeUtilization ?? 0.85,
      resources: input.resources,
      bottleneckResource: a.bottleneckResource,
      bottleneckUtilization: a.bottleneckUtilization,
      revenueCeiling: a.revenueCeiling,
      safeRevenueCeiling: a.safeRevenueCeiling,
      growthCapacityRevenue: a.growthCapacityRevenue,
      availableBuffer: a.availableBuffer,
      expansionTriggered: a.expansionTriggered,
      growthSafe: a.growthSafe,
    },
  });
  return persisted;
}

/** List capacity snapshots for a workspace (scoped). */
export async function listCapacitySnapshots(workspaceId: string, injected?: CapDeps): Promise<PersistedCapacity[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  return deps.db.ownerCapacitySnapshot.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
}
