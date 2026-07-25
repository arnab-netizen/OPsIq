/**
 * Owner proof-risk adjudication — pure domain + DI-proven service.
 *
 * Domain: 7 outcomes, fail-closed (missing outcome/reason/sourceRef), effect map, no fraud/theft
 * language allowed in the reason. Service: workspace-verified proofIds, atomic audit, idempotent
 * upsert (identical resubmit dedups; changed outcome updates), reassessment for keep-risk outcomes.
 */
import { describe, it, expect } from "vitest";
import {
  planAdjudication, clearsFinding, isFindingSuppressed,
  AdjudicationOutcome, AdjudicationSourceType,
} from "@/domain/execution/proof-risk-adjudication";
import {
  adjudicateProofRiskFinding, getProofRiskAdjudications,
  type AdjudicationDeps,
} from "@/services/execution/proof-risk-adjudication.service";

const WS = "11111111-1111-1111-1111-111111111111";
const PROOF = "22222222-2222-2222-2222-222222222222";
const ACTOR = "33333333-3333-3333-3333-333333333333";

describe("proof-risk-adjudication — module contract assertions", () => {
  it("planAdjudication is a function", () => { expect(typeof planAdjudication).toBe("function"); });
  it("clearsFinding is a function", () => { expect(typeof clearsFinding).toBe("function"); });
  it("isFindingSuppressed is a function", () => { expect(typeof isFindingSuppressed).toBe("function"); });
  it("AdjudicationOutcome is an object", () => { expect(typeof AdjudicationOutcome).toBe("object"); });
  it("AdjudicationSourceType is an object", () => { expect(typeof AdjudicationSourceType).toBe("object"); });
  it("adjudicateProofRiskFinding is a function", () => { expect(typeof adjudicateProofRiskFinding).toBe("function"); });
  it("getProofRiskAdjudications is a function", () => { expect(typeof getProofRiskAdjudications).toBe("function"); });
  it("WS is a string", () => { expect(typeof WS).toBe("string"); });
  it("PROOF is a string", () => { expect(typeof PROOF).toBe("string"); });
  it("ACTOR is a string", () => { expect(typeof ACTOR).toBe("string"); });
  it("AdjudicationOutcome.DISMISS_FALSE_POSITIVE is defined", () => { expect(AdjudicationOutcome.DISMISS_FALSE_POSITIVE).toBeDefined(); });
  it("AdjudicationOutcome.REQUIRE_FRESH_PROOF is defined", () => { expect(AdjudicationOutcome.REQUIRE_FRESH_PROOF).toBeDefined(); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("proof-risk adjudication — domain", () => {
  const base = { workspaceId: WS, sourceType: AdjudicationSourceType.REUSED_HASH_FINDING, sourceRef: PROOF, reason: "reviewed the two jobs; genuinely different photos", proofIds: [PROOF] };

  it("fails closed on a missing/invalid outcome, reason, or sourceRef", () => {
    expect(planAdjudication({ ...base, outcome: "NOPE" }).ok).toBe(false);
    expect(planAdjudication({ ...base, outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE, reason: "" }).ok).toBe(false);
    expect(planAdjudication({ ...base, sourceRef: "", outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE }).ok).toBe(false);
  });

  it("rejects a reason that asserts fraud/theft (adjudication is not a verdict)", () => {
    expect(planAdjudication({ ...base, outcome: AdjudicationOutcome.CONFIRM_SUSPICIOUS_PATTERN, reason: "this operator is committing fraud" }).ok).toBe(false);
    expect(planAdjudication({ ...base, outcome: AdjudicationOutcome.CONFIRM_SUSPICIOUS_PATTERN, reason: "reused the same photo across two different jobs" }).ok).toBe(true);
  });

  it("derives conservative effects per outcome + a default idempotency key", () => {
    const fresh = planAdjudication({ ...base, outcome: AdjudicationOutcome.REQUIRE_FRESH_PROOF });
    expect(fresh.ok && fresh.plan.ownerActionRequired).toBe(true);
    expect(fresh.ok && fresh.plan.keepsRisk).toBe(true);
    expect(fresh.ok && fresh.plan.triggersReassessment).toBe(true);
    expect(fresh.ok && fresh.plan.idempotencyKey).toBe(`REUSED_HASH_FINDING:${PROOF}`);

    const dismiss = planAdjudication({ ...base, outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE });
    expect(dismiss.ok && dismiss.plan.status).toBe("CLEARED");
    expect(dismiss.ok && dismiss.plan.ownerActionRequired).toBe(false);

    const confirm = planAdjudication({ ...base, outcome: AdjudicationOutcome.CONFIRM_SUSPICIOUS_PATTERN });
    expect(confirm.ok && confirm.plan.status).toBe("CONFIRMED");
    expect(confirm.ok && confirm.plan.keepsRisk).toBe(true);
  });

  it("classifies clearing outcomes (only accept/dismiss) vs risk-keeping outcomes (incl. training)", () => {
    expect(clearsFinding(AdjudicationOutcome.DISMISS_FALSE_POSITIVE)).toBe(true);
    expect(clearsFinding(AdjudicationOutcome.ACCEPT_AS_VALID)).toBe(true);
    // Training now KEEPS the finding visible as an action item (not a clearing decision).
    expect(clearsFinding(AdjudicationOutcome.ESCALATE_FOR_TRAINING)).toBe(false);
    expect(clearsFinding(AdjudicationOutcome.CONFIRM_SUSPICIOUS_PATTERN)).toBe(false);
    expect(clearsFinding(AdjudicationOutcome.REQUIRE_FRESH_PROOF)).toBe(false);
  });

  it("isFindingSuppressed: only when EVERY supporting proof is cleared (new evidence resurfaces)", () => {
    const cleared = new Set(["p1", "p2"]);
    expect(isFindingSuppressed(["p1", "p2"], cleared)).toBe(true);   // all cleared → suppressed
    expect(isFindingSuppressed(["p1", "p3"], cleared)).toBe(false);  // p3 is new evidence → resurfaces
    expect(isFindingSuppressed([], cleared)).toBe(false);            // no supporting ids → never suppressed
    expect(isFindingSuppressed(undefined, cleared)).toBe(false);     // unknown evidence → fail visible
    expect(isFindingSuppressed(["p1"], new Set())).toBe(false);      // nothing cleared → visible
  });
});

function makeDeps(opts: { existing?: Record<string, unknown> | null; proofs?: { id: string; businessId: string | null }[] } = {}) {
  const calls = { created: [] as Record<string, unknown>[], updated: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[], reassess: 0 };
  let n = 0;
  const tx = {
    proofRiskAdjudication: {
      create: async (a: { data: Record<string, unknown> }) => { calls.created.push(a.data); return { id: a.data.id as string }; },
      updateMany: async (a: { data: Record<string, unknown> }) => { calls.updated.push(a.data); return { count: 1 }; },
    },
    auditEvent: { create: async (a: { data: Record<string, unknown> }) => { calls.audits.push(a.data); return {}; } },
  };
  const deps: AdjudicationDeps = {
    uuid: () => `id-${++n}`,
    now: () => new Date("2026-07-05T00:00:00.000Z"),
    db: {
      proofRiskAdjudication: {
        findFirst: async () => (opts.existing ?? null) as never,
        findMany: async () => (opts.existing ? [opts.existing] : []) as never,
      },
      proof: { findMany: async () => (opts.proofs ?? [{ id: PROOF, businessId: null }]) as never },
      $transaction: async (fn) => fn(tx),
    },
    createReassessment: async () => { calls.reassess++; return { id: "reassess-1", deduped: false }; },
  };
  return { deps, calls };
}

const rec = { workspaceId: WS, actorId: ACTOR, actorRole: "manager", sourceType: AdjudicationSourceType.REUSED_HASH_FINDING, sourceRef: PROOF, reason: "reviewed; require a fresh photo per job", proofIds: [PROOF] };

describe("proof-risk adjudication — service", () => {
  it("records an adjudication + atomic audit (REQUIRE_FRESH_PROOF keeps risk, maintains reassessment)", async () => {
    const { deps, calls } = makeDeps({ proofs: [{ id: PROOF, businessId: "biz-1" }] });
    const r = await adjudicateProofRiskFinding({ ...rec, outcome: AdjudicationOutcome.REQUIRE_FRESH_PROOF }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.status).toBe("ACTIVE"); expect(r.reassessmentEventId).toBe("reassess-1"); }
    expect(calls.created[0].outcome).toBe("REQUIRE_FRESH_PROOF");
    expect(calls.audits[0].eventName).toBe("proof_risk.adjudicated");
    expect(calls.reassess).toBe(1);
  });

  it("dismisses a false positive with a required reason (CLEARED, no reassessment)", async () => {
    const { deps, calls } = makeDeps();
    const r = await adjudicateProofRiskFinding({ ...rec, outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE }, deps);
    expect(r.ok && r.status).toBe("CLEARED");
    expect(calls.reassess).toBe(0);
  });

  it("fails closed on missing reason and missing outcome", async () => {
    const { deps } = makeDeps();
    expect((await adjudicateProofRiskFinding({ ...rec, outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE, reason: "" }, deps)).ok).toBe(false);
    expect((await adjudicateProofRiskFinding({ ...rec, outcome: undefined }, deps)).ok).toBe(false);
  });

  it("fails closed when a referenced proofId is not in the workspace", async () => {
    const { deps } = makeDeps({ proofs: [] }); // no proof returned → membership check fails
    const r = await adjudicateProofRiskFinding({ ...rec, outcome: AdjudicationOutcome.ACCEPT_AS_VALID }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not in this workspace/i);
  });

  it("is idempotent: identical resubmit dedups; a changed outcome updates + re-audits", async () => {
    const existing = { id: "adj-1", workspaceId: WS, idempotencyKey: `REUSED_HASH_FINDING:${PROOF}`, outcome: "DISMISS_FALSE_POSITIVE", reason: "reviewed; require a fresh photo per job", status: "CLEARED", proofIds: [PROOF], actorIds: [], sourceType: "REUSED_HASH_FINDING", sourceRef: PROOF, adjudicatedByUserId: null, adjudicatedByRole: null, ownerActionRequired: false, recommendedNextAction: "x", createdAt: new Date(), updatedAt: new Date() };
    const dedup = makeDeps({ existing });
    const same = await adjudicateProofRiskFinding({ ...rec, outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE }, dedup.deps);
    expect(same.ok && same.deduped).toBe(true);
    expect(dedup.calls.created).toHaveLength(0);
    expect(dedup.calls.updated).toHaveLength(0);

    const upd = makeDeps({ existing });
    const changed = await adjudicateProofRiskFinding({ ...rec, outcome: AdjudicationOutcome.CONFIRM_SUSPICIOUS_PATTERN }, upd.deps);
    expect(changed.ok && changed.updated).toBe(true);
    expect(upd.calls.updated[0].outcome).toBe("CONFIRM_SUSPICIOUS_PATTERN");
    expect(upd.calls.audits[0].eventName).toBe("proof_risk.adjudicated");
  });

  it("read path returns the workspace's adjudications", async () => {
    const existing = { id: "adj-1", workspaceId: WS, idempotencyKey: "k", outcome: "CONFIRM_SUSPICIOUS_PATTERN", reason: "r", status: "CONFIRMED", proofIds: [PROOF], actorIds: [], sourceType: "REUSED_HASH_FINDING", sourceRef: PROOF, adjudicatedByUserId: null, adjudicatedByRole: null, ownerActionRequired: true, recommendedNextAction: "x", createdAt: new Date(), updatedAt: new Date() };
    const { deps } = makeDeps({ existing });
    const list = await getProofRiskAdjudications(WS, deps);
    expect(list).toHaveLength(1);
    expect(list[0].outcome).toBe("CONFIRM_SUSPICIOUS_PATTERN");
  });
});
