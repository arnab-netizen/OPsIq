/**
 * Constraint / Bottleneck Engine — real-business DB simulation (laundry/dry-cleaning).
 *
 * Seeds a realistic day: a customer/quality issue (complaints + rework), weak retention
 * (churn), staff execution lag (overdue proofs), and an owner review queue. Then asks the
 * LIVE Owner Now View (which runs the Constraint Engine) for the single binding constraint,
 * and asserts it is specific, owner-visible, action-bearing, and workspace-isolated.
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
const OLD = new Date("2026-06-01T00:00:00Z"); // > 48h old → overdue

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Constraint Engine — laundry business binding-constraint simulation", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: userId, email: `ce-${userId}@laundry.test`, name: "Owner", isActive: true, updatedAt: NOW } });
    for (const id of [wsLaundry, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `ce-${id.slice(0, 8)}`, createdBy: userId } });
    }
    await db.ownerBusiness.create({ data: { id: bizLaundry, workspaceId: wsLaundry, name: "Sparkle Laundry", businessType: "laundry", updatedAt: NOW } });
    // Customer/quality + retention signal: 12 complaints, 6 rework, weak repeat rate.
    await db.ownerMetricSnapshot.create({
      data: {
        id: randomUUID(), workspaceId: wsLaundry, businessId: bizLaundry,
        periodStart: OLD, periodEnd: NOW, currency: "USD",
        revenue: 20000, complaintCount: 12, rewashCount: 6, newCustomers: 40, repeatCustomers: 8,
        updatedAt: NOW,
      },
    });
    // Staff execution lag: overdue proof submissions (created > 48h ago, still pending).
    for (let i = 0; i < 4; i++) {
      await db.proof.create({
        data: { id: randomUUID(), workspaceId: wsLaundry, proofType: "photo", status: "PENDING_SUBMISSION", createdAt: OLD, updatedAt: OLD },
      });
    }
    // Owner review queue: proofs awaiting human review.
    for (let i = 0; i < 2; i++) {
      await db.proof.create({
        data: { id: randomUUID(), workspaceId: wsLaundry, proofType: "photo", status: "NEEDS_HUMAN_REVIEW", updatedAt: NOW },
      });
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

  it("identifies the binding constraint and exposes it owner-visibly through the now-view", async () => {
    const out = await getOwnerNowView(wsLaundry, bizLaundry);
    expect(out.topConstraint).toBeTruthy();
    const c = out.topConstraint!;

    // Quality (12 complaints / 6 rework) is the binding operational constraint here.
    expect(c.constraintType).toBe("QUALITY");
    expect(c.workspaceId).toBe(wsLaundry);

    // Owner-visible standard: why it matters, evidence, a specific next action, success metric, reassessment.
    expect(c.ownerExplanation.length).toBeGreaterThan(0);
    expect(c.evidence.join(" ")).toMatch(/complaint|rework/i);
    expect(c.recommendedAction).toMatch(/SOP|fix|failure/i);
    expect(c.successMetric.length).toBeGreaterThan(0);
    expect(c.reassessmentTrigger.length).toBeGreaterThan(0);

    // The owner workload budget saw the same day's owner review queue.
    expect(out.workloadBudget.reviewsRequired).toBe(2);
  });

  it("is deterministic across repeated evaluations of the same state", async () => {
    const a = await getOwnerNowView(wsLaundry, bizLaundry);
    const b = await getOwnerNowView(wsLaundry, bizLaundry);
    expect(a.topConstraint!.constraintType).toBe(b.topConstraint!.constraintType);
    expect(a.topConstraint!.bindingScore).toBe(b.topConstraint!.bindingScore);
  });

  it("a clean workspace with no signals returns DATA_INSUFFICIENT, not a fabricated constraint", async () => {
    const out = await getOwnerNowView(wsClean, null);
    expect(out.topConstraint!.constraintType).toBe("DATA_INSUFFICIENT");
    expect(out.topConstraint!.missingData.length).toBeGreaterThan(0);
    // Cross-workspace isolation: the laundry's complaints/reviews do not bleed into wsClean.
    expect(out.workloadBudget.reviewsRequired).toBe(0);
  });
});
