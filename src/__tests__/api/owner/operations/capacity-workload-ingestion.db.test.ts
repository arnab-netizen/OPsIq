/**
 * [db]-gated P0-A runtime-readiness proof — the two previously-unwritable CRITICAL ingestion domains
 * (`equipment_capacity` / OwnerCapacitySnapshot, `owner_workload_memory` / OwnerWorkloadSnapshot) can now be written
 * through the SAME service the new routes call, and doing so lets a real business leave the structural
 * `need_more_data` wall (blocker B1). Also proves: with those two domains missing the plan is correctly stuck at
 * `need_more_data`, and the writers reject a cross-workspace business (isolation). Requires TEST_WITH_DB=true.
 *
 * NOTE: `seedOwnerDbCase` is used only to establish the OTHER seven critical domains (a realistic full business); the
 * capacity/workload transition itself is exercised through the real `saveCapacitySnapshot`/`saveOwnerWorkloadSnapshot`
 * service path — NOT via the seed — which is exactly what the new POST routes invoke.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedOwnerDbCase, cleanupOwnerDbCase, type OwnerDbCaseIds } from "../../../../../scripts/seed-owner-db-case";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import { saveCapacitySnapshot } from "@/services/owner-operations/capacity-snapshot.service";
import { saveOwnerWorkloadSnapshot } from "@/services/owner-operations/owner-workload-snapshot.service";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-06-29T00:00:00Z");
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
const businessId = randomUUID();
const cleanBusinessId = randomUUID();
const userId = randomUUID();
const ids: OwnerDbCaseIds = { workspaceId, businessId, userId, now: NOW };

const capacityInput = {
  workspaceId,
  businessId,
  resources: [{ type: "machine", utilization: 0.6 }],
  currentRevenue: 100000,
  safeUtilization: 0.85,
};
const workloadInput = {
  workspaceId,
  businessId,
  ownerMinutesPerDay: 300,
  sustainableMinutesPerDay: 480,
  ownerTasks: 8,
  ownerOnlyCriticalTasks: 2,
};

async function plan() {
  return getOwnerWholeBusinessPlan({ db: prisma, workspaceId, businessId, now: NOW });
}
async function deleteCapacityWorkload() {
  await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).ownerCapacitySnapshot.deleteMany({ where: { workspaceId, businessId } });
  await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).ownerWorkloadSnapshot.deleteMany({ where: { workspaceId, businessId } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] P0-A capacity/workload ingestion unblocks need_more_data", () => {
  beforeAll(async () => {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `p0a-${userId}@example.com`, name: "P0A", isActive: true, updatedAt: NOW } });
    for (const wid of [workspaceId, otherWorkspaceId]) {
      await (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({ where: { id: wid }, update: {}, create: { id: wid, name: `WS ${wid}`, slug: `ws-${wid}`, createdBy: userId } });
    }
    await seedOwnerDbCase(prisma, ids);
    // A clean business in the SAME workspace with NO snapshots and NO compliance block — so the missing-critical-data
    // signal resolves to the literal `need_more_data` wall (not outranked by a `blocked` boundary).
    await (prisma as unknown as { ownerBusiness: { upsert: (a: unknown) => Promise<unknown> } }).ownerBusiness.upsert({
      where: { id: cleanBusinessId }, update: {},
      create: { id: cleanBusinessId, workspaceId, name: "Clean P0A Business", businessType: "laundry_dry_cleaning", location: "Kolkata", currency: "INR", createdBy: userId },
    });
  });
  afterAll(async () => {
    await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).ownerBusiness.deleteMany({ where: { id: cleanBusinessId } });
    await cleanupOwnerDbCase(prisma, ids);
  });

  it("[db] baseline: full seeded business has all critical domains real and is NOT need_more_data", async () => {
    const v = await plan();
    expect(v.found).toBe(true);
    expect(v.data.criticalDomainsAllReal).toBe(true);
    expect(v.supervisor.actionStatus).not.toBe("need_more_data");
  });

  it("[db] the capacity/workload writers reject a cross-workspace business (isolation)", async () => {
    await expect(saveCapacitySnapshot({ ...capacityInput, workspaceId: otherWorkspaceId })).rejects.toThrow();
    await expect(saveOwnerWorkloadSnapshot({ ...workloadInput, workspaceId: otherWorkspaceId })).rejects.toThrow();
  });

  it("[db] the literal need_more_data wall: a clean business with no critical data cannot proceed", async () => {
    const v = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId, businessId: cleanBusinessId, now: NOW });
    expect(v.found).toBe(true);
    expect(v.data.criticalDomainsAllReal).toBe(false);
    expect(v.supervisor.actionStatus).toBe("need_more_data");
  });

  it("[db] B1 reproduced: deleting capacity+workload flips criticalDomainsAllReal false and blocks a confident proceed", async () => {
    await deleteCapacityWorkload();
    const v = await plan();
    // These two ARE load-bearing critical domains: with them missing the corpus can no longer be all-real,
    // so no confident `proceed` is possible (here a compliance boundary also dominates → `blocked`).
    expect(v.data.criticalDomainsAllReal).toBe(false);
    expect(["proceed", "cautious_proceed"]).not.toContain(v.supervisor.actionStatus);
  });

  it("[db] B1 unblocked: writing capacity+workload via the real service path (what the routes call) leaves need_more_data", async () => {
    await deleteCapacityWorkload();
    const cap = await saveCapacitySnapshot(capacityInput);
    const wl = await saveOwnerWorkloadSnapshot(workloadInput);
    expect(cap.workspaceId).toBe(workspaceId);
    expect(cap.businessId).toBe(businessId);
    expect(wl.workspaceId).toBe(workspaceId);
    expect(wl.businessId).toBe(businessId);
    const v = await plan();
    expect(v.data.criticalDomainsAllReal).toBe(true);
    expect(v.supervisor.actionStatus).not.toBe("need_more_data");
  });

  it("[db] the written snapshots are business-scoped and visible only under the owning workspace", async () => {
    const leak = await getOwnerWholeBusinessPlan({ db: prisma, workspaceId: otherWorkspaceId, businessId, now: NOW });
    expect(leak.found).toBe(false);
    expect(leak.data.criticalDomainsAllReal).toBe(false);
  });
});
