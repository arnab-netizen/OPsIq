/**
 * Cross-Event Anti-Gaming Analytics — real-business multi-actor DB simulation (laundry).
 *
 * Owner + manager + two operators. One operator repeatedly submits weak proof and reuses a
 * proof; the manager self-reviews one item. The LIVE Owner Now View (which runs the analytics)
 * surfaces the highest-risk gaming pattern, owner-visibly, with reason codes and a specific
 * response — and a clean workspace returns DATA_INSUFFICIENT (no fabricated blame).
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { getGamingAnalysis } from "@/services/owner-mode/gaming-analytics.service";

const owner = randomUUID();
const manager = randomUUID();
const opWeak = randomUUID();
const opOk = randomUUID();
const wsLaundry = randomUUID();
const wsClean = randomUUID();
const bizLaundry = randomUUID();
const NOW = new Date("2026-07-05T00:00:00Z");

async function proof(over: Record<string, unknown>) {
  await db.proof.create({ data: { id: randomUUID(), workspaceId: wsLaundry, proofType: "photo", status: "SUBMITTED", updatedAt: NOW, ...over } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Anti-Gaming Analytics — laundry multi-actor simulation", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [manager, "Manager"], [opWeak, "OpWeak"], [opOk, "OpOk"]] as const) {
      await db.user.create({ data: { id, email: `ag-${id}@laundry.test`, name: nm, isActive: true, updatedAt: NOW } });
    }
    for (const id of [wsLaundry, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `ag-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.ownerBusiness.create({ data: { id: bizLaundry, workspaceId: wsLaundry, name: "Sparkle Laundry", businessType: "laundry", updatedAt: NOW } });

    // opWeak: 4 weak/review-needed proofs + 2 reused (duplicate-flagged).
    for (let i = 0; i < 4; i++) await proof({ submittedByUserId: opWeak, status: "NEEDS_HUMAN_REVIEW" });
    for (let i = 0; i < 2; i++) await proof({ submittedByUserId: opWeak, status: "SUBMITTED", duplicateFlagged: true });
    // opOk: clean submissions.
    for (let i = 0; i < 2; i++) await proof({ submittedByUserId: opOk, status: "ACCEPTED", reviewedByUserId: manager });
    // manager self-review (reviewer === submitter) — should be the top, highest-risk signal.
    await proof({ submittedByUserId: manager, reviewedByUserId: manager, status: "ACCEPTED" });
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsLaundry, wsClean] } } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsLaundry, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizLaundry } });
    await db.workspace.deleteMany({ where: { id: { in: [wsLaundry, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, manager, opWeak, opOk] } } });
  });

  it("surfaces the highest-risk gaming pattern (self-review) owner-visibly via the now-view", async () => {
    const out = await getOwnerNowView(wsLaundry, bizLaundry);
    expect(out.topGamingSignal).toBeTruthy();
    const g = out.topGamingSignal!;
    expect(g.signalType).toBe("SELF_REVIEW_ATTEMPT");
    expect(g.actorId).toBe(manager);
    expect(g.workspaceId).toBe(wsLaundry);
    // Reason codes + evidence, not a hidden score; a concrete owner response + reassessment.
    expect(g.reasonCodes).toContain("SELF_REVIEW");
    expect(g.evidence.length).toBeGreaterThan(0);
    expect(g.ownerActionRequired).toBe(true);
    expect(g.recommendedResponse.length).toBeGreaterThan(0);
    expect(g.reassessmentTrigger).toBeTruthy();
  });

  it("full analysis (owner-callable service) also flags the weak-proof operator by name", async () => {
    const analysis = await getGamingAnalysis(wsLaundry, {});
    const weak = analysis.signals.find((s) => s.signalType === "REPEATED_WEAK_PROOF" && s.actorId === opWeak);
    const reused = analysis.signals.find((s) => s.signalType === "REUSED_PROOF_PATTERN" && s.actorId === opWeak);
    expect(weak).toBeTruthy();
    expect(reused).toBeTruthy();
  });

  it("is deterministic across repeated live evaluations", async () => {
    const a = await getOwnerNowView(wsLaundry, bizLaundry);
    const b = await getOwnerNowView(wsLaundry, bizLaundry);
    expect(a.topGamingSignal!.signalType).toBe(b.topGamingSignal!.signalType);
    expect(a.topGamingSignal!.signalScore).toBe(b.topGamingSignal!.signalScore);
  });

  it("a clean workspace returns DATA_INSUFFICIENT and is isolated (no cross-workspace bleed)", async () => {
    const out = await getOwnerNowView(wsClean, null);
    expect(out.topGamingSignal!.signalType).toBe("DATA_INSUFFICIENT");
    const analysisClean = await getGamingAnalysis(wsClean, {});
    expect(analysisClean.signals.every((s) => s.actorId === null)).toBe(true); // no laundry actors leaked in
  });
});
