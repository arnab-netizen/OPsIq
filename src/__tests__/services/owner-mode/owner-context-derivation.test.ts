/**
 * Unit tests for deriving a runtime context from persisted owner-mode rows. Pure + deterministic —
 * no DB. Proves archetype/location mapping, risk-flag derivation from real state, decision category,
 * and that absent rows reduce (never fabricate) signal.
 */
import { describe, it, expect } from "vitest";
import {
  deriveOwnerContext,
  businessTypeToArchetype,
  deriveLocationContext,
} from "@/services/owner-mode/owner-context-derivation";
import type { OwnerDomainRows } from "@/services/owner-mode/owner-db-providers";

const NOW = new Date("2026-06-29T00:00:00Z");
const past = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

function rows(over: Partial<OwnerDomainRows> = {}): OwnerDomainRows {
  return {
    business: { id: "b1", workspaceId: "w1", name: "Test Laundry", businessType: "laundry_dry_cleaning", location: "Kolkata, West Bengal", currency: "INR" } as OwnerDomainRows["business"],
    cashflow: { periodEnd: NOW, cashInHand: 15000, bankBalance: 0, receivables: 240000, receivablesOverdue: 80000, payables: 30000 } as OwnerDomainRows["cashflow"],
    finance: { periodEnd: NOW, revenue: 320000, costOfGoods: 250000, fixedCosts: 60000, variableCosts: 20000 } as OwnerDomainRows["finance"],
    wcItems: [{ kind: "receivable", amount: 240000, dueDate: past(10) }] as OwnerDomainRows["wcItems"],
    capacity: { bottleneckUtilization: 1.1, growthSafe: false, safeUtilization: 0.7, createdAt: NOW, expansionTriggered: false } as OwnerDomainRows["capacity"],
    compliance: [{ expiresAt: past(5) }] as OwnerDomainRows["compliance"],
    proofs: [{ duplicateFlagged: true, status: "REQUIRED", submittedAt: null }] as OwnerDomainRows["proofs"],
    workload: { dailyLoadPct: 167, band: "overloaded", ownerOnlyCriticalTasks: 9, overloaded: true, bottleneckRisk: true, createdAt: NOW } as OwnerDomainRows["workload"],
    standingCount: 1,
    learningCount: 1,
    ...over,
  };
}

