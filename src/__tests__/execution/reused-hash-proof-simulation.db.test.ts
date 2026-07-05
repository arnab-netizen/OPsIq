/**
 * Reused-hash / duplicate-proof precheck — real-business DB simulation (laundry).
 *
 * Operator `opWeak` submits the SAME photo (identical fileHash) as proof for two different jobs
 * (tasks). The dedicated reused-hash precheck deterministically flags the cross-task reuse
 * (NEEDS_REVIEW_DUPLICATE, exact hash, same operator), which the live now-view surfaces as a
 * REUSED_PROOF_PATTERN (anti-gaming) + a REUSED_PROOF credibility concern — with proof refs, no
 * fraud label. A clean workspace fabricates nothing and a same-hash proof in another workspace is
 * never exposed (workspace-scoped).
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getReusedHashFindings, getReusedHashFindingForProof } from "@/services/execution/reused-hash-precheck.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const opWeak = randomUUID();
const wsL = randomUUID();
const wsOther = randomUUID();
const bizL = randomUUID();
const proofA = randomUUID();
const proofB = randomUUID();
const proofOther = randomUUID();
const taskA = randomUUID();
const taskB = randomUUID();
const REUSED_HASH = "c".repeat(64); // well-formed sha256-length hex, reused across jobs
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /fraud|fraudster|theft|thief/i;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Reused-hash proof precheck (laundry)", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [opWeak, "OpWeak"]] as const) {
      await db.user.create({ data: { id, email: `rh-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsOther]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `rh-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    // Same fileHash reused for two DIFFERENT jobs by the same operator.
    await db.proof.create({ data: { id: proofA, workspaceId: wsL, businessId: bizL, taskId: taskA, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, fileHash: REUSED_HASH, createdAt: new Date(NOW - 6 * H), updatedAt: new Date(NOW - 6 * H) } });
    await db.proof.create({ data: { id: proofB, workspaceId: wsL, businessId: bizL, taskId: taskB, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, fileHash: REUSED_HASH, duplicateFlagged: true, createdAt: new Date(NOW - 5 * H), updatedAt: new Date(NOW - 5 * H) } });
    // A same-hash proof in ANOTHER workspace — must never be exposed.
    await db.proof.create({ data: { id: proofOther, workspaceId: wsOther, proofType: "photo", status: "ACCEPTED", submittedByUserId: opWeak, fileHash: REUSED_HASH, createdAt: new Date(NOW - 4 * H), updatedAt: new Date(NOW - 4 * H) } });
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsOther] } } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsOther] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsOther] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, opWeak] } } });
  });

  it("deterministically flags cross-task reuse, workspace-scoped (no cross-workspace leak)", async () => {
    const a = await getReusedHashFindings(wsL, { db: db as never, now: () => NOW });
    expect(a.needsReviewCount).toBe(2); // proofA & proofB each flag the other
    expect(a.submitterReuse.find((s) => s.actorId === opWeak)?.count).toBe(2);
    // The matched IDs are only same-workspace proofs; the other workspace's proof never appears.
    const allMatched = a.findings.flatMap((f) => f.matchedProofIds);
    expect(allMatched).not.toContain(proofOther);

    const f = await getReusedHashFindingForProof(wsL, proofA, { db: db as never, now: () => NOW });
    expect(f?.status).toBe("NEEDS_REVIEW_DUPLICATE");
    expect(f?.matchedProofIds).toContain(proofB);
    expect(f?.matchedProofIds).not.toContain(proofOther);
    expect(JSON.stringify(f)).not.toMatch(NO_FRAUD);
  });

  it("the reuse surfaces through the now-view credibility/anti-gaming pipeline", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    expect(out.reusedProofFindings?.needsReviewCount).toBe(2);
    // Deterministic reuse drives the anti-gaming reused-proof pattern OR the credibility reused concern.
    const gamingReused = out.topGamingSignal?.signalType === "REUSED_PROOF_PATTERN";
    const credReused = out.topCredibilityConcern?.signalType === "REUSED_PROOF";
    expect(gamingReused || credReused).toBe(true);
    // No fraud accusation anywhere in the surfaced signals.
    expect(JSON.stringify(out.reusedProofFindings)).not.toMatch(NO_FRAUD);
  });

  it("a clean workspace fabricates no reused-proof finding", async () => {
    const a = await getReusedHashFindings(wsOther, { db: db as never, now: () => NOW });
    // wsOther has a single proof with that hash — no same-workspace duplicate.
    expect(a.needsReviewCount).toBe(0);
    const out = await getOwnerNowView(wsOther, null);
    expect(out.reusedProofFindings?.needsReviewCount ?? 0).toBe(0);
  });
});
