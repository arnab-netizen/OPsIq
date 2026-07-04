/**
 * Profit-Leak Radar — real-business DB simulation (laundry/dry-cleaning).
 *
 * Seeds a realistic day: heavy discounting (25% of revenue), some complaints, weak repeat
 * rate, and an owner review queue. Asks the LIVE Owner Now View (which runs the radar) for
 * the top profit leak and asserts it is the discount leak — reported with the REAL discount
 * figure (no fabricated saving), owner-gated, action-bearing, and workspace-isolated.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const userId = randomUUID();
const wsLaundry = randomUUID();
const wsClean = randomUUID();
const bizLaundry = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");
const OLD = new Date("2026-06-01T00:00:00Z");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Profit-Leak Radar — laundry discount-abuse simulation", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: userId, email: `pl-${userId}@laundry.test`, name: "Owner", isActive: true, updatedAt: NOW } });
    for (const id of [wsLaundry, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `pl-${id.slice(0, 8)}`, createdBy: userId } });
    }
    await db.ownerBusiness.create({ data: { id: bizLaundry, workspaceId: wsLaundry, name: "Sparkle Laundry", businessType: "laundry", updatedAt: NOW } });
    // Discount abuse: 5000 of 20000 revenue (25%) discounted, plus some complaints + weak repeat.
    await db.ownerMetricSnapshot.create({
      data: {
        id: randomUUID(), workspaceId: wsLaundry, businessId: bizLaundry, periodStart: OLD, periodEnd: NOW, currency: "USD",
        revenue: 20000, discountAmount: 5000, complaintCount: 4, newCustomers: 40, repeatCustomers: 10, updatedAt: NOW,
      },
    });
    // Owner review queue.
    for (let i = 0; i < 2; i++) {
      await db.proof.create({ data: { id: randomUUID(), workspaceId: wsLaundry, proofType: "photo", status: "NEEDS_HUMAN_REVIEW", updatedAt: NOW } });
    }
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsLaundry, wsClean] } } });
    await db.ownerMetricSnapshot.deleteMany({ where: { workspaceId: wsLaundry } });
    await db.proof.deleteMany({ where: { workspaceId: wsLaundry } });
    await db.ownerBusiness.deleteMany({ where: { id: bizLaundry } });
    await db.workspace.deleteMany({ where: { id: { in: [wsLaundry, wsClean] } } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  it("surfaces the discount leak (with the real figure) through the live now-view", async () => {
    const out = await getOwnerNowView(wsLaundry, bizLaundry);
    expect(out.topProfitLeak).toBeTruthy();
    const leak = out.topProfitLeak!;

    expect(leak.leakType).toBe("DISCOUNT_LEAK");
    expect(leak.workspaceId).toBe(wsLaundry);
    // Real figure reported; recoverable portion is owner judgment (no fabricated saving).
    expect(leak.estimatedImpact.rangeHigh).toBe(5000);
    expect(leak.estimatedImpact.note).toMatch(/recoverable|not a guaranteed/i);
    // Owner-visible standard.
    expect(leak.ownerApprovalRequired).toBe(true);
    expect(leak.evidence.join(" ")).toMatch(/discount/i);
    expect(leak.recommendedAction.length).toBeGreaterThan(0);
    expect(leak.successMetric.length).toBeGreaterThan(0);
    expect(leak.stopLoss.length).toBeGreaterThan(0);
    expect(leak.reassessmentTrigger.length).toBeGreaterThan(0);
  });

  it("is deterministic across repeated live evaluations", async () => {
    const a = await getOwnerNowView(wsLaundry, bizLaundry);
    const b = await getOwnerNowView(wsLaundry, bizLaundry);
    expect(a.topProfitLeak!.leakType).toBe(b.topProfitLeak!.leakType);
    expect(a.topProfitLeak!.leakScore).toBe(b.topProfitLeak!.leakScore);
  });

  it("a clean workspace returns DATA_INSUFFICIENT (no fabricated leak) and is isolated", async () => {
    const out = await getOwnerNowView(wsClean, null);
    expect(out.topProfitLeak!.leakType).toBe("DATA_INSUFFICIENT");
    expect(out.topProfitLeak!.missingData.length).toBeGreaterThan(0);
    expect(out.workloadBudget.reviewsRequired).toBe(0); // laundry's queue does not bleed in
  });
});
