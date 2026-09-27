/* eslint-disable @typescript-eslint/no-explicit-any -- structural DI fakes for the promotion gates */
/**
 * Consulting Mode compatibility: the owner-decision consolidation must NOT change how a consulting
 * recommendation's promotion is gated. Written only against APIs that exist unchanged in the
 * pre-consolidation base (548908a8), so the same file runs against both trees (mutation check).
 *
 *   A — consulting-only workspace (no owner business), pricing rec, no figures → the margin gate does not
 *       newly block; no owner-business requirement; no request for owner-mode data.
 *   B — known margin below the floor → blocked exactly as before.
 *   C — known margin above the floor → promotion semantics unchanged.
 *   Cash — no owner business, no readings: unknown cash is AT_RISK exactly as before (growth blocked with
 *       the same outcome/code, spend and general work proceed) — never broadened.
 *   F — two owner businesses: business A's margin can never gate a recommendation; the unattributable
 *       margin is unknown (deferred), not a known-safe reading. (Differs from base BY DESIGN: the base read
 *       whichever business's snapshot was newest workspace-wide.)
 */
import { describe, it, expect, vi } from "vitest";
import { enforceMarginSafetyForPromotion } from "@/services/owner-finance/recommendation-margin-safety.service";
import { enforceCashSafetyForPromotion } from "@/services/owner-finance/recommendation-cash-safety.service";
import { MarginSafetyGateError } from "@/domain/owner-finance/margin-safety-gate";
import { CashSafetyGateError } from "@/domain/owner-finance/cash-safety-gate";

function world(opts: { impactArea: string; businesses: string[]; margin?: { revenue: number; costOfGoods: number } | null }) {
  const snapshotReads: any[] = [];
  const db: any = {
    clientAccount: { findUnique: vi.fn(async () => ({ requireBusinessImpactAssessment: true })) },
    recommendation: { findUnique: vi.fn(async () => ({ findingId: "f1" })) },
    finding: { findFirst: vi.fn(async () => ({ impactArea: opts.impactArea })) },
    ownerBusiness: { findMany: vi.fn(async () => opts.businesses.map((id) => ({ id }))) },
    ownerFinancialSnapshot: { findFirst: vi.fn(async (args: any) => { snapshotReads.push(args); return opts.margin ?? null; }) },
    ownerCashflowCycle: { findFirst: vi.fn(async () => null) },
    ownerFinanceCycle: { findFirst: vi.fn(async () => null) },
  };
  return { deps: { db, marginFloorPct: 15 } as any, snapshotReads };
}

const outcome = (p: Promise<void>) => p.then(() => ({ allowed: true as const }), (e: any) => ({ allowed: false as const, error: e }));

describe("Consulting Mode compatibility — margin promotion gate", () => {
  it("A — consulting-only workspace, pricing rec, no owner business: the margin gate does NOT block (unknown → deferred to input quality); nothing is demanded", async () => {
    const { deps } = world({ impactArea: "pricing discount policy", businesses: [], margin: null });
    const r = await outcome(enforceMarginSafetyForPromotion("rec-A", "ws", deps));
    expect(r.allowed).toBe(true);
  });

  it("B — known margin below the floor: blocked exactly as before", async () => {
    const { deps } = world({ impactArea: "pricing discount policy", businesses: ["biz-1"], margin: { revenue: 100, costOfGoods: 92 } });
    const r = await outcome(enforceMarginSafetyForPromotion("rec-B", "ws", deps));
    expect(r.allowed).toBe(false);
    expect((r as any).error).toBeInstanceOf(MarginSafetyGateError);
    expect((r as any).error.code).toBe("MARGIN_SAFETY_GATE_BLOCKED");
  });

  it("C — known margin above the floor: allowed exactly as before", async () => {
    const { deps } = world({ impactArea: "pricing discount policy", businesses: ["biz-1"], margin: { revenue: 100, costOfGoods: 60 } });
    expect((await outcome(enforceMarginSafetyForPromotion("rec-C", "ws", deps))).allowed).toBe(true);
  });
});

describe("Consulting Mode compatibility — cash promotion gate (unknown cash is AT_RISK, never broadened)", () => {
  it("no owner business, no readings: growth is blocked with the unchanged outcome; spend, pricing and general work proceed; nothing is demanded", async () => {
    const growth = await outcome(enforceCashSafetyForPromotion("rec-g", "ws", world({ impactArea: "growth", businesses: [] }).deps));
    expect(growth.allowed).toBe(false);
    expect((growth as any).error).toBeInstanceOf(CashSafetyGateError);
    expect((growth as any).error.code).toBe("CASH_SAFETY_GATE_BLOCKED");
    expect((growth as any).error.effectiveState).toBe("AT_RISK");
    expect((growth as any).error.requiredData).toBeUndefined();
    for (const impactArea of ["cash flow", "revenue", "pricing discount policy", "hiring", "customer experience"]) {
      expect((await outcome(enforceCashSafetyForPromotion("rec-s", "ws", world({ impactArea, businesses: [] }).deps))).allowed, impactArea).toBe(true);
    }
  });
});

describe("F — two owner businesses (by design, differs from base: no cross-business leak)", () => {
  it("business A's below-floor margin never gates a recommendation; the unattributable margin is unknown (deferred), never read as known-safe", async () => {
    const { deps, snapshotReads } = world({ impactArea: "pricing discount policy", businesses: ["biz-A", "biz-B"], margin: { revenue: 100, costOfGoods: 92 } });
    expect((await outcome(enforceMarginSafetyForPromotion("rec-F", "ws", deps))).allowed).toBe(true);
    expect(snapshotReads).toEqual([]);
  });
});
