/**
 * P1-4 — Cashflow complete-cash-position truth. Total cash is a fact ONLY when BOTH cash in hand and the bank balance
 * are known (a known 0 is known; missing / null / non-finite is unknown). Unknown is not zero, not safe, not dangerous:
 * every total-cash metric abstains, the cash gap is named as missing evidence, the state is never SAFE, health never
 * exceeds the neutral basis, and no danger is invented. The REAL Cashflow engine throughout; same primitive as Portfolio.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  computeCashflowMetrics,
  totalCash,
  cashflowHealthScore,
  cashflowDangerScore,
  cashflowOpportunityScore,
  resolveCashflowThresholds,
  type CashflowSnapshotInput,
} from "@/domain/owner-cashflow";
import { diagnoseCashflowSnapshot } from "@/domain/owner-cashflow/diagnosis";
import { calculateDataConfidence, missingCriticalCashflowInputs } from "@/domain/owner-cashflow/data-confidence";
import { cashflowTotalCash, cashflowCashPositionMissingComponents } from "@/domain/owner-finance/liquidity";
import { assessSurvivalEvidence } from "@/domain/owner-spine/survival-evidence";

const NOW = new Date("2026-06-05");
const T = resolveCashflowThresholds();
/** A burning business (obligations 120000 over 31 days vs collections 3000/day), cash position supplied per case. */
const base: CashflowSnapshotInput = {
  periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
  dailyCollections: 3000, receivables: 5000, receivablesOverdue: 0, payables: 20000, payablesOverdue: 0,
  upcomingEmi: 10000, rentDue: 30000, salaryDue: 60000, vendorDue: 20000, taxDue: 0, ownerWithdrawal: 0,
};
const healthy: CashflowSnapshotInput = {
  periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", businessModel: "service",
  cashInHand: 50000, bankBalance: 150000, dailyCollections: 8000, receivables: 5000, receivablesOverdue: 0,
  payables: 20000, payablesOverdue: 0, upcomingEmi: 10000, rentDue: 15000, salaryDue: 40000, vendorDue: 10000, taxDue: 5000, ownerWithdrawal: 20000,
};
const withCash = (o: Partial<CashflowSnapshotInput>, from: CashflowSnapshotInput = base): CashflowSnapshotInput => ({ ...from, ...o });
const run = (i: CashflowSnapshotInput) => computeCashflowMetrics(i, { now: NOW });
const codesOf = (i: CashflowSnapshotInput) => diagnoseCashflowSnapshot(i, { now: NOW }).findings.map((f) => f.code);
const CASH_FINDINGS = ["CF_INSOLVENT_RUNWAY", "CF_LOW_RUNWAY", "CF_URGENT_PAYMENT_RISK", "CF_VENDOR_CUTOFF_RISK", "CF_DEBT_DEFAULT_RISK", "CF_OWNER_WITHDRAWAL_PRESSURE"];
const TOTAL_CASH_METRICS = ["cashRunwayDays", "payablesPressurePct", "urgentPaymentRiskPct", "ownerWithdrawalPressurePct"] as const;

describe("A–D, G — partial positions are unknown, never a partial sum", () => {
  const partials: Array<[string, Partial<CashflowSnapshotInput>]> = [
    ["A cash 0 + bank missing", { cashInHand: 0 }],
    ["B cash missing + bank 0", { bankBalance: 0 }],
    ["C cash 100000 + bank missing", { cashInHand: 100000 }],
    ["D cash missing + bank 100000", { bankBalance: 100000 }],
    ["G cash NaN + bank 50000", { cashInHand: Number.NaN, bankBalance: 50000 }],
    ["G cash 50000 + bank Infinity", { cashInHand: 50000, bankBalance: Number.POSITIVE_INFINITY }],
    ["both missing", {}],
  ];
  it.each(partials)("%s → total unknown, every total-cash metric abstains, no cash-derived finding, no insolvency", (_n, o) => {
    const i = withCash({ ...o, ownerWithdrawal: 20000 });
    const m = run(i);
    expect(m.totalCash).toBeNull();
    for (const k of TOTAL_CASH_METRICS) expect(m[k], k).toBeNull();
    expect(m.cashflowState).not.toBe("INSOLVENT_RISK");
    expect(m.cashflowState).not.toBe("CRITICAL");
    const codes = codesOf(i);
    for (const c of CASH_FINDINGS) expect(codes, c).not.toContain(c);
    expect(codes).toContain("CF_MISSING_CRITICAL_DATA");
  });
});

