/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  isCashSafetyGateEnabled,
  enforceCashSafetyForPromotion,
  enforceCashSafetyIfRequired,
  type CashDeps,
} from "@/services/owner-finance/recommendation-cash-safety.service";
import { CashSafetyGateError } from "@/domain/owner-finance/cash-safety-gate";

interface BusinessReading {
  cash?: string | null;
  fin?: string | null;
  /** This business's Finance snapshot was amended since: its cycle is no longer effective evidence. */
  finSuperseded?: boolean;
  /** These readings describe a period that has not ended yet. */
  future?: boolean;
}

interface World {
  /** Real (active, non-fixture) businesses in the workspace (default: exactly one, "b1"). */
  businesses?: string[];
  /** Per-business readings (overrides cashflowState/survivalState for the businesses named). */
  perBusiness?: Record<string, BusinessReading>;
  flag?: boolean;
  /** The Finance diagnosis's snapshot was amended since (its reading is not current). */
  financeSuperseded?: boolean;
  cashflowState?: string | null;
  survivalState?: string | null;
  impactArea?: string | null;
}

function reading(w: World, businessId: string): BusinessReading {
  return w.perBusiness?.[businessId] ?? { cash: w.cashflowState ?? null, fin: w.survivalState ?? null, finSuperseded: w.financeSuperseded };
}

