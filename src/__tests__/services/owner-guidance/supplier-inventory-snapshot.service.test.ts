import { describe, it, expect } from "vitest";
import {
  computeSupplierInventoryRisk,
  saveSupplierInventorySnapshot,
  type SIDeps,
} from "@/services/owner-guidance/supplier-inventory-snapshot.service";

const item = (over = {}) => ({ sku: "s", currentQty: 100, dailyUsage: 10, leadTimeDays: 3, safetyStock: 20, ...over });
const sup = (over = {}) => ({ supplierId: "x", deliveriesOnTime: 19, deliveriesTotal: 20, ...over });

describe("[module41] supplier/inventory — function contract assertions", () => {
  it("computeSupplierInventoryRisk is a function", () => {
    expect(typeof computeSupplierInventoryRisk).toBe("function");
  });
  it("saveSupplierInventorySnapshot is a function", () => {
    expect(typeof saveSupplierInventorySnapshot).toBe("function");
  });
  it("item() fixture has expected fields", () => {
    const i = item();
    expect(i).toHaveProperty("sku");
    expect(i).toHaveProperty("currentQty");
    expect(i).toHaveProperty("dailyUsage");
    expect(i).toHaveProperty("leadTimeDays");
    expect(i).toHaveProperty("safetyStock");
  });
  it("item().sku is 's'", () => {
    expect(item().sku).toBe("s");
  });
  it("item().currentQty defaults to 100", () => {
    expect(item().currentQty).toBe(100);
  });
  it("item().dailyUsage defaults to 10", () => {
    expect(item().dailyUsage).toBe(10);
  });
  it("item({currentQty: 0}) overrides currentQty", () => {
    expect(item({ currentQty: 0 }).currentQty).toBe(0);
  });
  it("sup() fixture has expected fields", () => {
    const s = sup();
    expect(s).toHaveProperty("supplierId");
    expect(s).toHaveProperty("deliveriesOnTime");
    expect(s).toHaveProperty("deliveriesTotal");
  });
  it("sup().supplierId defaults to 'x'", () => {
    expect(sup().supplierId).toBe("x");
  });
  it("sup().deliveriesOnTime defaults to 19", () => {
    expect(sup().deliveriesOnTime).toBe(19);
  });
  it("sup().deliveriesTotal defaults to 20", () => {
    expect(sup().deliveriesTotal).toBe(20);
  });
  it("computeSupplierInventoryRisk returns an object", () => {
    const r = computeSupplierInventoryRisk({ workspaceId: "ws", items: [item()], suppliers: [sup()] });
    expect(typeof r).toBe("object");
    expect(r).not.toBeNull();
  });
  it("computeSupplierInventoryRisk result has worstStockoutRisk field", () => {
    const r = computeSupplierInventoryRisk({ workspaceId: "ws", items: [item()], suppliers: [sup()] });
    expect(r).toHaveProperty("worstStockoutRisk");
  });
  it("computeSupplierInventoryRisk result has riskScore field", () => {
    const r = computeSupplierInventoryRisk({ workspaceId: "ws", items: [item()], suppliers: [sup()] });
    expect(r).toHaveProperty("riskScore");
  });
  it("computeSupplierInventoryRisk result has supplyCutoffRisk field", () => {
    const r = computeSupplierInventoryRisk({ workspaceId: "ws", items: [item()], suppliers: [sup()] });
    expect(r).toHaveProperty("supplyCutoffRisk");
  });
  it("computeSupplierInventoryRisk with healthy stock returns riskScore of 0", () => {
    const r = computeSupplierInventoryRisk({ workspaceId: "ws", items: [item()], suppliers: [sup()] });
    expect(r.riskScore).toBe(0);
  });
  it("computeSupplierInventoryRisk with healthy stock returns supplyCutoffRisk false", () => {
    const r = computeSupplierInventoryRisk({ workspaceId: "ws", items: [item()], suppliers: [sup()] });
    expect(r.supplyCutoffRisk).toBe(false);
  });
});

describe("[module41] supplier/inventory risk computation (wraps M23)", () => {
  it("no risk when stock healthy + suppliers reliable", () => {
    const r = computeSupplierInventoryRisk({ workspaceId: "ws", items: [item()], suppliers: [sup()] });
    expect(r.worstStockoutRisk).toBe("NONE");
    expect(r.riskScore).toBe(0);
    expect(r.supplyCutoffRisk).toBe(false);
  });

  it("high risk on stockout + unreliable supplier + cutoff", () => {
    const r = computeSupplierInventoryRisk({
      workspaceId: "ws",
      items: [item({ currentQty: 0 })],
      suppliers: [sup({ deliveriesOnTime: 5, deliveriesTotal: 20, overduePayable: 5000 })],
    });
    expect(r.worstStockoutRisk).toBe("STOCKOUT");
    expect(r.stockoutCount).toBe(1);
    expect(r.unreliableSupplierCount).toBe(1);
    expect(r.supplyCutoffRisk).toBe(true);
    expect(r.riskScore).toBeGreaterThanOrEqual(0.5);
  });

  it("persists a workspace-scoped snapshot", async () => {
    const created: Record<string, unknown>[] = [];
    const deps: SIDeps = {
      uuid: () => "00000000-0000-0000-0000-000000000009",
      db: {
        ownerSupplierInventorySnapshot: {
          create: async (a: { data: Record<string, unknown> }) => { created.push(a.data); return a.data; },
          findFirst: async () => null,
        },
      },
    };
    await saveSupplierInventorySnapshot({ workspaceId: "ws7", businessId: "b1", items: [item({ currentQty: 0 })], suppliers: [sup()] }, deps);
    expect(created).toHaveLength(1);
    expect(created[0].workspaceId).toBe("ws7");
    expect(created[0].worstStockoutRisk).toBe("STOCKOUT");
  });
});
