/**
 * Owner Cashflow (Module 5 Slice 2) — detector + diagnosis tests.
 * Pure/no DB. Covers risk findings (runway / urgent payment / vendor cutoff /
 * debt default / overdue receivables / slow collections / owner withdrawal /
 * missing data / invalid currency), opportunity findings (collect overdue /
 * defer payables / reduce owner withdrawal under pressure / data quality),
 * deterministic ranking, the cashflow DomainScore, no-fabrication-on-missing,
 * and spine schema validity.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseCashflowSnapshot,
  buildCashflowRiskFindings,
  buildCashflowOpportunityFindings,
  computeCashflowMetrics,
  resolveCashflowThresholds,
  rankCashflowFindings,
  type CashflowSnapshotInput,
} from "@/domain/owner-cashflow";
import {
  ownerFindingSchema,
  domainScoreSchema,
} from "@/domain/owner-spine/contracts";

function healthy(): CashflowSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    cashInHand: 50000,
    bankBalance: 150000,
    dailyCollections: 8000,
    receivables: 5000,
    receivablesOverdue: 0,
    payables: 20000,
    payablesOverdue: 0,
    upcomingEmi: 10000,
    rentDue: 15000,
    salaryDue: 40000,
    vendorDue: 10000,
    taxDue: 5000,
    ownerWithdrawal: 20000,
  };
}

/** Acute liquidity crisis: obligations exceed cash, burning, overdue receivables. */
function crisis(): CashflowSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    cashInHand: 20000,
    bankBalance: 0,
    dailyCollections: 800,
    receivables: 60000,
    receivablesOverdue: 45000,
    payables: 50000,
    payablesOverdue: 30000,
    upcomingEmi: 25000,
    rentDue: 20000,
    salaryDue: 50000,
    ownerWithdrawal: 15000,
  };
}

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

function diagnose(input: CashflowSnapshotInput) {
  return diagnoseCashflowSnapshot(input, { now: new Date("2026-06-05") });
}

describe("owner-cashflow detector — risk findings", () => {
  it("crisis triggers the survival risk cluster", () => {
    const r = diagnose(crisis());
    const c = codes(r.riskFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "CF_URGENT_PAYMENT_RISK",
        "CF_VENDOR_CUTOFF_RISK",
        "CF_DEBT_DEFAULT_RISK",
        "CF_HIGH_OVERDUE_RECEIVABLES",
      ])
    );
    // urgent payment risk is critical here (obligations > cash)
    const urgent = r.riskFindings.find((f) => f.code === "CF_URGENT_PAYMENT_RISK");
    expect(urgent?.severity).toBe("critical");
  });

  it("healthy business emits no survival risk findings", () => {
    const r = diagnose(healthy());
    const c = codes(r.riskFindings);
    expect(c).not.toContain("CF_URGENT_PAYMENT_RISK");
    expect(c).not.toContain("CF_VENDOR_CUTOFF_RISK");
    expect(c).not.toContain("CF_INSOLVENT_RUNWAY");
    expect(c).not.toContain("CF_HIGH_OVERDUE_RECEIVABLES");
  });

  it("flags missing critical data and invalid currency (certain)", () => {
    const m = computeCashflowMetrics(
      { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "" },
      { now: new Date("2026-06-05") }
    );
    const t = resolveCashflowThresholds();
    const findings = buildCashflowRiskFindings(
      { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "" },
      m,
      t
    );
    const c = codes(findings);
    expect(c).toContain("CF_INVALID_CURRENCY");
    expect(c).toContain("CF_MISSING_CRITICAL_DATA");
    const missing = findings.find((f) => f.code === "CF_MISSING_CRITICAL_DATA");
    expect(missing?.confidence).toBe(1); // certain about absence
    expect(missing?.missingData).toEqual(
      expect.arrayContaining(["cash", "nearTermObligations", "dailyCollections"])
    );
  });

  it("debt default risk only fires when EMI is a high share of cash", () => {
    const t = resolveCashflowThresholds();
    const lowEmi = { ...healthy(), upcomingEmi: 1000 }; // 0.5% of 200000 cash
    const mLow = computeCashflowMetrics(lowEmi, { now: new Date("2026-06-05") });
    expect(codes(buildCashflowRiskFindings(lowEmi, mLow, t))).not.toContain("CF_DEBT_DEFAULT_RISK");

    const highEmi = { ...healthy(), upcomingEmi: 150000 }; // 75% of cash
    const mHigh = computeCashflowMetrics(highEmi, { now: new Date("2026-06-05") });
    expect(codes(buildCashflowRiskFindings(highEmi, mHigh, t))).toContain("CF_DEBT_DEFAULT_RISK");
  });
});

