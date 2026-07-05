/**
 * Evidence Credibility Graph — real-business multi-actor DB simulation (laundry).
 *
 * Owner + manager + two operators. Operator A repeatedly submits weak/reused proof;
 * Operator B submits clean accepted proof; the manager self-reviews one item. The LIVE
 * Owner Now View (which builds the credibility graph) surfaces the top credibility concern
 * (self-review) owner-visibly with reason codes; the owner-callable service flags A as an
 * unreliable submitter and B as reliable-with-caveat. Clean workspace → DATA_INSUFFICIENT.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { getCredibilityGraph } from "@/services/owner-mode/evidence-credibility.service";

const owner = randomUUID();
const manager = randomUUID();
const opA = randomUUID();
const opB = randomUUID();
const wsLaundry = randomUUID();
const wsClean = randomUUID();
const bizLaundry = randomUUID();
const NOW = new Date("2026-07-05T00:00:00Z");

async function proof(over: Record<string, unknown>) {
  await db.proof.create({ data: { id: randomUUID(), workspaceId: wsLaundry, proofType: "photo", status: "SUBMITTED", updatedAt: NOW, ...over } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Evidence Credibility Graph — laundry multi-actor simulation", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [manager, "Manager"], [opA, "OpA"], [opB, "OpB"]] as const) {
      await db.user.create({ data: { id, email: `ec-${id}@laundry.test`, name: nm, isActive: true, updatedAt: NOW } });
    }
    for (const id of [wsLaundry, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `ec-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.ownerBusiness.create({ data: { id: bizLaundry, workspaceId: wsLaundry, name: "Sparkle Laundry", businessType: "laundry", updatedAt: NOW } });

    // Operator A: unreliable — 3 weak + 2 reused.
    for (let i = 0; i < 3; i++) await proof({ submittedByUserId: opA, status: "NEEDS_HUMAN_REVIEW" });
    for (let i = 0; i < 2; i++) await proof({ submittedByUserId: opA, status: "SUBMITTED", duplicateFlagged: true });
    // Operator B: reliable — 5 accepted, no contradiction data.
    for (let i = 0; i < 5; i++) await proof({ submittedByUserId: opB, status: "ACCEPTED", reviewedByUserId: manager });
    // Manager self-review (reviewer == submitter) — top, highest-risk credibility concern.
    await proof({ submittedByUserId: manager, reviewedByUserId: manager, status: "ACCEPTED" });
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsLaundry, wsClean] } } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsLaundry, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizLaundry } });
    await db.workspace.deleteMany({ where: { id: { in: [wsLaundry, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, manager, opA, opB] } } });
  });

  it("surfaces the top credibility concern (self-review) owner-visibly via the now-view", async () => {
    const out = await getOwnerNowView(wsLaundry, bizLaundry);
    expect(out.topCredibilityConcern).toBeTruthy();
    const c = out.topCredibilityConcern!;
    expect(c.signalType).toBe("SELF_REVIEW_BLOCKED_OR_ATTEMPTED");
    expect(c.entityId).toBe(manager);
    expect(c.workspaceId).toBe(wsLaundry);
    expect(c.reasonCodes).toContain("SELF_REVIEW");
    expect(c.relatedGamingSignal).toBe("SELF_REVIEW_ATTEMPT");
    expect(c.ownerActionRequired).toBe(true);
    expect(c.reassessmentTrigger).toBeTruthy();
  });

  it("owner-callable graph flags Operator A unreliable and Operator B reliable-with-caveat", async () => {
    const g = await getCredibilityGraph(wsLaundry, {});
    const a = g.findings.find((f) => f.signalType === "UNRELIABLE_SUBMITTER_PATTERN" && f.entityId === opA);
    const b = g.findings.find((f) => f.signalType === "RELIABLE_SUBMITTER_PATTERN" && f.entityId === opB);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(b!.severity).toBe("POSITIVE");
    expect(b!.missingData.join(" ")).toMatch(/outcome|complaint|rework/i);
  });

  it("is deterministic across repeated live evaluations", async () => {
    const a = await getOwnerNowView(wsLaundry, bizLaundry);
    const b = await getOwnerNowView(wsLaundry, bizLaundry);
    expect(a.topCredibilityConcern!.signalType).toBe(b.topCredibilityConcern!.signalType);
    expect(a.topCredibilityConcern!.credibilityScore).toBe(b.topCredibilityConcern!.credibilityScore);
  });

  it("a clean workspace returns DATA_INSUFFICIENT and is isolated", async () => {
    const out = await getOwnerNowView(wsClean, null);
    expect(out.topCredibilityConcern!.signalType).toBe("DATA_INSUFFICIENT");
    const gClean = await getCredibilityGraph(wsClean, {});
    expect(gClean.findings.every((f) => f.entityId === null)).toBe(true); // no laundry entities leaked in
  });
});
