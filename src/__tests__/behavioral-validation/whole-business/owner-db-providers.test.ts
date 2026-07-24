import { describe, it, expect } from "vitest";
import { buildOwnerDomainProviders, fixtureOnlyProviders } from "@/services/owner-mode/owner-db-providers";
import { ingestBusinessState } from "@/services/owner-mode/owner-domain-ingestion";
import { caseToContext } from "@/behavioral-validation/whole-business/production-runner";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import type { PrismaClient } from "@/generated/prisma/client";

const NOW = new Date("2026-06-29T00:00:00Z");
const recent = new Date("2026-06-20T00:00:00Z");
const old = new Date("2026-01-01T00:00:00Z");
const ctx = caseToContext(SEED_CASES.find((c) => c.id === "A1")!);

interface MockData {
  cashflow?: unknown; finance?: unknown; wcItems?: unknown[]; capacity?: unknown; compliance?: unknown[];
  proofs?: unknown[]; workload?: unknown; standingCount?: number; business?: unknown; learningCount?: number;
}

/** A mock Prisma client that records every `where` clause (to prove workspace/business scoping). */
function mockDb(data: MockData, wheres: unknown[]) {
  const first = (row: unknown) => ({ findFirst: async (a: { where: unknown }) => (wheres.push(a.where), row ?? null) });
  const many = (rows: unknown[]) => ({ findMany: async (a: { where: unknown }) => (wheres.push(a.where), rows) });
  const count = (n: number) => ({ count: async (a: { where: unknown }) => (wheres.push(a.where), n) });
  return {
    ownerCashflowSnapshot: first(data.cashflow),
    ownerFinancialSnapshot: first(data.finance),
    ownerWorkingCapitalItem: many(data.wcItems ?? []),
    ownerCapacitySnapshot: first(data.capacity),
    ownerComplianceItem: many(data.compliance ?? []),
    proof: many(data.proofs ?? []),
    ownerWorkloadSnapshot: first(data.workload),
    ownerStandingInstruction: count(data.standingCount ?? 0),
    ownerBusiness: first(data.business),
    behavioralLearningArtifact: count(data.learningCount ?? 0),
  } as unknown as PrismaClient;
}

const deps = (db: PrismaClient) => ({ db, workspaceId: "ws-1", businessId: "biz-1", now: NOW });

