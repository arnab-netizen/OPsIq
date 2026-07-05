/**
 * Complaint / Rework Event Linkage — real-business DB simulation (laundry).
 *
 * Full live chain: an operator's proof is ACCEPTED, the customer reports a quality complaint, the
 * complaint event is recorded + linked to the accepted proof (LIVE service), and the proof is
 * disputed. The linked event is shown to make bad accepted work MEASURABLE across the stack:
 *   - getComplaintReworkLinks measures the proof→complaint linkage + attributes it to the operator;
 *   - the live now-view surfaces COMPLAINT_REVENUE_RISK (topProfitLeak) + ACCEPTED_PROOF_WITH_
 *     COMPLAINT (credibility) + PROOF_OUTCOME_INTEGRITY FAIL that now consumes the complaint;
 *   - reassessment is not duplicated; a clean workspace fabricates nothing; isolation holds.
 *
 * Requires TEST_WITH_DB=true with the operational_events migration applied.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { recordOperationalEvent, linkOperationalEventToProof, getComplaintReworkLinks } from "@/services/execution/complaint-rework.service";
import { disputeAcceptedProof } from "@/services/execution/proof-dispute.service";
import { OperationalEventType, ComplaintCategory } from "@/domain/execution/complaint-rework";
import { ProofDisputeCategory } from "@/domain/execution/proof-dispute";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const opWeak = randomUUID();
const reviewer = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const proofId = randomUUID();
const NOW = Date.now();
const H = 3_600_000;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Complaint/Rework Event Linkage — laundry quality complaint", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [opWeak, "OpWeak"], [reviewer, "Reviewer"]] as const) {
      await db.user.create({ data: { id, email: `cr-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `cr-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    await db.proof.create({ data: { id: proofId, workspaceId: wsL, businessId: bizL, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, reviewedByUserId: reviewer, reviewedAt: new Date(NOW - 5 * H), createdAt: new Date(NOW - 6 * H), updatedAt: new Date(NOW - 5 * H) } });
    await db.auditEvent.create({ data: { id: randomUUID(), workspaceId: wsL, eventName: "proof.reviewed", actorId: reviewer, actorType: "user", entityType: "proof", entityId: proofId, payload: { fromStatus: "NEEDS_HUMAN_REVIEW", toStatus: "ACCEPTED" }, visibility: "internal", occurredAt: new Date(NOW - 5 * H) } });
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

  it("records + links a complaint to the accepted proof (measurable, workspace-scoped)", async () => {
    // Cross-workspace record is refused (proof not in wsClean).
    const bad = await recordOperationalEvent({ workspaceId: wsClean, actorId: owner, eventType: OperationalEventType.COMPLAINT, category: ComplaintCategory.QUALITY_COMPLAINT, description: "wrong ws", relatedProofId: proofId });
    expect(bad.ok).toBe(false);

    const rec = await recordOperationalEvent({ workspaceId: wsL, actorId: owner, eventType: OperationalEventType.COMPLAINT, category: ComplaintCategory.QUALITY_COMPLAINT, description: "customer says stain remained after wash", relatedProofId: proofId });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    // Re-linking the same proof is idempotent.
    const link = await linkOperationalEventToProof({ workspaceId: wsL, actorId: owner, eventId: rec.eventId, proofId });
    expect(link.ok && link.deduped).toBe(true);

    const a = await getComplaintReworkLinks(wsL, { db: db as never, uuid: () => randomUUID(), now: () => NOW + 1000 });
    expect(a.measurement.proofComplaintMeasurable).toBe(true);
    expect(a.aggregates.complaintLinkedCount).toBe(1);
    expect(a.submitterComplaints).toEqual([{ actorId: opWeak, count: 1 }]);
  });

  it("the linked complaint alone drives profit / credibility / integrity via the now-view", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    // Linked complaint (no dispute yet) drives the profit leak + credibility + integrity.
    expect(out.topProfitLeak?.leakType).toBe("COMPLAINT_REVENUE_RISK");
    expect(out.topCredibilityConcern?.signalType).toBe("ACCEPTED_PROOF_WITH_COMPLAINT");
    expect(out.businessControlHealth.slos.find((s) => s.sloType === "PROOF_OUTCOME_INTEGRITY")!.status).toBe("FAIL");
    expect(out.complaintReworkLinks?.aggregates.complaintLinkedCount).toBe(1);
    // proof→complaint is now measurable in the proof-outcome report (was NOT_MEASURABLE).
    expect(out.proofOutcomeLinkage?.links.some((l) => l.linkType === "PROOF_TO_COMPLAINT_LINK" && l.status === "LINKED")).toBe(true);
  });

  it("disputing the complaint-linked proof creates one (idempotent) reassessment", async () => {
    const d = await disputeAcceptedProof({ workspaceId: wsL, proofId, actorId: reviewer, actorRole: TaskActorRole.MANAGER, category: ProofDisputeCategory.CUSTOMER_COMPLAINT, reason: "customer complaint — stain remained" });
    expect(d.ok).toBe(true);
    const again = await disputeAcceptedProof({ workspaceId: wsL, proofId, actorId: reviewer, actorRole: TaskActorRole.MANAGER, category: ProofDisputeCategory.CUSTOMER_COMPLAINT, reason: "customer complaint — stain remained" });
    expect(again.ok && again.deduped).toBe(true);
    const reassessCount = await db.ownerReassessmentEvent.count({ where: { workspaceId: wsL, sourceProofId: proofId } });
    expect(reassessCount).toBe(1);
  });

  it("a clean workspace fabricates no complaint/rework and is isolated", async () => {
    const a = await getComplaintReworkLinks(wsClean, { db: db as never, uuid: () => randomUUID(), now: () => NOW });
    expect(a.aggregates.complaintLinkedCount).toBe(0);
    expect(a.links.some((l) => l.eventId)).toBe(false);
    const out = await getOwnerNowView(wsClean, null);
    expect(out.topProfitLeak?.leakType).not.toBe("COMPLAINT_REVENUE_RISK");
  });
});