describe("E, F — complete positions", () => {
  it("E: cash 0 + bank 0 is a REAL measured zero; with real burn it legitimately reaches insolvency risk", () => {
    const m = run(withCash({ cashInHand: 0, bankBalance: 0 }));
    expect(m.totalCash).toBe(0);
    expect(m.cashRunwayDays).toBe(0);
    expect(m.cashflowState).toBe("INSOLVENT_RISK");
    expect(codesOf(withCash({ cashInHand: 0, bankBalance: 0 }))).not.toContain("CF_MISSING_CRITICAL_DATA");
  });
  it("F: 50000 + 150000 = 200000 exactly; 100 + 0 and 0 + 100 are 100", () => {
    expect(run(healthy).totalCash).toBe(200000);
    expect(totalCash(withCash({ cashInHand: 100, bankBalance: 0 }))).toBe(100);
    expect(totalCash(withCash({ cashInHand: 0, bankBalance: 100 }))).toBe(100);
  });
});

describe("H–L — state, danger, health, opportunity", () => {
  it("H: partial position + high overdue receivables → no cash danger, genuine overdue risk still AT_RISK", () => {
    const i = withCash({ cashInHand: 0, receivables: 100000, receivablesOverdue: 80000, upcomingEmi: undefined, rentDue: 1000, salaryDue: undefined, vendorDue: undefined, payables: undefined, dailyCollections: 100000 });
    const m = run(i);
    expect(m.totalCash).toBeNull();
    expect(m.overdueReceivablesPct).toBe(80);
    expect(m.cashflowState).toBe("AT_RISK");
    expect(m.cashflowDangerScore).toBe(10); // the overdue contribution only; nothing cash-derived
    expect(m.cashflowOpportunityScore).toBe(40); // independent overdue evidence kept; payables/withdrawal parts abstain
    expect(m.cashflowHealthScore).toBeLessThanOrEqual(50);
  });
  it("I: partial position with otherwise healthy facts → WATCH, never SAFE", () => {
    expect(run(withCash({ bankBalance: undefined }, healthy)).cashflowState).toBe("WATCH");
    expect(run(withCash({ cashInHand: undefined }, healthy)).cashflowState).toBe("WATCH");
  });
  it("J/Y: complete healthy position → SAFE, unchanged", () => {
    const m = run(healthy);
    expect(m.cashflowState).toBe("SAFE");
    expect(m.cashflowHealthScore).toBeGreaterThan(50);
  });
  it("K: unknown cash never leaves health above the neutral basis; a complete position may exceed it", () => {
    expect(cashflowHealthScore(withCash({ bankBalance: undefined }, healthy), T)).toBeLessThanOrEqual(50);
    expect(cashflowHealthScore(withCash({ cashInHand: undefined, bankBalance: undefined }, healthy), T)).toBeLessThanOrEqual(50);
    expect(cashflowHealthScore(healthy, T)).toBeGreaterThan(50);
  });
  it("L: missing evidence is not danger — danger of a healthy partial position equals 0, same as the complete one", () => {
    expect(cashflowDangerScore(withCash({ bankBalance: undefined }, healthy), T)).toBe(0);
    expect(cashflowDangerScore(healthy, T)).toBe(0);
  });
  it("opportunity: payables / owner-withdrawal parts abstain when cash is unknown, and return when it is known", () => {
    const heavy = withCash({ payables: 90000, ownerWithdrawal: 90000 }, healthy);
    expect(cashflowOpportunityScore(withCash({ bankBalance: undefined }, heavy))).toBe(0);
    expect(cashflowOpportunityScore(heavy)).toBeGreaterThan(0);
  });
});

describe("N, O–S — findings and missing-data identity", () => {
  it("N: partial position + a large upcoming EMI emits no debt-default pressure", () => {
    expect(codesOf(withCash({ cashInHand: 1000, upcomingEmi: 500000 }))).not.toContain("CF_DEBT_DEFAULT_RISK");
    expect(codesOf(withCash({ cashInHand: 1000, bankBalance: 0, upcomingEmi: 500000 }))).toContain("CF_DEBT_DEFAULT_RISK"); // complete → still fires
  });
  it("P/Q/R: the exact missing component is named; both missing names both; one critical requirement either way", () => {
    expect(missingCriticalCashflowInputs(withCash({ cashInHand: 0 }))).toEqual(["bankBalance"]);
    expect(missingCriticalCashflowInputs(withCash({ bankBalance: 0 }))).toEqual(["cashInHand"]);
    expect(missingCriticalCashflowInputs(withCash({}))).toEqual(["cashInHand", "bankBalance"]);
  });
  it("S: known zeros are present, never listed as missing", () => {
    expect(missingCriticalCashflowInputs(withCash({ cashInHand: 0, bankBalance: 0 }))).toEqual([]);
  });
  it("the evidence request says which component is unknown and never claims zero cash / insolvency / unsafe", () => {
    const f = diagnoseCashflowSnapshot(withCash({ cashInHand: 0 }), { now: NOW }).findings.find((x) => x.code === "CF_MISSING_CRITICAL_DATA")!;
    const text = [f.title, f.summary, ...f.evidence].join(" ");
    expect(text).toMatch(/bank balance not recorded/);
    expect(text).toMatch(/total cash is not established/);
    expect(text).not.toMatch(/insolven|unsafe|zero cash|runs out/i);
    expect(f.missingData).toEqual(["bankBalance"]);
  });
  it("the cash gap is ONE critical requirement for the confidence penalty (not double-counted)", () => {
    const one = calculateDataConfidence(withCash({ cashInHand: 0 }), { now: NOW }).dataConfidenceScore;
    const both = calculateDataConfidence(withCash({}), { now: NOW }).dataConfidenceScore;
    const complete = calculateDataConfidence(withCash({ cashInHand: 0, bankBalance: 0 }), { now: NOW }).dataConfidenceScore;
    expect(complete - one).toBe(30);
    expect(one).toBe(both);
  });
});

