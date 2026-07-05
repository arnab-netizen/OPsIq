/**
 * Per-proof evidence lists → adjudicable self-review — real-business DB simulation (laundry).
 *
 * Operator `opWeak` reviews their OWN proofs (self-review — separation of duty bypassed). The
 * anti-gaming SELF_REVIEW_ATTEMPT signal + the SELF_REVIEW_BLOCKED_OR_ATTEMPTED credibility concern
 * now carry the exact supporting proof IDs (sourceCompleteness COMPLETE), so the owner can fairly
 * adjudicate them: a DISMISS_FALSE_POSITIVE suppresses the exact signal, and a NEW self-reviewed proof
 * re-surfaces it. No fraud/theft label; a clean workspace fabricates nothing; isolation holds.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { adjudicateProofRiskFinding } from "@/services/execution/proof-risk-adjudication.service";
import { AdjudicationOutcome, AdjudicationSourceType } from "@/domain/execution/proof-risk-adjudication";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const opWeak = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const p1 = randomUUID();
const p2 = randomUUID();
const p3 = randomUUID();
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /fraud|fraudster|theft|thief/i;

const gamingRef = `SELF_REVIEW_ATTEMPT:${opWeak}`;
const credRef = `SELF_REVIEW_BLOCKED_OR_ATTEMPTED:${opWeak}`;
const slo = (out: Awaited<ReturnType<typeof getOwnerNowView>>, t: string) =>
  out.businessControlHealth.slos.find((s) => s.sloType === t)!;

async function selfReviewedProof(id: string, ago: number) {
  // Operator both submits AND reviews (self-review — the pattern the signal catches).
  await db.proof.create({ data: { id, workspaceId: wsL, businessId: bizL, taskId: randomUUID(), proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, reviewedByUserId: opWeak, reviewedAt: new Date(NOW - ago * H), createdAt: new Date(NOW - (ago + 1) * H), updatedAt: new Date(NOW - ago * H) } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Per-proof evidence → adjudicable self-review (laundry)", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [opWeak, "OpWeak"]] as const) {
      await db.user.create({ data: { id, email: `pe-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `pe-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    await selfReviewedProof(p1, 6);
    await selfReviewedProof(p2, 5);
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.proofRiskAdjudication.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, opWeak] } } });
  });

  it("the self-review signal carries supporting proof IDs (COMPLETE)", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.topGamingSignal?.signalType).toBe("SELF_REVIEW_ATTEMPT");
    expect(out.topGamingSignal?.sourceCompleteness).toBe("COMPLETE");
    expect((out.topGamingSignal?.supportingProofIds ?? []).sort()).toEqual([p1, p2].sort());
    expect(out.topCredibilityConcern?.signalType).toBe("SELF_REVIEW_BLOCKED_OR_ATTEMPTED");
    expect((out.topCredibilityConcern?.supportingProofIds ?? []).length).toBe(2);
    expect(slo(out, "ANTI_GAMING_RISK").status).toBe("FAIL");
    expect(JSON.stringify(out.topGamingSignal)).not.toMatch(NO_FRAUD);
  });

  it("dismissing the self-review ANTI_GAMING_SIGNAL suppresses it (now adjudicable) + eases SLO", async () => {
    const r = await adjudicateProofRiskFinding({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      sourceType: AdjudicationSourceType.ANTI_GAMING_SIGNAL, sourceRef: gamingRef,
      outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE, reason: "solo shift; owner authorised self-check for these two jobs",
      proofIds: [p1, p2],
    });
    expect(r.ok).toBe(true);
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.topGamingSignal?.signalType).not.toBe("SELF_REVIEW_ATTEMPT");
    expect(slo(out, "ANTI_GAMING_RISK").status).not.toBe("FAIL");
    // The credibility concern is a different source — still visible until adjudicated.
    expect(out.topCredibilityConcern?.signalType).toBe("SELF_REVIEW_BLOCKED_OR_ATTEMPTED");
  });

  it("dismissing the self-review CREDIBILITY_CONCERN suppresses it too", async () => {
    await adjudicateProofRiskFinding({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      sourceType: AdjudicationSourceType.CREDIBILITY_CONCERN, sourceRef: credRef,
      outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE, reason: "same authorised self-check; not a credibility problem",
      proofIds: [p1, p2],
    });
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.topCredibilityConcern?.signalType).not.toBe("SELF_REVIEW_BLOCKED_OR_ATTEMPTED");
  });

  it("a NEW self-reviewed proof re-surfaces the self-review risk", async () => {
    await selfReviewedProof(p3, 3);
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.topGamingSignal?.signalType).toBe("SELF_REVIEW_ATTEMPT"); // p3 not cleared → re-surfaces
    expect(slo(out, "ANTI_GAMING_RISK").status).toBe("FAIL");
  });

  it("a clean workspace fabricates no signal and is isolated", async () => {
    const out = await getOwnerNowView(wsClean, null);
    expect(out.topGamingSignal?.signalType).not.toBe("SELF_REVIEW_ATTEMPT");
    expect(out.proofRiskAdjudications).toEqual([]);
  });
});
