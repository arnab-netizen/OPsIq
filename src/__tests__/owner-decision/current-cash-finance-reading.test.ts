/**
 * The ONE current cash/finance survival reading (src/services/owner-spine/current-cash-finance-reading.ts)
 * that Owner Home, Now View, the owner action gate and the recommendation cash gate all use.
 */
import { describe, it, expect } from "vitest";
import { currentCashFinanceReading } from "@/services/owner-spine/current-cash-finance-reading";

const NOW = new Date("2026-09-27T00:00:00Z").getTime();
const day = (d: number) => new Date(NOW - d * 86_400_000);
const cash = (state: string, daysAgo: number) => ({ state, snapshot: { periodEnd: day(daysAgo) } });
const fin = (state: string, daysAgo: number, amended = false) => ({ state, snapshot: { periodEnd: day(daysAgo), supersededById: amended ? "newer" : null } });

describe("currentCashFinanceReading — one definition of the current cash/finance reading", () => {
  it("a newer disagreeing reading supersedes the older one (by evidence period), and the gate enforces the current one", () => {
    const r = currentCashFinanceReading(cash("CRITICAL", 30), fin("SAFE", 5), NOW);
    expect(r.effectiveState).toBe("SAFE");
    expect(r.supersededSource).toBe("cash");
    expect(r.gateState).toBe("SAFE");
  });

  it("an incomparable disagreement is an explicit conflict; the gate enforces the worse reading (fail safe)", () => {
    const r = currentCashFinanceReading(cash("SAFE", 5), fin("CRITICAL", 5), NOW);
    expect(r.conflicting).toBe(true);
    expect(r.effectiveState).toBeNull();
    expect(r.gateState).toBe("CRITICAL");
  });

  it("D-P1-1 — a Finance reading whose figures were amended is NOT current: it never passes as SAFE", () => {
    const r = currentCashFinanceReading(cash("SAFE", 5), fin("SAFE", 5, true), NOW);
    expect(r.financeState).toBeNull();
    expect(r.financeAmendedLastKnown).toBe("SAFE");
    // Only the cash reading is current: its state stands, Finance is missing (callers fail safe on it).
    expect(r.effectiveState).toBe("SAFE");
  });

  it("A-P1-2 — an amended UNSAFE Finance reading still applies at the gate until the amended figures are diagnosed", () => {
    const r = currentCashFinanceReading(cash("SAFE", 5), fin("INSOLVENT_RISK", 5, true), NOW);
    expect(r.effectiveState).toBe("SAFE");
    expect(r.gateState).toBe("INSOLVENT_RISK");
    const alone = currentCashFinanceReading(null, fin("CRITICAL", 5, true), NOW);
    expect(alone.gateState).toBe("CRITICAL");
  });

  it("out-of-date readings never supersede each other (disagreement between stale readings fails safe)", () => {
    const r = currentCashFinanceReading(cash("SAFE", 90), fin("AT_RISK", 100), NOW);
    expect(r.supersededSource).toBeNull();
    expect(r.conflicting).toBe(true);
    expect(r.gateState).toBe("AT_RISK");
  });

  it("no reading at all → nothing to enforce (null); unknown states are ignored, never read as SAFE", () => {
    expect(currentCashFinanceReading(null, null, NOW).gateState).toBeNull();
    const r = currentCashFinanceReading({ state: "BOGUS", snapshot: null }, null, NOW);
    expect(r.cashState).toBeNull();
    expect(r.gateState).toBeNull();
  });
});
