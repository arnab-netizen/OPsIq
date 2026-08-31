/**
 * Owner-pilot surfaces — LIVE DB proof (TEST_WITH_DB=true).
 *
 * Proves against a real Postgres that the owner-pilot surfaces (onboarding, dynamic input guidance,
 * readiness score, action assignment) read REAL workspace+business-scoped persisted rows, that the
 * MANUAL input path persists a scoped intake and raises confidence, that malformed / cross-business /
 * cross-workspace records are rejected, and that legacy null-business rows never fake REAL_DB confidence.
 *
 * Seed helpers (`seedOwnerDbCase`) are reused so the persisted shape matches the rest of the suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedOwnerDbCase, cleanupOwnerDbCase, type OwnerDbCaseIds } from "../../../../scripts/seed-owner-db-case";
import { getOwnerOnboardingState } from "@/services/owner-mode/owner-onboarding.service";
import { getOwnerInputGuidance } from "@/services/owner-mode/owner-input-guidance.service";
import { getOwnerReadiness } from "@/services/owner-mode/owner-readiness.service";
import { getOwnerActionAssignment } from "@/services/owner-mode/owner-action-assignment.service";
import { submitManualEntry } from "@/services/owner-mode/owner-manual-entry.service";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");

const CONF: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] owner-pilot surfaces (live DB)", () => {
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const userId = randomUUID();

  // Rich business (full seeded rows) + weak business (only an OwnerBusiness row) + a business in another workspace.
  const richIds: OwnerDbCaseIds = { workspaceId, businessId: randomUUID(), userId, now: NOW };
  const weakBusinessId = randomUUID();
  const legacyBusinessId = randomUUID();
  const otherBusinessId = randomUUID();

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `pilot-${userId}@example.com`, name: "Pilot", isActive: true, updatedAt: NOW },
    });
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      update: {},
      create: { id: workspaceId, name: "Pilot WS", slug: `pilot-ws-${workspaceId}`, createdBy: userId },
    });
    await prisma.workspace.upsert({
      where: { id: otherWorkspaceId },
      update: {},
      create: { id: otherWorkspaceId, name: "Other WS", slug: `other-ws-${otherWorkspaceId}`, createdBy: userId },
    });

    // Rich business — full domain rows (laundry archetype).
    await seedOwnerDbCase(prisma, richIds);

    // Weak business — exists but has NO domain snapshots (confidence must be low/none).
    await prisma.ownerBusiness.create({
      data: { id: weakBusinessId, workspaceId, name: "Weak Cleaning Co", businessType: "Housekeeping & cleaning services", operatingModel: "owner_operated", currency: "INR", createdBy: userId },
    });

    // Legacy business — only a workspace-only (business_id NULL) capacity row exists; its own scoped reads are empty.
    await prisma.ownerBusiness.create({
      data: { id: legacyBusinessId, workspaceId, name: "Legacy Laundry", businessType: "Laundry & dry cleaning", currency: "INR", createdBy: userId },
    });
    await prisma.ownerCapacitySnapshot.create({
      data: {
        id: randomUUID(), workspaceId, businessId: null,
        currentRevenue: 100000, safeUtilization: 0.7, resources: {}, bottleneckUtilization: 1.2,
        growthCapacityRevenue: 0, availableBuffer: 0, expansionTriggered: true, growthSafe: false, createdAt: NOW,
      },
    });

    // Business in ANOTHER workspace (for cross-workspace isolation).
    await prisma.ownerBusiness.create({
      data: { id: otherBusinessId, workspaceId: otherWorkspaceId, name: "Other WS Biz", businessType: "Laundry", currency: "INR", createdBy: userId },
    });
  });

  afterAll(async () => {
    await cleanupOwnerDbCase(prisma, richIds);
    await prisma.ownerDataIntake.deleteMany({ where: { workspaceId } });
    await prisma.ownerCapacitySnapshot.deleteMany({ where: { workspaceId, businessId: null } });
    await prisma.ownerBusiness.deleteMany({ where: { id: { in: [weakBusinessId, legacyBusinessId] } } });
    await prisma.ownerBusiness.deleteMany({ where: { id: otherBusinessId } });
    // Audit events emitted by the manual-entry path reference the actor — clear them before the user.
    await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("[db] onboarding reads real scoped rows — rich business has supplied data, weak business is missing it", async () => {
    const rich = await getOwnerOnboardingState({ db: prisma, workspaceId, businessId: richIds.businessId, now: NOW });
    expect(rich.found).toBe(true);
    expect(rich.suppliedCount).toBeGreaterThan(0);

    const weak = await getOwnerOnboardingState({ db: prisma, workspaceId, businessId: weakBusinessId, now: NOW });
    expect(weak.found).toBe(true);
    expect(weak.missingMinimum.length).toBeGreaterThan(0);
    expect(weak.confidenceBeforeDiagnosis).not.toBe("high");
  });

  it("[db] guidance + readiness + action read DB-backed runtime state", async () => {
    const guidance = await getOwnerInputGuidance({ db: prisma, workspaceId, businessId: richIds.businessId, now: NOW });
    expect(guidance.found).toBe(true);
    expect(guidance.guidance.length).toBeGreaterThanOrEqual(20);

    const readiness = await getOwnerReadiness({ db: prisma, workspaceId, businessId: richIds.businessId, now: NOW });
    expect(readiness.found).toBe(true);
    expect(readiness.dimensions).toHaveLength(10);

    const action = await getOwnerActionAssignment({ db: prisma, workspaceId, businessId: richIds.businessId, now: NOW });
    expect(action.found).toBe(true);
    expect(action.assignment).not.toBeNull();
    expect(action.assignment!.responsibleParty.length).toBeGreaterThan(0);
  });

  it("[db] manual input path persists a scoped intake and RAISES confidence for a non-financial category", async () => {
    // F1: revenue_sales/expenses/payroll/cash_debt are financial-snapshot-backed — a bare confirmed
    // note (no periodStart/periodEnd/currency, exactly what manual-entry's own sections collect) must
    // NOT satisfy them (see the DB-free proof in input-paths.test.ts). staff_attendance is not
    // snapshot-backed, so a confirmed manual note remains its real, legitimate supplied signal.
    const before = await getOwnerInputGuidance({ db: prisma, workspaceId, businessId: weakBusinessId, now: NOW });

    const res = await submitManualEntry(
      { workspaceId, businessId: weakBusinessId, record: { workspaceId, businessId: weakBusinessId, category: "staff_attendance", source: "manual", fields: { note: "owner covers most shifts personally" } } },
      { db: prisma, now: NOW, actorId: userId },
    );
    expect(res.ok).toBe(true);

    const row = await prisma.ownerDataIntake.findFirst({ where: { workspaceId, businessId: weakBusinessId, targetDomain: "staff_attendance", ownerConfirmed: true } });
    expect(row).not.toBeNull();

    // The confidence read path now counts the confirmed intake → staff_attendance is supplied.
    const onboardingAfter = await getOwnerOnboardingState({ db: prisma, workspaceId, businessId: weakBusinessId, now: NOW });
    expect(onboardingAfter.missingMinimum.find((m) => m.category === "staff_attendance")).toBeUndefined();

    // A bare confirmed note for a financial-snapshot-backed category must NOT clear it from missing.
    const bareFinanceNote = await submitManualEntry(
      { workspaceId, businessId: weakBusinessId, record: { workspaceId, businessId: weakBusinessId, category: "revenue_sales", source: "manual", fields: { note: "sales flat vs last month" } } },
      { db: prisma, now: NOW, actorId: userId },
    );
    expect(bareFinanceNote.ok).toBe(true);
    const afterBareNote = await getOwnerOnboardingState({ db: prisma, workspaceId, businessId: weakBusinessId, now: NOW });
    expect(afterBareNote.missingMinimum.find((m) => m.category === "revenue_sales")).toBeDefined();

    // The REAL structured entry point — a real financial snapshot, same shape /owner/finance submits —
    // is what actually clears revenue_sales/expenses/payroll/cash_debt from missing.
    const { createFinancialSnapshot } = await import("@/services/owner-finance/snapshot.service");
    await createFinancialSnapshot(
      weakBusinessId,
      {
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        currency: "USD",
        revenue: 450000,
        costOfGoodsOrServices: 120000,
        salaryPayroll: 60000,
        cashOnHand: 30000,
      } as never,
      userId,
      workspaceId,
    );
    const afterSnapshot = await getOwnerOnboardingState({ db: prisma, workspaceId, businessId: weakBusinessId, now: NOW });
    expect(afterSnapshot.missingMinimum.find((m) => m.category === "revenue_sales")).toBeUndefined();
    expect(afterSnapshot.missingMinimum.find((m) => m.category === "expenses")).toBeUndefined();
    expect(afterSnapshot.missingMinimum.find((m) => m.category === "payroll")).toBeUndefined();
    expect(afterSnapshot.missingMinimum.find((m) => m.category === "cash_debt")).toBeUndefined();

    const after = await getOwnerInputGuidance({ db: prisma, workspaceId, businessId: weakBusinessId, now: NOW });
    expect(CONF[after.overallConfidence]).toBeGreaterThan(CONF[before.overallConfidence]);
  });

  it("[db] malformed record is rejected and never written", async () => {
    const before = await prisma.ownerDataIntake.count({ where: { workspaceId, businessId: richIds.businessId } });
    const res = await submitManualEntry(
      { workspaceId, businessId: richIds.businessId, record: { workspaceId, businessId: richIds.businessId, category: "revenue_sales", source: "manual", fields: { revenue: -50 } } },
      { db: prisma, now: NOW, actorId: userId },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.rejection).toBe("malformed");
    const after = await prisma.ownerDataIntake.count({ where: { workspaceId, businessId: richIds.businessId } });
    expect(after).toBe(before);
  });

  it("[db] cross-business and cross-workspace records are rejected/isolated", async () => {
    // Record addressed to a DIFFERENT business than the scope.
    const xb = await submitManualEntry(
      { workspaceId, businessId: weakBusinessId, record: { workspaceId, businessId: richIds.businessId, category: "revenue_sales", source: "manual", fields: { revenue: 1 } } },
      { db: prisma, now: NOW, actorId: userId },
    );
    expect(xb.ok).toBe(false);
    if (!xb.ok) expect(xb.rejection).toBe("cross_business");

    // Record addressed to a DIFFERENT workspace than the verified scope.
    const xw = await submitManualEntry(
      { workspaceId, businessId: weakBusinessId, record: { workspaceId: otherWorkspaceId, businessId: weakBusinessId, category: "revenue_sales", source: "manual", fields: { revenue: 1 } } },
      { db: prisma, now: NOW, actorId: userId },
    );
    expect(xw.ok).toBe(false);
    if (!xw.ok) expect(xw.rejection).toBe("cross_workspace");

    // A business that does not belong to the workspace is rejected past the parser.
    const nf = await submitManualEntry(
      { workspaceId, businessId: otherBusinessId, record: { workspaceId, businessId: otherBusinessId, category: "revenue_sales", source: "manual", fields: { revenue: 1 } } },
      { db: prisma, now: NOW, actorId: userId },
    );
    expect(nf.ok).toBe(false);
    if (!nf.ok) expect(nf.rejection).toBe("business_not_found");

    // No intake leaked into the other workspace.
    expect(await prisma.ownerDataIntake.count({ where: { workspaceId: otherWorkspaceId } })).toBe(0);
  });

  it("[db] legacy null-business rows do not produce false REAL_DB confidence", async () => {
    // The legacy business has only a workspace-only (business_id NULL) capacity row — its own scoped
    // reads are empty, so onboarding sees no supplied data and confidence is not high.
    const legacy = await getOwnerOnboardingState({ db: prisma, workspaceId, businessId: legacyBusinessId, now: NOW });
    expect(legacy.found).toBe(true);
    expect(legacy.suppliedCount).toBe(0);
    expect(legacy.confidenceBeforeDiagnosis).not.toBe("high");
  });
});
