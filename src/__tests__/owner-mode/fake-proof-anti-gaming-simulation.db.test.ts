/**
 * Fake / reused / suspicious proof-DISPUTE → Anti-Gaming — real-business DB simulation (laundry).
 *
 * An operator's two accepted proofs are each disputed as SUSPECTED_FAKE_OR_REUSED_PROOF (a real
 * governed dispute, not a fabricated label). The live now-view is shown to:
 *   - surface a SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN as the top anti-gaming signal, attributed to
 *     the operator, with reason codes + proof refs (no "fraud" label, no hidden score);
 *   - fail the ANTI_GAMING_RISK SLO;
 *   - keep a related evidence-credibility concern for the same operator;
 *   - link the staff/weak-proof profit leak + constraint that the dispute already drives.
 * A clean workspace fabricates no signal and isolation holds.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { disputeAcceptedProof } from "@/services/execution/proof-dispute.service";
import { ProofDisputeCategory } from "@/domain/execution/proof-dispute";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const opWeak = randomUUID();
const reviewer = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const proof1 = randomUUID();
const proof2 = randomUUID();
const NOW = Date.now();
const H = 3_600_000;

const NO_FRAUD_LABEL = /fraud|fraudster|theft|thief/i;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Fake/reused proof dispute → Anti-Gaming (laundry)", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [opWeak, "OpWeak"], [reviewer, "Reviewer"]] as const) {
      await db.user.create({ data: { id, email: `fp-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `fp-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    for (const [id, ago] of [[proof1, 6], [proof2, 5]] as const) {
      await db.proof.create({ data: { id, workspaceId: wsL, businessId: bizL, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, reviewedByUserId: reviewer, reviewedAt: new Date(NOW - ago * H), createdAt: new Date(NOW - (ago + 1) * H), updatedAt: new Date(NOW - ago * H) } });
      await db.auditEvent.create({ data: { id: randomUUID(), workspaceId: wsL, eventName: "proof.reviewed", actorId: reviewer, actorType: "user", entityType: "proof", entityId: id, payload: { fromStatus: "NEEDS_HUMAN_REVIEW", toStatus: "ACCEPTED" }, visibility: "internal", occurredAt: new Date(NOW - ago * H) } });
    }
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.operationalEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, opWeak, reviewer] } } });
  });

  it("two accepted proofs disputed as suspected-fake create a repeated anti-gaming pattern", async () => {
    for (const proofId of [proof1, proof2]) {
      const d = await disputeAcceptedProof({ workspaceId: wsL, proofId, actorId: reviewer, actorRole: TaskActorRole.MANAGER, category: ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF, reason: "photo appears reused from an earlier job" });
      expect(d.ok).toBe(true);
    }

    const out = await getOwnerNowView(wsL, bizL);
    // Anti-gaming surfaces the fake/reused pattern, attributed to the operator, as the top signal.
    expect(out.topGamingSignal?.signalType).toBe("SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN");
    expect(out.topGamingSignal?.isRepeatedPattern).toBe(true);
    expect(out.topGamingSignal?.actorId).toBe(opWeak);
    expect(out.topGamingSignal?.reasonCodes).toContain("REPEATED_SUSPECTED_FAKE_OR_REUSED_PROOF_DISPUTE");
    expect(out.topGamingSignal?.evidence.some((e) => /proof refs/i.test(e))).toBe(true);
    expect(out.topGamingSignal?.ownerActionRequired).toBe(true);
    // No unsupported fraud accusation anywhere in the signal.
    expect(JSON.stringify(out.topGamingSignal)).not.toMatch(NO_FRAUD_LABEL);
    // The ANTI_GAMING_RISK SLO reflects it.
    expect(out.businessControlHealth.slos.find((s) => s.sloType === "ANTI_GAMING_RISK")!.status).toBe("FAIL");
    // A related evidence-credibility concern remains for the same operator (not duplicated here).
    expect(out.topCredibilityConcern).toBeTruthy();
    // The dispute already drives the staff/weak-proof profit leak + constraint the signal links to.
    expect(out.topGamingSignal?.relatedConstraint === "STAFF" || out.topConstraint?.constraintType === "STAFF").toBe(true);
  });

  it("a clean workspace fabricates no anti-gaming signal and is isolated", async () => {
    const out = await getOwnerNowView(wsClean, null);
    expect(out.topGamingSignal?.signalType).not.toBe("SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN");
  });
});
