/**
 * Governed Proof Dispute — real-business DB simulation (laundry).
 *
 * Full live flow: an operator's proof is ACCEPTED, then an authorized reviewer disputes it because
 * the customer needed a rewash. Exercises the LIVE dispute service (real DB + real reassessment
 * creation) and asserts the governed contradiction propagates end-to-end:
 *   - proof reverses ACCEPTED → DISPUTED with both audits (proof.reviewed + proof.disputed);
 *   - a governed OwnerReassessmentEvent is created, keyed to the proof, idempotently;
 *   - the Proof↔Outcome Linkage now measures the contradiction;
 *   - the live Owner Now View shows PROOF_OUTCOME_INTEGRITY FAIL + the credibility concern;
 *   - SoD blocks the operator from disputing their own proof;
 *   - a cross-workspace dispute fails closed; a clean workspace stays NOT_MEASURABLE.
 *
 * Requires TEST_WITH_DB=true. No schema change this pass — the dispute reuses the proof.reviewed
 * audit trail + reviewReason and adds a proof.disputed governed record.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { disputeAcceptedProof } from "@/services/execution/proof-dispute.service";
import { ProofDisputeCategory } from "@/domain/execution/proof-dispute";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import { getProofOutcomeLinkage } from "@/services/owner-mode/proof-outcome-linkage.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const opWeak = randomUUID();
const reviewer = randomUUID();
const wsL = randomUUID();      // = ClientAccount id, so reassessment FK resolves
const wsClean = randomUUID();
const bizL = randomUUID();
const proofId = randomUUID();
const NOW = Date.now();
const H = 3_600_000;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Governed Proof Dispute — laundry rewash dispute simulation", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [opWeak, "OpWeak"], [reviewer, "Reviewer"]] as const) {
      await db.user.create({ data: { id, email: `pd-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `pd-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

    // Operator's proof, ACCEPTED by the reviewer 5h ago (the original acceptance audit).
    await db.proof.create({ data: { id: proofId, workspaceId: wsL, businessId: bizL, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, reviewedByUserId: reviewer, reviewedAt: new Date(NOW - 5 * H), createdAt: new Date(NOW - 6 * H), updatedAt: new Date(NOW - 5 * H) } });
    await db.auditEvent.create({ data: { id: randomUUID(), workspaceId: wsL, eventName: "proof.reviewed", actorId: reviewer, actorType: "user", entityType: "proof", entityId: proofId, payload: { fromStatus: "NEEDS_HUMAN_REVIEW", toStatus: "ACCEPTED" }, visibility: "internal", occurredAt: new Date(NOW - 5 * H) } });
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, opWeak, reviewer] } } });
  });

  it("SoD: the operator cannot dispute their own proof", async () => {
    const r = await disputeAcceptedProof({ workspaceId: wsL, proofId, actorId: opWeak, actorRole: TaskActorRole.MANAGER, category: ProofDisputeCategory.QUALITY_FAILURE, reason: "self dispute attempt" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/separation of duty/i);
    const row = await db.proof.findFirst({ where: { id: proofId } });
    expect(row?.status).toBe("ACCEPTED"); // unchanged
  });

  it("a cross-workspace dispute fails closed", async () => {
    const r = await disputeAcceptedProof({ workspaceId: wsClean, proofId, actorId: reviewer, actorRole: TaskActorRole.MANAGER, category: ProofDisputeCategory.QUALITY_FAILURE, reason: "wrong workspace" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not found/i);
  });

  it("authorized reviewer disputes: reversal + dual audit + keyed reassessment (idempotent)", async () => {
    const r = await disputeAcceptedProof({ workspaceId: wsL, proofId, actorId: reviewer, actorRole: TaskActorRole.MANAGER, category: ProofDisputeCategory.REWORK_REQUIRED, reason: "customer returned item — rewash required" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("DISPUTED");
    expect(r.reassessmentEventId).toBeTruthy();

    const row = await db.proof.findFirst({ where: { id: proofId } });
    expect(row?.status).toBe("DISPUTED");
    expect(row?.reviewReason).toMatch(/rewash/i);

    const reviewedAudit = await db.auditEvent.findFirst({ where: { workspaceId: wsL, eventName: "proof.reviewed", entityId: proofId, occurredAt: { gte: new Date(NOW - 60_000) } } });
    expect(reviewedAudit).toBeTruthy();
    const disputedAudit = await db.auditEvent.findFirst({ where: { workspaceId: wsL, eventName: "proof.disputed", entityId: proofId } });
    expect(disputedAudit).toBeTruthy();
    const reassess = await db.ownerReassessmentEvent.findFirst({ where: { workspaceId: wsL, sourceProofId: proofId } });
    expect(reassess).toBeTruthy();

    // Idempotent: a repeated dispute is a safe no-op (no second reassessment).
    const again = await disputeAcceptedProof({ workspaceId: wsL, proofId, actorId: reviewer, actorRole: TaskActorRole.MANAGER, category: ProofDisputeCategory.REWORK_REQUIRED, reason: "customer returned item — rewash required" });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.deduped).toBe(true);
    const reassessCount = await db.ownerReassessmentEvent.count({ where: { workspaceId: wsL, sourceProofId: proofId } });
    expect(reassessCount).toBe(1);
  });

  it("the dispute propagates to linkage, credibility, SLO and the live now-view", async () => {
    const linkage = await getProofOutcomeLinkage(wsL, { db: db as never, now: () => NOW + 1000 });
    expect(linkage.measurement.contradictedCount).toBe(1);
    expect(linkage.measurement.acceptedProofCount).toBe(1);

    const out = await getOwnerNowView(wsL, bizL);
    const slo = out.businessControlHealth.slos.find((s) => s.sloType === "PROOF_OUTCOME_INTEGRITY")!;
    expect(slo.status).toBe("FAIL");
    expect(slo.actualValue).toMatch(/100% reversed/);
    expect(out.topCredibilityConcern?.signalType).toBe("ACCEPTED_PROOF_WITH_BAD_OUTCOME");
    expect(out.proofOutcomeLinkage?.measurement.contradictedCount).toBe(1);
  });

  it("a clean workspace stays NOT_MEASURABLE (no fabricated failure) and is isolated", async () => {
    const linkage = await getProofOutcomeLinkage(wsClean, { db: db as never, now: () => NOW });
    expect(linkage.measurement.measurable).toBe(false);
    expect(linkage.links.some((l) => l.sourceEntityId === proofId)).toBe(false);
    const out = await getOwnerNowView(wsClean, null);
    expect(out.businessControlHealth.slos.find((s) => s.sloType === "PROOF_OUTCOME_INTEGRITY")!.status).toBe("NOT_MEASURABLE");
  });
});
