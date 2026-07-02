/**
 * [db]-gated P0-B runtime-readiness proof — confirming a CSV intake now MATERIALIZES its records into the snapshot
 * read models the owner whole-business plan actually consumes (blocker B2's CSV dead-end). Proves: a valid `finance`
 * intake becomes a real OwnerFinancialSnapshot the plan sees; an intake missing required fields materializes NOTHING
 * (confirm cannot fake readiness); duplicate periods are idempotent; and cross-workspace confirm is rejected.
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { confirmDataIntake } from "@/services/owner-intake/intake.service";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
const bizValid = randomUUID();
const bizEmpty = randomUUID();
const userId = randomUUID();

type Rec = Record<string, number | string | null>;
const anyDb = prisma as unknown as Record<string, { create: (a: unknown) => Promise<{ id: string }>; count: (a: unknown) => Promise<number>; deleteMany: (a: unknown) => Promise<unknown> }>;

async function makeIntake(businessId: string, records: Rec[], ws = workspaceId): Promise<string> {
  const row = await anyDb.ownerDataIntake.create({
    data: {
      id: randomUUID(), workspaceId: ws, businessId, source: "csv_upload", targetDomain: "finance",
      rowCount: records.length, validationStatus: "valid", normalizationStatus: "normalized",
      mappedFields: ["periodStart", "periodEnd", "currency", "revenue"], unmappedColumns: [],
      records, errorReport: [], ownerConfirmed: false,
    },
  });
  return row.id;
}
const financeRow = (periodStart: string, periodEnd: string, revenue: number): Rec => ({
  periodStart, periodEnd, currency: "INR", revenue, costOfGoodsOrServices: Math.round(revenue * 0.6),
  fixedCosts: Math.round(revenue * 0.2), variableCosts: Math.round(revenue * 0.05),
});
const snapshotCount = (businessId: string) => anyDb.ownerFinancialSnapshot.count({ where: { businessId } });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] P0-B intake materialization closes the CSV dead-end", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `p0b-${userId}@example.com`, name: "P0B", isActive: true, updatedAt: NOW } });
    for (const wid of [workspaceId, otherWorkspaceId]) {
      await (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({ where: { id: wid }, update: {}, create: { id: wid, name: `WS ${wid}`, slug: `ws-${wid}`, createdBy: userId } });
    }
    for (const bid of [bizValid, bizEmpty]) {
      await (prisma as unknown as { ownerBusiness: { upsert: (a: unknown) => Promise<unknown> } }).ownerBusiness.upsert({ where: { id: bid }, update: {}, create: { id: bid, workspaceId, name: `Biz ${bid}`, businessType: "laundry_dry_cleaning", location: "Kolkata", currency: "INR", createdBy: userId } });
    }
  });
  afterAll(async () => {
    for (const t of ["ownerFinancialSnapshot", "ownerDataIntake", "ownerBusiness"]) await anyDb[t].deleteMany({ where: { workspaceId } });
  });

  it("[db] a valid finance intake materializes into a real OwnerFinancialSnapshot the plan reads", async () => {
    const id = await makeIntake(bizValid, [financeRow("2026-01-01", "2026-01-31", 100000)]);
    const res = (await confirmDataIntake(id, userId, workspaceId)) as unknown as { materialization: { materialized: number; skipped: number } };
    expect(res.materialization.materialized).toBe(1);
    expect(await snapshotCount(bizValid)).toBe(1);
    const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId, businessId: bizValid, now: NOW });
    expect(view.found).toBe(true);
    expect(view.data.realProviderDomains).toContain("finance_cash");
  });

  it("[db] confirming an intake missing required fields materializes NOTHING (no faked readiness)", async () => {
    const id = await makeIntake(bizEmpty, [{ periodStart: "2026-02-01", periodEnd: "2026-02-28", currency: "INR", revenue: null }]);
    const res = (await confirmDataIntake(id, userId, workspaceId)) as unknown as { materialization: { materialized: number; skipped: number } };
    expect(res.materialization.materialized).toBe(0);
    expect(res.materialization.skipped).toBe(1);
    expect(await snapshotCount(bizEmpty)).toBe(0);
    const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId, businessId: bizEmpty, now: NOW });
    expect(view.data.realProviderDomains).not.toContain("finance_cash");
  });

  it("[db] duplicate periods are idempotent — same period materializes once", async () => {
    const id = await makeIntake(bizValid, [financeRow("2026-03-01", "2026-03-31", 90000), financeRow("2026-03-01", "2026-03-31", 90000)]);
    const res = (await confirmDataIntake(id, userId, workspaceId)) as unknown as { materialization: { materialized: number; skipped: number } };
    expect(res.materialization.materialized).toBe(1);
    expect(res.materialization.skipped).toBe(1);
  });

  it("[db] cross-workspace confirm is rejected", async () => {
    const id = await makeIntake(bizValid, [financeRow("2026-04-01", "2026-04-30", 80000)]);
    await expect(confirmDataIntake(id, userId, otherWorkspaceId)).rejects.toThrow();
  });
});
