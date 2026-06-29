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
});
