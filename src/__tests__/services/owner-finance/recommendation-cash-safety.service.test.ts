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
  /** This business's latest completed Finance snapshot was amended since and not re-diagnosed. */
  finSuperseded?: boolean;
  /**
   * An OLDER completed Finance period's reading (a cycle on an unamended snapshot). A query that skipped the
   * amended current cycle (a `supersededById: null` filter) would fall back to it — the defect this models.
   */
  finOlder?: string | null;
  /** These completed readings are older than the freshness window (unverified). */
  stale?: boolean;
  /** These readings describe a period that has not STARTED (genuinely future): never returned. */
  future?: boolean;
  /** The in-progress current period's readings (provisional). */
  provCash?: string | null;
  provFin?: string | null;
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

const NOW = new Date("2026-09-15T00:00:00.000Z");
const DAY = 86_400_000;

function reading(w: World, businessId: string): BusinessReading {
  return w.perBusiness?.[businessId] ?? { cash: w.cashflowState ?? null, fin: w.survivalState ?? null, finSuperseded: w.financeSuperseded };
}

/** Which kind of period a query asks for: completed (ended by now) or provisional (in progress). */
function queryKind(args: any): "completed" | "provisional" {
  const sn = args.where.snapshot ?? {};
  if (sn.periodStart?.lte && sn.periodEnd?.gt) return "provisional";
  if (sn.periodEnd?.lte) return "completed";
  throw new Error(`unexpected period filter ${JSON.stringify(sn)}`);
}

function deps(w: World): CashDeps {
  const periodEnd = (r: BusinessReading) => new Date(NOW.getTime() - (r.stale ? 120 : 10) * DAY);
  return {
    db: {
      clientAccount: { findUnique: async () => (w.flag === undefined ? null : { requireBusinessImpactAssessment: w.flag }) },
      ownerBusiness: { findMany: async () => (w.businesses ?? ["b1"]).map((id) => ({ id })) },
      // The mocks apply the service's filters as Postgres would: completed vs in-progress periods; a
      // genuinely future period is never returned; a `supersededById: null` filter skips the amended cycle and
      // returns the older one (the fallback the service must never make).
      ownerCashflowCycle: {
        findFirst: async (args: any) => {
          const r = reading(w, args.where.businessId);
          if (queryKind(args) === "provisional") return r.provCash ? { cashflowState: r.provCash, dataConfidenceScore: 80, snapshot: { periodStart: NOW, periodEnd: new Date(NOW.getTime() + 10 * DAY) } } : null;
          return r.cash == null || r.future ? null : { cashflowState: r.cash, snapshot: { periodEnd: periodEnd(r) } };
        },
      },
      ownerFinanceCycle: {
        findFirst: async (args: any) => {
          const r = reading(w, args.where.businessId);
          if (queryKind(args) === "provisional") {
            return r.provFin ? { survivalState: r.provFin, dataConfidenceScore: 80, snapshot: { periodStart: NOW, periodEnd: new Date(NOW.getTime() + 10 * DAY), supersededById: null }, findings: [] } : null;
          }
          if (r.fin == null || r.future) return null;
          if (r.finSuperseded && args.where.snapshot && "supersededById" in args.where.snapshot) {
            return r.finOlder ? { survivalState: r.finOlder, snapshot: { periodEnd: new Date(periodEnd(r).getTime() - 30 * DAY), supersededById: null } } : null;
          }
          return { survivalState: r.fin, snapshot: { periodEnd: periodEnd(r), supersededById: r.finSuperseded ? "newer-snapshot" : null } };
        },
      },
      recommendation: { findUnique: async () => ({ findingId: "f1" }) },
      finding: { findFirst: async () => ({ impactArea: w.impactArea ?? "operations" }) },
    } as any,
  };
}

const enforce = (id: string, d: CashDeps) => enforceCashSafetyForPromotion(id, "ws", d, NOW);

