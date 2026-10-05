/**
 * A1 amendment — cash semantics through the amendment chain (pure rules) and the deployment cutover.
 */
import { describe, it, expect } from "vitest";
import {
  PHYSICAL_CASH_SEMANTICS_EFFECTIVE_FROM,
  cashSemanticsForSnapshot,
  cashflowTotalCash,
  resolveCashSemanticsFromLineage,
  resolveLiquidity,
  type CashLineageNode,
} from "@/domain/owner-finance/liquidity";
import { deriveOwnerContext } from "@/services/owner-mode/owner-context-derivation";
import { buildProvidersFromRows } from "@/services/owner-mode/owner-db-providers";

const PRE = "2026-09-20T10:00:00Z";
const POST = "2026-10-10T10:00:00Z";
const node = (createdAt: string, cashOnHand: number | null, changedFields: unknown = null): CashLineageNode => ({ createdAt, cashOnHand, changedFields });

describe("A1 amendment — deployment cutover", () => {
  it("is the production deployment-complete instant of #586, not the merge instant", () => {
    expect(PHYSICAL_CASH_SEMANTICS_EFFECTIVE_FROM).toBe("2026-10-04T15:29:07.000Z");
  });
  it("15:28:00Z and 15:29:06Z (between merge and deploy) are LEGACY_AMBIGUOUS; 15:29:07Z+ is PHYSICAL_ONLY", () => {
    expect(cashSemanticsForSnapshot("2026-10-04T15:27:23Z")).toBe("LEGACY_AMBIGUOUS");
    expect(cashSemanticsForSnapshot("2026-10-04T15:28:00Z")).toBe("LEGACY_AMBIGUOUS");
    expect(cashSemanticsForSnapshot("2026-10-04T15:29:06Z")).toBe("LEGACY_AMBIGUOUS");
    expect(cashSemanticsForSnapshot("2026-10-04T15:29:07Z")).toBe("PHYSICAL_ONLY");
    expect(cashSemanticsForSnapshot("2026-10-04T15:29:08Z")).toBe("PHYSICAL_ONLY");
  });
});

describe("A1 amendment — lineage rules", () => {
  it("original pre-cutover → LEGACY; original post-cutover → PHYSICAL", () => {
    expect(resolveCashSemanticsFromLineage([node(PRE, 130000)])).toBe("LEGACY_AMBIGUOUS");
    expect(resolveCashSemanticsFromLineage([node(POST, 10000)])).toBe("PHYSICAL_ONLY");
  });
  it("post-cutover amendment of a legacy row that does NOT touch cash inherits LEGACY (value copied forward)", () => {
    expect(resolveCashSemanticsFromLineage([node(PRE, 130000), node(POST, 130000, ["receivables"])])).toBe("LEGACY_AMBIGUOUS");
  });
  it("post-cutover amendment explicitly replacing cashOnHand with a new value → PHYSICAL", () => {
    expect(resolveCashSemanticsFromLineage([node(PRE, 130000), node(POST, 10000, ["cashOnHand"])])).toBe("PHYSICAL_ONLY");
  });
  it("re-submitting the SAME number is not proof of a new meaning → stays LEGACY", () => {
    expect(resolveCashSemanticsFromLineage([node(PRE, 130000), node(POST, 130000, ["cashOnHand"])])).toBe("LEGACY_AMBIGUOUS");
  });
  it("physical row amended without touching cash stays PHYSICAL", () => {
    expect(resolveCashSemanticsFromLineage([node(POST, 10000), node("2026-10-12T10:00:00Z", 10000, ["notes"])])).toBe("PHYSICAL_ONLY");
  });
  it("legacy → amend → amend (no cash changes) stays LEGACY throughout", () => {
    const chain = [node(PRE, 130000), node(POST, 130000, ["receivables"]), node("2026-10-12T10:00:00Z", 130000, ["payables"])];
    for (let n = 1; n <= 3; n++) expect(resolveCashSemanticsFromLineage(chain.slice(0, n))).toBe("LEGACY_AMBIGUOUS");
  });
  it("legacy → explicit cash replacement → later unrelated amendment → PHYSICAL thereafter", () => {
    const chain = [node(PRE, 130000), node(POST, 10000, ["cashOnHand"]), node("2026-10-12T10:00:00Z", 10000, ["receivables"])];
    expect(resolveCashSemanticsFromLineage(chain)).toBe("PHYSICAL_ONLY");
  });
  it("an amendment created before the cutover can never establish PHYSICAL", () => {
    expect(resolveCashSemanticsFromLineage([node(PRE, 130000), node("2026-09-25T10:00:00Z", 10000, ["cashOnHand"])])).toBe("LEGACY_AMBIGUOUS");
  });
  it("malformed provenance and empty chains fail closed", () => {
    expect(resolveCashSemanticsFromLineage([])).toBe("LEGACY_AMBIGUOUS");
    expect(resolveCashSemanticsFromLineage([node(PRE, 130000), node(POST, 10000, "cashOnHand")])).toBe("LEGACY_AMBIGUOUS");
    expect(resolveCashSemanticsFromLineage([node("garbage", 1)])).toBe("LEGACY_AMBIGUOUS");
  });
  it("legacy ambiguous value + bank balance is never double-counted", () => {
    const p = resolveLiquidity({ cashOnHand: 130000, bankBalance: 120000, cashSemantics: "LEGACY_AMBIGUOUS" });
    expect(p.totalLiquidFunds).toBe(130000);
  });
});

