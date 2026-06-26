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
