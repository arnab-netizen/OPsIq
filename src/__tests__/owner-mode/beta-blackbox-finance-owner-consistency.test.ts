/**
 * Beta black-box trust remediation — Finance → Owner Decision consistency (deterministic regression).
 *
 * Reproduces the live Chrome scenario: revenue 180000, fixed 110000, variable 60000, cash 40000, no discount
 * amount, INR. Finance measures ~7.3 cash days of costs (< 14), fixed-cost burden ~61.1%, net margin ~5.6%.
 *
 *   D1  Home claimed "no measured runway figure" and asked for the cash position that was just entered.
 *   D2  Unknown discounting became "you are not discounting — a line is likely underpriced".
 *   D3  A generic "Not enough financial data to assess profit" survived a complete Finance snapshot.
 */
import { describe, it, expect } from "vitest";
import { diagnoseFinanceSnapshot } from "@/domain/owner-finance/diagnosis";
import type { FinancialSnapshotInput } from "@/domain/owner-finance/types";
import {
  buildCashProfitProtection, deriveFinanceCashProfitFacts, type CashProfitInput,
} from "@/domain/owner-mode/cash-profit-protection";
import { identifyProfitLeaks, detectProfitLeaks, type ProfitLeakSignals } from "@/domain/owner-mode/profit-leak-radar";
import { getOwnerNowView, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";

const NOW = 1_900_000_000_000;
const DAY = 86_400_000;
const periodEnd = new Date(NOW - 10 * DAY);
const periodStart = new Date(periodEnd.getTime() - 30 * DAY); // 31-day period

const SNAPSHOT_INPUT: FinancialSnapshotInput = {
  periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), currency: "INR",
  revenue: 180000, fixedCosts: 110000, variableCosts: 60000, cashOnHand: 40000,
};
const diagnosis = diagnoseFinanceSnapshot(SNAPSHOT_INPUT, { now: new Date(NOW) });

// The persisted shape of that same diagnosis (what OwnerFinanceCycle/OwnerFinanceFinding hold).
const finRow = {
  survivalState: diagnosis.metrics.survivalState,
  dataConfidenceScore: 80,
  snapshot: {
    periodEnd, supersededById: null,
    revenue: 180000, fixedCosts: 110000, variableCosts: 60000, cashOnHand: 40000,
    costOfGoods: null, rent: null, payroll: null, utilities: null, deliveryCost: null, marketingSpend: null,
  },
  findings: diagnosis.findings.map((f) => ({
    code: f.code, severity: f.severity, sourceMetric: f.sourceMetric, sourceValue: f.sourceValue ?? null, threshold: f.threshold ?? null,
  })),
};

function deps(rows: { cash?: unknown; fin?: unknown; metric?: unknown }): GuidanceDeps {
  return {
    uuid: () => "00000000-0000-0000-0000-000000000001",
    now: () => NOW,
    db: {
      ownerCashflowCycle: { findFirst: async () => rows.cash ?? null },
      ownerFinanceCycle: { findFirst: async () => rows.fin ?? null },
      ownerEmployeeWorkloadSnapshot: { findFirst: async () => null },
      ownerWorkloadSnapshot: { findFirst: async () => null },
      ownerCapacitySnapshot: { findFirst: async () => null },
      ownerMetricSnapshot: { findFirst: async () => rows.metric ?? null },
      ownerSupplierInventorySnapshot: { findFirst: async () => null },
      ownerBusiness: { findFirst: async () => ({ businessType: "generic_smb" }) },
      proof: { count: async () => 0 },
      ownerActionOutcome: { count: async () => 0 },
      ownerReassessmentEvent: { count: async () => 0 },
      ownerGuidanceSnapshot: { findFirst: async () => null, create: async (a: { data: Record<string, unknown> }) => a.data },
    } as never,
  };
}

const cashInput = (over: Partial<CashProfitInput> = {}): CashProfitInput => ({
  cashRunwayDays: null, netMarginPct: null, lowMarginJobCount: 0, pricingLeakCount: 0, discountLeakCount: 0,
  reworkCostEventCount: 0, deliveryCostEventCount: 0, staffInefficiencyCount: 0, b2bUnderpricedCount: 0,
  overdueReceivableCount: 0, hasUnitEconomics: true, financialDataComplete: true,
  supportingProofIds: [], supportingOperationalEventIds: [], supportingFinancialSnapshotIds: [], ...over,
});

