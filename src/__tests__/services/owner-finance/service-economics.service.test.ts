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