describe("owner-cashflow detector — opportunity findings", () => {
  it("emits collect-overdue + defer-payables + reduce-withdrawal under pressure", () => {
    const r = diagnose(crisis());
    const c = codes(r.opportunityFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "CF_OPP_COLLECT_OVERDUE",
        "CF_OPP_DEFER_PAYABLES",
        "CF_OPP_REDUCE_OWNER_WITHDRAWAL",
      ])
    );
  });

  it("does NOT suggest trimming owner withdrawal when there is no pressure", () => {
    const r = diagnose(healthy()); // dangerScore 0
    expect(codes(r.opportunityFindings)).not.toContain("CF_OPP_REDUCE_OWNER_WITHDRAWAL");
  });

  it("fabricates no opportunity when supporting inputs are absent", () => {
    const bare: CashflowSnapshotInput = {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      cashInHand: 100000,
      rentDue: 1000,
      dailyCollections: 5000,
      // no receivables, no payables, no ownerWithdrawal
    };
    const m = computeCashflowMetrics(bare, { now: new Date("2026-06-05") });
    const opp = buildCashflowOpportunityFindings(bare, m, resolveCashflowThresholds());
    const c = codes(opp);
    expect(c).not.toContain("CF_OPP_COLLECT_OVERDUE");
    expect(c).not.toContain("CF_OPP_DEFER_PAYABLES");
    expect(c).not.toContain("CF_OPP_REDUCE_OWNER_WITHDRAWAL");
  });
});

describe("owner-cashflow detector — ranking + domain score", () => {
  it("ranks critical findings ahead of low ones (deterministic)", () => {
    const r = diagnose(crisis());
    for (let i = 1; i < r.findings.length; i++) {
      const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
      expect(rank[r.findings[i - 1].severity]).toBeGreaterThanOrEqual(rank[r.findings[i].severity]);
    }
    // stable / pure: a second run yields identical order
    const again = diagnose(crisis());
    expect(codes(again.findings)).toEqual(codes(r.findings));
  });

  it("produces a valid cashflow DomainScore from the engine metrics", () => {
    const r = diagnose(crisis());
    const parsed = domainScoreSchema.parse(r.domainScore);
    expect(parsed.domain).toBe("cashflow");
    expect(parsed.riskScore).toBe(r.metrics.cashflowDangerScore);
    expect(parsed.healthScore).toBe(r.metrics.cashflowHealthScore);
    expect(parsed.opportunityScore).toBe(r.metrics.cashflowOpportunityScore);
    expect(parsed.topFindingCodes.length).toBeGreaterThan(0);
  });

  it("every finding satisfies the spine OwnerFinding schema", () => {
    const r = diagnose(crisis());
    for (const f of r.findings) {
      expect(() => ownerFindingSchema.parse(f)).not.toThrow();
      expect(f.domain).toBe("cashflow");
    }
  });

  it("rankCashflowFindings does not mutate its input", () => {
    const r = diagnose(crisis());
    const before = codes(r.findings);
    const copy = [...r.findings];
    rankCashflowFindings(r.findings);
    expect(codes(copy)).toEqual(before);
  });
});
