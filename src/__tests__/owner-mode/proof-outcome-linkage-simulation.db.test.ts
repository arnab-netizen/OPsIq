/**
 * Proof ↔ Outcome Linkage — real-business DB simulation (laundry).
 *
 * Seeds the ACTUAL persisted proof lifecycle for one workspace: an accepted proof that is later
 * DISPUTED (recorded as real `proof.reviewed` audit transitions), plus a clean accepted proof.
 * Then it exercises the DB-backed linkage service, the reassessment-event creation service, and
 * the LIVE Owner Now View, asserting:
 *   - the accepted→contradicted link is measured from the real audit trail (PROOF_OUTCOME_INTEGRITY
 *     flips from NOT_MEASURABLE to a measured FAIL);
 *   - the credibility graph raises ACCEPTED_PROOF_WITH_BAD_OUTCOME for the operator;
 *   - the reassessment-event service creates a governed OwnerReassessmentEvent keyed to the proof
 *     (idempotently), which makes REASSESSMENT_LATENCY measurable;
 *   - a clean workspace stays NOT_MEASURABLE (no fabricated failure) and is fully isolated.
 *
 * Requires TEST_WITH_DB=true with the migrations applied.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getProofOutcomeLinkage } from "@/services/owner-mode/proof-outcome-linkage.service";
import { createReassessmentEvent } from "@/services/owner-mode/reassessment-event.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const opWeak = randomUUID();
const reviewer = randomUUID();
const wsL = randomUUID();      // laundry workspace (= ClientAccount id, so reassessment FK resolves)
const wsClean = randomUUID();
const bizL = randomUUID();
const proofReversed = randomUUID();
const proofClean = randomUUID();
const NOW = Date.now();
const H = 3_600_000;

async function reviewAudit(proofId: string, fromStatus: string | null, toStatus: string, occurredAt: Date, actorId: string) {
  await db.auditEvent.create({
    data: {
      id: randomUUID(), workspaceId: wsL, eventName: "proof.reviewed", actorId, actorType: "user",
      entityType: "proof", entityId: proofId, payload: { fromStatus, toStatus }, visibility: "internal", occurredAt,
    },
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Proof→Outcome Linkage — laundry accepted-then-reversed simulation", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [opWeak, "OpWeak"], [reviewer, "Reviewer"]] as const) {
      await db.user.create({ data: { id, email: `po-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `po-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

    // Proof 1: accepted, then DISPUTED (a real accepted-then-reversed contradiction).
    await db.proof.create({ data: { id: proofReversed, workspaceId: wsL, proofType: "photo", status: "DISPUTED", submittedByUserId: opWeak, reviewedByUserId: reviewer, reviewedAt: new Date(NOW - 5 * H), createdAt: new Date(NOW - 6 * H), updatedAt: new Date(NOW - 2 * H) } });
    await reviewAudit(proofReversed, "NEEDS_HUMAN_REVIEW", "ACCEPTED", new Date(NOW - 5 * H), reviewer);
    await reviewAudit(proofReversed, "ACCEPTED", "DISPUTED", new Date(NOW - 2 * H), reviewer);

    // Proof 2: accepted, never reversed (the honest denominator).
    await db.proof.create({ data: { id: proofClean, workspaceId: wsL, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, reviewedByUserId: reviewer, reviewedAt: new Date(NOW - 4 * H), createdAt: new Date(NOW - 5 * H), updatedAt: new Date(NOW - 4 * H) } });
    await reviewAudit(proofClean, "NEEDS_HUMAN_REVIEW", "ACCEPTED", new Date(NOW - 4 * H), reviewer);
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

  it("measures the accepted→contradicted link from the real proof.reviewed audit trail", async () => {
    const r = await getProofOutcomeLinkage(wsL, { db: db as never, now: () => NOW });
    expect(r.measurement.measurable).toBe(true);
    expect(r.measurement.acceptedProofCount).toBe(2);
    expect(r.measurement.contradictedCount).toBe(1);
    const link = r.links.find((l) => l.linkType === "PROOF_TO_BAD_RESULT_LINK")!;
    expect(link.status).toBe("LINKED");
    expect(link.sourceEntityId).toBe(proofReversed);
    expect(link.latencyMs).toBe(3 * H);
    expect(r.submitterContradictions).toEqual([{ actorId: opWeak, contradictedCount: 1, proofType: "photo" }]);
  });

  it("creates a governed reassessment keyed to the proof, idempotently", async () => {
    const first = await createReassessmentEvent({
      workspaceId: wsL, businessId: bizL, trigger: "evidence_retraction",
      triggerDescription: "accepted proof later disputed", sourceProofId: proofReversed, actorId: owner,
    });
    expect(first.deduped).toBe(false);
    expect(first.sourceProofId).toBe(proofReversed);

    const row = await db.ownerReassessmentEvent.findFirst({ where: { workspaceId: wsL, sourceProofId: proofReversed } });
    expect(row).toBeTruthy();
    const auditRow = await db.auditEvent.findFirst({ where: { workspaceId: wsL, eventName: "owner.reassessment_created", entityId: first.id } });
    expect(auditRow).toBeTruthy();

    // Second call with the same source reuses the open reassessment (no duplicate).
    const second = await createReassessmentEvent({
      workspaceId: wsL, businessId: bizL, trigger: "evidence_retraction",
      triggerDescription: "accepted proof later disputed", sourceProofId: proofReversed, actorId: owner,
    });
    expect(second.deduped).toBe(true);
    expect(second.id).toBe(first.id);
    const count = await db.ownerReassessmentEvent.count({ where: { workspaceId: wsL, sourceProofId: proofReversed } });
    expect(count).toBe(1);
  });

  it("flips PROOF_OUTCOME_INTEGRITY to measured + surfaces the contradiction via the live now-view", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const slo = (t: string) => out.businessControlHealth.slos.find((s) => s.sloType === t)!;

    // Was NOT_MEASURABLE last pass; now measured (1 of 2 accepted reversed → FAIL).
    expect(slo("PROOF_OUTCOME_INTEGRITY").status).toBe("FAIL");
    expect(slo("PROOF_OUTCOME_INTEGRITY").actualValue).toMatch(/50% reversed/);

    // The reassessment created above makes REASSESSMENT_LATENCY measurable (no longer NOT_MEASURABLE).
    expect(slo("REASSESSMENT_LATENCY").status).not.toBe("NOT_MEASURABLE");

    // Credibility raises the contradiction concern for the operator.
    expect(out.topCredibilityConcern?.signalType).toBe("ACCEPTED_PROOF_WITH_BAD_OUTCOME");

    // The linkage report is surfaced on the owner payload.
    expect(out.proofOutcomeLinkage?.measurement.contradictedCount).toBe(1);
  });

  it("a clean workspace stays NOT_MEASURABLE and is fully isolated (no bleed)", async () => {
    const r = await getProofOutcomeLinkage(wsClean, { db: db as never, now: () => NOW });
    expect(r.measurement.measurable).toBe(false);
    expect(r.measurement.contradictedCount).toBe(0);
    expect(r.links.every((l) => l.workspaceId === wsClean)).toBe(true);
    expect(r.links.some((l) => l.sourceEntityId === proofReversed)).toBe(false);

    const out = await getOwnerNowView(wsClean, null);
    expect(out.businessControlHealth.slos.find((s) => s.sloType === "PROOF_OUTCOME_INTEGRITY")!.status).toBe("NOT_MEASURABLE");
  });
});
