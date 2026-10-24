/**
 * Route contract (non-DB) for the Owner Outcome Persistence v1 APIs:
 *   /api/owner/businesses/[businessId]/{decisions, outcome-contracts, outcome-chain, outcome-chain/process-task-link}
 * Reads need OWNER_VIEW, writes OWNER_MANAGE (workspace required); the workspace and actor come from the verified
 * context, never the body; unknown fields — including any attempt to POST a conclusion — are rejected before the service runs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  recordOwnerDecision: vi.fn(), listOwnerDecisions: vi.fn(), recordOwnerOutcomeContract: vi.fn(),
  assessPersistedOwnerOutcome: vi.fn(), getOwnerOutcomeChain: vi.fn(), linkProcessTaskToDecision: vi.fn(),
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown, params: Record<string, string>) => unknown, options?: Record<string, unknown>) => {
    const wrapped = (ctx: unknown, params: Record<string, string>) => handler(ctx, params);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));
vi.mock("@/services/owner-outcome/owner-decision.service", () => ({
  recordOwnerDecision: mocks.recordOwnerDecision, listOwnerDecisions: mocks.listOwnerDecisions, recordOwnerOutcomeContract: mocks.recordOwnerOutcomeContract,
}));
vi.mock("@/services/owner-outcome/owner-outcome-chain.service", () => ({
  assessPersistedOwnerOutcome: mocks.assessPersistedOwnerOutcome, getOwnerOutcomeChain: mocks.getOwnerOutcomeChain, linkProcessTaskToDecision: mocks.linkProcessTaskToDecision,
}));

import { GET as decisionsGet, POST as decisionsPost } from "@/app/api/owner/businesses/[businessId]/decisions/route";
import { POST as contractsPost } from "@/app/api/owner/businesses/[businessId]/outcome-contracts/route";
import { GET as chainGet, POST as chainPost } from "@/app/api/owner/businesses/[businessId]/outcome-chain/route";
import { POST as linkPost } from "@/app/api/owner/businesses/[businessId]/outcome-chain/process-task-link/route";

const WS = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const BIZ = "33333333-3333-4333-8333-333333333333";
const CAND = "domain_action:finance:0b6f2d1e-3c4a-4b5d-8e6f-123456789abc";

const ctx = (url: string, body?: unknown) => ({
  verifiedWorkspaceId: WS, verifiedActorId: ACTOR,
  request: new Request(url, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});
const opts = (h: unknown) => (h as { __options?: { requireCapabilities: string[]; requireWorkspace: boolean } }).__options;
const call = (h: unknown, c: unknown, biz = BIZ) => (h as (c: unknown, p: Record<string, string>) => Promise<unknown>)(c, { businessId: biz });
const base = `http://t/api/owner/businesses/${BIZ}`;

beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

describe("capabilities", () => {
  it("reads are OWNER_VIEW; every write is OWNER_MANAGE; all require a workspace", () => {
    expect(opts(decisionsGet)).toEqual({ requireCapabilities: ["owner:view"], requireWorkspace: true });
    expect(opts(chainGet)).toEqual({ requireCapabilities: ["owner:view"], requireWorkspace: true });
    for (const h of [decisionsPost, contractsPost, chainPost, linkPost]) expect(opts(h)).toEqual({ requireCapabilities: ["owner:manage"], requireWorkspace: true });
  });
});

describe("decisions", () => {
  it("passes the VERIFIED workspace/actor and the path business to the service; a replay is 200, a new decision 201", async () => {
    mocks.recordOwnerDecision.mockResolvedValueOnce({ decision: { id: "d1" }, replayed: false }).mockResolvedValueOnce({ decision: { id: "d1" }, replayed: true });
    const body = { candidateId: CAND, state: "ACCEPTED", contract: { targetDirection: "up" } };
    const r1 = (await call(decisionsPost, ctx(`${base}/decisions`, body))) as { status: number };
    const r2 = (await call(decisionsPost, ctx(`${base}/decisions`, body))) as { status: number };
    expect([r1.status, r2.status]).toEqual([201, 200]);
    expect(mocks.recordOwnerDecision).toHaveBeenCalledWith(WS, ACTOR, BIZ, expect.objectContaining({ candidateId: CAND, state: "ACCEPTED" }));
  });
  it("rejects client-supplied workspace/business/actor ids, unknown states and conclusion fields before the service runs", async () => {
    for (const bad of [
      { candidateId: CAND, state: "ACCEPTED", workspaceId: "x" },
      { candidateId: CAND, state: "ACCEPTED", businessId: BIZ },
      { candidateId: CAND, state: "ACCEPTED", decidedById: "x" },
      { candidateId: CAND, state: "APPROVED" },
      { candidateId: CAND, state: "ACCEPTED", measurementResult: "IMPROVED" },
      { candidateId: CAND, state: "ACCEPTED", contract: { issueResolution: "RESOLVED" } },
      { candidateId: CAND, state: "ACCEPTED", contract: { targetDirection: "sideways" } },
      { state: "ACCEPTED" },
    ]) await expect(call(decisionsPost, ctx(`${base}/decisions`, bad)), JSON.stringify(bad)).rejects.toThrow();
    expect(mocks.recordOwnerDecision).not.toHaveBeenCalled();
  });
  it("rejects a malformed business id", async () => {
    await expect(call(decisionsPost, ctx(`${base}/decisions`, { candidateId: CAND, state: "REJECTED" }), "not-a-uuid")).rejects.toThrow();
  });
  it("GET lists scoped to the verified workspace", async () => {
    mocks.listOwnerDecisions.mockResolvedValueOnce([]);
    await call(decisionsGet, ctx(`${base}/decisions?candidateId=${encodeURIComponent(CAND)}`));
    expect(mocks.listOwnerDecisions).toHaveBeenCalledWith(WS, BIZ, { candidateId: CAND });
  });
});

describe("outcome contract / chain / link", () => {
  it("contract amendments accept only the contract facts", async () => {
    mocks.recordOwnerOutcomeContract.mockResolvedValueOnce({ decision: {}, replayed: false });
    await call(contractsPost, ctx(`${base}/outcome-contracts`, { candidateId: CAND, contract: { targetValue: 0, targetDirection: "down" } }));
    expect(mocks.recordOwnerOutcomeContract).toHaveBeenCalledTimes(1);
    await expect(call(contractsPost, ctx(`${base}/outcome-contracts`, { candidateId: CAND, contract: {}, afterValue: 9 }))).rejects.toThrow();
  });
  it("assess takes exactly one reference and never a conclusion", async () => {
    mocks.assessPersistedOwnerOutcome.mockResolvedValue({ assessment: {}, created: true });
    await call(chainPost, ctx(`${base}/outcome-chain`, { candidateId: CAND }));
    await call(chainPost, ctx(`${base}/outcome-chain`, { processTaskKey: "pc:x" }));
    expect(mocks.assessPersistedOwnerOutcome).toHaveBeenNthCalledWith(1, WS, ACTOR, BIZ, { candidateId: CAND });
    expect(mocks.assessPersistedOwnerOutcome).toHaveBeenNthCalledWith(2, WS, ACTOR, BIZ, { processTaskKey: "pc:x" });
    for (const bad of [{}, { candidateId: CAND, processTaskKey: "pc:x" }, { candidateId: CAND, measurementResult: "IMPROVED" }, { candidateId: CAND, issueResolution: "RESOLVED" }, { candidateId: CAND, learningEligibility: "ELIGIBLE_CONFIRMED_BY_GATE" }, { candidateId: CAND, learningGate: { eligible: true } }]) {
      await expect(call(chainPost, ctx(`${base}/outcome-chain`, bad)), JSON.stringify(bad)).rejects.toThrow();
    }
    expect(mocks.assessPersistedOwnerOutcome).toHaveBeenCalledTimes(2);
  });
  it("chain GET needs exactly one reference", async () => {
    mocks.getOwnerOutcomeChain.mockResolvedValue({});
    await call(chainGet, ctx(`${base}/outcome-chain?candidateId=${encodeURIComponent(CAND)}`));
    expect(mocks.getOwnerOutcomeChain).toHaveBeenCalledWith(WS, BIZ, { candidateId: CAND });
    await expect(call(chainGet, ctx(`${base}/outcome-chain`))).rejects.toThrow();
    await expect(call(chainGet, ctx(`${base}/outcome-chain?candidateId=a&processTaskKey=b`))).rejects.toThrow();
  });
  it("linking takes the two explicit references only", async () => {
    mocks.linkProcessTaskToDecision.mockResolvedValueOnce({ assessment: {}, created: true });
    await call(linkPost, ctx(`${base}/outcome-chain/process-task-link`, { candidateId: "compliance_item:0b6f2d1e-3c4a-4b5d-8e6f-123456789abc", processTaskKey: "pc:x" }));
    expect(mocks.linkProcessTaskToDecision).toHaveBeenCalledWith(WS, ACTOR, BIZ, { candidateId: "compliance_item:0b6f2d1e-3c4a-4b5d-8e6f-123456789abc", processTaskKey: "pc:x" });
    await expect(call(linkPost, ctx(`${base}/outcome-chain/process-task-link`, { candidateId: CAND, processTaskKey: "pc:x", ownerActionOutcomeId: "o1" }))).rejects.toThrow();
    await expect(call(linkPost, ctx(`${base}/outcome-chain/process-task-link`, { candidateId: CAND }))).rejects.toThrow();
  });
});
