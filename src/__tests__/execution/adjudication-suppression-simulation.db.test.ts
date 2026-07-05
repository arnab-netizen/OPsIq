/**
 * Adjudication suppression across all proof-risk sources — real-business DB simulation (laundry).
 *
 * Operator `opWeak` reuses one photo hash across jobs, which surfaces (a) a REUSED_PROOF_PATTERN
 * anti-gaming signal, (b) a REUSED_PROOF credibility concern, and (c) reused-hash findings. The owner
 * adjudicates each source independently and OpsIQ suppresses ONLY the adjudicated source, keeps the
 * others visible, RE-SURFACES on new evidence (a new reused proof), keeps confirmed risk active, and
 * never marks bad proof good (PROOF_OUTCOME_INTEGRITY stays FAIL after a dispute is dismissed). No
 * fraud/theft label; a clean workspace fabricates nothing; workspace isolation holds.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { adjudicateProofRiskFinding } from "@/services/execution/proof-risk-adjudication.service";
import { AdjudicationOutcome, AdjudicationSourceType } from "@/domain/execution/proof-risk-adjudication";
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
const proofA = randomUUID();
const proofB = randomUUID();
const proofC = randomUUID();
const taskA = randomUUID();
const taskB = randomUUID();
const taskC = randomUUID();
const HASH = "e".repeat(64);
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /fraud|fraudster|theft|thief/i;

const gamingRef = `REUSED_PROOF_PATTERN:${opWeak}`;
const credRef = `REUSED_PROOF:${opWeak}`;
const slo = (out: Awaited<ReturnType<typeof getOwnerNowView>>, t: string) =>
  out.businessControlHealth.slos.find((s) => s.sloType === t)!;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Adjudication suppression across sources (laundry)", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [opWeak, "OpWeak"], [reviewer, "Reviewer"]] as const) {
      await db.user.create({ data: { id, email: `sup-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `sup-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    for (const [id, task, ago] of [[proofA, taskA, 6], [proofB, taskB, 5]] as const) {
      await db.proof.create({ data: { id, workspaceId: wsL, businessId: bizL, taskId: task, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, fileHash: HASH, duplicateFlagged: id === proofB, createdAt: new Date(NOW - ago * H), updatedAt: new Date(NOW - ago * H) } });
    }
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.proofRiskAdjudication.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, opWeak, reviewer] } } });
  });

  it("baseline: reused proof drives gaming + credibility + reused findings", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.topGamingSignal?.signalType).toBe("REUSED_PROOF_PATTERN");
    expect(out.topCredibilityConcern?.signalType).toBe("REUSED_PROOF");
    expect(out.reusedProofFindings?.needsReviewCount).toBe(2);
    expect(slo(out, "ANTI_GAMING_RISK").status).toBe("FAIL");
  });

  it("dismissing the ANTI_GAMING_SIGNAL suppresses ONLY the gaming signal (per-source scope)", async () => {
    const r = await adjudicateProofRiskFinding({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      sourceType: AdjudicationSourceType.ANTI_GAMING_SIGNAL, sourceRef: gamingRef,
      outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE, reason: "checked both jobs; genuinely different photos",
      proofIds: [proofA, proofB],
    });
    expect(r.ok).toBe(true);

    const out = await getOwnerNowView(wsL, bizL);
    // Gaming signal suppressed + SLO eases; the credibility concern (different source) stays visible.
    expect(out.topGamingSignal?.signalType).not.toBe("REUSED_PROOF_PATTERN");
    expect(slo(out, "ANTI_GAMING_RISK").status).not.toBe("FAIL");
    expect(out.topCredibilityConcern?.signalType).toBe("REUSED_PROOF");
    // The reused-hash source is not cleared, so its findings remain.
    expect(out.reusedProofFindings?.needsReviewCount).toBe(2);
    expect(out.proofRiskAdjudicationSummary?.clearedCount).toBe(1);
    expect(JSON.stringify(out.proofRiskAdjudications)).not.toMatch(NO_FRAUD);
  });

  it("dismissing the CREDIBILITY_CONCERN suppresses the credibility concern too", async () => {
    await adjudicateProofRiskFinding({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      sourceType: AdjudicationSourceType.CREDIBILITY_CONCERN, sourceRef: credRef,
      outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE, reason: "same review as above; not a reuse concern",
      proofIds: [proofA, proofB],
    });
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.topCredibilityConcern?.signalType).not.toBe("REUSED_PROOF");
  });

  it("new evidence (a NEW reused proof) re-surfaces the gaming risk; CONFIRM then keeps it active", async () => {
    await db.proof.create({ data: { id: proofC, workspaceId: wsL, businessId: bizL, taskId: taskC, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, reviewedByUserId: reviewer, reviewedAt: new Date(NOW - 4 * H), fileHash: HASH, createdAt: new Date(NOW - 4.5 * H), updatedAt: new Date(NOW - 4 * H) } });
    await db.auditEvent.create({ data: { id: randomUUID(), workspaceId: wsL, eventName: "proof.reviewed", actorId: reviewer, actorType: "user", entityType: "proof", entityId: proofC, payload: { fromStatus: "NEEDS_HUMAN_REVIEW", toStatus: "ACCEPTED" }, visibility: "internal", occurredAt: new Date(NOW - 4 * H) } });

    // A new supporting proof (proofC) is not covered by the earlier dismissal → the risk re-surfaces.
    const resurfaced = await getOwnerNowView(wsL, bizL);
    expect(resurfaced.topGamingSignal?.signalType).toBe("REUSED_PROOF_PATTERN");
    expect(resurfaced.reusedProofFindings?.needsReviewCount).toBe(3);

    // Owner CONFIRMS (updates the same gaming adjudication key) — confirm is not a clearing decision.
    const r = await adjudicateProofRiskFinding({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      sourceType: AdjudicationSourceType.ANTI_GAMING_SIGNAL, sourceRef: gamingRef,
      outcome: AdjudicationOutcome.CONFIRM_SUSPICIOUS_PATTERN, reason: "third reuse of the same photo; keep active for review",
      proofIds: [proofA, proofB, proofC],
    });
    expect(r.ok && r.updated).toBe(true);
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.topGamingSignal?.signalType).toBe("REUSED_PROOF_PATTERN"); // confirmed → stays visible
    expect(slo(out, "ANTI_GAMING_RISK").status).toBe("FAIL");
  });

  it("dismissing the REUSED_HASH_FINDING for A+B leaves the new proof C still flagged", async () => {
    await adjudicateProofRiskFinding({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      sourceType: AdjudicationSourceType.REUSED_HASH_FINDING, sourceRef: proofA,
      outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE, reason: "A and B verified as different jobs",
      proofIds: [proofA, proofB],
    });
    const out = await getOwnerNowView(wsL, bizL);
    // A + B suppressed from the reused findings; C (new evidence) remains.
    expect(out.reusedProofFindings?.findings.every((f) => f.proofId !== proofA && f.proofId !== proofB)).toBe(true);
    expect(out.reusedProofFindings?.findings.some((f) => f.proofId === proofC)).toBe(true);
  });

  it("dismissing a PROOF_DISPUTE never marks bad proof good — integrity stays FAIL (audit retained)", async () => {
    const d = await disputeAcceptedProof({ workspaceId: wsL, proofId: proofC, actorId: reviewer, actorRole: TaskActorRole.MANAGER, category: ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF, reason: "reused photo across jobs" });
    expect(d.ok).toBe(true);
    expect(slo(await getOwnerNowView(wsL, bizL), "PROOF_OUTCOME_INTEGRITY").status).toBe("FAIL");

    await adjudicateProofRiskFinding({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      sourceType: AdjudicationSourceType.PROOF_DISPUTE, sourceRef: proofC,
      outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE, reason: "dispute reviewed; reducing review burden",
      proofIds: [proofC],
    });
    const out = await getOwnerNowView(wsL, bizL);
    // Integrity is audit-derived and must NOT be erased by a dispute adjudication.
    expect(slo(out, "PROOF_OUTCOME_INTEGRITY").status).toBe("FAIL");
    // The proof.disputed audit is retained.
    expect(await db.auditEvent.count({ where: { workspaceId: wsL, eventName: "proof.disputed", entityId: proofC } })).toBe(1);
  });

  it("a clean workspace fabricates no adjudication state and is isolated", async () => {
    const out = await getOwnerNowView(wsClean, null);
    expect(out.proofRiskAdjudications).toEqual([]);
    expect(out.proofRiskAdjudicationSummary?.total ?? 0).toBe(0);
    expect(out.reusedProofFindings?.needsReviewCount ?? 0).toBe(0);
  });
});
