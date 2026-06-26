import { describe, it, expect } from "vitest";
import {
  computeSupplierInventoryRisk,
  saveSupplierInventorySnapshot,
  type SIDeps,
} from "@/services/owner-guidance/supplier-inventory-snapshot.service";

const item = (over = {}) => ({ sku: "s", currentQty: 100, dailyUsage: 10, leadTimeDays: 3, safetyStock: 20, ...over });
const sup = (over = {}) => ({ supplierId: "x", deliveriesOnTime: 19, deliveriesTotal: 20, ...over });

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
