/**
 * Scheduled-reassessment due-scanner — DB-backed proof (M8 runtime-readiness).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true. Proves the time-based reassessment that was previously dead now
 * fires: a business with an OVERDUE, still-open budget action is picked up by the scanner and re-run through the
 * governed `reassessBudget` path (a new plan snapshot is created); a business whose action is NOT yet due is skipped;
 * and re-running the scan the same day is idempotent (no duplicate snapshot), because the trigger id embeds the date.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/due-reassessment.service.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { listBudgetSnapshots } from "@/services/owner-budget/budget.service";
import { scanDueReassessments } from "@/services/owner-budget/due-reassessment.service";

const actor = randomUUID();
const businessIds: string[] = [];
const DAY = 86_400_000;

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `due-scan-${actor}@example.com`, name: "Due Scan", isActive: true, updatedAt: new Date() },
  });
});

afterEach(async () => {
  for (const id of businessIds.splice(0)) {
    await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
  }
});

async function newBusiness(workspaceId: string): Promise<string> {
  const b = await createBusiness(
    { name: "Due Scan Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId,
  );
  businessIds.push(b.id);
  return b.id;
}

async function seedFinance(workspaceId: string, businessId: string) {
  await db.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"), currency: "INR",
      revenue: 500000, costOfGoods: 250000, fixedCosts: 150000, cashOnHand: 400000,
      dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(),
    },
  });
}

async function seedBudgetAction(workspaceId: string, businessId: string, dueAt: Date, status = "proposed") {
  await db.ownerBudgetAction.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      sourceKey: `sk-${randomUUID()}`,
      title: "Review cash protection", accountableRole: "owner", decisionType: "INVESTIGATE",
      requiredProof: "Updated cash position", reviewInDays: 7, dueAt, status,
      expectedFinancialImpact: "Protect reserve before due-date default",
      verificationMethod: "owner_review", escalationPath: "owner",
      updatedAt: new Date(),
    },
  });
}

describe("[db] M8 scheduled-reassessment due-scanner", () => {
  it("[db] reassesses a business whose budget action is overdue", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await seedBudgetAction(workspaceId, businessId, new Date(Date.now() - 2 * DAY)); // overdue

    const before = await listBudgetSnapshots(workspaceId, businessId);
    const res = await scanDueReassessments(new Date(), { actorId: actor });
    expect(res.businesses.some((b) => b.businessId === businessId && b.ok)).toBe(true);
    expect(res.reassessed).toBeGreaterThanOrEqual(1);

    const after = await listBudgetSnapshots(workspaceId, businessId);
    expect(after.length).toBeGreaterThan(before.length); // a governed reassessment snapshot was created
  });

  it("[db] does NOT reassess a business whose action is not yet due", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await seedBudgetAction(workspaceId, businessId, new Date(Date.now() + 5 * DAY)); // future — not due

    const res = await scanDueReassessments(new Date(), { actorId: actor });
    expect(res.businesses.some((b) => b.businessId === businessId)).toBe(false);
    const snaps = await listBudgetSnapshots(workspaceId, businessId);
    expect(snaps.length).toBe(0);
  });

  it("[db] is idempotent per day — a second same-day scan creates no duplicate snapshot", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await seedBudgetAction(workspaceId, businessId, new Date(Date.now() - 2 * DAY));

    const now = new Date();
    await scanDueReassessments(now, { actorId: actor });
    const afterFirst = await listBudgetSnapshots(workspaceId, businessId);
    await scanDueReassessments(now, { actorId: actor }); // same day → same trigger id → idempotent
    const afterSecond = await listBudgetSnapshots(workspaceId, businessId);
    expect(afterSecond.length).toBe(afterFirst.length);
  });

  it("[db] skips a business whose overdue action is already closed (not open)", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await seedBudgetAction(workspaceId, businessId, new Date(Date.now() - 2 * DAY), "completed");

    const res = await scanDueReassessments(new Date(), { actorId: actor });
    expect(res.businesses.some((b) => b.businessId === businessId)).toBe(false);
  });
});