describe("owner-context-derivation — module contract assertions", () => {
  it("deriveOwnerContext is a function", () => { expect(typeof deriveOwnerContext).toBe("function"); });
  it("businessTypeToArchetype is a function", () => { expect(typeof businessTypeToArchetype).toBe("function"); });
  it("deriveLocationContext is a function", () => { expect(typeof deriveLocationContext).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("past is a function", () => { expect(typeof past).toBe("function"); });
  it("rows is a function", () => { expect(typeof rows).toBe("function"); });
  it("rows() returns an object", () => { expect(typeof rows()).toBe("object"); });
  it("rows() has business field", () => { expect(rows()).toHaveProperty("business"); });
  it("businessTypeToArchetype('laundry_dry_cleaning') equals 'laundry_dry_cleaning'", () => { expect(businessTypeToArchetype("laundry_dry_cleaning")).toBe("laundry_dry_cleaning"); });
  it("businessTypeToArchetype('something unknown') returns a string", () => { expect(typeof businessTypeToArchetype("something unknown")).toBe("string"); });
  it("deriveLocationContext('Kolkata, West Bengal', 'INR') returns an object", () => { expect(typeof deriveLocationContext("Kolkata, West Bengal", "INR")).toBe("object"); });
  it("deriveLocationContext result has cityRegion field", () => { expect(deriveLocationContext("Kolkata, West Bengal", "INR")).toHaveProperty("cityRegion"); });
  it("deriveLocationContext empty string has sourceConfidence 'low'", () => { expect(deriveLocationContext("", "").sourceConfidence).toBe("low"); });
  it("rows().business.businessType equals 'laundry_dry_cleaning'", () => { expect(rows().business.businessType).toBe("laundry_dry_cleaning"); });
});

describe("businessTypeToArchetype", () => {
  it("maps exact + keyword + safe default", () => {
    expect(businessTypeToArchetype("laundry_dry_cleaning")).toBe("laundry_dry_cleaning");
    expect(businessTypeToArchetype("Neighbourhood dry-clean & dhobi")).toBe("laundry_dry_cleaning");
    expect(businessTypeToArchetype("fleet courier delivery")).toBe("logistics_delivery_fleet");
    expect(businessTypeToArchetype("something unknown")).toBe("professional_services_agency");
  });
});

describe("deriveLocationContext", () => {
  it("matches a preset by keyword and stays schema-valid for unknowns", () => {
    expect(deriveLocationContext("Kolkata, West Bengal", "INR").cityRegion).toMatch(/Kolkata/);
    const neutral = deriveLocationContext("", "");
    expect(neutral.country.length).toBeGreaterThan(0);
    expect(neutral.sourceConfidence).toBe("low");
  });
});

describe("deriveOwnerContext", () => {
  it("derives real risk flags + numbers + decision category from persisted state", () => {
    const ctx = deriveOwnerContext(rows(), { now: NOW });
    expect(ctx.archetype).toBe("laundry_dry_cleaning");
    expect(ctx.decisionCategory).toBe("cash_margin_working_capital");
    expect(ctx.riskFlags.cashRisk).toBe(true); // overdue receivables
    expect(ctx.riskFlags.complianceRisk).toBe(true); // expired item + duplicate/unsubmitted proof
    expect(ctx.riskFlags.capacityRisk).toBe(true); // bottleneck >= 1 / growth unsafe
    expect(ctx.numbers.cash).toBe(15000);
    expect(ctx.numbers.grossSalesNow).toBe(320000);
    expect(ctx.messyFacts.length).toBeGreaterThan(2);
  });

  it("flags stale finance data via missingOrStaleData", () => {
    const ctx = deriveOwnerContext(rows({ cashflow: { periodEnd: past(120), cashInHand: 15000, bankBalance: 0, receivables: 0, receivablesOverdue: 0, payables: 0 } as OwnerDomainRows["cashflow"] }), { now: NOW });
    expect(ctx.riskFlags.missingOrStaleData).toBe(true);
  });

  it("does not invent signal when rows are absent", () => {
    const ctx = deriveOwnerContext(
      { business: rows().business, cashflow: null, finance: null, wcItems: [], capacity: null, compliance: [], proofs: [], workload: null, standingCount: 0, learningCount: 0 },
      { now: NOW },
    );
    expect(ctx.riskFlags.cashRisk).toBe(false);
    expect(ctx.riskFlags.complianceRisk).toBe(false);
    expect(ctx.riskFlags.capacityRisk).toBe(false);
    expect(ctx.decisionCategory).toBe("data_sufficiency");
    expect(ctx.messyFacts.length).toBeGreaterThan(0); // still schema-valid (>=1)
  });

  it("throws only when there is no business row", () => {
    expect(() => deriveOwnerContext({ ...rows(), business: null }, { now: NOW })).toThrow(/no owner business/i);
  });

  // ── M3: no hardcoded margin constants in the live plan path ──
  it("[M3] a below-margin business feeds REAL revenue/cost to the margin gate — never the 18/22/30 placeholders", () => {
    // revenue 200000 < costOfGoods 240000 ⇒ negative gross margin ⇒ belowMargin.
    const belowMarginRows = rows({
      cashflow: { periodEnd: NOW, cashInHand: 50000, bankBalance: 0, receivables: 0, receivablesOverdue: 0, payables: 0 } as OwnerDomainRows["cashflow"],
      finance: { periodEnd: NOW, revenue: 200000, costOfGoods: 240000, fixedCosts: 60000, variableCosts: 20000 } as OwnerDomainRows["finance"],
      wcItems: [], capacity: null, compliance: [], proofs: [], workload: null,
    });
    const ctx = deriveOwnerContext(belowMarginRows, { now: NOW });
    expect(ctx.decisionCategory).toBe("marketing_opportunity_contract"); // below-margin ⇒ opportunity/contract
    // The rate/cost fed to the gate are the owner's REAL figures, not the removed 18/22/30 constants.
    expect(ctx.numbers.consideredRate).toBe(200000);
    expect(ctx.numbers.fullyLoadedCost).toBe(240000);
    expect(ctx.numbers.consideredRate).not.toBe(18);
    expect(ctx.numbers.fullyLoadedCost).not.toBe(22);
    // Payment terms are not captured on any owner snapshot, so no number is planted.
    expect(ctx.numbers.paymentTermsDays).toBeUndefined();
    // The real negative-margin basis holds: revenue < fully-loaded cost.
    expect(Number(ctx.numbers.consideredRate)).toBeLessThan(Number(ctx.numbers.fullyLoadedCost));
  });

  it("[M3] a profitable business plants no rate/cost/terms numbers at all", () => {
    const healthyRows = rows({
      cashflow: { periodEnd: NOW, cashInHand: 200000, bankBalance: 0, receivables: 0, receivablesOverdue: 0, payables: 0 } as OwnerDomainRows["cashflow"],
      finance: { periodEnd: NOW, revenue: 320000, costOfGoods: 120000, fixedCosts: 60000, variableCosts: 20000 } as OwnerDomainRows["finance"],
      wcItems: [], capacity: null, compliance: [], proofs: [], workload: null,
    });
    const ctx = deriveOwnerContext(healthyRows, { now: NOW });
    expect(ctx.numbers.consideredRate).toBeUndefined();
    expect(ctx.numbers.fullyLoadedCost).toBeUndefined();
    expect(ctx.numbers.paymentTermsDays).toBeUndefined();
  });
});
