/**
 * Business-Control SLOs — real-business DB simulation (laundry).
 *
 * Seeds owner workload pressure + a weak/self-review proof pattern, then asks the LIVE Owner
 * Now View (which grades the SLOs) for control health. Asserts a mix — at least one PASS, one
 * WARN/FAIL, and one NOT_MEASURABLE (from a source that is genuinely not persisted) — with a
 * deterministic, explainable top control risk. No fake metrics; workspace isolation preserved.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { getBusinessControlHealth } from "@/services/owner-mode/business-control-slo.service";

const owner = randomUUID();
const manager = randomUUID();
const opWeak = randomUUID();
const wsLaundry = randomUUID();
const wsClean = randomUUID();
const bizLaundry = randomUUID();
const NOW = new Date("2026-07-05T00:00:00Z");
const OLD = new Date("2026-06-01T00:00:00Z");

async function proof(over: Record<string, unknown>) {
  await db.proof.create({ data: { id: randomUUID(), workspaceId: wsLaundry, proofType: "photo", status: "SUBMITTED", updatedAt: NOW, ...over } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Business-Control SLOs — laundry control-health simulation", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [manager, "Manager"], [opWeak, "OpWeak"]] as const) {
      await db.user.create({ data: { id, email: `bc-${id}@laundry.test`, name: nm, isActive: true, updatedAt: NOW } });
    }
    for (const id of [wsLaundry, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `bc-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.ownerBusiness.create({ data: { id: bizLaundry, workspaceId: wsLaundry, name: "Sparkle Laundry", businessType: "laundry", updatedAt: NOW } });
    // 5 overdue weak proofs (drives weak-proof-rate FAIL + overdue-review + owner review load) + a self-review.
    for (let i = 0; i < 5; i++) await proof({ submittedByUserId: opWeak, status: "NEEDS_HUMAN_REVIEW", createdAt: OLD });
    await proof({ submittedByUserId: manager, reviewedByUserId: manager, status: "ACCEPTED" }); // self-review
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsLaundry, wsClean] } } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsLaundry, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizLaundry } });
    await db.workspace.deleteMany({ where: { id: { in: [wsLaundry, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, manager, opWeak] } } });
  });

  it("grades control health and exposes a top control risk via the live now-view", async () => {
    const out = await getOwnerNowView(wsLaundry, bizLaundry);
    const h = out.businessControlHealth;
    expect(h).toBeTruthy();
    expect(h.workspaceId).toBe(wsLaundry);

    // A genuine mix — no always-green.
    expect(h.slos.some((s) => s.status === "PASS")).toBe(true);
    expect(h.slos.some((s) => s.status === "WARN" || s.status === "FAIL")).toBe(true);
    expect(h.slos.some((s) => s.status === "NOT_MEASURABLE")).toBe(true);

    // Weak-proof rate FAILs (5/6 weak) with a real measured value.
    const weakRate = h.slos.find((s) => s.sloType === "WEAK_PROOF_REVIEW_RATE")!;
    expect(weakRate.status).toBe("FAIL");
    expect(weakRate.actualValue).toMatch(/\d+%/);

    // Anti-gaming risk FAILs (self-review) and links the gaming signal.
    const gaming = h.slos.find((s) => s.sloType === "ANTI_GAMING_RISK")!;
    expect(gaming.status).toBe("FAIL");
    expect(gaming.relatedGamingSignal).toBeTruthy();

    // Reassessment latency is honestly NOT_MEASURABLE (source not persisted).
    const reeval = h.slos.find((s) => s.sloType === "REASSESSMENT_LATENCY")!;
    expect(reeval.status).toBe("NOT_MEASURABLE");
    expect(reeval.missingData.length).toBeGreaterThan(0);

    // Top control risk is a real WARN/FAIL, owner-visible with a corrective action.
    expect(["WARN", "FAIL"]).toContain(h.topControlRisk!.status);
    expect(h.topControlRisk!.recommendedAction.length).toBeGreaterThan(0);
  });

  it("owner-callable getBusinessControlHealth returns the same graded health", async () => {
    const h = await getBusinessControlHealth(wsLaundry, bizLaundry);
    expect(h.overallStatus).toBe("FAIL");
    expect(h.failCount).toBeGreaterThan(0);
  });

  it("is deterministic across repeated live evaluations", async () => {
    const a = await getOwnerNowView(wsLaundry, bizLaundry);
    const b = await getOwnerNowView(wsLaundry, bizLaundry);
    expect(a.businessControlHealth.overallStatus).toBe(b.businessControlHealth.overallStatus);
    expect(a.businessControlHealth.topControlRisk!.sloType).toBe(b.businessControlHealth.topControlRisk!.sloType);
  });

  it("a clean workspace grades PASS/NOT_MEASURABLE (no fabricated failures) and is isolated", async () => {
    const out = await getOwnerNowView(wsClean, null);
    const h = out.businessControlHealth;
    expect(h.failCount).toBe(0);
    // The laundry's weak proofs do not bleed into the clean workspace's weak-proof rate.
    const weakRate = h.slos.find((s) => s.sloType === "WEAK_PROOF_REVIEW_RATE")!;
    expect(weakRate.status).toBe("NOT_MEASURABLE"); // no proofs in the clean workspace
  });
});