function deps(w: World): CashDeps {
  return {
    db: {
      clientAccount: { findUnique: async () => (w.flag === undefined ? null : { requireBusinessImpactAssessment: w.flag }) },
      ownerBusiness: { findMany: async () => (w.businesses ?? ["b1"]).map((id) => ({ id })) },
      // The mocks apply the service's own filters as Postgres would: a period that has not ended, or an
      // amended (superseded) Finance snapshot, is not returned.
      ownerCashflowCycle: {
        findFirst: async (args: any) => {
          const r = reading(w, args.where.businessId);
          return r.cash == null || (r.future && args.where.snapshot?.periodEnd?.lte) ? null : { cashflowState: r.cash };
        },
      },
      ownerFinanceCycle: {
        findFirst: async (args: any) => {
          const r = reading(w, args.where.businessId);
          if (r.fin == null || (r.future && args.where.snapshot?.periodEnd?.lte)) return null;
          if (r.finSuperseded && args.where.snapshot && "supersededById" in args.where.snapshot) return null;
          return { survivalState: r.fin };
        },
      },
      recommendation: { findUnique: async () => ({ findingId: "f1" }) },
      finding: { findFirst: async () => ({ impactArea: w.impactArea ?? "operations" }) },
    } as any,
  };
}

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

  it("Consulting keeps the base worst-of semantics: a SAFE Finance reading never wipes out a CRITICAL cash reading (whichever is newer)", async () => {
    // The pre-consolidation gate took the worse of the two persisted states — no freshness arbitration.
    const cashCritical = deps({ flag: true, cashflowState: "CRITICAL", survivalState: "SAFE", impactArea: "cash flow" });
    const err = await enforceCashSafetyForPromotion("rec-1", "ws", cashCritical).catch((e) => e);
    expect(err).toBeInstanceOf(CashSafetyGateError);
    expect(err.effectiveState).toBe("CRITICAL");
    await expect(enforceCashSafetyForPromotion("rec-2", "ws", deps({ flag: true, cashflowState: "CRITICAL", survivalState: "SAFE", impactArea: "growth" }))).rejects.toBeInstanceOf(CashSafetyGateError);
    // Decision 3 (E): a Finance diagnosis whose figures were amended is no longer effective evidence — its
    // INSOLVENT_RISK does not masquerade as current; the Finance half is then missing (AT_RISK, base rule).
    const amended = await enforceCashSafetyForPromotion("rec-3", "ws", deps({ flag: true, cashflowState: "SAFE", survivalState: "INSOLVENT_RISK", financeSuperseded: true, impactArea: "growth" })).catch((e) => e);
    expect(amended).toBeInstanceOf(CashSafetyGateError);
    expect(amended.effectiveState).toBe("AT_RISK");
    await expect(enforceCashSafetyForPromotion("rec-4", "ws", deps({ flag: true, cashflowState: "SAFE", survivalState: "INSOLVENT_RISK", financeSuperseded: true, impactArea: "cash flow" }))).resolves.toBeUndefined();
  });

  it("Consulting: a missing half is AT_RISK (base): growth held, non-growth allowed", async () => {
    await expect(enforceCashSafetyForPromotion("rec-1", "ws", deps({ flag: true, cashflowState: "SAFE", survivalState: null, impactArea: "growth" }))).rejects.toBeInstanceOf(CashSafetyGateError);
    await expect(enforceCashSafetyForPromotion("rec-2", "ws", deps({ flag: true, cashflowState: null, survivalState: "SAFE", impactArea: "cash flow" }))).resolves.toBeUndefined();
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

describe("Decision 3 — Consulting multi-business cash: the WORST valid current state across real businesses", () => {
  function recording(w: World) {
    const calls: any[] = [];
    const d = deps(w) as any;
    const cf = d.db.ownerCashflowCycle.findFirst;
    const fin = d.db.ownerFinanceCycle.findFirst;
    d.db.ownerCashflowCycle.findFirst = async (args: any) => { calls.push(args); return cf(args); };
    d.db.ownerFinanceCycle.findFirst = async (args: any) => { calls.push(args); return fin(args); };
    return { d: d as CashDeps, calls };
  }
  const state = async (w: World, impactArea = "growth") =>
    enforceCashSafetyForPromotion("rec-1", "ws", deps({ flag: true, impactArea, ...w })).then(() => "allowed", (e) => (e as CashSafetyGateError).effectiveState);

  it("each business's cycles are read scoped to it, current order, periods that have ended, Finance only while its figures are effective", async () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const { d, calls } = recording({ businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "SAFE" }, b: { cash: "SAFE", fin: "SAFE" } }, impactArea: "growth" });
    await enforceCashSafetyForPromotion("rec-1", "ws", d, now);
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(["a", "b"]).toContain(c.where.businessId);
      expect(c.where.workspaceId).toBe("ws");
      expect(c.where.snapshot.periodEnd).toEqual({ lte: now });
      expect(c.orderBy).toEqual([{ snapshot: { periodEnd: "desc" } }, { snapshot: { createdAt: "desc" } }, { sequenceNumber: "desc" }]);
    }
    expect(calls.filter((c) => "supersededById" in c.where.snapshot)).toHaveLength(2);
  });

  it("A: business A SAFE, business B CRITICAL → CRITICAL", async () => {
    expect(await state({ businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "SAFE" }, b: { cash: "CRITICAL", fin: "SAFE" } } })).toBe("CRITICAL");
  });

  it("B: business A CRITICAL, business B SAFE → CRITICAL (order of businesses / insertion never decides)", async () => {
    expect(await state({ businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "CRITICAL" }, b: { cash: "SAFE", fin: "SAFE" } } })).toBe("CRITICAL");
    expect(await state({ businesses: ["b", "a"], perBusiness: { a: { cash: "SAFE", fin: "CRITICAL" }, b: { cash: "SAFE", fin: "SAFE" } } })).toBe("CRITICAL");
  });

  it("C: business A SAFE, business B WATCH → WATCH (growth proceeds; no averaging, no relaxation)", async () => {
    expect(await state({ businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "SAFE" }, b: { cash: "WATCH", fin: "SAFE" } } })).toBe("allowed");
    const err = await enforceCashSafetyForPromotion("rec-1", "ws", deps({ flag: true, impactArea: "growth", businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "SAFE" }, b: { cash: "WATCH", fin: "AT_RISK" } } })).catch((e) => e);
    expect(err.effectiveState).toBe("AT_RISK");
  });

  it("D: a future-dated CRITICAL period cannot silently win — the business with only future figures contributes nothing", async () => {
    expect(await state({ businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "SAFE" }, b: { cash: "CRITICAL", fin: "CRITICAL", future: true } } })).toBe("allowed");
  });

  it("E: a superseded unsafe Finance reading does not masquerade as current (its business's Finance half is missing → AT_RISK)", async () => {
    expect(await state({ businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "SAFE" }, b: { cash: "SAFE", fin: "INSOLVENT_RISK", finSuperseded: true } } })).toBe("AT_RISK");
    expect(await state({ businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "SAFE" }, b: { cash: "SAFE", fin: "INSOLVENT_RISK", finSuperseded: true } } }, "cash flow")).toBe("allowed");
  });

  it("F: a single business behaves as the base gate (worse of its two states; a missing half AT_RISK)", async () => {
    expect(await state({ perBusiness: { b1: { cash: "CRITICAL", fin: "SAFE" } } })).toBe("CRITICAL");
    expect(await state({ perBusiness: { b1: { cash: "SAFE", fin: "SAFE" } } })).toBe("allowed");
    expect(await state({ perBusiness: { b1: { cash: "SAFE", fin: null } } })).toBe("AT_RISK");
    expect(await state({ perBusiness: { b1: { cash: null, fin: null } } })).toBe("AT_RISK");
  });

  it("no business with a valid current reading → AT_RISK (growth held; non-growth proceeds)", async () => {
    expect(await state({ businesses: ["a", "b"], perBusiness: { a: { cash: null, fin: null }, b: { cash: null, fin: null } } })).toBe("AT_RISK");
    expect(await state({ businesses: ["a", "b"], perBusiness: { a: { cash: null, fin: null }, b: { cash: null, fin: null } } }, "customer experience")).toBe("allowed");
  });
});
