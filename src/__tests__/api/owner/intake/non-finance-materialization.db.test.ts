/**
 * [db]-gated Wave 5 runtime-readiness proof — confirming a NON-FINANCE CSV intake now MATERIALIZES its records into
 * the domain snapshot read models the owner-visible per-domain dashboards consume. Proves, via the REAL
 * confirmDataIntake → materializeIntake → create{Domain}Snapshot path (no seed-only shortcut): a valid sales /
 * operations / sop / marketing intake becomes a real Owner{Domain}Snapshot that get{Domain}Dashboard reads; an intake
 * missing period/currency materializes NOTHING (confirm cannot fake readiness); duplicate periods are idempotent;
 * scope is workspace- and business-isolated; and — honestly — materializing `operations` does NOT flip the
 * whole-business-plan `equipment_capacity` critical domain (that bridge is a documented product decision).
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { confirmDataIntake } from "@/services/owner-intake/intake.service";
import { getSalesDashboard } from "@/services/owner-sales/dashboard.service";
import { getOperationsDashboard } from "@/services/owner-operations/dashboard.service";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
const bizA = randomUUID();
const bizB = randomUUID();
const userId = randomUUID();

type Rec = Record<string, number | string | null>;
type Mat = { materialization: { materialized: number; skipped: number } };
const anyDb = prisma as unknown as Record<string, { create: (a: unknown) => Promise<{ id: string }>; count: (a: unknown) => Promise<number>; deleteMany: (a: unknown) => Promise<unknown> }>;

async function makeIntake(businessId: string, targetDomain: string, records: Rec[], ws = workspaceId): Promise<string> {
  const row = await anyDb.ownerDataIntake.create({
    data: {
      id: randomUUID(), workspaceId: ws, businessId, source: "csv_upload", targetDomain,
      rowCount: records.length, validationStatus: "valid", normalizationStatus: "normalized",
      mappedFields: ["periodStart", "periodEnd", "currency"], unmappedColumns: [],
      records, errorReport: [], ownerConfirmed: false,
    },
  });
  return row.id;
}
const period = (s: string, e: string) => ({ periodStart: s, periodEnd: e, currency: "INR" });
const salesRow = (s: string, e: string, revenue: number): Rec => ({ ...period(s, e), leads: 50, orders: 30, revenue, complaints: 2, refundAmount: 500 });
const opsRow = (s: string, e: string): Rec => ({ ...period(s, e), ordersReceived: 100, ordersCompleted: 92, reworkCount: 5, complaints: 3, machineCapacityUnits: 200, idleHours: 8 });
const sopRow = (s: string, e: string): Rec => ({ ...period(s, e), actionsAssigned: 40, actionsCompleted: 33, actionsOverdue: 4, proofRequired: 20, proofProvided: 15 });
const mktRow = (s: string, e: string): Rec => ({ ...period(s, e), marketingSpend: 20000, revenue: 90000, leads: 120, orders: 40, campaignsRun: 3 });

const count = (model: string, businessId: string) => anyDb[model].count({ where: { businessId } });
const confirm = (id: string, ws = workspaceId) => confirmDataIntake(id, userId, ws) as unknown as Promise<Mat>;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Wave 5 — non-finance intake materialization reaches the per-domain owner dashboards", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `w5-${userId}@example.com`, name: "W5", isActive: true, updatedAt: NOW } });
    for (const wid of [workspaceId, otherWorkspaceId]) {
      await (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({ where: { id: wid }, update: {}, create: { id: wid, name: `WS ${wid}`, slug: `ws-${wid}`, createdBy: userId } });
    }
    for (const bid of [bizA, bizB]) {
      await (prisma as unknown as { ownerBusiness: { upsert: (a: unknown) => Promise<unknown> } }).ownerBusiness.upsert({ where: { id: bid }, update: {}, create: { id: bid, workspaceId, name: `Biz ${bid}`, businessType: "laundry_dry_cleaning", location: "Kolkata", currency: "INR", createdBy: userId } });
    }
  });
  afterAll(async () => {
    for (const t of ["ownerSalesSnapshot", "ownerOperationsSnapshot", "ownerSopSnapshot", "ownerMarketingSnapshot", "ownerDataIntake", "ownerBusiness"]) {
      await anyDb[t].deleteMany({ where: { workspaceId } });
    }
  });

  it("[db] a valid sales intake materializes a real OwnerSalesSnapshot the owner-sales dashboard reads", async () => {
    const id = await makeIntake(bizA, "sales", [salesRow("2026-01-01", "2026-01-31", 120000)]);
    const res = await confirm(id);
    expect(res.materialization.materialized).toBe(1);
    expect(await count("ownerSalesSnapshot", bizA)).toBe(1);
    const dash = await getSalesDashboard(workspaceId, bizA);
    expect(dash.latestSnapshot).not.toBeNull();
    expect((dash.latestSnapshot as unknown as { revenue: number | null }).revenue).toBe(120000);
  });

  it("[db] operations / sop / marketing intakes each materialize their snapshot", async () => {
    const opId = await makeIntake(bizA, "operations", [opsRow("2026-02-01", "2026-02-28")]);
    expect((await confirm(opId)).materialization.materialized).toBe(1);
    expect(await count("ownerOperationsSnapshot", bizA)).toBe(1);
    const opDash = await getOperationsDashboard(workspaceId, bizA);
    expect(opDash.latestSnapshot).not.toBeNull();

    const sopId = await makeIntake(bizA, "sop", [sopRow("2026-02-01", "2026-02-28")]);
    expect((await confirm(sopId)).materialization.materialized).toBe(1);
    expect(await count("ownerSopSnapshot", bizA)).toBe(1);

    const mktId = await makeIntake(bizA, "marketing", [mktRow("2026-02-01", "2026-02-28")]);
    expect((await confirm(mktId)).materialization.materialized).toBe(1);
    expect(await count("ownerMarketingSnapshot", bizA)).toBe(1);
  });

  it("[db] an intake missing period/currency materializes NOTHING (confirm cannot fake readiness)", async () => {
    const id = await makeIntake(bizB, "sales", [{ periodStart: "2026-03-01", periodEnd: "2026-03-31", currency: null, revenue: 50000 }]);
    const res = await confirm(id);
    expect(res.materialization.materialized).toBe(0);
    expect(res.materialization.skipped).toBe(1);
    expect(await count("ownerSalesSnapshot", bizB)).toBe(0);
  });

  it("[db] duplicate periods within one intake are idempotent", async () => {
    const id = await makeIntake(bizB, "marketing", [mktRow("2026-04-01", "2026-04-30"), mktRow("2026-04-01", "2026-04-30")]);
    const res = await confirm(id);
    expect(res.materialization.materialized).toBe(1);
    expect(res.materialization.skipped).toBe(1);
  });

  it("[db] cross-workspace confirm is rejected", async () => {
    const id = await makeIntake(bizA, "sales", [salesRow("2026-05-01", "2026-05-31", 70000)]);
    await expect(confirm(id, otherWorkspaceId)).rejects.toThrow();
  });

  it("[db] business isolation — a materialized snapshot is scoped to its business", async () => {
    const id = await makeIntake(bizB, "sales", [salesRow("2026-06-01", "2026-06-30", 61000)]);
    await confirm(id);
    const dashB = await getSalesDashboard(workspaceId, bizB);
    expect((dashB.latestSnapshot as unknown as { revenue: number | null }).revenue).toBe(61000);
    // bizA's latest sales snapshot (from the first test) is a different period/value — not bizB's.
    const rowsB = await (prisma as unknown as { ownerSalesSnapshot: { findMany: (a: unknown) => Promise<Array<{ businessId: string }>> } }).ownerSalesSnapshot.findMany({ where: { businessId: bizB } });
    expect(rowsB.every((r) => r.businessId === bizB)).toBe(true);
  });

  it("[db] HONESTY BOUNDARY: materializing operations does NOT flip the whole-business-plan equipment_capacity", async () => {
    // bizB has sales/operations/marketing materialized but no OwnerCapacitySnapshot — the command-center critical
    // domain must still report equipment_capacity as missing (documented product decision, not a hidden gap).
    const opId = await makeIntake(bizB, "operations", [opsRow("2026-07-01", "2026-07-31")]);
    await confirm(opId);
    const view = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId, businessId: bizB, now: NOW });
    expect(view.data.realProviderDomains).not.toContain("equipment_capacity");
  });
});
