/**
 * Phase 2 — Owner journey adversarial quality tests (DB-backed).
 *
 * Verifies that the real-DB runtime responds conservatively and correctly
 * under adversarial conditions per the Phase 2 quality gate:
 *
 *   1. Stale data (70 days old, window=35) → confidence degrades to "medium", not "high"
 *   2. Cash crisis (deeply negative cash) → cash_survival constraint, growth blocked,
 *      conservative next action (no expansion advice)
 *   3. Contradictory signals (negative cash + positive revenue) → cash_survival wins;
 *      [GAP-MEDIUM] runtime has no explicit "data contradicts itself" typed flag — but
 *      behavior IS conservative (cash_survival when cash<0, growth blocked)
 *   4. Infeasible growth (110% capacity + negative cash) → growth explicitly blocked
 *      with non-empty blockedBy list
 *   5. Multi-domain consistency — multiple red domains → arbitration is NOT "profitable_growth"
 *   6. Insufficient data (no OwnerBusiness row) → found=false, confidence="none"
 *   7. Cross-workspace isolation — data seeded in wsMain, queried with wsOther → found=false,
 *      no leakage into doNotDo / redDomains / growth signals
 *
 * Gap classification (documented per Phase 2.3):
 *   [GAP-MEDIUM] Contradictory data detection: no explicit typed flag for "data contradicts itself".
 *     Code IS conservative (cash_survival dominates when cash<0 regardless of revenue).
 *     Deferred: no unsafe advice path exists; conservative behavior is maintained.
 *   [GAP-MEDIUM] Numerical consistency: advice text (plan7Day etc.) is non-deterministic string;
 *     not assertable as a structured field. Deferred.
 *   [GAP-LOW] Stale data warning string: only confidence degrades to "medium"; no named
 *     warning constant is surfaced. Deferred: UI layer responsibility.
 *
 * Requires TEST_WITH_DB=true and a running PostgreSQL with migrations applied (LANE_B in CI).
 * Self-skips when TEST_WITH_DB != 'true'.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { seedOwnerDbCase, cleanupOwnerDbCase } from "../../../scripts/seed-owner-db-case";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
// 70 days old — well beyond the 35-day freshness window used by the provider layer
const STALE_PERIOD_END = new Date(NOW.getTime() - 70 * 86_400_000);

const userId = randomUUID();
const wsMain = randomUUID();
const wsOther = randomUUID(); // never seeded — proves cross-workspace isolation

// One business per scenario, co-seeded in wsMain (proves no intra-workspace bleed-through).
const BIZ = {
  stale:      randomUUID(), // scenario 1: 70-day-old data → stale finance_cash
  cashCrisis: randomUUID(), // scenario 2: cashInHand = -50000
  contradict: randomUUID(), // scenario 3: cashInHand = -12000, revenue = +320k
  fullLoad:   randomUUID(), // scenario 4: capacity 110%, cashInHand = -20000
  multiRed:   randomUUID(), // scenario 5: cashInHand = -5000 → multiple red domains
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ensureUser = () =>
  (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `ph2-adv-${userId}@test.local`, name: "Phase2Adv", isActive: true, updatedAt: NOW },
  });

const ensureWorkspace = (id: string) =>
  (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({
    where: { id },
    update: {},
    create: { id, name: `PH2 WS ${id}`, slug: `ph2-ws-${id}`, createdBy: userId },
  });

const plan = (businessId: string, workspaceId = wsMain) =>
  getOwnerWholeBusinessPlan({ db: prisma, workspaceId, businessId, now: NOW });

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Phase 2 — adversarial quality invariants", () => {
  beforeAll(async () => {
    await ensureUser();
    await ensureWorkspace(wsMain);
    await ensureWorkspace(wsOther);

    // Scenario 1: stale finance/cashflow data — periodEnd 70 days ago
    await seedOwnerDbCase(prisma, { workspaceId: wsMain, businessId: BIZ.stale, userId, now: NOW, periodEnd: STALE_PERIOD_END });
    // Scenario 2: cash crisis — deeply negative cash (fresh data timestamps)
    await seedOwnerDbCase(prisma, { workspaceId: wsMain, businessId: BIZ.cashCrisis, userId, now: NOW, cashInHand: -50000 });
    // Scenario 3: contradictory signals — negative cash but default revenue = +320k
    await seedOwnerDbCase(prisma, { workspaceId: wsMain, businessId: BIZ.contradict, userId, now: NOW, cashInHand: -12000 });
    // Scenario 4: infeasible growth — 110% capacity (seed default) + negative cash
    await seedOwnerDbCase(prisma, { workspaceId: wsMain, businessId: BIZ.fullLoad, userId, now: NOW, cashInHand: -20000 });
    // Scenario 5: multi-domain red — mildly negative cash
    await seedOwnerDbCase(prisma, { workspaceId: wsMain, businessId: BIZ.multiRed, userId, now: NOW, cashInHand: -5000 });
  });

  afterAll(async () => {
    for (const businessId of Object.values(BIZ)) {
      await cleanupOwnerDbCase(prisma, { workspaceId: wsMain, businessId, userId, now: NOW });
    }
  });

  // ─── 1. Stale data lowers confidence ─────────────────────────────────────

  it("stale data (70 days old) — found=true, confidence degrades to 'medium'", async () => {
    const v = await plan(BIZ.stale);
    expect(v.found).toBe(true);
    expect(v.data.overallConfidence).toBe("medium");
    expect(v.data.overallConfidence).not.toBe("high");
  });

  it("stale data — supervisor is aware of the business (found=true) but does not approve proceed", async () => {
    const v = await plan(BIZ.stale);
    expect(v.supervisor.found).toBe(true);
    expect(v.supervisor.actionStatus).not.toBe("proceed");
  });

  // ─── 2. Cash crisis — constraint correct, growth blocked, advice conservative ───

  it("cash crisis (-50k) — dominant constraint is cash_survival", async () => {
    const v = await plan(BIZ.cashCrisis);
    expect(v.found).toBe(true);
    expect(v.dominantConstraint).toBe("cash_survival");
    expect(v.arbitration.dominantConstraint).toBe("cash_survival");
  });

  it("cash crisis — growth scale is NOT allowed", async () => {
    const v = await plan(BIZ.cashCrisis);
    expect(v.growth.scaleAllowed).toBe(false);
  });

  it("cash crisis — doNotDo list is non-empty (high-cost actions blocked)", async () => {
    const v = await plan(BIZ.cashCrisis);
    expect(v.doNotDo.length).toBeGreaterThan(0);
  });

  it("cash crisis — nextBestAction does not recommend expansion, hiring, or scaling", async () => {
    const v = await plan(BIZ.cashCrisis);
    expect(v.nextBestAction.toLowerCase()).not.toMatch(/expand|hire|scale up|acquire customer/i);
  });

  it("cash crisis — supervisor.canProceed is false (cash block overrides)", async () => {
    const v = await plan(BIZ.cashCrisis);
    expect(v.supervisor.canProceed).toBe(false);
  });

  // ─── 3. Contradictory signals: negative cash + positive revenue ───────────
  // [GAP-MEDIUM] No explicit typed "contradictory" flag — runtime IS conservative:
  // cash_survival dominates when cash<0, regardless of revenue.

  it("contradictory signals (cash=-12k, revenue=+320k) — cash_survival dominates", async () => {
    const v = await plan(BIZ.contradict);
    expect(v.found).toBe(true);
    expect(v.dominantConstraint).toBe("cash_survival");
  });

  it("contradictory signals — growth blocked despite positive revenue signal", async () => {
    const v = await plan(BIZ.contradict);
    expect(v.growth.scaleAllowed).toBe(false);
  });

  // ─── 4. Infeasible growth: 110% capacity + negative cash ─────────────────

  it("full capacity + negative cash — growth.scaleAllowed is false", async () => {
    const v = await plan(BIZ.fullLoad);
    expect(v.growth.scaleAllowed).toBe(false);
  });

  it("full capacity + negative cash — growth.blockedBy is non-empty (reasons surfaced)", async () => {
    const v = await plan(BIZ.fullLoad);
    expect(v.growth.blockedBy.length).toBeGreaterThan(0);
  });

  // ─── 5. Multi-domain consistency ────────────────────────────────────────

  it("multiple red domains — arbitration constraint is not 'profitable_growth'", async () => {
    const v = await plan(BIZ.multiRed);
    expect(v.arbitration.dominantConstraint).not.toBe("profitable_growth");
  });

  it("multiple red domains — growth.scaleAllowed is false (consistency with constraint)", async () => {
    const v = await plan(BIZ.multiRed);
    expect(v.growth.scaleAllowed).toBe(false);
  });

  // ─── 6. Insufficient data (no OwnerBusiness row) ────────────────────────

  it("no OwnerBusiness row — found=false, supervisor.found=false, confidence='none'", async () => {
    const v = await plan(randomUUID()); // ID with no DB record
    expect(v.found).toBe(false);
    expect(v.supervisor.found).toBe(false);
    expect(v.data.overallConfidence).toBe("none");
    expect(v.data.criticalDomainsRealProviderBacked).toBe(false);
  });

  it("no OwnerBusiness row — nextBestAction explains missing data (not fabricated advice)", async () => {
    const v = await plan(randomUUID());
    expect(v.nextBestAction).toContain("No business data");
  });

  // ─── 7. Cross-workspace isolation ────────────────────────────────────────

  it("cross-workspace: BIZ seeded in wsMain, queried with wsOther → found=false", async () => {
    const v = await plan(BIZ.cashCrisis, wsOther);
    expect(v.found).toBe(false);
    expect(v.supervisor.found).toBe(false);
  });

  it("cross-workspace: wsOther yields no leaked doNotDo, redDomains, or growth signals", async () => {
    const v = await plan(BIZ.stale, wsOther);
    expect(v.doNotDo).toHaveLength(0);   // not-found view has no doNotDo
    expect(v.redDomains).toHaveLength(0); // not-found view has no red domains
    expect(v.growth.scaleAllowed).toBe(false); // not-found is always false (conservative)
  });
});
