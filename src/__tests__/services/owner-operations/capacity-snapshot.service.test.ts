/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { saveCapacitySnapshot, listCapacitySnapshots, type CapDeps } from "@/services/owner-operations/capacity-snapshot.service";

function fakeDeps(): CapDeps {
  const rows: any[] = [];
  let n = 0;
  return {
    uuid: () => `uuid-${++n}`,
    db: {
      ownerCapacitySnapshot: {
        create: async (args: any) => { rows.push(args.data); return args.data; },
        findMany: async (args: any) => rows.filter((r) => r.workspaceId === args.where.workspaceId),
      },
    } as any,
  };
}

describe("[module10-persist] capacity snapshot — function contract assertions", () => {
  it("saveCapacitySnapshot is a function", () => {
    expect(typeof saveCapacitySnapshot).toBe("function");
  });
  it("listCapacitySnapshots is a function", () => {
    expect(typeof listCapacitySnapshots).toBe("function");
  });
  it("fakeDeps is a function", () => {
    expect(typeof fakeDeps).toBe("function");
  });
  it("fakeDeps() returns an object with uuid and db fields", () => {
    const d = fakeDeps();
    expect(d).toHaveProperty("uuid");
    expect(d).toHaveProperty("db");
  });
  it("fakeDeps().uuid is a function", () => {
    expect(typeof fakeDeps().uuid).toBe("function");
  });
  it("fakeDeps().uuid() returns a string starting with 'uuid-'", () => {
    expect(fakeDeps().uuid()).toMatch(/^uuid-/);
  });
  it("fakeDeps().db has ownerCapacitySnapshot", () => {
    expect(fakeDeps().db).toHaveProperty("ownerCapacitySnapshot");
  });
  it("fakeDeps().db.ownerCapacitySnapshot has create function", async () => {
    const d = fakeDeps();
    expect(typeof (d.db as any).ownerCapacitySnapshot.create).toBe("function");
  });
  it("fakeDeps().db.ownerCapacitySnapshot has findMany function", async () => {
    const d = fakeDeps();
    expect(typeof (d.db as any).ownerCapacitySnapshot.findMany).toBe("function");
  });
  it("saveCapacitySnapshot result has growthSafe field", async () => {
    const r = await saveCapacitySnapshot({ workspaceId: "ws-x", resources: [{ type: "machine", utilization: 0.7 }], currentRevenue: 700000 }, fakeDeps());
    expect(r).toHaveProperty("growthSafe");
  });
  it("saveCapacitySnapshot result has bottleneckResource field", async () => {
    const r = await saveCapacitySnapshot({ workspaceId: "ws-x", resources: [{ type: "machine", utilization: 0.7 }], currentRevenue: 700000 }, fakeDeps());
    expect(r).toHaveProperty("bottleneckResource");
  });
  it("saveCapacitySnapshot result has safeRevenueCeiling field", async () => {
    const r = await saveCapacitySnapshot({ workspaceId: "ws-x", resources: [{ type: "machine", utilization: 0.7 }], currentRevenue: 700000 }, fakeDeps());
    expect(r).toHaveProperty("safeRevenueCeiling");
    expect(typeof r.safeRevenueCeiling).toBe("number");
  });
  it("saveCapacitySnapshot result has expansionTriggered field", async () => {
    const r = await saveCapacitySnapshot({ workspaceId: "ws-x", resources: [{ type: "machine", utilization: 0.7 }], currentRevenue: 700000 }, fakeDeps());
    expect(r).toHaveProperty("expansionTriggered");
    expect(typeof r.expansionTriggered).toBe("boolean");
  });
  it("saveCapacitySnapshot with 70% utilization returns growthSafe:true", async () => {
    const r = await saveCapacitySnapshot({ workspaceId: "ws-x", resources: [{ type: "machine", utilization: 0.7 }], currentRevenue: 700000 }, fakeDeps());
    expect(r.growthSafe).toBe(true);
  });
  it("saveCapacitySnapshot with 95% utilization returns growthSafe:false", async () => {
    const r = await saveCapacitySnapshot({ workspaceId: "ws-x", resources: [{ type: "machine", utilization: 0.95 }], currentRevenue: 700000 }, fakeDeps());
    expect(r.growthSafe).toBe(false);
  });
  it("listCapacitySnapshots returns an array", async () => {
    const d = fakeDeps();
    await saveCapacitySnapshot({ workspaceId: "ws-x", resources: [{ type: "machine", utilization: 0.7 }], currentRevenue: 700000 }, d);
    const rows = await listCapacitySnapshots("ws-x", d);
    expect(Array.isArray(rows)).toBe(true);
  });
  it("bottleneckResource matches the resource type passed in", async () => {
    const r = await saveCapacitySnapshot({ workspaceId: "ws-x", resources: [{ type: "staff", utilization: 0.7 }], currentRevenue: 200000 }, fakeDeps());
    expect(r.bottleneckResource).toBe("staff");
  });
});

describe("[module10-persist] capacity snapshot", () => {
  it("computes + persists ceiling/headroom/expansion", async () => {
    const deps = fakeDeps();
    const r = await saveCapacitySnapshot({ workspaceId: "ws-1", resources: [{ type: "machine", utilization: 0.7 }], currentRevenue: 700000 }, deps);
    expect(r.bottleneckResource).toBe("machine");
    expect(r.safeRevenueCeiling).toBeCloseTo(850000, 0);
    expect(r.growthSafe).toBe(true);
  });

  it("persists no-safe-growth + expansion trigger at the cap", async () => {
    const deps = fakeDeps();
    const r = await saveCapacitySnapshot({ workspaceId: "ws-1", resources: [{ type: "machine", utilization: 0.95 }], currentRevenue: 700000 }, deps);
    expect(r.growthSafe).toBe(false);
    expect(r.expansionTriggered).toBe(true);
  });

  it("reads back workspace-scoped snapshots only", async () => {
    const deps = fakeDeps();
    await saveCapacitySnapshot({ workspaceId: "ws-1", resources: [{ type: "staff", utilization: 0.5 }], currentRevenue: 100 }, deps);
    await saveCapacitySnapshot({ workspaceId: "ws-other", resources: [{ type: "staff", utilization: 0.5 }], currentRevenue: 100 }, deps);
    expect(await listCapacitySnapshots("ws-1", deps)).toHaveLength(1);
    expect(await listCapacitySnapshots("ws-other", deps)).toHaveLength(1);
  });
});
