/**
 * A1 — the ONE liquidity contract (domain/owner-finance/liquidity.ts).
 * Total liquid funds = cash in hand + bank balance, a fact only when BOTH are known. A known 0 is a fact;
 * an absent value is unknown and never becomes 0. Runway and days-of-costs share this one basis.
 */
import { describe, it, expect } from "vitest";
import { diagnoseFinanceSnapshot } from "@/domain/owner-finance/diagnosis";
import { computeFinancialMetrics } from "@/domain/owner-finance/metrics";
import {
  BANK_BALANCE_FRESHNESS_DAYS,
  PHYSICAL_CASH_SEMANTICS_EFFECTIVE_FROM,
  cashSemanticsForSnapshot,
  resolveLiquidity,
  selectUsableBankBalance,
} from "@/domain/owner-finance/liquidity";
import { classifyOwnerFindingCode } from "@/domain/owner-spine/owner-decision";
import { assessQuickEntry } from "@/domain/owner-finance/quick-entry";
import { missingCriticalFinanceInputs } from "@/domain/owner-finance/data-confidence";
import type { FinancialSnapshotInput } from "@/domain/owner-finance/types";

const NOW = new Date("2026-10-20T00:00:00Z");
const base = { periodStart: "2026-10-01", periodEnd: "2026-10-31", currency: "INR" } as const;
// Case A audit repro: revenue 100000, fixed costs 130000 (a 30000/month loss).
const lossMaking = (extra: Partial<FinancialSnapshotInput>): FinancialSnapshotInput => ({
  ...base, revenue: 100000, fixedCosts: 130000, ...extra,
});
const codes = (i: FinancialSnapshotInput) => diagnoseFinanceSnapshot(i, { now: NOW }).findings.map((f) => f.code);
const metrics = (i: FinancialSnapshotInput) => computeFinancialMetrics(i, { now: NOW });

