/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  saveOwnerWorkloadSnapshot,
  listOwnerWorkloadSnapshots,
  type OWDeps,
} from "@/services/owner-operations/owner-workload-snapshot.service";
import { OwnerLoadBand, OwnerReliefPath } from "@/domain/execution/owner-workload";

function fakeDeps(): OWDeps {
  const rows: any[] = [];
  let n = 0;
  return {
    uuid: () => `uuid-${++n}`,
    db: {
      ownerWorkloadSnapshot: {
        create: async (args: any) => { rows.push(args.data); return args.data; },
        findMany: async (args: any) => rows.filter((r) => r.workspaceId === args.where.workspaceId),
      },
    } as any,
  };
}

describe("[module9-persist] owner workload snapshot", () => {
  it("persists a sustainable owner load", async () => {
    const deps = fakeDeps();
    const r = await saveOwnerWorkloadSnapshot({ workspaceId: "ws-1", ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480 }, deps);
    expect(r.band).toBe(OwnerLoadBand.SUSTAINABLE);
    expect(r.overloaded).toBe(false);
    expect(r.recommendedPath).toBe(OwnerReliefPath.NONE);
  });

  it("persists overload + bottleneck + relief path", async () => {
    const deps = fakeDeps();
    const r = await saveOwnerWorkloadSnapshot({ workspaceId: "ws-1", ownerMinutesPerDay: 520, sustainableMinutesPerDay: 480, hasDelegatableTasks: true }, deps);
    expect(r.band).toBe(OwnerLoadBand.UNSUSTAINABLE);
    expect(r.overloaded).toBe(true);
    expect(r.bottleneckRisk).toBe(true);
    expect(r.recommendedPath).toBe(OwnerReliefPath.DELEGATE);
  });

  it("reads back workspace-scoped snapshots only", async () => {
    const deps = fakeDeps();
    await saveOwnerWorkloadSnapshot({ workspaceId: "ws-1", ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480 }, deps);
    await saveOwnerWorkloadSnapshot({ workspaceId: "ws-other", ownerMinutesPerDay: 100, sustainableMinutesPerDay: 480 }, deps);
    expect(await listOwnerWorkloadSnapshots("ws-1", deps)).toHaveLength(1);
    expect(await listOwnerWorkloadSnapshots("ws-other", deps)).toHaveLength(1);
  });
});
