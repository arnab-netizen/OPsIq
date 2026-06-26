/**
 * Module 8 — employee workload snapshot persistence.
 *
 * Computes an employee's utilization band via the proven employee-workload domain
 * and persists a workspace-scoped snapshot. DI for unit-testability.
 */

import {
  assessEmployeeWorkload,
  type EmployeeWorkloadInput,
} from "@/domain/execution/employee-workload";

export interface EmployeeWorkloadSnapshotInput extends EmployeeWorkloadInput {
  workspaceId: string;
  employeeUserId?: string | null;
  employeeLabel?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

export interface PersistedEmployeeWorkload {
  workspaceId: string;
  employeeLabel: string | null;
  utilization: number;
  utilizationPct: number;
  band: string;
  overburdened: boolean;
  fatigueRisk: boolean;
}

interface EWDb {
  ownerEmployeeWorkloadSnapshot: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args: { where: { workspaceId: string }; orderBy?: unknown }): Promise<PersistedEmployeeWorkload[]>;
  };
}

export interface EWDeps {
  db: EWDb;
  uuid: () => string;
}

async function resolveDefaultDeps(): Promise<EWDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as EWDb, uuid: () => randomUUID() };
}

/** Compute + persist an employee workload snapshot (workspace-scoped). */
export async function saveEmployeeWorkloadSnapshot(
  input: EmployeeWorkloadSnapshotInput,
  injected?: EWDeps
): Promise<PersistedEmployeeWorkload> {
  const deps = injected ?? (await resolveDefaultDeps());
  const a = assessEmployeeWorkload(input);
  const persisted: PersistedEmployeeWorkload = {
    workspaceId: input.workspaceId,
    employeeLabel: input.employeeLabel ?? null,
    utilization: a.utilization,
    utilizationPct: a.utilizationPct,
    band: a.band,
    overburdened: a.overburdened,
    fatigueRisk: a.fatigueRisk,
  };
  await deps.db.ownerEmployeeWorkloadSnapshot.create({
    data: {
      id: deps.uuid(),
      workspaceId: input.workspaceId,
      employeeUserId: input.employeeUserId ?? null,
      employeeLabel: input.employeeLabel ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      shiftHours: input.shiftHours,
      breakHours: input.breakHours ?? 0,
      taskHours: input.taskHours ?? 0,
      travelHours: input.travelHours ?? 0,
      reworkHours: input.reworkHours ?? 0,
      overtimeHours: input.overtimeHours ?? 0,
      utilization: a.utilization,
      utilizationPct: a.utilizationPct,
      band: a.band,
      overburdened: a.overburdened,
      fatigueRisk: a.fatigueRisk,
    },
  });
  return persisted;
}

/** List employee workload snapshots for a workspace (scoped). */
export async function listEmployeeWorkloadSnapshots(workspaceId: string, injected?: EWDeps): Promise<PersistedEmployeeWorkload[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  return deps.db.ownerEmployeeWorkloadSnapshot.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
}