describe("[module4/5] cash-safety enforcement service (DI)", () => {
  it("gate-enabled reflects the per-workspace flag (default off)", async () => {
    expect(await isCashSafetyGateEnabled("ws", deps({}))).toBe(false);
    expect(await isCashSafetyGateEnabled("ws", deps({ flag: true }))).toBe(true);
  });

  it("if-required is a NO-OP when not opted in", async () => {
    await expect(enforceCashSafetyIfRequired("rec-1", "ws", deps({ flag: false, cashflowState: "INSOLVENT_RISK", impactArea: "growth" }))).resolves.toBeUndefined();
  });

  it("opted-in: growth rec blocked when cashflow is CRITICAL", async () => {
    await expect(enforce("rec-1", deps({ flag: true, cashflowState: "CRITICAL", survivalState: "SAFE", impactArea: "growth/expansion" }))).rejects.toBeInstanceOf(CashSafetyGateError);
  });

  it("opted-in: growth rec blocked when finance/cash cycles are MISSING (fail-closed -> AT_RISK) — the base semantics, unchanged", async () => {
    const err = await enforce("rec-1", deps({ flag: true, cashflowState: null, survivalState: null, impactArea: "marketing growth" })).catch((e) => e);
    expect(err).toBeInstanceOf(CashSafetyGateError);
    expect(err.code).toBe("CASH_SAFETY_GATE_BLOCKED");
    expect(err.effectiveState).toBe("AT_RISK");
  });

  it("unknown cash is AT_RISK, never broadened: spend, pricing, hiring and general recommendations proceed", async () => {
    for (const impactArea of ["cash flow", "pricing discount policy", "hiring", "customer experience"]) {
      await expect(enforce("rec-2", deps({ flag: true, cashflowState: null, survivalState: null, impactArea })), impactArea).resolves.toBeUndefined();
    }
  });

  it("a consulting-only workspace (no owner business) keeps exactly the base semantics and is never asked for owner-mode data", async () => {
    const err = await enforce("rec-1", deps({ flag: true, businesses: [], impactArea: "growth" })).catch((e) => e);
    expect(err).toBeInstanceOf(CashSafetyGateError);
    expect(err.code).toBe("CASH_SAFETY_GATE_BLOCKED");
    expect(err.message).not.toMatch(/owner business|diagnosis for this business/);
    await expect(enforce("rec-2", deps({ flag: true, businesses: [], impactArea: "revenue" }))).resolves.toBeUndefined();
  });

  it("Consulting keeps the base worst-of semantics: a SAFE Finance reading never wipes out a CRITICAL cash reading (whichever is newer)", async () => {
    // The pre-consolidation gate took the worse of the two persisted states — no freshness arbitration.
    const cashCritical = deps({ flag: true, cashflowState: "CRITICAL", survivalState: "SAFE", impactArea: "cash flow" });
    const err = await enforceCashSafetyForPromotion("rec-1", "ws", cashCritical).catch((e) => e);
    expect(err).toBeInstanceOf(CashSafetyGateError);
    expect(err.effectiveState).toBe("CRITICAL");
    await expect(enforce("rec-2", deps({ flag: true, cashflowState: "CRITICAL", survivalState: "SAFE", impactArea: "growth" }))).rejects.toBeInstanceOf(CashSafetyGateError);
    // An amended-but-not-re-diagnosed unsafe Finance reading keeps its last-known state as unverified: it
    // never becomes safer (R8 P1).
    const amended = await enforce("rec-3", deps({ flag: true, cashflowState: "SAFE", survivalState: "INSOLVENT_RISK", financeSuperseded: true, impactArea: "growth" })).catch((e) => e);
    expect(amended).toBeInstanceOf(CashSafetyGateError);
    expect(amended.effectiveState).toBe("INSOLVENT_RISK");
    await expect(enforce("rec-4", deps({ flag: true, cashflowState: "SAFE", survivalState: "INSOLVENT_RISK", financeSuperseded: true, impactArea: "cash flow" }))).rejects.toBeInstanceOf(CashSafetyGateError);
  });

  it("Consulting: a missing half is AT_RISK (base): growth held, non-growth allowed", async () => {
    await expect(enforce("rec-1", deps({ flag: true, cashflowState: "SAFE", survivalState: null, impactArea: "growth" }))).rejects.toBeInstanceOf(CashSafetyGateError);
    await expect(enforce("rec-2", deps({ flag: true, cashflowState: null, survivalState: "SAFE", impactArea: "cash flow" }))).resolves.toBeUndefined();
  });

  it("opted-in: growth rec passes when cash + survival are SAFE", async () => {
    await expect(enforce("rec-1", deps({ flag: true, cashflowState: "SAFE", survivalState: "SAFE", impactArea: "growth" }))).resolves.toBeUndefined();
  });

  it("opted-in: a GENERAL rec passes even at CRITICAL (only growth/spend gated)", async () => {
    await expect(enforce("rec-1", deps({ flag: true, cashflowState: "CRITICAL", survivalState: "CRITICAL", impactArea: "customer experience" }))).resolves.toBeUndefined();
  });

  it("opted-in: finance-sensitive rec blocked at INSOLVENT_RISK", async () => {
    await expect(enforce("rec-1", deps({ flag: true, cashflowState: "INSOLVENT_RISK", survivalState: "SAFE", impactArea: "cash flow" }))).rejects.toBeInstanceOf(CashSafetyGateError);
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
    enforce("rec-1", deps({ flag: true, impactArea, ...w })).then(() => "allowed", (e) => (e as CashSafetyGateError).effectiveState);

  it("each business's cycles are read scoped to it, current order, periods that have ended, Finance only while its figures are effective", async () => {
    const now = NOW;
    const { d, calls } = recording({ businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "SAFE" }, b: { cash: "SAFE", fin: "SAFE" } }, impactArea: "growth" });
    await enforceCashSafetyForPromotion("rec-1", "ws", d, now);
    // Per business: the completed cash and Finance cycles, and the in-progress (provisional) ones.
    expect(calls).toHaveLength(8);
    for (const c of calls) {
      expect(["a", "b"]).toContain(c.where.businessId);
      expect(c.where.workspaceId).toBe("ws");
      expect(c.orderBy).toEqual([{ snapshot: { periodEnd: "desc" } }, { snapshot: { createdAt: "desc" } }, { sequenceNumber: "desc" }]);
    }
    const completed = calls.filter((c) => c.where.snapshot.periodEnd.lte);
    const provisional = calls.filter((c) => c.where.snapshot.periodEnd.gt);
    expect(completed).toHaveLength(4);
    expect(provisional).toHaveLength(4);
    for (const c of completed) expect(c.where.snapshot).toEqual({ periodEnd: { lte: now } });
    for (const c of provisional) expect(c.where.snapshot).toEqual({ periodStart: { lte: now }, periodEnd: { gt: now } });
    // The latest completed Finance cycle is read AS RECORDED — never filtered to unamended snapshots (which
    // would fall back to an older period's cycle).
    expect(calls.some((c) => "supersededById" in c.where.snapshot)).toBe(false);
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
    const err = await enforce("rec-1", deps({ flag: true, impactArea: "growth", businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "SAFE" }, b: { cash: "WATCH", fin: "AT_RISK" } } })).catch((e) => e);
    expect(err.effectiveState).toBe("AT_RISK");
  });

  it("D: a future-dated CRITICAL period cannot silently win — the business with only future figures contributes nothing", async () => {
    expect(await state({ businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "SAFE" }, b: { cash: "CRITICAL", fin: "CRITICAL", future: true } } })).toBe("allowed");
  });

  it("E: an amended unsafe Finance reading keeps its last-known state (unverified) — never replaced by an older SAFE period", async () => {
    const amended = { cash: "SAFE", fin: "INSOLVENT_RISK", finSuperseded: true, finOlder: "SAFE" };
    expect(await state({ businesses: ["a", "b"], perBusiness: { a: { cash: "SAFE", fin: "SAFE" }, b: amended } })).toBe("INSOLVENT_RISK");
    expect(await state({ perBusiness: { b1: amended } })).toBe("INSOLVENT_RISK");
    expect(await state({ perBusiness: { b1: amended } }, "cash flow")).toBe("INSOLVENT_RISK");
    // An amended SAFE reading is not verified safety: the Finance half is missing (AT_RISK), still never the
    // older period's reading.
    expect(await state({ perBusiness: { b1: { cash: "SAFE", fin: "SAFE", finSuperseded: true, finOlder: "SAFE" } } })).toBe("AT_RISK");
    expect(await state({ perBusiness: { b1: { cash: "SAFE", fin: "WATCH", finSuperseded: true, finOlder: "CRITICAL" } } })).toBe("AT_RISK");
  });

  it("Decision 1: the in-progress current period tightens only; provisional SAFE never relaxes or proves safety; future never counts", async () => {
    // Provisional unsafe tightens a completed SAFE reading.
    expect(await state({ perBusiness: { b1: { cash: "SAFE", fin: "SAFE", provCash: "CRITICAL" } } })).toBe("CRITICAL");
    expect(await state({ perBusiness: { b1: { cash: "SAFE", fin: "SAFE", provFin: "AT_RISK" } } })).toBe("AT_RISK");
    // Provisional SAFE never relaxes a stricter completed reading (its later period end never supersedes it).
    expect(await state({ perBusiness: { b1: { cash: "CRITICAL", fin: "SAFE", provCash: "SAFE", provFin: "SAFE" } } })).toBe("CRITICAL");
    // Provisional SAFE alone never claims safety (the fail-safe AT_RISK stays).
    expect(await state({ perBusiness: { b1: { cash: null, fin: null, provCash: "SAFE", provFin: "SAFE" } } })).toBe("AT_RISK");
    // Provisional unsafe alone applies.
    expect(await state({ perBusiness: { b1: { cash: null, fin: null, provCash: "INSOLVENT_RISK" } } })).toBe("INSOLVENT_RISK");
    // A genuinely future period is excluded entirely.
    expect(await state({ perBusiness: { b1: { cash: "CRITICAL", fin: "CRITICAL", future: true } } })).toBe("AT_RISK");
  });

  it("freshness: an out-of-date SAFE reading is not verified safety; an out-of-date unsafe one is kept", async () => {
    expect(await state({ perBusiness: { b1: { cash: "SAFE", fin: "SAFE", stale: true } } })).toBe("AT_RISK");
    expect(await state({ perBusiness: { b1: { cash: "CRITICAL", fin: "SAFE", stale: true } } })).toBe("CRITICAL");
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