describe("A1 liquidity contract — owner scenarios", () => {
  it("A (audit repro): loss-making, cash in hand 0, bank NOT known → no insolvency verdict, asks for the bank balance", () => {
    const i = lossMaking({ cashOnHand: 0 });
    const m = metrics(i);
    expect(m.liquidityStatus).toBe("BANK_UNKNOWN");
    expect(m.totalLiquidFunds).toBeNull();
    expect(m.cashRunwayDays).toBeNull();
    expect(m.cashDaysOfCosts).toBeNull();
    expect(m.survivalState).not.toBe("INSOLVENT_RISK");
    const c = codes(i);
    expect(c).not.toContain("FIN_INSOLVENT_RUNWAY");
    expect(c).not.toContain("FIN_LOW_RUNWAY");
    expect(c).not.toContain("FIN_LOW_ABSOLUTE_CASH");
    expect(c).toContain("FIN_LIQUIDITY_UNCONFIRMED");
  });

  it("B (true zero): cash in hand 0 AND bank 0 → genuinely insolvent, the warning still fires", () => {
    const i = lossMaking({ cashOnHand: 0, bankBalance: 0 });
    const m = metrics(i);
    expect(m.liquidityStatus).toBe("COMPLETE");
    expect(m.totalLiquidFunds).toBe(0);
    expect(m.survivalState).toBe("INSOLVENT_RISK");
    expect(codes(i)).toContain("FIN_INSOLVENT_RUNWAY");
    expect(codes(i)).not.toContain("FIN_LIQUIDITY_UNCONFIRMED");
  });

  it("C: cash in hand 10000 + bank 120000 → 130000 counted exactly once, runway on 130000", () => {
    const i = lossMaking({ cashOnHand: 10000, bankBalance: 120000 });
    const m = metrics(i);
    expect(m.totalLiquidFunds).toBe(130000);
    // 30000 monthly loss over a 31-day period → 130000 / (30000/31) ≈ 134 days: not a survival warning.
    expect(m.cashRunwayDays).toBeCloseTo((130000 / 30000) * 31, 1);
    expect(m.survivalState).not.toBe("INSOLVENT_RISK");
    expect(codes(i)).not.toContain("FIN_INSOLVENT_RUNWAY");
  });

  it("C2: runway and days-of-costs use the SAME liquid-funds basis", () => {
    const i = lossMaking({ cashOnHand: 10000, bankBalance: 120000 });
    const m = metrics(i);
    expect(m.totalLiquidFunds).toBe(130000);
    expect(m.cashDaysOfCosts).toBeCloseTo((130000 / 130000) * 31, 5);
  });

  it("D (bank-only owner): cash in hand 0 + bank 120000 → liquid funds 120000, no false insolvency", () => {
    const i = lossMaking({ cashOnHand: 0, bankBalance: 120000 });
    expect(metrics(i).totalLiquidFunds).toBe(120000);
    expect(metrics(i).survivalState).not.toBe("INSOLVENT_RISK");
    expect(codes(i)).not.toContain("FIN_INSOLVENT_RUNWAY");
  });

  it("E: unknown bank never becomes 0 — absent, null and non-finite all abstain", () => {
    for (const bank of [undefined, null as unknown as undefined, Number.NaN]) {
      const p = resolveLiquidity({ cashOnHand: 5000, bankBalance: bank });
      expect(p.status).toBe("BANK_UNKNOWN");
      expect(p.totalLiquidFunds).toBeNull();
    }
    expect(resolveLiquidity({ cashOnHand: undefined, bankBalance: undefined }).status).toBe("UNKNOWN");
    expect(resolveLiquidity({ cashOnHand: undefined, bankBalance: 7 }).status).toBe("PHYSICAL_UNKNOWN");
    expect(resolveLiquidity({ cashOnHand: undefined, bankBalance: 7 }).totalLiquidFunds).toBeNull();
  });

  it("F: a stale bank balance (older than the window) is rejected, not used and not zeroed", () => {
    const stale = { bankBalance: 500000, periodEnd: "2026-08-01" };
    expect(selectUsableBankBalance({ financePeriodEnd: "2026-10-31", cashflow: stale })).toBeUndefined();
    const edge = { bankBalance: 500000, periodEnd: new Date(new Date("2026-10-31").getTime() - BANK_BALANCE_FRESHNESS_DAYS * 86_400_000) };
    expect(selectUsableBankBalance({ financePeriodEnd: "2026-10-31", cashflow: edge })).toBe(500000);
    const justOver = { bankBalance: 500000, periodEnd: new Date(new Date("2026-10-31").getTime() - (BANK_BALANCE_FRESHNESS_DAYS + 1) * 86_400_000) };
    expect(selectUsableBankBalance({ financePeriodEnd: "2026-10-31", cashflow: justOver })).toBeUndefined();
  });

  it("G: a bank balance dated AFTER the Finance period is rejected (future evidence never alters a past diagnosis)", () => {
    expect(selectUsableBankBalance({ financePeriodEnd: "2026-10-31", cashflow: { bankBalance: 90000, periodEnd: "2026-11-30" } })).toBeUndefined();
    expect(selectUsableBankBalance({ financePeriodEnd: "2026-10-31", cashflow: { bankBalance: 90000, periodEnd: "2026-10-31" } })).toBe(90000);
    expect(selectUsableBankBalance({ financePeriodEnd: "2026-10-31", cashflow: { bankBalance: null, periodEnd: "2026-10-31" } })).toBeUndefined();
    expect(selectUsableBankBalance({ financePeriodEnd: "2026-10-31", cashflow: null })).toBeUndefined();
    expect(selectUsableBankBalance({ financePeriodEnd: "2026-10-31", cashflow: { bankBalance: 1, periodEnd: "not-a-date" } })).toBeUndefined();
  });

  it("H: a profitable business has no runway to compute (N/A), whatever the liquidity", () => {
    const profitable: FinancialSnapshotInput = { ...base, revenue: 200000, fixedCosts: 100000, cashOnHand: 0 };
    expect(metrics(profitable).cashRunwayDays).toBeNull();
    expect(metrics({ ...profitable, bankBalance: 0 }).cashRunwayDays).toBeNull();
    expect(metrics({ ...profitable, bankBalance: 0 }).survivalState).not.toBe("INSOLVENT_RISK");
  });

  it("I: a pre-#586 snapshot may already hold cash AND bank in cashOnHand — bank is never added on top", () => {
    expect(cashSemanticsForSnapshot("2026-09-30T00:00:00Z")).toBe("LEGACY_AMBIGUOUS");
    expect(cashSemanticsForSnapshot(PHYSICAL_CASH_SEMANTICS_EFFECTIVE_FROM)).toBe("PHYSICAL_ONLY");
    expect(cashSemanticsForSnapshot(undefined)).toBe("LEGACY_AMBIGUOUS");
    expect(cashSemanticsForSnapshot("garbage")).toBe("LEGACY_AMBIGUOUS");
    const legacy = lossMaking({ cashOnHand: 130000, bankBalance: 120000, cashSemantics: "LEGACY_AMBIGUOUS" });
    const p = resolveLiquidity(legacy);
    expect(p.totalLiquidFunds).toBe(130000); // not 250000
    expect(p.bankCash).toBeNull();
    expect(metrics(legacy).cashDaysOfCosts).toBeCloseTo(31, 5);
    // And legacy cash 0 without a bank is still a known 0 as entered (no bank question is asked of it).
    expect(resolveLiquidity({ cashOnHand: 0, cashSemantics: "LEGACY_AMBIGUOUS" }).status).toBe("COMPLETE");
  });

  it("J: Quick input — cash in hand 0 is valid input, first read does not require a bank balance", () => {
    expect(missingCriticalFinanceInputs({ revenue: 100000, fixedCosts: 130000, cashOnHand: 0 })).toEqual([]);
    const a = assessQuickEntry({ revenue: "100000", fixedCosts: "130000", cashOnHand: "0" });
    expect(a.sufficiency?.sufficient).toBe(true);
  });

  it("L: Owner Decision — an unknown bank is an evidence request, never a survival main target", () => {
    expect(classifyOwnerFindingCode("FIN_LIQUIDITY_UNCONFIRMED")).not.toBe("SURVIVAL_CASH");
    const i = lossMaking({ cashOnHand: 0 });
    for (const f of diagnoseFinanceSnapshot(i, { now: NOW }).findings) {
      expect(classifyOwnerFindingCode(f.code)).not.toBe("SURVIVAL_CASH");
    }
  });

  it("genuine warnings still fire once liquidity is complete: short runway, negative margin, low cover", () => {
    const short = lossMaking({ cashOnHand: 5000, bankBalance: 15000 }); // 20000 / 30000 per month ≈ 20.7 days
    expect(metrics(short).cashRunwayDays).toBeLessThan(30);
    expect(codes(short)).toContain("FIN_LOW_RUNWAY");
    const profitableThin: FinancialSnapshotInput = { ...base, revenue: 200000, fixedCosts: 150000, cashOnHand: 1000, bankBalance: 1000 };
    expect(codes(profitableThin)).toContain("FIN_LOW_ABSOLUTE_CASH");
  });
});
