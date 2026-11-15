import { describe, it, expect } from "vitest";
import { profitPosition } from "@/domain/owner-finance/profit-position";
import type { FinancialSnapshotInput } from "@/domain/owner-finance";

const base = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR" } as const;
const snap = (o: Partial<FinancialSnapshotInput>) => ({ ...base, ...o }) as FinancialSnapshotInput;

describe("profit position: derived from a complete snapshot, UNKNOWN otherwise", () => {
  it("revenue 80,000 / fixed 20,000 / variable 35,000 → profit 25,000, margin 31.25%", () => {
    const p = profitPosition(snap({ revenue: 80000, fixedCosts: 20000, variableCosts: 35000 }), "INR");
    expect(p).toMatchObject({ status: "KNOWN", netProfit: 25000, marginPct: 31.25, headline: "Net profit of INR 25,000", marginText: "Net margin 31.25%" });
  });
  it("marketing spend, when entered, is part of total costs", () => {
    expect(profitPosition(snap({ revenue: 80000, fixedCosts: 20000, variableCosts: 35000, marketingSpend: 5000 }), "INR")).toMatchObject({ netProfit: 20000, marginPct: 25 });
  });
  it("a loss is stated as a loss", () => {
    const p = profitPosition(snap({ revenue: 10000, fixedCosts: 8000, variableCosts: 6000 }), "GBP");
    expect(p).toMatchObject({ status: "KNOWN", netProfit: -4000, headline: "Net loss of GBP 4,000" });
  });
  it("an explicit 0 cost is KNOWN and used; an UNKNOWN cost half is never zero", () => {
    expect(profitPosition(snap({ revenue: 80000, fixedCosts: 20000, variableCosts: 0 }), "INR")).toMatchObject({ status: "KNOWN", netProfit: 60000 });
    const u = profitPosition(snap({ revenue: 80000, fixedCosts: 20000 }), "INR");
    expect(u.status).toBe("UNKNOWN");
    expect((u as { reason: string }).reason).toMatch(/variable costs/);
  });
  it("revenue UNKNOWN → UNKNOWN with the reason; revenue explicit 0 → profit known, margin not computable", () => {
    expect(profitPosition(snap({ fixedCosts: 1, variableCosts: 1 }), "INR")).toEqual({ status: "UNKNOWN", reason: expect.stringMatching(/Revenue is not entered/) });
    expect(profitPosition(snap({ revenue: 0, fixedCosts: 1, variableCosts: 1 }), "INR")).toMatchObject({ status: "KNOWN", netProfit: -2, marginPct: null, marginText: null });
  });
});
