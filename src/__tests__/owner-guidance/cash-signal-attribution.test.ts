/** Pure matrix for cashSignalState / cashProfitRiskIsActive (cash-profit-protection.ts). */
import { describe, it, expect } from "vitest";
import { cashSignalState, cashProfitRiskIsActive, type CashRiskState } from "@/domain/owner-mode/cash-profit-protection";

type Driver = "cash" | "finance_profit" | "unverified" | null;
const base = { gateState: "AT_RISK" as CashRiskState | null, gateDriver: "finance_profit" as Driver, cashState: null as CashRiskState | null, provisionalCashState: null as CashRiskState | null, financeMeasuredCash: false };

describe("cashSignalState", () => {
  it("no gate state → null", () => expect(cashSignalState({ ...base, gateState: null, gateDriver: null })).toBeNull());
  it.each(["cash", "unverified", null] as Driver[])("driver %s keeps the enforced gate state", (gateDriver) => {
    expect(cashSignalState({ ...base, gateDriver })).toBe("AT_RISK");
  });
  it("profit-driven with no cash fact of its own → null (a margin problem is never a cash danger)", () => {
    expect(cashSignalState(base)).toBeNull();
    expect(cashSignalState({ ...base, gateState: "CRITICAL" })).toBeNull();
  });
  it("profit-driven but Finance carries a measured cash cushion/runway finding → keeps the gate state", () => {
    expect(cashSignalState({ ...base, financeMeasuredCash: true })).toBe("AT_RISK");
  });
  it("profit-driven with an independent unsafe Cash flow reading → that reading's own severity, not the profit severity", () => {
    expect(cashSignalState({ ...base, gateState: "CRITICAL", cashState: "AT_RISK" })).toBe("AT_RISK");
    expect(cashSignalState({ ...base, gateState: "CRITICAL", provisionalCashState: "CRITICAL" })).toBe("CRITICAL");
    expect(cashSignalState({ ...base, cashState: "AT_RISK", provisionalCashState: "INSOLVENT_RISK" })).toBe("INSOLVENT_RISK");
  });
  it("profit-driven with only a safe cash reading → null", () => {
    expect(cashSignalState({ ...base, cashState: "SAFE", provisionalCashState: "WATCH" })).toBeNull();
  });
});

describe("cashProfitRiskIsActive (the growth/capital block is never relaxed by correct attribution)", () => {
  const margin = { signals: [{ category: "MARGIN", severity: "MEDIUM" }] };
  it("an unsafe gate state keeps it active even with only a margin signal", () => {
    for (const g of ["AT_RISK", "CRITICAL", "INSOLVENT_RISK"] as CashRiskState[]) expect(cashProfitRiskIsActive(margin, g)).toBe(true);
  });
  it("a CASH or CRITICAL signal keeps it active", () => {
    expect(cashProfitRiskIsActive({ signals: [{ category: "CASH", severity: "HIGH" }] }, null)).toBe(true);
    expect(cashProfitRiskIsActive({ signals: [{ category: "MARGIN", severity: "CRITICAL" }] }, "SAFE")).toBe(true);
  });
  it("safe gate and no cash/critical signal → inactive", () => {
    expect(cashProfitRiskIsActive(margin, "SAFE")).toBe(false);
    expect(cashProfitRiskIsActive(margin, "WATCH")).toBe(false);
    expect(cashProfitRiskIsActive(null, null)).toBe(false);
  });
});
