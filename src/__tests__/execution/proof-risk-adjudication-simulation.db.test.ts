/**
 * Owner proof-risk adjudication — real-business DB simulation (laundry).
 *
 * Operator `opWeak` reuses one photo hash across two jobs → the reused-hash precheck raises a
 * NEEDS_REVIEW finding that the now-view surfaces. The owner then:
 *   1. adjudicates REQUIRE_FRESH_PROOF — governed + audited; the risk STAYS owner-visible (a
 *      require-fresh decision keeps risk) and a reassessment is maintained;
 *   2. re-adjudicates the same finding to DISMISS_FALSE_POSITIVE — an idempotent update (fresh audit)
 *      that CLEARS the finding: the reused risk stops re-surfacing (owner noise drops) while the
 *      evidence + audit trail are retained.
 * No fraud/theft label is used; a clean workspace fabricates nothing; workspace isolation holds.
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
const proofA = randomUUID();
const proofB = randomUUID();
const taskA = randomUUID();
const taskB = randomUUID();
const REUSED_HASH = "d".repeat(64);
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /fraud|fraudster|theft|thief/i;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner proof-risk adjudication (laundry)", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [opWeak, "OpWeak"]] as const) {
      await db.user.create({ data: { id, email: `adj-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `adj-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    for (const [id, task, ago] of [[proofA, taskA, 6], [proofB, taskB, 5]] as const) {
      await db.proof.create({ data: { id, workspaceId: wsL, businessId: bizL, taskId: task, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, fileHash: REUSED_HASH, duplicateFlagged: id === proofB, createdAt: new Date(NOW - ago * H), updatedAt: new Date(NOW - ago * H) } });
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
    await db.user.deleteMany({ where: { id: { in: [owner, opWeak] } } });
  });

  it("the reused-hash risk surfaces before any adjudication", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.reusedProofFindings?.needsReviewCount).toBe(2);
    expect(out.proofRiskAdjudications).toEqual([]);
  });

  it("REQUIRE_FRESH_PROOF is governed + audited and keeps the risk owner-visible", async () => {
    const r = await adjudicateProofRiskFinding({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      sourceType: AdjudicationSourceType.REUSED_HASH_FINDING, sourceRef: proofA,
      outcome: AdjudicationOutcome.REQUIRE_FRESH_PROOF, reason: "same photo used for two different jobs; require a fresh photo per job",
      proofIds: [proofA, proofB],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("ACTIVE");
    const audits = await db.auditEvent.count({ where: { workspaceId: wsL, eventName: "proof_risk.adjudicated" } });
    expect(audits).toBe(1);

    const out = await getOwnerNowView(wsL, bizL);
    // Require-fresh keeps the risk: the reused finding is still visible, and the adjudication shows.
    expect(out.reusedProofFindings?.needsReviewCount).toBe(2);
    expect(out.proofRiskAdjudications?.[0].outcome).toBe("REQUIRE_FRESH_PROOF");
    expect(out.proofRiskAdjudications?.[0].ownerActionRequired).toBe(true);
    expect(JSON.stringify(out.proofRiskAdjudications)).not.toMatch(NO_FRAUD);
  });

  it("re-adjudicating to DISMISS_FALSE_POSITIVE updates (idempotent key) and clears the risk", async () => {
    const r = await adjudicateProofRiskFinding({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      sourceType: AdjudicationSourceType.REUSED_HASH_FINDING, sourceRef: proofA,
      outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE, reason: "confirmed the two photos are genuinely different jobs",
      proofIds: [proofA, proofB],
    });
    expect(r.ok && r.updated).toBe(true);
    if (r.ok) expect(r.status).toBe("CLEARED");
    // One record (updated in place), two audits (require-fresh + dismiss).
    const count = await db.proofRiskAdjudication.count({ where: { workspaceId: wsL } });
    expect(count).toBe(1);
    const audits = await db.auditEvent.count({ where: { workspaceId: wsL, eventName: "proof_risk.adjudicated" } });
    expect(audits).toBe(2);

    const out = await getOwnerNowView(wsL, bizL);
    // Cleared: the reused risk no longer re-surfaces; the adjudication (with its status) is retained.
    expect(out.reusedProofFindings?.needsReviewCount).toBe(0);
    expect(out.topGamingSignal?.signalType).not.toBe("REUSED_PROOF_PATTERN");
    expect(out.proofRiskAdjudications?.[0].status).toBe("CLEARED");
    // Evidence retained: the proofs still exist.
    expect(await db.proof.count({ where: { workspaceId: wsL } })).toBe(2);
  });

  it("a clean workspace fabricates no adjudication and is isolated", async () => {
    const out = await getOwnerNowView(wsClean, null);
    expect(out.proofRiskAdjudications).toEqual([]);
    expect(out.reusedProofFindings?.needsReviewCount ?? 0).toBe(0);
  });
});