describe("A1 amendment — 35-day owner-context window is generic staleness, and never invents a liquidity claim", () => {
  it("cashflowTotalCash needs BOTH parts; an unrecorded part is unknown, never 0", () => {
    expect(cashflowTotalCash({ cashInHand: 5, bankBalance: 7 })).toBe(12);
    expect(cashflowTotalCash({ cashInHand: 0, bankBalance: 0 })).toBe(0);
    expect(cashflowTotalCash({ cashInHand: 0, bankBalance: null })).toBeNull();
    expect(cashflowTotalCash({ cashInHand: null, bankBalance: 9 })).toBeNull();
    expect(cashflowTotalCash(null)).toBeNull();
  });

  const NOW = new Date("2026-10-20T00:00:00Z");
  const rows = (cashflow: Record<string, unknown>) => ({
    cashflow: { periodEnd: new Date("2026-10-10"), receivables: null, payables: null, receivablesOverdue: null, ...cashflow },
    finance: null, wcItems: [], capacity: null, compliance: [], proofs: [], workload: null, standingCount: 0,
    business: { businessType: "laundry", location: null, currency: "INR" }, learningCount: 0, confirmedIntakeDomains: [], reputation: null,
  }) as never;

  it("cash in hand 0 with bank NOT recorded: no 'cash is 0' number and no cash_negative flag from either path", () => {
    const r = rows({ cashInHand: 0, bankBalance: null });
    const ctx = deriveOwnerContext(r, { now: NOW });
    expect((ctx.numbers as Record<string, unknown>).cash).toBeUndefined();
    const st = buildProvidersFromRows(r, { now: NOW } as never).finance_cash!();
    expect(st.riskFlags ?? []).not.toContain("cash_negative");
    expect(String(st.summary)).not.toMatch(/cash=0\b/);
  });

  it("both recorded: the total is used and a real zero still flags", () => {
    const ok = deriveOwnerContext(rows({ cashInHand: 10000, bankBalance: 120000 }), { now: NOW });
    expect((ok.numbers as Record<string, unknown>).cash).toBe(130000);
    const zero = buildProvidersFromRows(rows({ cashInHand: 0, bankBalance: 0 }), { now: NOW } as never).finance_cash!();
    expect(zero.riskFlags ?? []).toContain("cash_negative");
  });
});
