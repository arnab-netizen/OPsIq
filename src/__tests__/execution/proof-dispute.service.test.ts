/**
 * Governed Proof Dispute service — DI-proven (no DB). Asserts server-authoritative load, fail-closed
 * behavior (not found / non-accepted / SoD / missing reason), atomic dual audit (proof.reviewed +
 * proof.disputed), idempotent no-op on an already-disputed proof, reassessment creation keyed to the
 * proof, and that a reassessment failure does not roll back the committed dispute.
 */
import { describe, it, expect } from "vitest";
import { disputeAcceptedProof, type DisputeDeps } from "@/services/execution/proof-dispute.service";
import { ProofDisputeCategory } from "@/domain/execution/proof-dispute";
import { ProofStatus } from "@/domain/execution/proof";
import { TaskActorRole } from "@/domain/execution/delegated-task";

const WS = "11111111-1111-1111-1111-111111111111";
const PROOF = "22222222-2222-2222-2222-222222222222";
const ACTOR = "33333333-3333-3333-3333-333333333333";
const SUBMITTER = "44444444-4444-4444-4444-444444444444";

function makeDeps(proof: { status: string; submittedByUserId: string | null; businessId: string | null } | null, opts: { reassessThrows?: boolean; updateCount?: number } = {}) {
  const calls = { audits: [] as Record<string, unknown>[], updates: [] as Record<string, unknown>[], reassess: [] as Record<string, unknown>[] };
  let n = 0;
  const deps: DisputeDeps = {
    uuid: () => `id-${++n}`,
    now: () => new Date("2026-07-05T00:00:00.000Z"),
    db: {
      proof: { findFirst: async () => (proof ? { id: PROOF, taskId: null, ...proof } : null) },
      $transaction: async (fn) => fn({
        proof: { updateMany: async (a) => { calls.updates.push(a.data); return { count: opts.updateCount ?? 1 }; } },
        auditEvent: { create: async (a) => { calls.audits.push(a.data); return {}; } },
      }),
    },
    createReassessment: async (input) => {
      calls.reassess.push(input);
      if (opts.reassessThrows) throw new Error("FK: no client account");
      return { id: "reassess-1", deduped: false };
    },
  };
  return { deps, calls };
}

const base = { workspaceId: WS, proofId: PROOF, actorId: ACTOR, actorRole: TaskActorRole.MANAGER, category: ProofDisputeCategory.QUALITY_FAILURE, reason: "rewash needed" };

describe("disputeAcceptedProof", () => {
  it("disputes an accepted proof: transition + dual audit + keyed reassessment", async () => {
    const { deps, calls } = makeDeps({ status: ProofStatus.ACCEPTED, submittedByUserId: SUBMITTER, businessId: "biz-1" });
    const r = await disputeAcceptedProof(base, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe(ProofStatus.DISPUTED);
    expect(r.deduped).toBe(false);
    expect(calls.updates[0].status).toBe(ProofStatus.DISPUTED);
    // Both audits written in the transaction.
    expect(calls.audits.map((a) => a.eventName)).toEqual(["proof.reviewed", "proof.disputed"]);
    expect((calls.audits[0].payload as Record<string, unknown>).fromStatus).toBe(ProofStatus.ACCEPTED);
    expect((calls.audits[1].payload as Record<string, unknown>).disputeCategory).toBe(ProofDisputeCategory.QUALITY_FAILURE);
    // Reassessment keyed to the proof.
    expect(calls.reassess[0].sourceProofId).toBe(PROOF);
    expect(r.reassessmentEventId).toBe("reassess-1");
  });

  it("fails closed: proof not found", async () => {
    const { deps } = makeDeps(null);
    const r = await disputeAcceptedProof(base, deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/not found/i);
  });

  it("fails closed: non-accepted proof cannot be disputed", async () => {
    const { deps, calls } = makeDeps({ status: ProofStatus.SUBMITTED, submittedByUserId: SUBMITTER, businessId: "biz-1" });
    const r = await disputeAcceptedProof(base, deps);
    expect(r.ok).toBe(false);
    expect(calls.updates).toHaveLength(0);
  });

  it("fails closed: separation of duty — cannot dispute own proof", async () => {
    const { deps, calls } = makeDeps({ status: ProofStatus.ACCEPTED, submittedByUserId: ACTOR, businessId: "biz-1" });
    const r = await disputeAcceptedProof(base, deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/separation of duty/i);
    expect(calls.updates).toHaveLength(0);
  });

  it("fails closed: missing reason / invalid category", async () => {
    const { deps } = makeDeps({ status: ProofStatus.ACCEPTED, submittedByUserId: SUBMITTER, businessId: "biz-1" });
    expect((await disputeAcceptedProof({ ...base, reason: "" }, deps)).ok).toBe(false);
    expect((await disputeAcceptedProof({ ...base, category: "NOPE" }, deps)).ok).toBe(false);
  });

  it("is idempotent: an already-disputed proof is a safe no-op (no new mutation)", async () => {
    const { deps, calls } = makeDeps({ status: ProofStatus.DISPUTED, submittedByUserId: SUBMITTER, businessId: "biz-1" });
    const r = await disputeAcceptedProof(base, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deduped).toBe(true);
    expect(calls.updates).toHaveLength(0);
    expect(calls.audits).toHaveLength(0);
  });

  it("owner-only override to OVERRIDDEN_NOT_VERIFIED; manager override rejected", async () => {
    const asOwner = makeDeps({ status: ProofStatus.ACCEPTED, submittedByUserId: SUBMITTER, businessId: "biz-1" });
    const rOwner = await disputeAcceptedProof({ ...base, actorRole: TaskActorRole.OWNER, override: true }, asOwner.deps);
    expect(rOwner.ok).toBe(true);
    if (rOwner.ok) expect(rOwner.status).toBe(ProofStatus.OVERRIDDEN_NOT_VERIFIED);
    const asManager = makeDeps({ status: ProofStatus.ACCEPTED, submittedByUserId: SUBMITTER, businessId: "biz-1" });
    expect((await disputeAcceptedProof({ ...base, override: true }, asManager.deps)).ok).toBe(false);
  });

  it("a reassessment failure does not roll back the committed dispute", async () => {
    const { deps, calls } = makeDeps({ status: ProofStatus.ACCEPTED, submittedByUserId: SUBMITTER, businessId: "biz-1" }, { reassessThrows: true });
    const r = await disputeAcceptedProof(base, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe(ProofStatus.DISPUTED);
    expect(r.reassessmentEventId).toBeNull();
    expect(calls.audits).toHaveLength(2); // dispute still committed
  });
});
