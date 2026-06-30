/**
 * Module 10 — capacity/bottleneck snapshot persistence.
 *
 * Computes capacity ceiling / growth headroom / expansion trigger via the proven
 * capacity-ceiling domain and persists a workspace-scoped snapshot. DI.
 */

import { assessCapacity, type CapacityInput } from "@/domain/execution/capacity-ceiling";
import { assertBusinessInWorkspace, type BusinessScopeDb } from "@/services/owner-mode/business-scope";

export interface CapacitySnapshotInput extends CapacityInput {
  workspaceId: string;
  /** Business this snapshot belongs to (one workspace may hold many businesses). Validated server-side. */
  businessId?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

export interface PersistedCapacity {
  workspaceId: string;
  businessId: string | null;
  bottleneckResource: string | null;
  bottleneckUtilization: number;
  revenueCeiling: number | null;
  safeRevenueCeiling: number | null;
  growthCapacityRevenue: number;
  availableBuffer: number;
  expansionTriggered: boolean;
  growthSafe: boolean;
}

interface CapDb extends BusinessScopeDb {
  ownerCapacitySnapshot: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args: { where: { workspaceId: string; businessId?: string }; orderBy?: unknown }): Promise<PersistedCapacity[]>;
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
  const businessId = input.businessId ?? null;
  // Server-side authority: a supplied businessId must belong to the workspace (rejects cross-workspace).
  if (businessId) await assertBusinessInWorkspace(deps.db, input.workspaceId, businessId);
  const a = assessCapacity(input);
  const persisted: PersistedCapacity = {
    workspaceId: input.workspaceId,
    businessId,
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
      businessId,
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

/** List capacity snapshots for a workspace, optionally scoped to one business. */
export async function listCapacitySnapshots(workspaceId: string, injected?: CapDeps, businessId?: string): Promise<PersistedCapacity[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  const where = businessId ? { workspaceId, businessId } : { workspaceId };
  return deps.db.ownerCapacitySnapshot.findMany({ where, orderBy: { createdAt: "desc" } });
}
