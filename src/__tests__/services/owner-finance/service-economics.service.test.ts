/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  computeServiceEconomics,
  saveServiceEconomics,
  listServiceEconomics,
  type SEDeps,
  type PersistedServiceEconomics,
} from "@/services/owner-finance/service-economics.service";

function fakeDeps(): { deps: SEDeps; rows: any[] } {
  const rows: any[] = [];
  let n = 0;
  return {
    rows,
    deps: {
      uuid: () => `uuid-${++n}`,
      db: {
        ownerServiceEconomics: {
          create: async (args: any) => { rows.push(args.data); return args.data; },
          findMany: async (args: any) => rows.filter((r) => r.workspaceId === args.where.workspaceId) as PersistedServiceEconomics[],
        },
      } as any,
    },
  };
}

describe("service economics — module contract assertions", () => {
  it("computeServiceEconomics is a function", () => {
    expect(typeof computeServiceEconomics).toBe("function");
  });
  it("saveServiceEconomics is a function", () => {
    expect(typeof saveServiceEconomics).toBe("function");
  });
  it("listServiceEconomics is a function", () => {
    expect(typeof listServiceEconomics).toBe("function");
  });
  it("fakeDeps() returns an object with deps and rows", () => {
    const d = fakeDeps();
    expect(typeof d).toBe("object");
    expect(d).toHaveProperty("deps");
    expect(d).toHaveProperty("rows");
  });
  it("fakeDeps().rows is initially empty", () => {
    expect(fakeDeps().rows).toHaveLength(0);
  });
  it("fakeDeps().deps.uuid is a function", () => {
    expect(typeof fakeDeps().deps.uuid).toBe("function");
  });
  it("fakeDeps().deps.uuid() returns 'uuid-1' on first call", () => {
    const { deps } = fakeDeps();
    expect(deps.uuid()).toBe("uuid-1");
  });
  it("computeServiceEconomics returns an object with directCost", () => {
    const c = computeServiceEconomics({ workspaceId: "ws", serviceLine: "x", orders: [{ revenue: 100, labourCost: 40 }] });
    expect(c).toHaveProperty("directCost");
  });
  it("computeServiceEconomics returns an object with contributionMargin", () => {
    const c = computeServiceEconomics({ workspaceId: "ws", serviceLine: "x", orders: [{ revenue: 100, labourCost: 40 }] });
    expect(c).toHaveProperty("contributionMargin");
  });
  it("computeServiceEconomics returns an object with lossMaking boolean", () => {
    const c = computeServiceEconomics({ workspaceId: "ws", serviceLine: "x", orders: [{ revenue: 100, labourCost: 40 }] });
    expect(typeof c.lossMaking).toBe("boolean");
  });
  it("computeServiceEconomics: revenue > total cost → lossMaking false", () => {
    const c = computeServiceEconomics({ workspaceId: "ws", serviceLine: "x", orders: [{ revenue: 1000, labourCost: 200 }] });
    expect(c.lossMaking).toBe(false);
  });
  it("computeServiceEconomics: cost > revenue → lossMaking true", () => {
    const c = computeServiceEconomics({ workspaceId: "ws", serviceLine: "x", orders: [{ revenue: 100, labourCost: 500 }] });
    expect(c.lossMaking).toBe(true);
  });
  it("computeServiceEconomics with empty orders array returns an object", () => {
    const c = computeServiceEconomics({ workspaceId: "ws", serviceLine: "x", orders: [] });
    expect(typeof c).toBe("object");
  });
  it("contributionMarginPct is a number", () => {
    const c = computeServiceEconomics({ workspaceId: "ws", serviceLine: "x", orders: [{ revenue: 1000, labourCost: 400 }] });
    expect(typeof c.contributionMarginPct).toBe("number");
  });
  it("fakeDeps().deps.uuid() increments on each call", () => {
    const { deps } = fakeDeps();
    expect(deps.uuid()).toBe("uuid-1");
    expect(deps.uuid()).toBe("uuid-2");
  });
  it("listServiceEconomics returns a Promise", () => {
    const { deps } = fakeDeps();
    const result = listServiceEconomics("ws-1", deps);
    expect(result).toBeInstanceOf(Promise);
  });
});

describe("[module6-persist] service economics", () => {
  it("computes contribution margin, pct, profit-per-resource, loss flag", () => {
    const c = computeServiceEconomics({
      workspaceId: "ws-1", serviceLine: "wash",
      orders: [{ revenue: 1000, labourCost: 200, materialCost: 150, deliveryCost: 50 }],
      usage: { labourHours: 4, machineHours: 2 },
    });
    expect(c.directCost).toBe(400);
    expect(c.contributionMargin).toBe(600);
    expect(c.contributionMarginPct).toBeCloseTo(0.6, 5);
    expect(c.profitPerLabourHour).toBeCloseTo(150, 5);
    expect(c.profitPerMachineHour).toBeCloseTo(300, 5);
    expect(c.lossMaking).toBe(false);
  });

  it("flags a loss-making service", () => {
    const c = computeServiceEconomics({
      workspaceId: "ws-1", serviceLine: "express",
      orders: [{ revenue: 300, labourCost: 200, materialCost: 150 }],
    });
    expect(c.lossMaking).toBe(true);
    expect(c.contributionMargin).toBeLessThan(0);
  });

  it("persists and reads back workspace-scoped records", async () => {
    const { deps } = fakeDeps();
    await saveServiceEconomics({ workspaceId: "ws-1", serviceLine: "wash", segment: "retail", orders: [{ revenue: 1000, labourCost: 400 }] }, deps);
    await saveServiceEconomics({ workspaceId: "ws-1", serviceLine: "dryclean", orders: [{ revenue: 500, labourCost: 100 }] }, deps);
    await saveServiceEconomics({ workspaceId: "ws-other", serviceLine: "wash", orders: [{ revenue: 100 }] }, deps);

    const ws1 = await listServiceEconomics("ws-1", deps);
    expect(ws1).toHaveLength(2);
    expect(ws1.map((r) => r.serviceLine).sort()).toEqual(["dryclean", "wash"]);
    expect((await listServiceEconomics("ws-other", deps))).toHaveLength(1);
  });

  it("aggregates multiple orders for a service line", () => {
    const c = computeServiceEconomics({
      workspaceId: "ws-1", serviceLine: "wash",
      orders: [
        { revenue: 1000, labourCost: 400 },
        { revenue: 500, labourCost: 100, materialCost: 50 },
      ],
    });
    expect(c.revenue).toBe(1500);
    expect(c.directCost).toBe(550);
    expect(c.contributionMargin).toBe(950);
  });
});
