/**
 * Module 9 — owner workload snapshot persistence.
 *
 * Computes the owner's load band / bottleneck risk / relief path via the proven
 * owner-workload domain and persists a workspace-scoped snapshot. DI.
 */

import { assessOwnerWorkload, type OwnerWorkloadInput } from "@/domain/execution/owner-workload";
import { assertBusinessInWorkspace, type BusinessScopeDb } from "@/services/owner-mode/business-scope";

export interface OwnerWorkloadSnapshotInput extends OwnerWorkloadInput {
  workspaceId: string;
  /** Business this snapshot belongs to (one workspace may hold many businesses). Validated server-side. */
  businessId?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

export interface PersistedOwnerWorkload {
  workspaceId: string;
  businessId: string | null;
  dailyLoad: number;
  dailyLoadPct: number;
  band: string;
  bottleneckRisk: boolean;
  overloaded: boolean;
  recommendedPath: string;
}

interface OWDb extends BusinessScopeDb {
  ownerWorkloadSnapshot: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args: { where: { workspaceId: string; businessId?: string }; orderBy?: unknown }): Promise<PersistedOwnerWorkload[]>;
  };
}

export interface OWDeps {
  db: OWDb;
  uuid: () => string;
}

async function resolveDefaultDeps(): Promise<OWDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as OWDb, uuid: () => randomUUID() };
}

/** Compute + persist an owner workload snapshot (workspace-scoped). */
export async function saveOwnerWorkloadSnapshot(input: OwnerWorkloadSnapshotInput, injected?: OWDeps): Promise<PersistedOwnerWorkload> {
  const deps = injected ?? (await resolveDefaultDeps());
  const businessId = input.businessId ?? null;
  // Server-side authority: a supplied businessId must belong to the workspace (rejects cross-workspace).
  if (businessId) await assertBusinessInWorkspace(deps.db, input.workspaceId, businessId);
  const a = assessOwnerWorkload(input);
  const persisted: PersistedOwnerWorkload = {
    workspaceId: input.workspaceId,
    businessId,
    dailyLoad: a.dailyLoad,
    dailyLoadPct: a.dailyLoadPct,
    band: a.band,
    bottleneckRisk: a.bottleneckRisk,
    overloaded: a.overloaded,
    recommendedPath: a.recommendedPath,
  };
  await deps.db.ownerWorkloadSnapshot.create({
    data: {
      id: deps.uuid(),
      workspaceId: input.workspaceId,
      businessId,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      ownerMinutesPerDay: input.ownerMinutesPerDay,
      sustainableMinutesPerDay: input.sustainableMinutesPerDay,
      ownerTasks: input.ownerTasks ?? 0,
      ownerOnlyCriticalTasks: input.ownerOnlyCriticalTasks ?? 0,
      dailyLoad: a.dailyLoad,
      dailyLoadPct: a.dailyLoadPct,
      band: a.band,
      bottleneckRisk: a.bottleneckRisk,
      overloaded: a.overloaded,
      recommendedPath: a.recommendedPath,
    },
  });
  return persisted;
}

/** List owner workload snapshots for a workspace, optionally scoped to one business. */
export async function listOwnerWorkloadSnapshots(workspaceId: string, injected?: OWDeps, businessId?: string): Promise<PersistedOwnerWorkload[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  const where = businessId ? { workspaceId, businessId } : { workspaceId };
  return deps.db.ownerWorkloadSnapshot.findMany({ where, orderBy: { createdAt: "desc" } });
}
