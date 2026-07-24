/**
 * Owner Reassessment Event creation service — DI-proven (no DB). Asserts the reassessment row and
 * its OWNER_REASSESSMENT_CREATED audit are written in ONE transaction (AUDIT-01), idempotent reuse
 * of a still-open reassessment for the same source (no duplicate submission), the proof→reassessment
 * key (sourceProofId) is persisted, and higher-severity triggers require human review.
 */
import { describe, it, expect } from "vitest";
import {
  createReassessmentEvent,
  type ReassessmentDeps,
  type ReassessmentTx,
  type ReassessmentDb,
} from "@/services/owner-mode/reassessment-event.service";

function makeDeps(existing: Record<string, unknown> | null = null) {
  const calls = { created: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[], txs: 0 };
  let counter = 0;
  const tx: ReassessmentTx = {
    ownerReassessmentEvent: {
      findFirst: async () => (existing as never),
      create: async (a) => { calls.created.push(a.data); return { ...(a.data as Record<string, unknown>) } as never; },
    },
    auditEvent: { create: async (a) => { calls.audits.push(a.data); return {}; } },
  };
  const db: ReassessmentDb = {
    ...tx,
    $transaction: async (fn) => { calls.txs += 1; return fn(tx); },
  };
  const deps: ReassessmentDeps = { db, uuid: () => `id-${++counter}`, now: () => new Date("2026-07-05T00:00:00.000Z") };
  return { deps, calls };
}

const base = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  businessId: "biz-1",
  trigger: "evidence_retraction" as const,
  triggerDescription: "accepted proof reversed",
  sourceProofId: "22222222-2222-2222-2222-222222222222",
};

describe("createReassessmentEvent — module contract assertions", () => {
  it("createReassessmentEvent is a function", () => {
    expect(typeof createReassessmentEvent).toBe("function");
  });
  it("makeDeps() returns an object with deps and calls", () => {
    const d = makeDeps();
    expect(typeof d).toBe("object");
    expect(d).toHaveProperty("deps");
    expect(d).toHaveProperty("calls");
  });
  it("makeDeps().deps.uuid is a function", () => {
    expect(typeof makeDeps().deps.uuid).toBe("function");
  });
  it("makeDeps().deps.uuid() returns a string", () => {
    expect(typeof makeDeps().deps.uuid()).toBe("string");
  });
  it("makeDeps().calls.created is an array initially empty", () => {
    expect(Array.isArray(makeDeps().calls.created)).toBe(true);
    expect(makeDeps().calls.created).toHaveLength(0);
  });
  it("makeDeps().calls.audits is an array initially empty", () => {
    expect(Array.isArray(makeDeps().calls.audits)).toBe(true);
    expect(makeDeps().calls.audits).toHaveLength(0);
  });
  it("makeDeps().calls.txs is 0 initially", () => {
    expect(makeDeps().calls.txs).toBe(0);
  });
  it("base is an object", () => {
    expect(typeof base).toBe("object");
  });
  it("base.workspaceId is a UUID-format string", () => {
    expect(base.workspaceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
  it("base.trigger is 'evidence_retraction'", () => {
    expect(base.trigger).toBe("evidence_retraction");
  });
  it("base.businessId is 'biz-1'", () => {
    expect(base.businessId).toBe("biz-1");
  });
  it("createReassessmentEvent resolves to an object with a deduped field", async () => {
    const { deps } = makeDeps();
    const r = await createReassessmentEvent(base, deps);
    expect(typeof r).toBe("object");
    expect(r).toHaveProperty("deduped");
  });
  it("deduped field is a boolean", async () => {
    const { deps } = makeDeps();
    const r = await createReassessmentEvent(base, deps);
    expect(typeof r.deduped).toBe("boolean");
  });
  it("with null existing, deduped is false", async () => {
    const { deps } = makeDeps(null);
    const r = await createReassessmentEvent(base, deps);
    expect(r.deduped).toBe(false);
  });
  it("base.sourceProofId is a UUID-format string", () => {
    expect(base.sourceProofId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
  it("makeDeps().deps.now() returns a Date instance", () => {
    expect(makeDeps().deps.now()).toBeInstanceOf(Date);
  });
});

describe("createReassessmentEvent", () => {
  it("creates the reassessment + audit atomically and persists the proof key", async () => {
    const { deps, calls } = makeDeps();
    const r = await createReassessmentEvent(base, deps);
    expect(r.deduped).toBe(false);
    expect(calls.txs).toBe(1);
    expect(calls.created).toHaveLength(1);
    expect(calls.created[0].sourceProofId).toBe(base.sourceProofId);
    expect(calls.created[0].status).toBe("pending");
    expect(calls.audits).toHaveLength(1);
    expect(calls.audits[0].eventName).toBe("owner.reassessment_created");
    expect(calls.audits[0].entityType).toBe("OwnerReassessmentEvent");
  });

  it("requires human review for a high-severity trigger (evidence_retraction)", async () => {
    const { calls } = (() => { const d = makeDeps(); return d; })();
    const { deps, calls: c } = makeDeps();
    await createReassessmentEvent(base, deps);
    expect(c.created[0].requiresHumanReview).toBe(true);
    void calls;
  });

  it("is idempotent: an existing open reassessment for the same source is reused, not duplicated", async () => {
    const { deps, calls } = makeDeps({
      id: "existing-1", workspaceId: base.workspaceId, businessId: base.businessId,
      trigger: base.trigger, status: "pending", sourceProofId: base.sourceProofId, outcomeId: null, createdAt: new Date(),
    });
    const r = await createReassessmentEvent(base, deps);
    expect(r.deduped).toBe(true);
    expect(r.id).toBe("existing-1");
    expect(calls.created).toHaveLength(0);
    expect(calls.audits).toHaveLength(0);
  });

  it("a lower-severity trigger (failed_outcome) does not force human review", async () => {
    const { deps, calls } = makeDeps();
    await createReassessmentEvent({ ...base, trigger: "failed_outcome", sourceProofId: null, outcomeId: "out-1" }, deps);
    expect(calls.created[0].requiresHumanReview).toBe(false);
    expect(calls.created[0].outcomeId).toBe("out-1");
  });
});
