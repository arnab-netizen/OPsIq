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

describe("[module8-persist] employee workload snapshot — function contract assertions", () => {
  it("saveEmployeeWorkloadSnapshot is a function", () => {
    expect(typeof saveEmployeeWorkloadSnapshot).toBe("function");
  });
  it("listEmployeeWorkloadSnapshots is a function", () => {
    expect(typeof listEmployeeWorkloadSnapshots).toBe("function");
  });
  it("WorkloadBand is defined", () => {
    expect(WorkloadBand).toBeDefined();
  });
  it("WorkloadBand.HEALTHY_UTILIZATION is defined", () => {
    expect(WorkloadBand.HEALTHY_UTILIZATION).toBeDefined();
  });
  it("WorkloadBand.UNSUSTAINABLE is defined", () => {
    expect(WorkloadBand.UNSUSTAINABLE).toBeDefined();
  });
  it("fakeDeps is a function", () => {
    expect(typeof fakeDeps).toBe("function");
  });
  it("fakeDeps() returns an object with uuid and db fields", () => {
    const d = fakeDeps();
    expect(d).toHaveProperty("uuid");
    expect(d).toHaveProperty("db");
  });
  it("fakeDeps().uuid() returns a string starting with 'uuid-'", () => {
    expect(fakeDeps().uuid()).toMatch(/^uuid-/);
  });
  it("saveEmployeeWorkloadSnapshot result has band field", async () => {
    const r = await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-x", employeeLabel: "T", shiftHours: 8, taskHours: 4 }, fakeDeps());
    expect(r).toHaveProperty("band");
  });
  it("saveEmployeeWorkloadSnapshot result has utilizationPct field", async () => {
    const r = await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-x", shiftHours: 8, taskHours: 4 }, fakeDeps());
    expect(r).toHaveProperty("utilizationPct");
    expect(typeof r.utilizationPct).toBe("number");
  });
  it("saveEmployeeWorkloadSnapshot result has overburdened field", async () => {
    const r = await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-x", shiftHours: 8, taskHours: 4 }, fakeDeps());
    expect(r).toHaveProperty("overburdened");
    expect(typeof r.overburdened).toBe("boolean");
  });
  it("saveEmployeeWorkloadSnapshot result has fatigueRisk field", async () => {
    const r = await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-x", shiftHours: 8, taskHours: 4 }, fakeDeps());
    expect(r).toHaveProperty("fatigueRisk");
    expect(typeof r.fatigueRisk).toBe("boolean");
  });
  it("50% utilization returns HEALTHY_UTILIZATION band", async () => {
    const r = await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-x", shiftHours: 8, taskHours: 4 }, fakeDeps());
    expect(r.band).toBe(WorkloadBand.HEALTHY_UTILIZATION);
  });
  it("50% utilization returns utilizationPct of 50", async () => {
    const r = await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-x", shiftHours: 8, taskHours: 4 }, fakeDeps());
    expect(r.utilizationPct).toBe(50);
  });
  it("50% utilization returns overburdened:false", async () => {
    const r = await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-x", shiftHours: 8, taskHours: 4 }, fakeDeps());
    expect(r.overburdened).toBe(false);
  });
  it("listEmployeeWorkloadSnapshots returns an array", async () => {
    const d = fakeDeps();
    await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-x", shiftHours: 8, taskHours: 4 }, d);
    const rows = await listEmployeeWorkloadSnapshots("ws-x", d);
    expect(Array.isArray(rows)).toBe(true);
  });
  it("100% taskHours/shiftHours returns overburdened:true", async () => {
    const r = await saveEmployeeWorkloadSnapshot({ workspaceId: "ws-x", shiftHours: 8, taskHours: 8, overtimeHours: 2 }, fakeDeps());
    expect(r.overburdened).toBe(true);
  });
});

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