describe("black-box scenario premises (the real Finance engine)", () => {
  it("measures ~7.3 cash days of costs, unsafe, with no discount data", () => {
    expect(diagnosis.metrics.cashDaysOfCosts).toBe(7.3);
    expect(["AT_RISK", "CRITICAL", "INSOLVENT_RISK"]).toContain(diagnosis.metrics.survivalState);
    const abs = diagnosis.findings.find((f) => f.sourceMetric === "cashDaysOfCosts");
    expect(abs?.sourceValue).toBe(7.3);
    expect(abs?.threshold).toBe(14);
    expect(SNAPSHOT_INPUT.discountAmount).toBeUndefined();
  });
});

describe("D1 — measured cash exists, Home must not claim it does not", () => {
  it("deriveFinanceCashProfitFacts reads the measured value and never relabels it as runway", () => {
    const facts = deriveFinanceCashProfitFacts({ findings: finRow.findings, snapshot: finRow.snapshot });
    expect(facts.cashDaysOfCosts).toEqual({ days: 7.3, threshold: 14 });
    expect(facts.cashRunwayDays).toBeNull(); // profitable business: no burn-rate runway exists
    expect(facts.cashPositionMeasured).toBe(true);
    expect(facts.missingFinancialFields).toEqual([]);
  });

  it("Case A (domain): risk stays CRITICAL/HIGH class, wording states the measured days-of-costs and what is unknown", () => {
    const facts = deriveFinanceCashProfitFacts({ findings: finRow.findings, snapshot: finRow.snapshot });
    const a = buildCashProfitProtection(cashInput({ cashRunwayState: "AT_RISK", financeCashDaysOfCosts: facts.cashDaysOfCosts }), "ws1", "2026-09-29T00:00:00Z");
    const sig = a.signals.find((s) => s.signalType === "CASH_SAFETY_RISK")!;
    expect(sig.severity).toBe("HIGH");
    expect(sig.metricType).toBe("CASH_DAYS_OF_COSTS"); // not relabelled as CASH_RUNWAY_DAYS
    expect(sig.metricValue).toBe(7.3);
    expect(sig.metricThreshold).toBe(14);
    expect(sig.missingData).toEqual([]);
    expect(sig.ownerExplanation).not.toMatch(/no measured runway/i);
    expect(sig.ownerExplanation).toMatch(/7\.3 days of total costs/);
    expect(sig.ownerExplanation).toMatch(/not a burn-rate runway/);
  });

  it("without a measured Finance value the honest qualitative wording is kept (no fabricated figure)", () => {
    const a = buildCashProfitProtection(cashInput({ cashRunwayState: "AT_RISK" }), "ws1", "2026-09-29T00:00:00Z");
    const sig = a.signals.find((s) => s.signalType === "CASH_SAFETY_RISK")!;
    expect(sig.metricValue).toBeNull();
    expect(sig.ownerExplanation).toMatch(/no measured runway figure/);
  });

  it("a measured value alone never raises or clears a risk (arbitrated state stays the decider)", () => {
    const a = buildCashProfitProtection(cashInput({ cashRunwayState: "SAFE", financeCashDaysOfCosts: { days: 7.3, threshold: 14 } }), "ws1", "2026-09-29T00:00:00Z");
    expect(a.signals.some((s) => s.signalType === "CASH_SAFETY_RISK")).toBe(false);
  });

  it("Case A (Home service): Finance-only owner — measured cash is used and the cash position is not requested again", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({ fin: finRow }));
    const cash = out.cashProfitProtection!.signals.find((s) => s.signalType === "CASH_SAFETY_RISK")!;
    expect(cash).toBeTruthy(); // cash survival is still raised
    expect(["HIGH", "CRITICAL"]).toContain(cash.severity);
    expect(cash.metricValue).toBe(7.3);
    expect(cash.ownerExplanation).not.toMatch(/no measured runway/i);
    expect(out.view.missingDataRequests.join(" | ")).not.toMatch(/cash position/i);
    // what remains unknown is named specifically: the Cash flow check's obligations/inflows, not cash on hand
    expect(out.view.missingDataRequests.join(" | ")).toMatch(/cash obligations and expected inflows/);
    expect(out.view.missingDataRequests.join(" | ")).toMatch(/cash on hand is already measured/);
  });

  it("without any Finance snapshot the cash position is still requested (no false measurement)", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({}));
    expect(out.view.missingDataRequests.join(" | ")).toMatch(/cash position/i);
  });

  it("a Finance snapshot with no cash figure still requests the cash position", async () => {
    const noCash = { ...finRow, snapshot: { ...finRow.snapshot, cashOnHand: null } };
    const out = await getOwnerNowView("ws1", "biz1", deps({ fin: noCash }));
    expect(out.view.missingDataRequests.join(" | ")).toMatch(/cash position/i);
  });

  it("a Finance reading that is NOT current contributes no measured figure (stale/amended readings are never current truth)", async () => {
    const stale = { ...finRow, snapshot: { ...finRow.snapshot, periodEnd: new Date(NOW - 400 * DAY) } };
    const out = await getOwnerNowView("ws1", "biz1", deps({ fin: stale }));
    const cash = out.cashProfitProtection?.signals.find((s) => s.signalType === "CASH_SAFETY_RISK");
    expect(cash?.metricValue ?? null).toBeNull();
    const amended = { ...finRow, snapshot: { ...finRow.snapshot, supersededById: "00000000-0000-0000-0000-0000000000aa" } };
    const out2 = await getOwnerNowView("ws1", "biz1", deps({ fin: amended }));
    expect(out2.cashProfitProtection?.signals.find((s) => s.signalType === "CASH_SAFETY_RISK")?.metricValue ?? null).toBeNull();
  });
});

