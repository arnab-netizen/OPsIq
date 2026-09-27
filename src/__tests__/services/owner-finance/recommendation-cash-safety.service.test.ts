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
  /** Real (active, non-fixture) businesses in the workspace (default: exactly one, "b1"). */
  businesses?: string[];
  flag?: boolean;
  /** The Finance diagnosis's snapshot was amended since (its reading is not current). */
  financeSuperseded?: boolean;
  cashflowState?: string | null;
  survivalState?: string | null;
  impactArea?: string | null;
}

function deps(w: World): CashDeps {
  return {
    db: {
      clientAccount: { findUnique: async () => (w.flag === undefined ? null : { requireBusinessImpactAssessment: w.flag }) },
      ownerBusiness: { findMany: async () => (w.businesses ?? ["b1"]).map((id) => ({ id })) },
      ownerCashflowCycle: { findFirst: async () => (w.cashflowState == null ? null : { cashflowState: w.cashflowState }) },
      ownerFinanceCycle: { findFirst: async () => (w.survivalState == null ? null : { survivalState: w.survivalState, snapshot: { supersededById: w.financeSuperseded ? "newer" : null } }) },
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

  it("opted-in: growth rec blocked when finance/cash cycles are MISSING (fail-closed -> AT_RISK) — the base semantics, unchanged", async () => {
    const err = await enforceCashSafetyForPromotion("rec-1", "ws", deps({ flag: true, cashflowState: null, survivalState: null, impactArea: "marketing growth" })).catch((e) => e);
    expect(err).toBeInstanceOf(CashSafetyGateError);
    expect(err.code).toBe("CASH_SAFETY_GATE_BLOCKED");
    expect(err.effectiveState).toBe("AT_RISK");
  });

  it("unknown cash is AT_RISK, never broadened: spend, pricing, hiring and general recommendations proceed", async () => {
    for (const impactArea of ["cash flow", "pricing discount policy", "hiring", "customer experience"]) {
      await expect(enforceCashSafetyForPromotion("rec-2", "ws", deps({ flag: true, cashflowState: null, survivalState: null, impactArea })), impactArea).resolves.toBeUndefined();
    }
  });

  it("a consulting-only workspace (no owner business) keeps exactly the base semantics and is never asked for owner-mode data", async () => {
    const err = await enforceCashSafetyForPromotion("rec-1", "ws", deps({ flag: true, businesses: [], impactArea: "growth" })).catch((e) => e);
    expect(err).toBeInstanceOf(CashSafetyGateError);
    expect(err.code).toBe("CASH_SAFETY_GATE_BLOCKED");
    expect(err.message).not.toMatch(/owner business|diagnosis for this business/);
    await expect(enforceCashSafetyForPromotion("rec-2", "ws", deps({ flag: true, businesses: [], impactArea: "revenue" }))).resolves.toBeUndefined();
  });

  it("a Finance reading on an AMENDED (not yet re-diagnosed) snapshot never clears anything, and an unsafe one still blocks until re-diagnosed", async () => {
    // INSOLVENT on figures amended since, SAFE cash: fail safe — the last Finance reading still blocks spend.
    const err = await enforceCashSafetyForPromotion("rec-1", "ws", deps({ flag: true, cashflowState: "SAFE", survivalState: "INSOLVENT_RISK", financeSuperseded: true, impactArea: "cash flow" })).catch((e) => e);
    expect(err).toBeInstanceOf(CashSafetyGateError);
    expect(err.message).toMatch(/INSOLVENT_RISK/);
    // A SAFE amended Finance reading is not a current reading: the missing half is AT_RISK, so growth is held.
    await expect(enforceCashSafetyForPromotion("rec-2", "ws", deps({ flag: true, cashflowState: "SAFE", survivalState: "SAFE", financeSuperseded: true, impactArea: "growth" }))).rejects.toBeInstanceOf(CashSafetyGateError);
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

describe("P2 — cross-business cash safety: cycles are read for the ONE attributable business, never workspace-wide", () => {
  function recording(w: World) {
    const calls: any[] = [];
    const d = deps(w) as any;
    const cf = d.db.ownerCashflowCycle.findFirst;
    const fin = d.db.ownerFinanceCycle.findFirst;
    d.db.ownerCashflowCycle.findFirst = async (args: any) => { calls.push(args); return cf(args); };
    d.db.ownerFinanceCycle.findFirst = async (args: any) => { calls.push(args); return fin(args); };
    return { d: d as CashDeps, calls };
  }

  it("single business: both cycle reads are scoped to it, in the current-diagnosis order (latest evidence period)", async () => {
    const { d, calls } = recording({ cashflowState: "SAFE", survivalState: "SAFE", impactArea: "growth" });
    await enforceCashSafetyForPromotion("rec-1", "ws", d);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.where).toEqual({ workspaceId: "ws", businessId: "b1" });
      expect(c.orderBy).toEqual([{ snapshot: { periodEnd: "desc" } }, { snapshot: { createdAt: "desc" } }, { sequenceNumber: "desc" }]);
    }
  });

  it("two businesses: no cycle is read (another business's SAFE figures can never clear growth) — unattributable cash is AT_RISK", async () => {
    const { d, calls } = recording({ businesses: ["a", "b"], cashflowState: "SAFE", survivalState: "SAFE", impactArea: "growth" });
    const err = await enforceCashSafetyForPromotion("rec-1", "ws", d).catch((e) => e);
    expect(err).toBeInstanceOf(CashSafetyGateError);
    expect(err.effectiveState).toBe("AT_RISK");
    expect(calls).toEqual([]);
    // Unknown cash is AT_RISK: spend and non-growth work are not blocked by the fail-safe.
    await expect(enforceCashSafetyForPromotion("rec-3", "ws", recording({ businesses: ["a", "b"], impactArea: "cash flow" }).d)).resolves.toBeUndefined();
    await expect(enforceCashSafetyForPromotion("rec-2", "ws", recording({ businesses: ["a", "b"], impactArea: "customer experience" }).d)).resolves.toBeUndefined();
  });
});
