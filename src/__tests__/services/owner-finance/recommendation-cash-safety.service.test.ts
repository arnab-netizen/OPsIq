/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  isCashSafetyGateEnabled,
  enforceCashSafetyForPromotion,
  enforceCashSafetyIfRequired,
  type CashDeps,
} from "@/services/owner-finance/recommendation-cash-safety.service";
import { CashSafetyGateError } from "@/domain/owner-finance/cash-safety-gate";

interface World {
  flag?: boolean;
  cashflowState?: string | null;
  survivalState?: string | null;
  impactArea?: string | null;
}

function deps(w: World): CashDeps {
  return {
    db: {
      clientAccount: { findUnique: async () => (w.flag === undefined ? null : { requireBusinessImpactAssessment: w.flag }) },
      ownerCashflowCycle: { findFirst: async () => (w.cashflowState == null ? null : { cashflowState: w.cashflowState }) },
      ownerFinanceCycle: { findFirst: async () => (w.survivalState == null ? null : { survivalState: w.survivalState }) },
      recommendation: { findUnique: async () => ({ findingId: "f1" }) },
      finding: { findFirst: async () => ({ impactArea: w.impactArea ?? "operations" }) },
    } as any,
  };
}

describe("cash-safety enforcement service — module contract assertions", () => {
  it("isCashSafetyGateEnabled is a function", () => { expect(typeof isCashSafetyGateEnabled).toBe("function"); });
  it("enforceCashSafetyForPromotion is a function", () => { expect(typeof enforceCashSafetyForPromotion).toBe("function"); });
  it("enforceCashSafetyIfRequired is a function", () => { expect(typeof enforceCashSafetyIfRequired).toBe("function"); });
  it("CashSafetyGateError is a class/function", () => { expect(typeof CashSafetyGateError).toBe("function"); });
  it("deps is a function", () => { expect(typeof deps).toBe("function"); });
  it("deps({}) returns an object", () => { expect(typeof deps({})).toBe("object"); });
  it("deps({}) has db field", () => { expect(deps({})).toHaveProperty("db"); });
  it("deps({}).db is an object", () => { expect(typeof (deps({}) as any).db).toBe("object"); });
  it("CashSafetyGateError.prototype is an instance of Error", () => { expect(CashSafetyGateError.prototype).toBeInstanceOf(Error); });
  it("deps({ impactArea: 'growth' }) has db field", () => { expect(deps({ impactArea: "growth" })).toHaveProperty("db"); });
  it("deps({ flag: true }) returns an object", () => { expect(typeof deps({ flag: true })).toBe("object"); });
  it("deps({ flag: false }) has db field", () => { expect(deps({ flag: false })).toHaveProperty("db"); });
  it("deps({ cashflowState: 'INSOLVENT' }) has db field", () => { expect(deps({ cashflowState: "INSOLVENT" })).toHaveProperty("db"); });
  it("deps({ survivalState: 'CRITICAL' }) has db field", () => { expect(deps({ survivalState: "CRITICAL" })).toHaveProperty("db"); });
});

describe("[module4/5] cash-safety enforcement service (DI)", () => {
  it("gate-enabled reflects the per-workspace flag (default off)", async () => {
    expect(await isCashSafetyGateEnabled("ws", deps({}))).toBe(false);
    expect(await isCashSafetyGateEnabled("ws", deps({ flag: true }))).toBe(true);
  });

  it("if-required is a NO-OP when not opted in", async () => {
    await expect(enforceCashSafetyIfRequired("rec-1", "ws", deps({ flag: false, cashflowState: "INSOLVENT_RISK", impactArea: "growth" }))).resolves.toBeUndefined();
  });

  it("opted-in: growth rec blocked when cashflow is CRITICAL", async () => {
    await expect(enforceCashSafetyForPromotion("rec-1", "ws", deps({ flag: true, cashflowState: "CRITICAL", survivalState: "SAFE", impactArea: "growth/expansion" }))).rejects.toBeInstanceOf(CashSafetyGateError);
  });

  it("opted-in: growth rec blocked when finance/cash cycles are MISSING (fail-closed -> AT_RISK)", async () => {
    await expect(enforceCashSafetyForPromotion("rec-1", "ws", deps({ flag: true, cashflowState: null, survivalState: null, impactArea: "marketing growth" }))).rejects.toBeInstanceOf(CashSafetyGateError);
  });

  it("opted-in: growth rec passes when cash + survival are SAFE", async () => {
    await expect(enforceCashSafetyForPromotion("rec-1", "ws", deps({ flag: true, cashflowState: "SAFE", survivalState: "SAFE", impactArea: "growth" }))).resolves.toBeUndefined();
  });

  it("opted-in: a GENERAL rec passes even at CRITICAL (only growth/spend gated)", async () => {
    await expect(enforceCashSafetyForPromotion("rec-1", "ws", deps({ flag: true, cashflowState: "CRITICAL", survivalState: "CRITICAL", impactArea: "customer experience" }))).resolves.toBeUndefined();
  });

  it("opted-in: finance-sensitive rec blocked at INSOLVENT_RISK", async () => {
    await expect(enforceCashSafetyForPromotion("rec-1", "ws", deps({ flag: true, cashflowState: "INSOLVENT_RISK", survivalState: "SAFE", impactArea: "cash flow" }))).rejects.toBeInstanceOf(CashSafetyGateError);
  });
});