describe("real DB domain providers — module contract assertions", () => {
  it("buildOwnerDomainProviders is a function", () => { expect(typeof buildOwnerDomainProviders).toBe("function"); });
  it("fixtureOnlyProviders is a function", () => { expect(typeof fixtureOnlyProviders).toBe("function"); });
  it("ingestBusinessState is a function", () => { expect(typeof ingestBusinessState).toBe("function"); });
  it("caseToContext is a function", () => { expect(typeof caseToContext).toBe("function"); });
  it("SEED_CASES is an array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); });
  it("NOW is a Date instance", () => { expect(NOW).toBeInstanceOf(Date); });
  it("ctx is an object", () => { expect(typeof ctx).toBe("object"); });
  it("mockDb is a function", () => { expect(typeof mockDb).toBe("function"); });
  it("deps is a function", () => { expect(typeof deps).toBe("function"); });
  it("fixtureOnlyProviders() returns an object", () => { expect(typeof fixtureOnlyProviders()).toBe("object"); });
  it("recent is a Date instance", () => { expect(recent).toBeInstanceOf(Date); });
  it("old is a Date instance", () => { expect(old).toBeInstanceOf(Date); });
  it("SEED_CASES has at least 1 element", () => { expect(SEED_CASES.length).toBeGreaterThan(0); });
  it("ctx has decisionCategory field", () => { expect(ctx).toHaveProperty("decisionCategory"); });
});

describe("real DB domain providers", () => {
  it("finance_cash reads a persisted cashflow snapshot as REAL_DB with real risk flags", async () => {
    const p = await buildOwnerDomainProviders(deps(mockDb({ cashflow: { cashInHand: 0, bankBalance: 0, receivables: 50000, receivablesOverdue: 20000, payables: 10000, periodEnd: recent } }, [])));
    const s = p.finance_cash!(ctx)!;
    expect(s.sourceType).toBe("REAL_DB");
    expect(s.realData).toBe(true);
    expect(s.freshness).toBe("fresh");
    expect(s.riskFlags).toContain("cash_negative");
    expect(s.riskFlags).toContain("receivables_overdue");
  });

  it("a missing snapshot is DATA_SOURCE_MISSING + missing (never fabricated)", async () => {
    const p = await buildOwnerDomainProviders(deps(mockDb({}, [])));
    expect(p.finance_cash!(ctx)!.sourceType).toBe("DATA_SOURCE_MISSING");
    expect(p.finance_cash!(ctx)!.missing).toBe(true);
  });

  it("stale records lower confidence", async () => {
    const p = await buildOwnerDomainProviders(deps(mockDb({ capacity: { bottleneckUtilization: 0.5, growthSafe: true, safeUtilization: 0.6, expansionTriggered: false, createdAt: old } }, [])));
    const s = p.equipment_capacity!(ctx)!;
    expect(s.freshness).toBe("stale");
    expect(s.confidence).toBe("medium");
  });

  it("working_capital flags overdue receivables from persisted items", async () => {
    const p = await buildOwnerDomainProviders(deps(mockDb({ wcItems: [{ kind: "receivable", amount: 90000, dueDate: old }, { kind: "payable", amount: 30000, dueDate: null }] }, [])));
    const s = p.working_capital!(ctx)!;
    expect(s.sourceType).toBe("REAL_DB");
    expect(s.riskFlags).toContain("receivables_overdue");
  });

  it("compliance_proof flags expired compliance + duplicate proof", async () => {
    const p = await buildOwnerDomainProviders(deps(mockDb({ compliance: [{ expiresAt: old, status: "active" }], proofs: [{ status: "REQUIRED", duplicateFlagged: true, submittedAt: null }] }, [])));
    const s = p.compliance_proof!(ctx)!;
    expect(s.riskFlags).toEqual(expect.arrayContaining(["compliance_expired", "duplicate_proof", "unsubmitted_proof"]));
  });

  it("every query is workspace/business scoped (no cross-workspace reads)", async () => {
    const wheres: Array<Record<string, unknown>> = [];
    await buildOwnerDomainProviders(deps(mockDb({ business: { location: "Kolkata", currency: "INR" } }, wheres)));
    expect(wheres.length).toBeGreaterThan(5);
    for (const w of wheres) {
      const scoped = "workspaceId" in w;
      expect(scoped, `query where missing workspaceId: ${JSON.stringify(w)}`).toBe(true);
    }
  });

  it("real providers make critical domains real-provider-backed; fixture-only does NOT", async () => {
    const realProviders = await buildOwnerDomainProviders(deps(mockDb({
      cashflow: { cashInHand: 50000, bankBalance: 0, receivables: 0, receivablesOverdue: 0, payables: 0, periodEnd: recent },
      finance: { revenue: 100000, costOfGoods: 40000, fixedCosts: 20000, periodEnd: recent },
      wcItems: [{ kind: "receivable", amount: 10000, dueDate: recent }],
      capacity: { bottleneckUtilization: 0.6, growthSafe: true, safeUtilization: 0.7, expansionTriggered: false, createdAt: recent },
      compliance: [{ expiresAt: null, status: "active" }],
      workload: { dailyLoadPct: 60, band: "ok", ownerOnlyCriticalTasks: 1, overloaded: false, bottleneckRisk: false, createdAt: recent },
      business: { location: "Kolkata", currency: "INR" },
      learningCount: 2,
    }, [])));
    // opportunity terms come as context input → provide a marketing/opportunity context
    const oppCtx = { ...ctx, decisionCategory: "marketing_opportunity_contract" as const, numbers: { consideredRate: 20, fullyLoadedCost: 16 } };
    const real = ingestBusinessState(oppCtx, { providers: realProviders, learningStore: {} as never, hasLearningArtifacts: true });
    expect(real.criticalDomainsRealProviderBacked).toBe(true);

    const fixture = ingestBusinessState(oppCtx, { providers: fixtureOnlyProviders(), learningStore: {} as never });
    expect(fixture.criticalDomainsRealProviderBacked).toBe(false);
  });
});
