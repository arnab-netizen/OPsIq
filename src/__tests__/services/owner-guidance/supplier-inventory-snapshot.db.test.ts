/**
 * Module 41 wiring — supplier/inventory snapshot persistence proof (DB-backed).
 * `[db]`-gated → runs only under TEST_WITH_DB=true with the migration applied.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { saveSupplierInventorySnapshot, getLatestSupplierInventory } from "@/services/owner-guidance/supplier-inventory-snapshot.service";

const wsA = randomUUID();
const wsB = randomUUID();

afterAll(async () => {
  await db.ownerSupplierInventorySnapshot.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
});

describe("[db][module41] supplier/inventory snapshot persistence", () => {
  it("persists + reads back the latest snapshot (round-trip)", async () => {
    await saveSupplierInventorySnapshot({
      workspaceId: wsA, businessId: null,
      items: [{ sku: "chem-1", currentQty: 0, dailyUsage: 10, leadTimeDays: 3, safetyStock: 20 }],
      suppliers: [{ supplierId: "s1", deliveriesOnTime: 5, deliveriesTotal: 20, overduePayable: 5000 }],
    });
    const latest = await getLatestSupplierInventory(wsA);
    expect(latest?.worstStockoutRisk).toBe("STOCKOUT");
    expect(latest?.supplyCutoffRisk).toBe(true);
    expect(latest?.riskScore).toBeGreaterThanOrEqual(0.5);
  });

  it("enforces workspace isolation", async () => {
    await saveSupplierInventorySnapshot({ workspaceId: wsA, items: [], suppliers: [] });
    expect(await getLatestSupplierInventory(wsB)).toBeNull();
  });
});