describe("T, U — one truth across snapshot, diagnosis, metrics, Portfolio", () => {
  const grid = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 0, 1, 100000];
  it("T: snapshot-time missingCritical (calculateDataConfidence) equals the diagnosis's missingCriticalData for every position", () => {
    for (const a of grid) for (const b of grid) {
      const i = withCash({ cashInHand: a as never, bankBalance: b as never });
      expect(calculateDataConfidence(i, { now: NOW }).missingCritical).toEqual(diagnoseCashflowSnapshot(i, { now: NOW }).missingCriticalData);
    }
  });
  it("one primitive: engine total cash, canonical total cash, missing-components, and Portfolio's incomplete flag all agree for every position", () => {
    for (const a of grid) for (const b of grid) {
      const row = { cashInHand: a as never, bankBalance: b as never };
      const i = withCash(row);
      const known = totalCash(i) !== null;
      expect(known).toBe(cashflowTotalCash(row) !== null);
      expect(known).toBe(cashflowCashPositionMissingComponents(row).length === 0);
      expect(missingCriticalCashflowInputs(i).some((k) => k === "cashInHand" || k === "bankBalance")).toBe(!known);
      // U: Portfolio's survival-evidence assessment flags exactly the positions the engine cannot total.
      expect(assessSurvivalEvidence({ domainsPresent: ["cashflow"], staleDomains: [], financeLiquidityUnconfirmed: false, cashflowPosition: row }).cashflowPositionIncomplete).toBe(!known);
    }
  });
});

describe("X, Z — nothing else moved", () => {
  it("X: a complete cash-crisis fixture still produces the legitimate survival state and findings", () => {
    const i = withCash({ cashInHand: 5000, bankBalance: 0, dailyCollections: 500, rentDue: 20000, salaryDue: 50000, upcomingEmi: undefined, vendorDue: undefined, payables: undefined });
    const m = run(i);
    expect(m.cashflowState).toBe("INSOLVENT_RISK");
    expect(m.totalCash).toBe(5000);
    expect(codesOf(i)).toContain("CF_URGENT_PAYMENT_RISK");
  });
  it("Z: the engine does not mutate its input", () => {
    const i = withCash({ cashInHand: 0 });
    const before = JSON.stringify(i);
    run(i); diagnoseCashflowSnapshot(i, { now: NOW }); calculateDataConfidence(i, { now: NOW });
    expect(JSON.stringify(i)).toBe(before);
  });
});

describe("recurrence protection", () => {
  const root = path.resolve(__dirname, "../..");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const dir = path.join(root, "domain/owner-cashflow");
  it("the Cashflow engine's totalCash IS the canonical strict primitive and nothing in the module sums cash components", () => {
    const m = strip(fs.readFileSync(path.join(dir, "metrics.ts"), "utf8"));
    expect(m).toMatch(/cashflowTotalCash\(input\)/);
    expect(m).not.toMatch(/sumPresent\(\s*input\.cashInHand/);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(5); // the scan must actually scan
    for (const f of files) {
      const src = strip(fs.readFileSync(path.join(dir, f), "utf8"));
      expect(src, f).not.toMatch(/cashInHand\s*(\+|\?\?|\|\|)|(\+|\?\?|\|\|)\s*[\w.]*bankBalance|bankBalance\s*(\+|\?\?|\|\|)/);
    }
  });
  it("the missing-data contract uses the shared completeness helper and cannot treat cash-in-hand OR bank as complete", () => {
    const d = strip(fs.readFileSync(path.join(dir, "data-confidence.ts"), "utf8"));
    expect(d).toMatch(/cashflowCashPositionMissingComponents\(/);
    expect(d).not.toMatch(/hasCash|present\(input\.cashInHand\)\s*\|\|/);
  });
  it("a missing component cannot reach SAFE and cash-derived findings need a complete total (behavioural over a position grid)", () => {
    const grid = [undefined, 0, 250000];
    for (const a of grid) for (const b of grid) {
      const i = withCash({ cashInHand: a, bankBalance: b }, healthy);
      const complete = a !== undefined && b !== undefined;
      const m = run(i);
      if (!complete) {
        expect(m.cashflowState, `${a}/${b}`).not.toBe("SAFE");
        for (const c of CASH_FINDINGS) expect(codesOf(i)).not.toContain(c);
        expect(m.cashflowHealthScore).toBeLessThanOrEqual(50);
      }
    }
  });
});
