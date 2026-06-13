/**
 * Owner Sales (Module 3 Slice 2) — detector + diagnosis tests.
 * Pure/no DB. Covers risk findings (conversion / follow-up / repeat / churn /
 * complaint / discount / refund / weak B2B pipeline / missing data / invalid
 * currency), opportunity findings (raise conversion / retention / win-back /
 * tighten discount / convert pipeline / data quality), deterministic ranking,
 * the sales DomainScore, no-fabrication-on-missing, and spine schema validity.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseSalesSnapshot,
  buildSalesRiskFindings,
  buildSalesOpportunityFindings,
  computeSalesMetrics,
  resolveSalesThresholds,
  rankSalesFindings,
  type SalesSnapshotInput,
} from "@/domain/owner-sales";
import { ownerFindingSchema, domainScoreSchema } from "@/domain/owner-spine/contracts";

function healthy(): SalesSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    leads: 1000,
    qualifiedLeads: 600,
    orders: 350,
    revenue: 700000,
    newCustomers: 150,
    repeatCustomers: 200,
    lostCustomers: 10,
    complaints: 3,
    discountAmount: 0,
    refundAmount: 0,
    b2bRevenue: 200000,
    b2cRevenue: 500000,
    b2bPipelineValue: 700000,
    staffCount: 5,
  };
}

/** Sales in distress: collapsed conversion + churn + complaints + discounts. */
function distress(): SalesSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    leads: 1000,
    qualifiedLeads: 400,
    orders: 30, // 3% conversion (critical); 30/400 = 7.5% qualified (poor follow-up)
    revenue: 60000,
    newCustomers: 12,
    repeatCustomers: 3, // 3/15 = 20% repeat
    lostCustomers: 25, // 25/40 = 62% lost (critical churn)
    complaints: 6, // 6/30 = 20% complaint ratio
    discountAmount: 18000, // 30% discount dependence
    refundAmount: 6000, // 10% refund rate
    b2bRevenue: 10000,
    b2cRevenue: 50000,
    b2bPipelineValue: 6000, // 10% coverage (weak)
  };
}

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

function diagnose(input: SalesSnapshotInput) {
  return diagnoseSalesSnapshot(input, { now: new Date("2026-06-05") });
}

describe("owner-sales detector — risk findings", () => {
  it("distress triggers the sales risk cluster", () => {
    const r = diagnose(distress());
    const c = codes(r.riskFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "SALES_LOW_CONVERSION",
        "SALES_POOR_FOLLOW_UP",
        "SALES_WEAK_REPEAT",
        "SALES_LOST_CUSTOMER_LEAKAGE",
        "SALES_HIGH_COMPLAINT_RATIO",
        "SALES_DISCOUNT_DEPENDENCE",
        "SALES_HIGH_REFUND_RATE",
        "SALES_WEAK_B2B_PIPELINE",
      ])
    );
    const conv = r.riskFindings.find((f) => f.code === "SALES_LOW_CONVERSION");
    expect(conv?.severity).toBe("critical"); // 3% < critical 5%
  });

  it("healthy business emits no sales risk findings", () => {
    const r = diagnose(healthy());
    const c = codes(r.riskFindings);
    expect(c).not.toContain("SALES_LOW_CONVERSION");
    expect(c).not.toContain("SALES_WEAK_REPEAT");
    expect(c).not.toContain("SALES_LOST_CUSTOMER_LEAKAGE");
    expect(c).not.toContain("SALES_HIGH_COMPLAINT_RATIO");
  });

  it("flags missing critical data and invalid currency (certain)", () => {
    const input: SalesSnapshotInput = { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "" };
    const m = computeSalesMetrics(input, { now: new Date("2026-06-05") });
    const findings = buildSalesRiskFindings(input, m, resolveSalesThresholds());
    const c = codes(findings);
    expect(c).toContain("SALES_INVALID_CURRENCY");
    expect(c).toContain("SALES_MISSING_CRITICAL_DATA");
    const missing = findings.find((f) => f.code === "SALES_MISSING_CRITICAL_DATA");
    expect(missing?.confidence).toBe(1);
    expect(missing?.missingData).toEqual(
      expect.arrayContaining(["orders", "customers", "leadsOrRevenue"])
    );
  });
});

describe("owner-sales detector — opportunity findings", () => {
  it("emits the improvement cluster under distress", () => {
    const r = diagnose(distress());
    const c = codes(r.opportunityFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "SALES_OPP_RAISE_CONVERSION",
        "SALES_OPP_IMPROVE_RETENTION",
        "SALES_OPP_WINBACK",
        "SALES_OPP_TIGHTEN_DISCOUNT",
        "SALES_OPP_CONVERT_PIPELINE",
      ])
    );
  });

  it("fabricates no opportunity when supporting inputs are absent", () => {
    const bare: SalesSnapshotInput = {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      leads: 100,
      orders: 40, // 40% conversion (>= healthy) → no raise-conversion opp
      newCustomers: 40,
      repeatCustomers: 0,
      // no lostCustomers, no discountAmount, no b2bPipelineValue
    };
    const m = computeSalesMetrics(bare, { now: new Date("2026-06-05") });
    const c = codes(buildSalesOpportunityFindings(bare, m, resolveSalesThresholds()));
    expect(c).not.toContain("SALES_OPP_WINBACK");
    expect(c).not.toContain("SALES_OPP_TIGHTEN_DISCOUNT");
    expect(c).not.toContain("SALES_OPP_CONVERT_PIPELINE");
    expect(c).not.toContain("SALES_OPP_RAISE_CONVERSION");
  });
});

describe("owner-sales detector — ranking + domain score", () => {
  it("ranks critical findings ahead of low ones (deterministic + stable)", () => {
    const r = diagnose(distress());
    const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    for (let i = 1; i < r.findings.length; i++) {
      expect(rank[r.findings[i - 1].severity]).toBeGreaterThanOrEqual(rank[r.findings[i].severity]);
    }
    const again = diagnose(distress());
    expect(codes(again.findings)).toEqual(codes(r.findings));
  });

  it("produces a valid sales DomainScore from the engine metrics", () => {
    const r = diagnose(distress());
    const parsed = domainScoreSchema.parse(r.domainScore);
    expect(parsed.domain).toBe("sales");
    expect(parsed.riskScore).toBe(r.metrics.salesRiskScore);
    expect(parsed.healthScore).toBe(r.metrics.salesHealthScore);
    expect(parsed.opportunityScore).toBe(r.metrics.salesOpportunityScore);
    expect(parsed.topFindingCodes.length).toBeGreaterThan(0);
  });

  it("every finding satisfies the spine OwnerFinding schema with domain sales", () => {
    const r = diagnose(distress());
    for (const f of r.findings) {
      expect(() => ownerFindingSchema.parse(f)).not.toThrow();
      expect(f.domain).toBe("sales");
    }
  });

  it("rankSalesFindings does not mutate its input", () => {
    const r = diagnose(distress());
    const before = codes(r.findings);
    const copy = [...r.findings];
    rankSalesFindings(r.findings);
    expect(codes(copy)).toEqual(before);
  });
});
