/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma client + service rows are untyped at this test-only seed boundary */
/**
 * TRUST JOURNEY REPRO SEED.
 *
 * Reproduces the exact conditions a real human usability test found broken:
 *   - a workspace with a real business ("Trinity Services") plus multiple acceptance/QA fixture
 *     businesses ("OPSIQ Acceptance ...", "OPSIQ Production Acceptance ...") created via the
 *     SYSTEM_ADMIN-gated isFixtureBusiness path (never visible to the ordinary owner);
 *   - a SAFE finance diagnosis for Trinity;
 *   - a stale/other AT_RISK finance diagnosis on one of the fixture businesses (the one
 *     listBusinesses() would previously have defaulted to, being the most recently created row);
 *   - zero customer/metric data for Trinity, so any "customers aren't coming back" claim would be
 *     a cross-business or missing-data-as-negative-signal bug, not a real signal.
 *
 * Used by tests/browser/trust-journey.spec.ts. Nothing here tunes or improves OpsIQ's output.
 */
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import {
  TRUST_JOURNEY_OWNER,
  TRUST_JOURNEY_WORKSPACE_ID,
  TRINITY_BUSINESS_NAME,
  FIXTURE_BUSINESS_A_NAME,
  FIXTURE_BUSINESS_B_NAME,
} from "../tests/browser/trust-journey-fixtures";

