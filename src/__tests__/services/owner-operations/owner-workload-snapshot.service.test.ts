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

describe("[module9-persist] owner workload snapshot — function contract assertions", () => {
  it("saveOwnerWorkloadSnapshot is a function", () => {
    expect(typeof saveOwnerWorkloadSnapshot).toBe("function");
  });
  it("listOwnerWorkloadSnapshots is a function", () => {
    expect(typeof listOwnerWorkloadSnapshots).toBe("function");
  });
  it("OwnerLoadBand is defined", () => {
    expect(OwnerLoadBand).toBeDefined();
  });
  it("OwnerLoadBand.SUSTAINABLE is defined", () => {
    expect(OwnerLoadBand.SUSTAINABLE).toBeDefined();
  });
  it("OwnerLoadBand.UNSUSTAINABLE is defined", () => {
    expect(OwnerLoadBand.UNSUSTAINABLE).toBeDefined();
  });
  it("OwnerReliefPath is defined", () => {
    expect(OwnerReliefPath).toBeDefined();
  });
  it("OwnerReliefPath.NONE is defined", () => {
    expect(OwnerReliefPath.NONE).toBeDefined();
  });
  it("OwnerReliefPath.DELEGATE is defined", () => {
    expect(OwnerReliefPath.DELEGATE).toBeDefined();
  });
  it("fakeDeps is a function", () => {
    expect(typeof fakeDeps).toBe("function");
  });
  it("fakeDeps() returns object with uuid and db", () => {
    const d = fakeDeps();
    expect(d).toHaveProperty("uuid");
    expect(d).toHaveProperty("db");
  });
  it("fakeDeps().uuid() returns a string", () => {
    expect(typeof fakeDeps().uuid()).toBe("string");
  });
  it("saveOwnerWorkloadSnapshot result has band field", async () => {
    const r = await saveOwnerWorkloadSnapshot({ workspaceId: "ws-x", ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480 }, fakeDeps());
    expect(r).toHaveProperty("band");
  });
  it("saveOwnerWorkloadSnapshot result has overloaded field (boolean)", async () => {
    const r = await saveOwnerWorkloadSnapshot({ workspaceId: "ws-x", ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480 }, fakeDeps());
    expect(r).toHaveProperty("overloaded");
    expect(typeof r.overloaded).toBe("boolean");
  });
  it("saveOwnerWorkloadSnapshot result has recommendedPath field", async () => {
    const r = await saveOwnerWorkloadSnapshot({ workspaceId: "ws-x", ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480 }, fakeDeps());
    expect(r).toHaveProperty("recommendedPath");
  });
  it("sustainable load returns SUSTAINABLE band", async () => {
    const r = await saveOwnerWorkloadSnapshot({ workspaceId: "ws-x", ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480 }, fakeDeps());
    expect(r.band).toBe(OwnerLoadBand.SUSTAINABLE);
  });
  it("sustainable load returns overloaded:false", async () => {
    const r = await saveOwnerWorkloadSnapshot({ workspaceId: "ws-x", ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480 }, fakeDeps());
    expect(r.overloaded).toBe(false);
  });
  it("listOwnerWorkloadSnapshots returns an array", async () => {
    const d = fakeDeps();
    await saveOwnerWorkloadSnapshot({ workspaceId: "ws-x", ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480 }, d);
    const rows = await listOwnerWorkloadSnapshots("ws-x", d);
    expect(Array.isArray(rows)).toBe(true);
  });
});

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
