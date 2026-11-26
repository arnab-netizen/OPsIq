/**
 * Phase 6J — evaluate route audit fail-closed proof.
 *
 * POST /api/decisions/[decisionId]/evaluate previously swallowed
 * emitAuditEvent failures via .catch() AFTER performing a governed DB
 * mutation (db.operatorItem.update). The fix removes the .catch() so audit
 * failures propagate (fail-closed), matching the Phase 6H pattern for
 * intake and operator routes.
 *
 * These tests prove that when emitAuditEvent throws:
 *   - POST /api/decisions/[decisionId]/evaluate rejects (does not swallow)
 *
 * All non-audit dependencies are mocked to succeed so the only failure path
 * exercised is the audit emission itself.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  emitAuditEvent: vi.fn(),
  dbWorkspaceMembershipFindFirst: vi.fn(),
  dbOperatorItemFindUnique: vi.fn(),
  dbOperatorItemUpdate: vi.fn(),
  resolveServerRole: vi.fn(),
  hasPermission: vi.fn(),
  fetch: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mocks.emitAuditEvent,
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown, params: unknown) => unknown) =>
    (ctx: unknown, params: unknown) => handler(ctx, params),
}));

vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn().mockResolvedValue(undefined),
  db: {
    workspaceMembership: { findFirst: mocks.dbWorkspaceMembershipFindFirst },
    operatorItem: {
      findUnique: mocks.dbOperatorItemFindUnique,
      update: mocks.dbOperatorItemUpdate,
    },
  },
}));

vi.mock("@/services/auth/server-role", () => ({
  resolveServerRole: mocks.resolveServerRole,
}));

vi.mock("@/middleware/workspace-enforcement", () => ({
  hasPermission: mocks.hasPermission,
  enforceWorkspaceScoping: vi.fn(),
}));

vi.mock("@/infra/errors", () => ({
  UnauthorizedError: class extends Error {
    constructor(msg: string) { super(msg); this.name = "UnauthorizedError"; }
  },
  ForbiddenError: class extends Error {
    constructor(msg: string) { super(msg); this.name = "ForbiddenError"; }
  },
}));

// ─── Import route after mocks ─────────────────────────────────────────────────

import { POST as evaluatePOST } from "@/app/api/decisions/[decisionId]/evaluate/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_DECISION = {
  id: "decision-1",
  workspaceId: "ws-1",
  status: "pending",
  blockStage: null,
  problem: "Churn spike detected",
  action: "Launch retention campaign",
  confidence: 0.7,
  impactExpected: 10000,
  impactLow: 5000,
  impactHigh: 15000,
  inputsSnapshot: {},
};

const SAMPLE_UPDATED = {
  ...SAMPLE_DECISION,
  status: "pending",
  blockStage: null,
};

const SAMPLE_EVAL_RESULT = {
  status: "approved",
  gateResult: { passed: true },
  guardrailResult: { warnings: [] },
  controlLayerViolations: null,
  blockStage: null,
  blockReason: null,
};

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: "ws-1",
    request: {
      json: () => Promise.resolve({}),
    },
    ...overrides,
  };
}

const PARAMS = { decisionId: "decision-1" };

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: everything succeeds
  mocks.emitAuditEvent.mockResolvedValue(undefined);
  mocks.dbWorkspaceMembershipFindFirst.mockResolvedValue({ role: "ADMIN" });
  mocks.dbOperatorItemFindUnique.mockResolvedValue(SAMPLE_DECISION);
  mocks.dbOperatorItemUpdate.mockResolvedValue(SAMPLE_UPDATED);
  mocks.resolveServerRole.mockResolvedValue("ADMIN");
  mocks.hasPermission.mockReturnValue(true);

  // Mock global fetch for /api/run call
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(SAMPLE_EVAL_RESULT),
  }) as unknown as typeof fetch;
});

describe("Phase 6J — evaluate audit fail-closed hardening", () => {
  it("succeeds when emitAuditEvent resolves (happy path)", async () => {
    const result = await evaluatePOST(makeCtx() as never, PARAMS);
    expect(result).toMatchObject({
      decisionId: "decision-1",
      recommendation: "approved",
    });
  });

  it("propagates emitAuditEvent failure — audit error is no longer swallowed", async () => {
    mocks.emitAuditEvent.mockRejectedValue(new Error("audit DB unavailable"));

    await expect(evaluatePOST(makeCtx() as never, PARAMS)).rejects.toThrow(
      "audit DB unavailable"
    );
  });

  it("emitAuditEvent is called with correct entityId, workspaceId, and eventName", async () => {
    await evaluatePOST(makeCtx() as never, PARAMS);

    expect(mocks.emitAuditEvent).toHaveBeenCalledOnce();
    expect(mocks.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "decision.evaluated",
        entityType: "Decision",
        entityId: "decision-1",
        workspaceId: "ws-1",
      })
    );
  });

  it("emitAuditEvent is called only after successful db.operatorItem.update", async () => {
    const callOrder: string[] = [];
    mocks.dbOperatorItemUpdate.mockImplementation(async () => {
      callOrder.push("update");
      return SAMPLE_UPDATED;
    });
    mocks.emitAuditEvent.mockImplementation(async () => {
      callOrder.push("audit");
    });

    await evaluatePOST(makeCtx() as never, PARAMS);

    expect(callOrder).toEqual(["update", "audit"]);
  });

  it("db.operatorItem.update is called with correct workspaceId guard", async () => {
    await evaluatePOST(makeCtx() as never, PARAMS);

    expect(mocks.dbOperatorItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "decision-1",
          workspaceId: "ws-1",
        }),
      })
    );
  });

  it("throws ForbiddenError if decision not in workspace", async () => {
    mocks.dbOperatorItemFindUnique.mockResolvedValue(null);

    await expect(evaluatePOST(makeCtx() as never, PARAMS)).rejects.toThrow();
    expect(mocks.emitAuditEvent).not.toHaveBeenCalled();
    expect(mocks.dbOperatorItemUpdate).not.toHaveBeenCalled();
  });

  it("rejects non-pending decisions before any mutation", async () => {
    mocks.dbOperatorItemFindUnique.mockResolvedValue({ ...SAMPLE_DECISION, status: "in_progress" });

    await expect(evaluatePOST(makeCtx() as never, PARAMS)).rejects.toThrow(
      "Cannot evaluate in_progress decision"
    );
    expect(mocks.dbOperatorItemUpdate).not.toHaveBeenCalled();
    expect(mocks.emitAuditEvent).not.toHaveBeenCalled();
  });

  it("emitAuditEvent payload contains before and after status", async () => {
    await evaluatePOST(makeCtx() as never, PARAMS);

    expect(mocks.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          before: expect.objectContaining({ status: "pending" }),
          after: expect.objectContaining({ recommendation: "approved" }),
        }),
      })
    );
  });

  it("emitAuditEvent receives actorId from verified context", async () => {
    await evaluatePOST(makeCtx({ verifiedActorId: "actor-special" }) as never, PARAMS);

    expect(mocks.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "actor-special" })
    );
  });

  describe("Phase 6J — additional behavioral coverage", () => {
    it("emitAuditEvent is called exactly once per successful request", async () => {
      await evaluatePOST(makeCtx() as never, PARAMS);
      expect(mocks.emitAuditEvent).toHaveBeenCalledTimes(1);
    });

    it("dbOperatorItemFindUnique is called with the decisionId from params", async () => {
      await evaluatePOST(makeCtx() as never, PARAMS);
      expect(mocks.dbOperatorItemFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: "decision-1" }) })
      );
    });

    it("dbOperatorItemUpdate is called exactly once", async () => {
      await evaluatePOST(makeCtx() as never, PARAMS);
      expect(mocks.dbOperatorItemUpdate).toHaveBeenCalledTimes(1);
    });

    it("fetch is called exactly once to invoke the evaluate API", async () => {
      await evaluatePOST(makeCtx() as never, PARAMS);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("result has decisionId field", async () => {
      const result = (await evaluatePOST(makeCtx() as never, PARAMS)) as { decisionId: string };
      expect(result).toHaveProperty("decisionId");
    });

    it("result.decisionId is decision-1", async () => {
      const result = (await evaluatePOST(makeCtx() as never, PARAMS)) as { decisionId: string };
      expect(result.decisionId).toBe("decision-1");
    });

    it("result has recommendation field", async () => {
      const result = (await evaluatePOST(makeCtx() as never, PARAMS)) as { recommendation: string };
      expect(result).toHaveProperty("recommendation");
    });

    it("result.recommendation is approved from mock eval result", async () => {
      const result = (await evaluatePOST(makeCtx() as never, PARAMS)) as { recommendation: string };
      expect(result.recommendation).toBe("approved");
    });

    it("makeCtx.verifiedWorkspaceId is ws-1 by default", () => {
      const ctx = makeCtx();
      expect(ctx.verifiedWorkspaceId).toBe("ws-1");
    });

    it("makeCtx.verifiedActorId is actor-1 by default", () => {
      const ctx = makeCtx();
      expect(ctx.verifiedActorId).toBe("actor-1");
    });

    it("emitAuditEvent is not called when decision is not found in workspace", async () => {
      mocks.dbOperatorItemFindUnique.mockResolvedValue(null);
      try { await evaluatePOST(makeCtx() as never, PARAMS); } catch { /* expected */ }
      expect(mocks.emitAuditEvent).not.toHaveBeenCalled();
    });
  });
});
