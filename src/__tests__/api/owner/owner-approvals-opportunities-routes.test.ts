/**
 * Owner approvals, arbitration, and opportunities route contract tests (non-DB).
 *
 * Routes covered:
 *   POST /api/owner/approvals/memory              — recordApproval (OWNER_MANAGE)
 *   GET  /api/owner/approvals/memory              — isApprovalRemembered (OWNER_VIEW)
 *   POST /api/owner/approvals/resolve             — resolveOwnerApproval (OWNER_MANAGE)
 *   POST /api/owner/arbitrate                     — arbitrate (OWNER_VIEW, pure domain)
 *   POST /api/owner/opportunities/decide          — decideOpportunity (OWNER_MANAGE)
 *   POST /api/owner/opportunities/signals         — submitExternalOpportunitySignal (OWNER_MANAGE)
 *   POST /api/owner/opportunities/execution-task  — recordExecutionTaskUpdate (OWNER_MANAGE)
 *   POST /api/owner/opportunities/validation-outcome — recordValidationOutcome (OWNER_MANAGE)
 *
 * DB-backed services are mocked; tests run without PostgreSQL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CanonicalJsonResponse } from "@/lib/canonical-json-response";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  recordApproval: vi.fn(),
  isApprovalRemembered: vi.fn(),
  resolveOwnerApproval: vi.fn(),
  hashApprovalContent: vi.fn((c: unknown) => "hash-" + JSON.stringify(c).slice(0, 8)),
  arbitrate: vi.fn(),
  decideOpportunity: vi.fn(),
  submitExternalOpportunitySignal: vi.fn(),
  recordExecutionTaskUpdate: vi.fn(),
  recordValidationOutcome: vi.fn(),
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => unknown,
    options?: Record<string, unknown>
  ) => {
    const wrapped = (ctx: unknown) => handler(ctx);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

vi.mock("@/services/owner-mode/approval-memory.service", () => ({
  recordApproval: mocks.recordApproval,
  isApprovalRemembered: mocks.isApprovalRemembered,
}));

vi.mock("@/domain/owner-mode/approval-memory", () => ({
  APPROVAL_RISK_CLASSES: ["low", "medium", "high", "critical"],
  hashApprovalContent: mocks.hashApprovalContent,
}));

vi.mock("@/services/owner-mode/owner-approval-resolution.service", () => ({
  resolveOwnerApproval: mocks.resolveOwnerApproval,
}));

vi.mock("@/domain/owner-mode/decision-arbitration", () => ({
  arbitrate: mocks.arbitrate,
}));

vi.mock("@/services/owner-mode/opportunity-decision.service", () => ({
  decideOpportunity: mocks.decideOpportunity,
}));

vi.mock("@/services/owner-mode/external-opportunity-intake.service", () => ({
  submitExternalOpportunitySignal: mocks.submitExternalOpportunitySignal,
}));

vi.mock("@/domain/owner-mode/external-opportunity-intake", () => ({
  INTAKE_TYPES: [
    "COMPETITOR_REVIEW_GAP", "B2B_DEMAND_SIGNAL", "GOVERNMENT_TENDER",
    "PUBLIC_PROCUREMENT_NOTICE", "CORPORATE_VENDOR_OPPORTUNITY", "GRANT_OR_SCHEME_SIGNAL",
    "PRICING_GAP", "SERVICE_GAP", "COMMUNITY_OR_APARTMENT_DEMAND",
    "SUPPLIER_OR_COST_ADVANTAGE", "MARKET_TREND_SIGNAL",
    "MANUAL_OWNER_OBSERVATION", "DATA_INSUFFICIENT",
  ],
  SOURCE_QUALITIES: [
    "VERIFIED_SOURCE", "OWNER_OBSERVED", "STAFF_REPORTED", "CUSTOMER_REPORTED",
    "PUBLIC_SOURCE_UNVERIFIED", "THIRD_PARTY_UNVERIFIED", "LOW_CONFIDENCE", "UNKNOWN",
  ],
}));

vi.mock("@/services/owner-mode/opportunity-execution.service", () => ({
  recordExecutionTaskUpdate: mocks.recordExecutionTaskUpdate,
}));

vi.mock("@/domain/owner-mode/validation-outcome", () => ({
  OUTCOME_STATUSES: ["NOT_STARTED", "RUNNING", "COMPLETED", "CANCELLED", "NEEDS_DATA"],
  OUTCOME_RESULTS: ["PASSED", "FAILED", "INCONCLUSIVE", "NOT_EVALUATED"],
}));

vi.mock("@/services/owner-mode/validation-outcome.service", () => ({
  recordValidationOutcome: mocks.recordValidationOutcome,
}));

// ─── Route imports (after mocks) ─────────────────────────────────────────────

import {
  POST as approvalsMemoryPost,
  GET as approvalsMemoryGet,
} from "@/app/api/owner/approvals/memory/route";
import { POST as approvalsResolvePost } from "@/app/api/owner/approvals/resolve/route";
import { POST as arbitratePost } from "@/app/api/owner/arbitrate/route";
import { POST as opportunitiesDecidePost } from "@/app/api/owner/opportunities/decide/route";
import { POST as opportunitiesSignalsPost } from "@/app/api/owner/opportunities/signals/route";
import { POST as opportunitiesExecutionTaskPost } from "@/app/api/owner/opportunities/execution-task/route";
import { POST as opportunitiesValidationOutcomePost } from "@/app/api/owner/opportunities/validation-outcome/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WS = "ws-approval-test";
const BIZ = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";

function makePostCtx(body: unknown, workspaceId = WS, actorId = "actor-approval-1") {
  return {
    verifiedActorId: actorId,
    verifiedWorkspaceId: workspaceId,
    request: {
      url: `https://x/api/owner/test`,
      json: async () => body,
    },
  } as const;
}

function makeGetCtx(rawUrl: string, workspaceId = WS) {
  return {
    verifiedActorId: "actor-approval-1",
    verifiedWorkspaceId: workspaceId,
    request: { url: rawUrl },
  } as const;
}

function getBody(res: unknown): unknown {
  return (res as CanonicalJsonResponse).body;
}

function getStatus(res: unknown): number {
  return (res as CanonicalJsonResponse).status as number;
}

function expectManage(handler: unknown) {
  const opts = (handler as { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } }).__options;
  expect(opts?.requireCapabilities).toContain("owner:manage");
  expect(opts?.requireWorkspace).toBe(true);
}

function expectView(handler: unknown) {
  const opts = (handler as { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } }).__options;
  expect(opts?.requireCapabilities).toContain("owner:view");
  expect(opts?.requireWorkspace).toBe(true);
}

beforeEach(() => vi.clearAllMocks());

// ─── approvals/memory POST ────────────────────────────────────────────────────

const VALID_APPROVAL_BODY = {
  scope: "vendor-payments",
  contentHash: "abc12345",
  riskClass: "medium" as const,
};

describe("POST /api/owner/approvals/memory", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectManage(approvalsMemoryPost));

  it("returns { ok: true } in canonicalJson status 201", async () => {
    mocks.recordApproval.mockResolvedValue(undefined);
    const res = await approvalsMemoryPost(makePostCtx(VALID_APPROVAL_BODY));
    expect(getStatus(res)).toBe(201);
    expect(getBody(res)).toEqual({ ok: true });
  });

  it("passes workspaceId and actorId from ctx to service", async () => {
    mocks.recordApproval.mockResolvedValue(undefined);
    await approvalsMemoryPost(makePostCtx(VALID_APPROVAL_BODY, "ws-APPROVAL", "actor-approval-x"));
    const arg = mocks.recordApproval.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-APPROVAL");
    expect(arg.actorId).toBe("actor-approval-x");
  });

  it("passes actorIsOwner: true to service", async () => {
    mocks.recordApproval.mockResolvedValue(undefined);
    await approvalsMemoryPost(makePostCtx(VALID_APPROVAL_BODY));
    expect(mocks.recordApproval.mock.calls[0][0].actorIsOwner).toBe(true);
  });

  it("rejects contentHash shorter than 8 chars", async () => {
    await expect(
      approvalsMemoryPost(makePostCtx({ ...VALID_APPROVAL_BODY, contentHash: "short" }))
    ).rejects.toThrow();
  });

  it("rejects invalid riskClass", async () => {
    await expect(
      approvalsMemoryPost(makePostCtx({ ...VALID_APPROVAL_BODY, riskClass: "extreme" }))
    ).rejects.toThrow();
  });

  it("rejects missing scope", async () => {
    const { scope: _, ...body } = VALID_APPROVAL_BODY;
    await expect(approvalsMemoryPost(makePostCtx(body))).rejects.toThrow();
  });

  it("rejects unknown fields", async () => {
    await expect(
      approvalsMemoryPost(makePostCtx({ ...VALID_APPROVAL_BODY, extra: "x" }))
    ).rejects.toThrow();
  });
});

// ─── approvals/memory GET ─────────────────────────────────────────────────────

describe("GET /api/owner/approvals/memory", () => {
  const url = (q = "") => `https://x/api/owner/approvals/memory?scope=test&contentHash=abc12345&riskClass=medium${q}`;

  it("declares OWNER_VIEW + requireWorkspace", () => expectView(approvalsMemoryGet));

  it("returns { remembered } in canonicalJson status 200", async () => {
    mocks.isApprovalRemembered.mockResolvedValue(true);
    const res = await approvalsMemoryGet(makeGetCtx(url()));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual({ remembered: true });
  });

  it("passes workspaceId from ctx to service", async () => {
    mocks.isApprovalRemembered.mockResolvedValue(false);
    await approvalsMemoryGet(makeGetCtx(url(), "ws-GET-APPROVAL"));
    expect(mocks.isApprovalRemembered.mock.calls[0][0].workspaceId).toBe("ws-GET-APPROVAL");
  });

  it("passes scope, contentHash, riskClass from query to service", async () => {
    mocks.isApprovalRemembered.mockResolvedValue(false);
    await approvalsMemoryGet(makeGetCtx(url()));
    const arg = mocks.isApprovalRemembered.mock.calls[0][0];
    expect(arg.scope).toBe("test");
    expect(arg.contentHash).toBe("abc12345");
    expect(arg.riskClass).toBe("medium");
  });

  it("uses strictest riskClass (critical) for unknown riskClass values", async () => {
    mocks.isApprovalRemembered.mockResolvedValue(false);
    await approvalsMemoryGet(makeGetCtx(`https://x/api/owner/approvals/memory?scope=x&contentHash=abc12345&riskClass=unknown-class`));
    expect(mocks.isApprovalRemembered.mock.calls[0][0].riskClass).toBe("critical");
  });

  it("workspace isolation: uses verifiedWorkspaceId, not URL param", async () => {
    mocks.isApprovalRemembered.mockResolvedValue(false);
    await approvalsMemoryGet(makeGetCtx(`${url()}&workspaceId=ws-ATTACKER`, "ws-REAL"));
    expect(mocks.isApprovalRemembered.mock.calls[0][0].workspaceId).toBe("ws-REAL");
  });
});

// ─── approvals/resolve POST ───────────────────────────────────────────────────

const VALID_RESOLVE_BODY = {
  scope: "vendor-payments",
  contentHash: "abc12345",
  riskClass: "medium" as const,
  actionType: "approve-invoice",
};

describe("POST /api/owner/approvals/resolve", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectManage(approvalsResolvePost));

  it("returns resolution in canonicalJson status 200", async () => {
    const resolution = { decision: "APPROVED", reason: "Standing instruction matched" };
    mocks.resolveOwnerApproval.mockResolvedValue(resolution);
    const res = await approvalsResolvePost(makePostCtx(VALID_RESOLVE_BODY));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual(resolution);
  });

  it("passes workspaceId from ctx to service", async () => {
    mocks.resolveOwnerApproval.mockResolvedValue({});
    await approvalsResolvePost(makePostCtx(VALID_RESOLVE_BODY, "ws-RESOLVE"));
    expect(mocks.resolveOwnerApproval.mock.calls[0][0].workspaceId).toBe("ws-RESOLVE");
  });

  it("uses contentHash when provided", async () => {
    mocks.resolveOwnerApproval.mockResolvedValue({});
    await approvalsResolvePost(makePostCtx(VALID_RESOLVE_BODY));
    expect(mocks.resolveOwnerApproval.mock.calls[0][0].contentHash).toBe("abc12345");
  });

  it("hashes content when contentHash absent", async () => {
    mocks.resolveOwnerApproval.mockResolvedValue({});
    const { contentHash: _, ...body } = VALID_RESOLVE_BODY;
    await approvalsResolvePost(makePostCtx({ ...body, content: { foo: "bar" } }));
    const usedHash = mocks.resolveOwnerApproval.mock.calls[0][0].contentHash;
    expect(usedHash).toMatch(/^hash-/);
  });

  it("rejects when neither contentHash nor content is provided", async () => {
    const { contentHash: _, ...body } = VALID_RESOLVE_BODY;
    await expect(approvalsResolvePost(makePostCtx(body))).rejects.toThrow();
  });

  it("rejects missing actionType", async () => {
    const { actionType: _, ...body } = VALID_RESOLVE_BODY;
    await expect(approvalsResolvePost(makePostCtx(body))).rejects.toThrow();
  });
});

// ─── arbitrate POST ───────────────────────────────────────────────────────────

const VALID_ARBITRATE_BODY = {
  candidates: [
    { id: "rec-1", blockedBy: [], riskOfAction: 0.3, riskOfInaction: 0.6, confidence: 0.8, ownerGoalAligned: true, reversible: true },
    { id: "rec-2", blockedBy: ["cash"], riskOfAction: 0.2, riskOfInaction: 0.4, confidence: 0.7, ownerGoalAligned: false, reversible: false },
  ],
};

describe("POST /api/owner/arbitrate", () => {
  it("declares OWNER_VIEW + requireWorkspace", () => expectView(arbitratePost));

  it("returns arbitration result in canonicalJson status 200", async () => {
    const result = { recommended: "rec-1", rejected: [{ id: "rec-2", reason: "blocked by cash" }] };
    mocks.arbitrate.mockReturnValue(result);
    const res = await arbitratePost(makePostCtx(VALID_ARBITRATE_BODY));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual(result);
  });

  it("passes candidates array to arbitrate domain function", async () => {
    mocks.arbitrate.mockReturnValue({});
    await arbitratePost(makePostCtx(VALID_ARBITRATE_BODY));
    expect(mocks.arbitrate.mock.calls[0][0]).toHaveLength(2);
    expect(mocks.arbitrate.mock.calls[0][0][0].id).toBe("rec-1");
  });

  it("rejects empty candidates array", async () => {
    await expect(arbitratePost(makePostCtx({ candidates: [] }))).rejects.toThrow();
  });

  it("rejects invalid blockedBy value", async () => {
    await expect(
      arbitratePost(makePostCtx({ candidates: [{ id: "x", blockedBy: ["invalid_block"] }] }))
    ).rejects.toThrow();
  });

  it("rejects missing candidates", async () => {
    await expect(arbitratePost(makePostCtx({}))).rejects.toThrow();
  });
});

// ─── opportunities/decide POST ────────────────────────────────────────────────

const VALID_DECIDE_BODY = {
  businessId: BIZ,
  fitScore: 0.75,
  paymentRisk: "low" as const,
};

describe("POST /api/owner/opportunities/decide", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectManage(opportunitiesDecidePost));

  it("returns decision in canonicalJson status 200", async () => {
    const decision = { outcome: "ACCEPT", reasons: [], nextAction: "prepare-proposal" };
    mocks.decideOpportunity.mockResolvedValue(decision);
    const res = await opportunitiesDecidePost(makePostCtx(VALID_DECIDE_BODY));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toEqual(decision);
  });

  it("passes workspaceId, businessId and actorId from ctx to service", async () => {
    mocks.decideOpportunity.mockResolvedValue({});
    await opportunitiesDecidePost(makePostCtx(VALID_DECIDE_BODY, "ws-DECIDE", "actor-decide"));
    const arg = mocks.decideOpportunity.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-DECIDE");
    expect(arg.businessId).toBe(BIZ);
    expect(arg.actorId).toBe("actor-decide");
  });

  it("rejects fitScore outside [0,1]", async () => {
    await expect(
      opportunitiesDecidePost(makePostCtx({ ...VALID_DECIDE_BODY, fitScore: 1.5 }))
    ).rejects.toThrow();
  });

  it("rejects invalid paymentRisk", async () => {
    await expect(
      opportunitiesDecidePost(makePostCtx({ ...VALID_DECIDE_BODY, paymentRisk: "extreme" }))
    ).rejects.toThrow();
  });

  it("rejects non-UUID businessId", async () => {
    await expect(
      opportunitiesDecidePost(makePostCtx({ ...VALID_DECIDE_BODY, businessId: "not-a-uuid" }))
    ).rejects.toThrow();
  });
});

// ─── opportunities/signals POST ───────────────────────────────────────────────

const VALID_SIGNAL_BODY = {
  rawSignalType: "GOVERNMENT_TENDER" as const,
  rawDescription: "City council tender for cleaning services 2026",
};

describe("POST /api/owner/opportunities/signals", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectManage(opportunitiesSignalsPost));

  it("returns signal result in canonicalJson status 200 on ok=true", async () => {
    const result = { signalId: "sig-1", classification: "TENDER", initialStatus: "PENDING", deduped: false, topOpportunity: null };
    mocks.submitExternalOpportunitySignal.mockResolvedValue({ ok: true, ...result });
    const res = await opportunitiesSignalsPost(makePostCtx(VALID_SIGNAL_BODY));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toMatchObject({ signalId: "sig-1" });
  });

  it("returns canonicalJson 400 with error when service ok=false", async () => {
    mocks.submitExternalOpportunitySignal.mockResolvedValue({ ok: false, reason: "missing data" });
    const res = await opportunitiesSignalsPost(makePostCtx(VALID_SIGNAL_BODY));
    expect(getStatus(res)).toBe(400);
    expect((getBody(res) as { error: string }).error).toBe("missing data");
  });

  it("returns 404 for workspace-not-found reason", async () => {
    mocks.submitExternalOpportunitySignal.mockResolvedValue({ ok: false, reason: "not in this workspace" });
    const res = await opportunitiesSignalsPost(makePostCtx(VALID_SIGNAL_BODY));
    expect(getStatus(res)).toBe(404);
  });

  it("passes workspaceId and actorId from ctx to service", async () => {
    mocks.submitExternalOpportunitySignal.mockResolvedValue({ ok: true, signalId: "x", classification: "t", initialStatus: "p", deduped: false, topOpportunity: null });
    await opportunitiesSignalsPost(makePostCtx(VALID_SIGNAL_BODY, "ws-SIG", "actor-sig"));
    const arg = mocks.submitExternalOpportunitySignal.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-SIG");
    expect(arg.actorId).toBe("actor-sig");
  });

  it("rejects missing rawSignalType", async () => {
    const { rawSignalType: _, ...body } = VALID_SIGNAL_BODY;
    await expect(opportunitiesSignalsPost(makePostCtx(body))).rejects.toThrow();
  });

  it("rejects invalid rawSignalType", async () => {
    await expect(
      opportunitiesSignalsPost(makePostCtx({ ...VALID_SIGNAL_BODY, rawSignalType: "INVALID_TYPE" }))
    ).rejects.toThrow();
  });
});

// ─── opportunities/execution-task POST ───────────────────────────────────────

const VALID_EXEC_TASK_BODY = {
  taskKey: "task-collect-docs-001",
  opportunityKey: "opp-tender-council-001",
  taskType: "COLLECT_DOCUMENTS" as const,
  sourceType: "PREP_CHECKLIST" as const,
  sourceKey: "checklist-001",
  nextActionOwner: "OWNER" as const,
  approvalLevel: "OWNER" as const,
  action: "ASSIGN" as const,
};

describe("POST /api/owner/opportunities/execution-task", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectManage(opportunitiesExecutionTaskPost));

  it("returns task result in canonicalJson status 200 on ok=true", async () => {
    const result = { taskId: "t-1", status: "ASSIGNED", updatesOpportunity: false, deduped: false };
    mocks.recordExecutionTaskUpdate.mockResolvedValue({ ok: true, ...result });
    const res = await opportunitiesExecutionTaskPost(makePostCtx(VALID_EXEC_TASK_BODY));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toMatchObject({ taskId: "t-1" });
  });

  it("returns canonicalJson 400 with error when service ok=false", async () => {
    mocks.recordExecutionTaskUpdate.mockResolvedValue({ ok: false, reason: "already completed" });
    const res = await opportunitiesExecutionTaskPost(makePostCtx(VALID_EXEC_TASK_BODY));
    expect(getStatus(res)).toBe(400);
    expect((getBody(res) as { error: string }).error).toBe("already completed");
  });

  it("passes workspaceId and actorId from ctx to service", async () => {
    mocks.recordExecutionTaskUpdate.mockResolvedValue({ ok: true, taskId: "x", status: "y", updatesOpportunity: false, deduped: false });
    await opportunitiesExecutionTaskPost(makePostCtx(VALID_EXEC_TASK_BODY, "ws-EXEC", "actor-exec"));
    const arg = mocks.recordExecutionTaskUpdate.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-EXEC");
    expect(arg.actorId).toBe("actor-exec");
  });

  it("rejects invalid taskType", async () => {
    await expect(
      opportunitiesExecutionTaskPost(makePostCtx({ ...VALID_EXEC_TASK_BODY, taskType: "INVALID_TASK" }))
    ).rejects.toThrow();
  });

  it("rejects invalid action", async () => {
    await expect(
      opportunitiesExecutionTaskPost(makePostCtx({ ...VALID_EXEC_TASK_BODY, action: "PAUSE" }))
    ).rejects.toThrow();
  });
});

// ─── opportunities/validation-outcome POST ────────────────────────────────────

const VALID_OUTCOME_BODY = {
  experimentKey: "exp-market-test-001",
  opportunityKey: "opp-tender-council-001",
  status: "COMPLETED" as const,
  result: "PASSED" as const,
};

describe("POST /api/owner/opportunities/validation-outcome", () => {
  it("declares OWNER_MANAGE + requireWorkspace", () => expectManage(opportunitiesValidationOutcomePost));

  it("returns outcome result in canonicalJson status 200 on ok=true", async () => {
    const r = { outcomeId: "out-1", result: "PASSED", nextRecommendedDecision: "SCALE", deduped: false, updated: true };
    mocks.recordValidationOutcome.mockResolvedValue({ ok: true, ...r });
    const res = await opportunitiesValidationOutcomePost(makePostCtx(VALID_OUTCOME_BODY));
    expect(getStatus(res)).toBe(200);
    expect(getBody(res)).toMatchObject({ outcomeId: "out-1" });
  });

  it("returns canonicalJson 400 with error when service ok=false", async () => {
    mocks.recordValidationOutcome.mockResolvedValue({ ok: false, reason: "stop-loss triggered" });
    const res = await opportunitiesValidationOutcomePost(makePostCtx(VALID_OUTCOME_BODY));
    expect(getStatus(res)).toBe(400);
    expect((getBody(res) as { error: string }).error).toBe("stop-loss triggered");
  });

  it("passes workspaceId and actorId from ctx to service", async () => {
    mocks.recordValidationOutcome.mockResolvedValue({ ok: true, outcomeId: "x", result: "PASSED", nextRecommendedDecision: null, deduped: false, updated: false });
    await opportunitiesValidationOutcomePost(makePostCtx(VALID_OUTCOME_BODY, "ws-OUTCOME", "actor-outcome"));
    const arg = mocks.recordValidationOutcome.mock.calls[0][0];
    expect(arg.workspaceId).toBe("ws-OUTCOME");
    expect(arg.actorId).toBe("actor-outcome");
  });

  it("rejects invalid status", async () => {
    await expect(
      opportunitiesValidationOutcomePost(makePostCtx({ ...VALID_OUTCOME_BODY, status: "INVALID" }))
    ).rejects.toThrow();
  });

  it("rejects invalid result", async () => {
    await expect(
      opportunitiesValidationOutcomePost(makePostCtx({ ...VALID_OUTCOME_BODY, result: "MAYBE" }))
    ).rejects.toThrow();
  });
});
