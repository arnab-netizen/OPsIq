import { describe, it, expect } from "vitest";
import {
  reorderPoint,
  daysOfCover,
  isBelowReorderPoint,
  isStockout,
  stockoutRisk,
  suggestReorder,
  onTimeRate,
  classifySupplier,
  supplyCutoffRisk,
  type StockItemInput,
  type SupplierInput,
} from "@/domain/execution/supplier-inventory";

const item = (over: Partial<StockItemInput> = {}): StockItemInput => ({
  sku: "chem-1", currentQty: 100, dailyUsage: 10, leadTimeDays: 3, safetyStock: 20, ...over,
});

describe("[module23] inventory control", () => {
  it("reorder point = usage*lead + safety", () => {
    expect(reorderPoint(item())).toBe(10 * 3 + 20); // 50
  });

  it("days of cover (Infinity when no usage)", () => {
    expect(daysOfCover(item({ currentQty: 100, dailyUsage: 10 }))).toBe(10);
    expect(daysOfCover(item({ dailyUsage: 0 }))).toBe(Infinity);
  });

  it("below reorder point + stockout detection", () => {
    expect(isBelowReorderPoint(item({ currentQty: 100 }))).toBe(false); // 100 > 50
    expect(isBelowReorderPoint(item({ currentQty: 40 }))).toBe(true);
    expect(isStockout(item({ currentQty: 0 }))).toBe(true);
  });

  it("stockout risk reflects cover vs lead time", () => {
    expect(stockoutRisk(item({ currentQty: 0 }))).toBe("STOCKOUT");
    expect(stockoutRisk(item({ currentQty: 25, dailyUsage: 10, leadTimeDays: 3 }))).toBe("HIGH"); // cover 2.5 <= lead 3
    expect(stockoutRisk(item({ currentQty: 45, dailyUsage: 10, leadTimeDays: 3, safetyStock: 20 }))).toBe("MEDIUM"); // below RP(50), cover 4.5>lead
    expect(stockoutRisk(item({ currentQty: 100, dailyUsage: 10, leadTimeDays: 3 }))).toBe("NONE");
  });

  it("suggests a reorder quantity to the order-up-to level when below RP", () => {
    const s = suggestReorder(item({ currentQty: 40, dailyUsage: 10, leadTimeDays: 3, safetyStock: 20 }));
    expect(s.shouldReorder).toBe(true);
    // orderUpTo = RP(50) + lead demand(30) = 80; qty = 80 - 40 = 40
    expect(s.suggestedOrderQty).toBe(40);
    expect(suggestReorder(item({ currentQty: 100 })).shouldReorder).toBe(false);
  });
});

describe("[module23] supplier reliability", () => {
  const sup = (over: Partial<SupplierInput> = {}): SupplierInput => ({ supplierId: "s1", deliveriesOnTime: 19, deliveriesTotal: 20, ...over });

  it("on-time rate + classification", () => {
    expect(onTimeRate(sup())).toBeCloseTo(0.95, 5);
    expect(classifySupplier(sup({ deliveriesOnTime: 19, deliveriesTotal: 20 }))).toBe("RELIABLE");
    expect(classifySupplier(sup({ deliveriesOnTime: 17, deliveriesTotal: 20 }))).toBe("WATCH");
    expect(classifySupplier(sup({ deliveriesOnTime: 10, deliveriesTotal: 20 }))).toBe("UNRELIABLE");
    expect(classifySupplier(sup({ deliveriesOnTime: 0, deliveriesTotal: 0 }))).toBe("UNKNOWN");
  });

  it("flags supply cutoff risk on overdue payable", () => {
    expect(supplyCutoffRisk(sup({ overduePayable: 5000 }))).toBe(true);
    expect(supplyCutoffRisk(sup())).toBe(false);
  });
});
