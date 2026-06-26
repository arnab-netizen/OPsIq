/**
 * Module 9 — owner workload snapshot persistence.
 *
 * Computes the owner's load band / bottleneck risk / relief path via the proven
 * owner-workload domain and persists a workspace-scoped snapshot. DI.
 */

import { assessOwnerWorkload, type OwnerWorkloadInput } from "@/domain/execution/owner-workload";

export interface OwnerWorkloadSnapshotInput extends OwnerWorkloadInput {
  workspaceId: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

export interface PersistedOwnerWorkload {
  workspaceId: string;
  dailyLoad: number;
  dailyLoadPct: number;
  band: string;
  bottleneckRisk: boolean;
  overloaded: boolean;
  recommendedPath: string;
}

interface OWDb {
  ownerWorkloadSnapshot: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args: { where: { workspaceId: string }; orderBy?: unknown }): Promise<PersistedOwnerWorkload[]>;
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
  const a = assessOwnerWorkload(input);
  const persisted: PersistedOwnerWorkload = {
    workspaceId: input.workspaceId,
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

/** List owner workload snapshots for a workspace (scoped). */
export async function listOwnerWorkloadSnapshots(workspaceId: string, injected?: OWDeps): Promise<PersistedOwnerWorkload[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  return deps.db.ownerWorkloadSnapshot.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
}