describe("D2 — unknown discounting is not zero discounting", () => {
  const thin = (over: Partial<ProfitLeakSignals> = {}): ProfitLeakSignals =>
    ({ workspaceId: "ws1", marginSafe: false, evaluatedAt: "2026-09-29T00:00:00Z", ...over });
  const text = (a: ReturnType<typeof identifyProfitLeaks>) => JSON.stringify(a.leaks);

  it("Case B: margin below threshold + discount UNKNOWN never says 'not discounting' and raises no underpricing claim", () => {
    const a = identifyProfitLeaks(thin({ discountAmount: null }));
    expect(text(a)).not.toMatch(/not discounting/i);
    expect(text(a)).not.toMatch(/no discount signal/i);
    expect(a.leaks.some((l) => l.leakType === "PRICING_UNDERCHARGE")).toBe(false);
    const top = a.topLeak!;
    expect(top.leakType).toBe("DATA_INSUFFICIENT");
    expect(top.missingData.join(" ")).toMatch(/discount amount/);
    expect(top.missingData.join(" ")).toMatch(/cannot be ruled in or out/);
  });

  it("discount omitted entirely (undefined) is also unknown", () => {
    expect(identifyProfitLeaks(thin()).leaks.some((l) => l.leakType === "PRICING_UNDERCHARGE")).toBe(false);
  });

  it("independent pricing evidence still raises a pricing leak while discounting stays unknown", () => {
    const a = identifyProfitLeaks(thin({ pricingComplaintCount: 2 }));
    const l = a.leaks.filter((x) => x.leakType === "PRICING_UNDERCHARGE");
    expect(l).toHaveLength(1);
    expect(text(a)).not.toMatch(/not discounting/i);
  });

  it("Case D: measured ZERO discounting is distinguishable from unknown and keeps the underpricing finding", () => {
    const a = identifyProfitLeaks(thin({ discountAmount: 0, revenue: 180000 }));
    const l = a.leaks.find((x) => x.leakType === "PRICING_UNDERCHARGE")!;
    expect(l).toBeTruthy();
    expect(l.evidence.join(" ")).toMatch(/measured discounting this period is zero/);
    expect(l.ownerExplanation).toMatch(/no discounting was recorded/);
  });

  it("Case E: measured positive discounting keeps its evidence-backed DISCOUNT_LEAK", () => {
    const a = identifyProfitLeaks(thin({ discountAmount: 30000, revenue: 180000 }));
    const l = a.leaks.find((x) => x.leakType === "DISCOUNT_LEAK")!;
    expect(l).toBeTruthy();
    expect(l.evidence.join(" ")).toMatch(/discounts = 30000/);
    expect(a.leaks.some((x) => x.leakType === "PRICING_UNDERCHARGE")).toBe(false);
    // a flagged discount leak without an amount is preserved too
    expect(identifyProfitLeaks(thin({ discountLeak: true })).leaks.some((x) => x.leakType === "DISCOUNT_LEAK")).toBe(true);
  });

  it("measured small positive discounting is known: underpricing is not blamed on discounts, and it is not called zero", () => {
    const a = identifyProfitLeaks(thin({ discountAmount: 1000, revenue: 180000 }));
    const l = a.leaks.find((x) => x.leakType === "PRICING_UNDERCHARGE")!;
    expect(l.ownerExplanation).not.toMatch(/no discounting was recorded/);
    expect(l.evidence.join(" ")).not.toMatch(/is zero/);
  });

  it("detectProfitLeaks: a measured price deviation counts as a discount reading, an absent one does not", () => {
    const unknown = detectProfitLeaks({ workspaceId: "ws1", revenue: 180000, grossMarginPct: 10 });
    expect(unknown.leaks.some((l) => l.leakType === "PRICING_UNDERCHARGE")).toBe(false);
    const measured = detectProfitLeaks({ workspaceId: "ws1", revenue: 180000, grossMarginPct: 10, priceDeviationPct: 2 });
    expect(measured.leaks.some((l) => l.leakType === "PRICING_UNDERCHARGE")).toBe(true);
  });

  it("Case B (Home service): Finance-only owner with no metric snapshot never sees 'not discounting'", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({ fin: finRow }));
    expect(JSON.stringify(out.topProfitLeak)).not.toMatch(/not discounting/i);
    expect(out.topProfitLeak?.leakType).not.toBe("PRICING_UNDERCHARGE");
  });
});

