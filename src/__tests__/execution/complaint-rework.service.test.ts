/**
 * Complaint / Rework service — DI-proven (no DB). Governed creation + linkage: fail-closed on
 * missing category/description, workspace-scoped proof validation (wrong-workspace fails closed),
 * atomic audit, idempotent linkage, and the read path.
 */
import { describe, it, expect } from "vitest";
import {
  recordOperationalEvent, linkOperationalEventToProof, getComplaintReworkLinks,
  type ComplaintReworkDeps,
} from "@/services/execution/complaint-rework.service";
import { OperationalEventType, ComplaintCategory } from "@/domain/execution/complaint-rework";

const WS = "11111111-1111-1111-1111-111111111111";
const PROOF = "22222222-2222-2222-2222-222222222222";
const ACTOR = "33333333-3333-3333-3333-333333333333";
const EVENT = "44444444-4444-4444-4444-444444444444";

function makeDeps(opts: { proof?: { id: string; status: string; submittedByUserId: string | null } | null; event?: { id: string; workspaceId: string; relatedProofId: string | null } | null; events?: unknown[]; proofs?: unknown[] } = {}) {
  const calls = { created: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[], updates: [] as Record<string, unknown>[] };
  let n = 0;
  const tx = {
    operationalEvent: {
      create: async (a: { data: Record<string, unknown> }) => { calls.created.push(a.data); return { id: a.data.id as string }; },
      updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => { calls.updates.push(a.data); return { count: 1 }; },
    },
    auditEvent: { create: async (a: { data: Record<string, unknown> }) => { calls.audits.push(a.data); return {}; } },
  };
  const deps: ComplaintReworkDeps = {
    uuid: () => `id-${++n}`,
    now: () => Date.parse("2026-07-05T00:00:00.000Z"),
    db: {
      operationalEvent: {
        findFirst: async () => (opts.event ?? null) as never,
        findMany: async () => (opts.events ?? []) as never,
        create: tx.operationalEvent.create,
        updateMany: tx.operationalEvent.updateMany,
      },
      proof: {
        findFirst: async () => (opts.proof ?? null) as never,
        findMany: async () => (opts.proofs ?? []) as never,
      },
      auditEvent: tx.auditEvent,
      $transaction: async (fn) => fn(tx),
    },
  };
  return { deps, calls };
}

const rec = { workspaceId: WS, actorId: ACTOR, eventType: OperationalEventType.COMPLAINT, category: ComplaintCategory.QUALITY_COMPLAINT, description: "stain remained" };

describe("recordOperationalEvent", () => {
  it("records a complaint + atomic audit", async () => {
    const { deps, calls } = makeDeps();
    const r = await recordOperationalEvent(rec, deps);
    expect(r.ok).toBe(true);
    expect(calls.created[0].eventType).toBe("COMPLAINT");
    expect(calls.audits[0].eventName).toBe("operational_event.recorded");
  });

  it("fails closed on missing category / blank description", async () => {
    const { deps } = makeDeps();
    expect((await recordOperationalEvent({ ...rec, category: "NOPE" }, deps)).ok).toBe(false);
    expect((await recordOperationalEvent({ ...rec, description: "" }, deps)).ok).toBe(false);
  });

  it("fails closed when a supplied relatedProofId is not in the workspace", async () => {
    const { deps, calls } = makeDeps({ proof: null });
    const r = await recordOperationalEvent({ ...rec, relatedProofId: PROOF }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not found/i);
    expect(calls.created).toHaveLength(0);
  });

  it("links a supplied in-workspace proof", async () => {
    const { deps, calls } = makeDeps({ proof: { id: PROOF, status: "ACCEPTED", submittedByUserId: "op" } });
    await recordOperationalEvent({ ...rec, relatedProofId: PROOF }, deps);
    expect(calls.created[0].relatedProofId).toBe(PROOF);
  });
});

describe("linkOperationalEventToProof", () => {
  it("links event↔proof with an audit; idempotent when already linked", async () => {
    const { deps, calls } = makeDeps({ event: { id: EVENT, workspaceId: WS, relatedProofId: null }, proof: { id: PROOF, status: "ACCEPTED", submittedByUserId: "op" } });
    const r = await linkOperationalEventToProof({ workspaceId: WS, actorId: ACTOR, eventId: EVENT, proofId: PROOF }, deps);
    expect(r.ok && r.deduped).toBe(false);
    expect(calls.audits[0].eventName).toBe("operational_event.linked");

    const dep2 = makeDeps({ event: { id: EVENT, workspaceId: WS, relatedProofId: PROOF }, proof: { id: PROOF, status: "ACCEPTED", submittedByUserId: "op" } });
    const again = await linkOperationalEventToProof({ workspaceId: WS, actorId: ACTOR, eventId: EVENT, proofId: PROOF }, dep2.deps);
    expect(again.ok && again.deduped).toBe(true);
    expect(dep2.calls.updates).toHaveLength(0);
  });

  it("fails closed on a cross-workspace / missing proof", async () => {
    const { deps } = makeDeps({ event: { id: EVENT, workspaceId: WS, relatedProofId: null }, proof: null });
    const r = await linkOperationalEventToProof({ workspaceId: WS, actorId: ACTOR, eventId: EVENT, proofId: PROOF }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not found/i);
  });
});

describe("getComplaintReworkLinks", () => {
  it("builds the analysis from linked events + their accepted proofs", async () => {
    const { deps } = makeDeps({
      events: [{ id: EVENT, eventType: "COMPLAINT", relatedProofId: PROOF, relatedActionId: null, category: "QUALITY_COMPLAINT", severity: "HIGH", status: "OPEN", source: "customer_reported", description: "stain", occurredAt: null, createdAt: new Date("2026-07-05"), estimatedImpactAmount: null, impactConfidence: "NEEDS_DATA" }],
      proofs: [{ id: PROOF, status: "ACCEPTED", submittedByUserId: "op" }],
    });
    const a = await getComplaintReworkLinks(WS, deps);
    expect(a.aggregates.complaintLinkedCount).toBe(1);
    expect(a.measurement.proofComplaintMeasurable).toBe(true);
  });
});