const USER_ID = TRUST_JOURNEY_OWNER.userId;
const WORKSPACE_ID = TRUST_JOURNEY_WORKSPACE_ID;
const OWNER_ROLE = "admin_or_portfolio_manager"; // grants OWNER_VIEW / OWNER_MANAGE (mirrors signup)

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma: any = new PrismaClient({ adapter: new PrismaPg(pool) });
  const now = new Date();
  const hashedPassword = bcrypt.hashSync(TRUST_JOURNEY_OWNER.password, 10);

  await prisma.user.upsert({
    where: { id: USER_ID },
    update: { hashedPassword },
    create: { id: USER_ID, email: TRUST_JOURNEY_OWNER.email, name: "Trust Journey Owner", hashedPassword, updatedAt: now },
  });
  await prisma.workspace.upsert({
    where: { slug: "trust-journey-repro" },
    update: {},
    create: { id: WORKSPACE_ID, name: "Trust Journey Repro", slug: "trust-journey-repro", createdBy: USER_ID, description: "P0 trust-closure regression scenario" },
  });
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: USER_ID } },
    update: { role: "owner", isActive: true },
    create: { workspaceId: WORKSPACE_ID, userId: USER_ID, role: "owner", addedBy: USER_ID, isActive: true },
  });
  await prisma.userRoleAssignment.upsert({
    where: { userId_role_scope_scopeId: { userId: USER_ID, role: OWNER_ROLE, scope: "workspace", scopeId: WORKSPACE_ID } },
    update: { isActive: true, revokedAt: null },
    create: { id: randomUUID(), userId: USER_ID, role: OWNER_ROLE, scope: "workspace", scopeId: WORKSPACE_ID, isActive: true },
  });
  console.log(`[trust-journey] owner ${TRUST_JOURNEY_OWNER.email} + workspace ${WORKSPACE_ID} ready`);

  // Idempotent re-seed: this script creates fresh rows every run (createBusiness always inserts),
  // so wipe this workspace's own prior businesses (and their cascading finance data) first rather
  // than accumulating duplicates across repeated runs.
  const priorBusinessIds = (await prisma.ownerBusiness.findMany({ where: { workspaceId: WORKSPACE_ID }, select: { id: true } })).map((b: any) => b.id);
  if (priorBusinessIds.length > 0) {
    await prisma.ownerBusiness.deleteMany({ where: { id: { in: priorBusinessIds } } });
    console.log(`[trust-journey] cleared ${priorBusinessIds.length} business(es) from a prior seed run`);
  }
  // The fixture risk/task below are workspace-scoped (no businessId column), so they are not
  // cascaded by the OwnerBusiness delete above — clear them explicitly for the same idempotency.
  await prisma.businessRiskEntry.deleteMany({ where: { workspaceId: WORKSPACE_ID, riskCode: { startsWith: "trust_journey_fixture_risk_" } } });
  await prisma.processExecutionTask.deleteMany({ where: { workspaceId: WORKSPACE_ID, taskKey: { startsWith: "trust_journey_fixture_task_" } } });

  const { createBusiness } = await import("../src/services/founder-recovery/business.service");
  const { createFinancialSnapshot } = await import("../src/services/owner-finance/snapshot.service");
  const { runFinanceDiagnosis } = await import("../src/services/owner-finance/diagnosis.service");
  const { createCashflowSnapshot } = await import("../src/services/owner-cashflow/snapshot.service");
  const { runCashflowDiagnosis } = await import("../src/services/owner-cashflow/diagnosis.service");

  // ── Real business: Trinity Services (created first, so it is NOT the newest row — this is
  // exactly the ordering that made the bug reproduce: listBusinesses() orders by createdAt desc,
  // so a real owner's older business loses to newer acceptance fixtures under the old
  // always-default-to-businesses[0] behavior). ─────────────────────────────────────────────────
  const trinity = await createBusiness(
    { name: TRINITY_BUSINESS_NAME, businessType: "b2b_project_contract_service", currency: "INR", b2cSupported: false, b2bSupported: true },
    USER_ID, WORKSPACE_ID
  );
  console.log(`[trust-journey] real business: ${trinity.id} (${TRINITY_BUSINESS_NAME})`);

  // P0-E repro: an OLDER, unsafe cash-survival-triage reading for Trinity itself (created first,
  // so its createdAt is naturally earlier than the finance diagnosis below), immediately
  // superseded by a NEWER, SAFE finance diagnosis for the SAME business — Home must present the
  // newer SAFE reading as current truth, never the stale AT_RISK one.
  const cashStart = "2026-06-01";
  const cashEnd = "2026-06-30";
  const trinityCashSnap = await createCashflowSnapshot(
    trinity.id,
    {
      periodStart: cashStart, periodEnd: cashEnd, currency: "INR",
      cashInHand: 1000, bankBalance: 0, dailyCollections: 200,
      upcomingEmi: 8000, rentDue: 10000, salaryDue: 20000, vendorDue: 8000, taxDue: 4000,
    },
    USER_ID, WORKSPACE_ID
  );
  const trinityCashCycle = await runCashflowDiagnosis(trinity.id, trinityCashSnap.id, USER_ID, WORKSPACE_ID);
  console.log(`[trust-journey] Trinity STALE cashflow diagnosis: cycle ${trinityCashCycle.id}, cashflowState ${trinityCashCycle.cashflowState}`);

  // Healthy, complete finance snapshot -> SAFE survivalState (see src/__tests__/owner-finance/
  // metrics.test.ts's `profitable()` fixture, which this mirrors exactly).
  const finStart = "2026-07-01";
  const finEnd = "2026-07-31";
  const trinitySnap = await createFinancialSnapshot(
    trinity.id,
    {
      periodStart: finStart, periodEnd: finEnd, currency: "INR", businessModel: "service",
      revenue: 100000, costOfGoodsOrServices: 30000, fixedCosts: 35000, rent: 10000,
      salaryPayroll: 20000, utilities: 5000, marketingSpend: 5000, cashOnHand: 200000,
      orderCount: 1000, customerCount: 800,
    },
    USER_ID, WORKSPACE_ID
  );
  const trinityCycle = await runFinanceDiagnosis(trinity.id, trinitySnap.id, USER_ID, WORKSPACE_ID);
  console.log(`[trust-journey] Trinity NEWER finance diagnosis: cycle ${trinityCycle.id}, survivalState ${trinityCycle.survivalState ?? "(see snapshot)"}`);

  // Deliberately NO OwnerMetricSnapshot / customer data for Trinity — this is the "zero customer
  // records" condition the retention "unknown != bad" fix must respect.

  // ── Acceptance/QA fixture businesses (isFixtureBusiness: true — the SYSTEM_ADMIN-gated path;
  // this seed script runs with direct DB/service access, equivalent to an authorized acceptance
  // actor, not a self-serve owner request). Created AFTER Trinity, so under the old buggy
  // behavior (no shared context, default to businesses[0] = most recently created) these would
  // have silently won the selector on every page except the one the owner had just touched. ────
  const fixtureA = await createBusiness(
    { name: FIXTURE_BUSINESS_A_NAME, businessType: "laundry_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    USER_ID, WORKSPACE_ID, { isFixtureBusiness: true }
  );
  console.log(`[trust-journey] fixture business A: ${fixtureA.id} (${FIXTURE_BUSINESS_A_NAME})`);

  // Stale/other AT_RISK signal on this fixture business (negative net margin -> AT_RISK or worse
  // per src/domain/owner-finance/metrics.ts's survivalState()) — this is the exact "Home says at
  // risk while the active business's Finance says SAFE" contradiction the human tester hit, when
  // now-view's cash/finance lookups fell back to a workspace-wide "most recent row" instead of the
  // active business.
  const fixtureASnap = await createFinancialSnapshot(
    fixtureA.id,
    {
      periodStart: finStart, periodEnd: finEnd, currency: "INR",
      revenue: 50000, fixedCosts: 40000, variableCosts: 40000, marketingSpend: 0, cashOnHand: 5000,
    },
    USER_ID, WORKSPACE_ID
  );
  const fixtureACycle = await runFinanceDiagnosis(fixtureA.id, fixtureASnap.id, USER_ID, WORKSPACE_ID);
  console.log(`[trust-journey] fixture A finance diagnosis: cycle ${fixtureACycle.id}, survivalState ${fixtureACycle.survivalState ?? "(see snapshot)"}`);

  // A fixture-tagged risk and task, directly in the workspace-wide surfaces (Home, Risks,
  // Priorities/Tasks) an ordinary owner reads without any business filter — proves
  // isFixtureRecord isolation holds for Startup Mode blueprint output, not just OwnerBusiness rows.
  const fixtureRiskId = randomUUID();
  await prisma.businessRiskEntry.create({
    data: {
      id: fixtureRiskId, workspaceId: WORKSPACE_ID,
      riskCode: `trust_journey_fixture_risk_${fixtureRiskId.slice(0, 8)}`,
      title: "OPSIQ Acceptance fixture risk — must never reach a real owner",
      category: "OPERATIONAL", likelihood: 80, impact: 80, severity: 64,
      isFixtureRecord: true, identifiedBy: USER_ID, updatedAt: now,
    },
  });
  const fixtureTaskId = randomUUID();
  await prisma.processExecutionTask.create({
    data: {
      id: fixtureTaskId, workspaceId: WORKSPACE_ID,
      taskKey: `trust_journey_fixture_task_${fixtureTaskId.slice(0, 8)}`,
      sourceFamily: "STARTUP_MODE", sourceFindingKey: `trust_journey_fixture_${fixtureTaskId.slice(0, 8)}`,
      executionRoute: "OWNER_LED", actionOwner: USER_ID, approvalLevel: "OWNER", status: "PROPOSED",
      completionCriteria: "OPSIQ Acceptance fixture task — must never reach a real owner",
      reassessmentTrigger: "WEEKLY_REVIEW", riskIfIgnored: "n/a (fixture)",
      ownerVisibleSummary: "OPSIQ Acceptance fixture task — must never reach a real owner",
      severity: "MEDIUM", priorityRank: 1, isFixtureRecord: true, updatedAt: now,
    },
  });
  console.log(`[trust-journey] fixture risk ${fixtureRiskId} + fixture task ${fixtureTaskId} seeded (isFixtureRecord: true)`);

  const fixtureB = await createBusiness(
    { name: FIXTURE_BUSINESS_B_NAME, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    USER_ID, WORKSPACE_ID, { isFixtureBusiness: true }
  );
  console.log(`[trust-journey] fixture business B: ${fixtureB.id} (${FIXTURE_BUSINESS_B_NAME}) — newest row in the workspace`);

  // ── A second REAL business, created LAST (i.e. the actual newest row in the workspace once
  // fixtures are excluded) — this is what makes the repro meaningful: with two real businesses,
  // the shared selector genuinely has a choice to make, and the old buggy behavior (each page
  // independently defaulting to businesses[0] = most-recently-created) would have shown this
  // business on some pages and Trinity on others even without any fixture involved. ─────────────
  const second = await createBusiness(
    { name: "Riverside Cafe", businessType: "hospitality_food_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    USER_ID, WORKSPACE_ID
  );
  console.log(`[trust-journey] second real business: ${second.id} (Riverside Cafe) — newest real row`);

  console.log("[trust-journey] SEED COMPLETE");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
