/**
 * [db]-gated proof that the production owner-advice runtime reads REAL persisted domain records
 * through the providers (not fixtures), is workspace-scoped, changes output when DB data changes, and
 * lowers confidence on missing/stale data. Requires TEST_WITH_DB=true with migrations applied + prisma
 * generated; skipped locally (Neon unreachable from the dev sandbox) and intended for CI.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedOwnerDbCase, cleanupOwnerDbCase, type OwnerDbCaseIds } from "../../../../scripts/seed-owner-db-case";
import { buildOwnerDomainProviders, fixtureOnlyProviders } from "@/services/owner-mode/owner-db-providers";
import { runOwnerAdvice, commandCenterSummary, type OwnerBusinessContext } from "@/services/owner-mode/owner-advice-runtime.service";
import { ingestBusinessState } from "@/services/owner-mode/owner-domain-ingestion";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { LOCATIONS } from "@/behavioral-validation/locations";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
const businessId = randomUUID();
const userId = randomUUID();
const ids: OwnerDbCaseIds = { workspaceId, businessId, userId, now: NOW };

// An opportunity/contract context — opportunity_contract is legitimately CONTEXT_PROVIDED (live terms).
const ctx: OwnerBusinessContext = {
  businessType: "laundry_dry_cleaning", archetype: "laundry_dry_cleaning",
  decisionCategory: "marketing_opportunity_contract", location: LOCATIONS.kolkata,
  ownerGoal: "Decide a hotel contract without hurting cash", numbers: { consideredRate: 20, fullyLoadedCost: 16, paymentTermsDays: 45 },
  riskFlags: { cashRisk: true }, messyFacts: ["hotel contract offered", "cash tight"], expectedTopPriority: "cash_survival",
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] real DB domain ingestion through providers", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `dbprov-${userId}@example.com`, name: "DB Prov", isActive: true, updatedAt: NOW } });
    for (const wid of [workspaceId, otherWorkspaceId]) {
      await (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({ where: { id: wid }, update: {}, create: { id: wid, name: `WS ${wid}`, slug: `ws-${wid}`, createdBy: userId } });
    }
    await seedOwnerDbCase(prisma, { ...ids, cashInHand: 0 });
  });
  afterAll(async () => {
    await cleanupOwnerDbCase(prisma, ids);
  });

  it("[db] providers read persisted records → critical domains are REAL-provider-backed", async () => {
    const providers = await buildOwnerDomainProviders({ db: prisma, workspaceId, businessId, now: NOW });
    const report = ingestBusinessState(ctx, { providers, learningStore: new InMemoryLearningStore(), hasLearningArtifacts: true });
    expect(report.byDomain.finance_cash.sourceType).toBe("REAL_DB");
    expect(report.byDomain.working_capital.sourceType).toBe("REAL_DB");
    expect(report.byDomain.compliance_proof.riskFlags).toContain("compliance_expired");
    expect(report.criticalDomainsRealProviderBacked).toBe(true);
  });

  it("[db] runtime receives provider data and surfaces it", async () => {
    const providers = await buildOwnerDomainProviders({ db: prisma, workspaceId, businessId, now: NOW });
    const r = await runOwnerAdvice({ workspaceId, context: ctx }, { store: new InMemoryLearningStore(), providers });
    expect(r.ingestion.byDomain.finance_cash.realData).toBe(true);
    expect(r.ingestion.byDomain.owner_workload_memory.riskFlags).toContain("owner_overloaded");
    expect(commandCenterSummary(r).topPriority.length).toBeGreaterThan(0);
  });

  it("[db] runtime output changes when the DB data changes", async () => {
    const before = ingestBusinessState(ctx, { providers: await buildOwnerDomainProviders({ db: prisma, workspaceId, businessId, now: NOW }) });
    await seedOwnerDbCase(prisma, { ...ids, cashInHand: 800000 }); // healthy cash now
    const after = ingestBusinessState(ctx, { providers: await buildOwnerDomainProviders({ db: prisma, workspaceId, businessId, now: NOW }) });
    expect(after.byDomain.finance_cash.summary).not.toBe(before.byDomain.finance_cash.summary);
    expect(before.byDomain.finance_cash.riskFlags).toContain("cash_negative");
    expect(after.byDomain.finance_cash.riskFlags ?? []).not.toContain("cash_negative");
  });

  it("[db] cross-workspace isolation — another workspace sees no seeded data", async () => {
    const providers = await buildOwnerDomainProviders({ db: prisma, workspaceId: otherWorkspaceId, businessId, now: NOW });
    expect(providers.finance_cash!(ctx)!.sourceType).toBe("DATA_SOURCE_MISSING");
    expect(providers.location_stage?.(ctx)?.sourceType ?? "DATA_SOURCE_MISSING").toBe("DATA_SOURCE_MISSING");
  });

  it("[db] missing critical data lowers confidence + blocks real-provider-backed", async () => {
    const providers = await buildOwnerDomainProviders({ db: prisma, workspaceId: otherWorkspaceId, businessId: randomUUID(), now: NOW });
    const report = ingestBusinessState(ctx, { providers });
    expect(report.criticalDomainsRealProviderBacked).toBe(false);
    expect(report.overallConfidence).toBe("low");
  });

  it("[db] stale data lowers confidence", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    await seedOwnerDbCase(prisma, { ...ids, periodEnd: old, cashInHand: 0 });
    const providers = await buildOwnerDomainProviders({ db: prisma, workspaceId, businessId, now: NOW });
    expect(providers.finance_cash!(ctx)!.freshness).toBe("stale");
  });

  it("[db] fixture-only providers do NOT satisfy critical readiness", () => {
    const report = ingestBusinessState(ctx, { providers: fixtureOnlyProviders() });
    expect(report.criticalDomainsRealProviderBacked).toBe(false);
  });
});