describe("D3 — a complete current Finance snapshot is not 'not enough financial data'", () => {
  it("Case C (domain): complete Finance data emits no PROFIT_DATA_INSUFFICIENT", () => {
    const a = buildCashProfitProtection(cashInput({ financialDataComplete: true }), "ws1", "2026-09-29T00:00:00Z");
    expect(a.signals.some((s) => s.signalType === "PROFIT_DATA_INSUFFICIENT")).toBe(false);
  });

  it("names the specific missing figure when the current snapshot lacks one", () => {
    const facts = deriveFinanceCashProfitFacts({ findings: [], snapshot: { revenue: null, fixedCosts: 1, cashOnHand: 5 } });
    expect(facts.missingFinancialFields).toEqual(["revenue"]);
    const a = buildCashProfitProtection(cashInput({ financialDataComplete: false, missingFinancialFields: facts.missingFinancialFields }), "ws1", "2026-09-29T00:00:00Z");
    const s = a.signals.find((x) => x.signalType === "PROFIT_DATA_INSUFFICIENT")!;
    expect(s.title).toBe("Profit cannot be assessed without revenue");
    expect(s.missingData).toEqual(["revenue"]);
    expect(s.title).not.toMatch(/not enough financial data/i);
  });

  it("uses Finance's own cost model: itemised costs count, no costs at all is a named gap", () => {
    expect(deriveFinanceCashProfitFacts({ snapshot: { revenue: 10, rent: 3, payroll: 2 } }).missingFinancialFields).toEqual([]);
    expect(deriveFinanceCashProfitFacts({ snapshot: { revenue: 10 } }).missingFinancialFields).toEqual(["cost figures"]);
    expect(deriveFinanceCashProfitFacts({ snapshot: {} }).missingFinancialFields).toEqual(["revenue", "cost figures"]);
  });

  it("Case C (Home service): Finance-only owner gets no generic data-gap action; the cash risk is still raised", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({ fin: finRow }));
    const types = out.cashProfitProtection!.signals.map((s) => s.signalType);
    expect(types).not.toContain("PROFIT_DATA_INSUFFICIENT");
    expect(types).toContain("CASH_SAFETY_RISK");
    const routes = (out.processExecution?.routes ?? []).map((r) => r.taskKey);
    expect(routes.some((k) => k.endsWith(":PROFIT_DATA_INSUFFICIENT"))).toBe(false);
  });

  it("no Finance reading at all keeps the generic data gap (nothing was assessed)", async () => {
    const out = await getOwnerNowView("ws1", "biz1", deps({ cash: { cashflowState: "AT_RISK", dataConfidenceScore: 70, snapshot: { periodEnd } } }));
    expect(out.cashProfitProtection!.signals.some((s) => s.signalType === "PROFIT_DATA_INSUFFICIENT")).toBe(true);
  });

  it("a current Finance snapshot missing revenue names revenue in the Home data gap (service level)", async () => {
    const noRev = { ...finRow, snapshot: { ...finRow.snapshot, revenue: null } };
    const out = await getOwnerNowView("ws1", "biz1", deps({ fin: noRev }));
    const s = out.cashProfitProtection!.signals.find((x) => x.signalType === "PROFIT_DATA_INSUFFICIENT")!;
    expect(s.missingData).toEqual(["revenue"]);
  });
});
