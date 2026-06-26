/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  saveEmployeeWorkloadSnapshot,
  listEmployeeWorkloadSnapshots,
  type EWDeps,
} from "@/services/owner-operations/employee-workload-snapshot.service";
import { WorkloadBand } from "@/domain/execution/employee-workload";

function fakeDeps(): EWDeps {
  const rows: any[] = [];
  let n = 0;
  return {
    uuid: () => `uuid-${++n}`,
    db: {
      ownerEmployeeWorkloadSnapshot: {
        create: async (args: any) => { rows.push(args.data); return args.data; },
        findMany: async (args: any) => rows.filter((r) => r.workspaceId === args.where.workspaceId),
      },
    } as any,
  };
}

describe("[module8-persist] employee workload snapshot", () => {
  it("computes + persists a healthy snapshot", async () => {
    const deps = fakeDeps();
    const r = await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-1", employeeLabel: "R", shiftHours: 8, taskHours: 4 }, deps);
    expect(r.band).toBe(WorkloadBand.HEALTHY_UTILIZATION);
    expect(r.utilizationPct).toBe(50);
    expect(r.overburdened).toBe(false);
  });

  it("persists overburden + fatigue for an unsustainable load", async () => {
    const deps = fakeDeps();
    const r = await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-1", employeeLabel: "S", shiftHours: 8, taskHours: 8, overtimeHours: 2 }, deps);
    expect(r.band).toBe(WorkloadBand.UNSUSTAINABLE);
    expect(r.overburdened).toBe(true);
    expect(r.fatigueRisk).toBe(true);
  });

  it("reads back workspace-scoped snapshots only", async () => {
    const deps = fakeDeps();
    await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-1", shiftHours: 8, taskHours: 4 }, deps);
    await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-1", shiftHours: 8, taskHours: 6 }, deps);
    await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-other", shiftHours: 8, taskHours: 4 }, deps);
    expect(await listEmployeeWorkloadSnapshots("ws-1", deps)).toHaveLength(2);
    expect(await listEmployeeWorkloadSnapshots("ws-other", deps)).toHaveLength(1);
  });
});
