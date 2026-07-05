/**
 * Dispute → Profit/Constraint Wiring — real-business DB simulation (laundry).
 *
 * Full live chain: an operator's proof is ACCEPTED, then disputed for rework via the LIVE dispute
 * service, and the governed dispute is shown to drive business-risk intelligence — not only proof
 * integrity:
 *   - the dispute-risk service maps the dispute to REWORK_REDO_COST + a QUALITY constraint driver;
 *   - the LIVE Owner Now View selects the dispute-derived REWORK_REDO_COST as topProfitLeak and
 *     QUALITY as topConstraint;
 *   - the credibility concern and PROOF_OUTCOME_INTEGRITY FAIL remain (not duplicated);
 *   - the reassessment is not duplicated;
 *   - a clean workspace fabricates no dispute risk and stays isolated.
 *
 * Requires TEST_WITH_DB=true. No schema change — reads the proof.disputed audit trail.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { disputeAcceptedProof } from "@/services/execution/proof-dispute.service";
import { ProofDisputeCategory } from "@/domain/execution/proof-dispute";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import { getDisputeRiskAnalysis } from "@/services/owner-mode/dispute-risk.service";
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

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Dispute → Profit/Constraint Wiring — laundry rework dispute", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [opWeak, "OpWeak"], [reviewer, "Reviewer"]] as const) {
      await db.user.create({ data: { id, email: `dr-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `dr-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    await db.proof.create({ data: { id: proofId, workspaceId: wsL, businessId: bizL, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, reviewedByUserId: reviewer, reviewedAt: new Date(NOW - 5 * H), createdAt: new Date(NOW - 6 * H), updatedAt: new Date(NOW - 5 * H) } });
    await db.auditEvent.create({ data: { id: randomUUID(), workspaceId: wsL, eventName: "proof.reviewed", actorId: reviewer, actorType: "user", entityType: "proof", entityId: proofId, payload: { fromStatus: "NEEDS_HUMAN_REVIEW", toStatus: "ACCEPTED" }, visibility: "internal", occurredAt: new Date(NOW - 5 * H) } });

    // LIVE dispute: reviewer disputes the accepted proof as rework required.
    const r = await disputeAcceptedProof({ workspaceId: wsL, proofId, actorId: reviewer, actorRole: TaskActorRole.MANAGER, category: ProofDisputeCategory.REWORK_REQUIRED, reason: "customer returned item — rewash required" });
    if (!r.ok) throw new Error(`dispute failed: ${r.reason}`);
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

  it("the dispute-risk service maps the rework dispute to REWORK_REDO_COST + QUALITY", async () => {
    const a = await getDisputeRiskAnalysis(wsL, { db: db as never, now: () => NOW + 1000 });
    expect(a.aggregates.total).toBe(1);
    expect(a.aggregates.disputeReworkCount).toBe(1);
    expect(a.aggregates.disputeQualityCount).toBe(1);
    expect(a.topRisk?.profitLeakType).toBe("REWORK_REDO_COST");
    expect(a.topRisk?.constraintType).toBe("QUALITY");
    // No fabricated financial figure.
    expect(a.topRisk?.missingData.length).toBeGreaterThan(0);
  });

  it("the live now-view selects the dispute-derived profit leak + quality constraint", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.topProfitLeak?.leakType).toBe("REWORK_REDO_COST");
    expect(out.topProfitLeak?.evidence.join(" ")).toMatch(/disputed as rework/i);
    expect(out.topConstraint?.constraintType).toBe("QUALITY");
    expect(out.disputeRisk?.aggregates.disputeReworkCount).toBe(1);

    // Proof integrity + credibility remain (not duplicated / not lost).
    expect(out.businessControlHealth.slos.find((s) => s.sloType === "PROOF_OUTCOME_INTEGRITY")!.status).toBe("FAIL");
    expect(out.topCredibilityConcern?.signalType).toBe("ACCEPTED_PROOF_WITH_BAD_OUTCOME");

    // Reassessment not duplicated.
    const reassessCount = await db.ownerReassessmentEvent.count({ where: { workspaceId: wsL, sourceProofId: proofId } });
    expect(reassessCount).toBe(1);
  });

  it("a clean workspace fabricates no dispute risk and is isolated", async () => {
    const a = await getDisputeRiskAnalysis(wsClean, { db: db as never, now: () => NOW });
    expect(a.aggregates.total).toBe(0);
    expect(a.risks.some((r) => r.proofId === proofId)).toBe(false);

    const out = await getOwnerNowView(wsClean, null);
    expect(out.topProfitLeak?.evidence.join(" ") ?? "").not.toMatch(/disputed/i);
  });
});
