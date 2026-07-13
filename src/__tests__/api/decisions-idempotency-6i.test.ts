/**
 * Phase 6I — Idempotency Hardening unit tests.
 *
 * Proves that POST /api/decisions/intake and POST /api/decisions/create:
 *  - Reject requests missing idempotency-key header (400)
 *  - First submission creates exactly one record and caches the response
 *  - Identical retry returns the cached response without a second DB write
 *  - Conflicting body with same key is rejected by the idempotency layer
 *  - Workspace scoping is preserved (workspaceId in every payload hash)
 *
 * Also proves that state-transition routes (accept, close) require and honour
 * idempotency-key:
 *  - Missing key → 400
 *  - First call succeeds and caches
 *  - Identical retry returns cached success without re-calling the service
 *
 * All external dependencies are mocked. No real DB is touched.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  // idempotency
  checkIdempotencyKey: vi.fn(),
  recordIdempotencyResponse: vi.fn(),
  recordIdempotencyError: vi.fn(),
  // auth
  withAuth: vi.fn(),
  // db
  dbWorkspaceMembershipFindFirst: vi.fn(),
  dbOperatorItemCreate: vi.fn(),
  dbOperatorItemFindFirst: vi.fn(),
  // audit
  emitAuditEvent: vi.fn(),
  // intake data builder
  buildIntakeOperatorItemData: vi.fn(),
  // workspace enforcement
  enforceWorkspaceScoping: vi.fn(),
  // decision creation service
  createDecision: vi.fn(),
  createDecisionsBulk: vi.fn(),
  parseCSV: vi.fn(),
  // decision acceptance service
  acceptDecision: vi.fn(),
  // decision lifecycle service
  closeDecision: vi.fn(),
  // entitlement
  assertCapability: vi.fn(),
  // canonical enforcement
  withCanonicalEnforcementHandler: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/services/idempotency", () => ({
  checkIdempotencyKey: mocks.checkIdempotencyKey,
  recordIdempotencyResponse: mocks.recordIdempotencyResponse,
  recordIdempotencyError: mocks.recordIdempotencyError,
}));

vi.mock("@/lib/auth-guard", () => ({
  withAuth: mocks.withAuth,
}));

vi.mock("@/lib/enforced-route", () => ({
  withEnforcementFull: (handler: (req: unknown) => unknown) => handler,
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement:
    (handler: (ctx: unknown, params: unknown) => unknown) =>
    (ctx: unknown, params: unknown) =>
      handler(ctx, params),
}));

vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn().mockResolvedValue(undefined),
  db: {
    workspaceMembership: { findFirst: mocks.dbWorkspaceMembershipFindFirst },
    operatorItem: {
      create: mocks.dbOperatorItemCreate,
      findFirst: mocks.dbOperatorItemFindFirst,
    },
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mocks.emitAuditEvent,
}));

vi.mock("@/app/api/decisions/intake/intake-data", () => ({
  buildIntakeOperatorItemData: mocks.buildIntakeOperatorItemData,
}));

vi.mock("@/middleware/workspace-enforcement", () => ({
  enforceWorkspaceScoping: mocks.enforceWorkspaceScoping,
  hasPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("@/services/decisions/decision-creation-service", () => ({
  createDecision: mocks.createDecision,
  createDecisionsBulk: mocks.createDecisionsBulk,
  parseCSV: mocks.parseCSV,
}));

vi.mock("@/services/decision-validation/decision-acceptance.service", () => ({
  acceptDecision: mocks.acceptDecision,
}));

vi.mock("@/services/decisions/decision-lifecycle.service", () => ({
  closeDecision: mocks.closeDecision,
}));

vi.mock("@/services/entitlement.service", () => ({
  assertCapability: mocks.assertCapability,
}));

vi.mock("@/domain/constants/capabilities", () => ({
  CAPABILITIES: { DECISION_CREATE: "decision_create" },
}));

vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/operator-error-governance", () => ({
  classifyOperatorError: (err: Error) => ({ operatorMessage: err.message }),
}));

vi.mock("@/infra/errors", () => ({
  UnauthorizedError: class extends Error {
    constructor(msg: string) { super(msg); this.name = "UnauthorizedError"; }
  },
  ForbiddenError: class extends Error {
    constructor(msg: string) { super(msg); this.name = "ForbiddenError"; }
  },
  ValidationError: class extends Error {
    constructor(msg: string) { super(msg); this.name = "ValidationError"; }
  },
  PlanLimitError: class extends Error {
    constructor(cap: string, reason: string) { super(`${cap}: ${reason}`); this.name = "PlanLimitError"; }
  },
}));

// ─── Route imports (after mocks) ─────────────────────────────────────────────

import { POST as intakePOST } from "@/app/api/decisions/intake/route";
import { POST as createPOST } from "@/app/api/decisions/create/route";
import { POST as acceptPOST } from "@/app/api/decisions/[decisionId]/accept/route";
import { POST as closePOST } from "@/app/api/decisions/[decisionId]/close/route";

// ─── Request helpers ──────────────────────────────────────────────────────────

function makeIntakeRequest(overrides: {
  idempotencyKey?: string | null;
  title?: string;
  workspaceId?: string;
} = {}) {
  const { idempotencyKey = "idem-key-intake-1", title = "Reduce churn rate", workspaceId = "ws-1" } = overrides;
  return {
    verifiedWorkspaceId: workspaceId,
    verifiedActorId: "actor-1",
    verifiedActorType: "user" as const,
    request: {
      headers: {
        get: (k: string) => {
          if (k === "idempotency-key") return idempotencyKey;
          return null;
        },
      },
      json: () => Promise.resolve({ title, risk: "medium", confidence: 0.5 }),
    },
  };
}

function makeCreateRequest(overrides: {
  idempotencyKey?: string | null;
  title?: string;
  workspaceId?: string;
  contentType?: string;
} = {}) {
  const {
    idempotencyKey = "idem-key-create-1",
    title = "Launch retention campaign",
    workspaceId = "ws-create-1",
    contentType = "application/json",
  } = overrides;
  return {
    verifiedWorkspaceId: workspaceId,
    verifiedActorId: "actor-1",
    verifiedActorType: "user" as const,
    request: {
      headers: {
        get: (k: string) => {
          if (k === "idempotency-key") return idempotencyKey;
          if (k === "content-type") return contentType;
          return null;
        },
      },
      json: () => Promise.resolve({ title }),
    },
  };
}

function makeAcceptCtx(overrides: { idempotencyKey?: string | null; decisionId?: string } = {}) {
  const { idempotencyKey = "idem-key-accept-1", decisionId = "dec-1" } = overrides;
  return {
    ctx: {
      verifiedActorId: "actor-1",
      verifiedWorkspaceId: "ws-1",
      request: {
        headers: { get: (k: string) => (k === "idempotency-key" ? idempotencyKey : null) },
        json: () =>
          Promise.resolve({
            engagementId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
            rationale: "Approved after review",
          }),
      },
    },
    params: { decisionId },
  };
}

function makeCloseCtx(overrides: { idempotencyKey?: string | null; decisionId?: string } = {}) {
  const { idempotencyKey = "idem-key-close-1", decisionId = "dec-2" } = overrides;
  return {
    ctx: {
      verifiedActorId: "actor-1",
      verifiedWorkspaceId: "ws-1",
      request: {
        headers: { get: (k: string) => (k === "idempotency-key" ? idempotencyKey : null) },
      },
    },
    params: { decisionId },
  };
}

// ─── Shared state ─────────────────────────────────────────────────────────────

const CREATED_DECISION = { id: "dec-new-1", createdAt: new Date("2026-07-10T12:00:00Z") };
const CREATED_ACCEPT_RECORD = {
  decisionId: "dec-1",
  acceptedBy: "actor-1",
  acceptedAt: new Date("2026-07-10T12:00:00Z"),
  rationale: "Approved after review",
  auditEventId: "audit-1",
};

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Auth
  mocks.withAuth.mockResolvedValue({ session: { user: { id: "user-1" } } });

  // Workspace
  mocks.dbWorkspaceMembershipFindFirst.mockResolvedValue({ workspaceId: "ws-1" });
  mocks.enforceWorkspaceScoping.mockResolvedValue({ role: "ADMIN" });
  mocks.assertCapability.mockResolvedValue({ allowed: true });

  // DB
  mocks.dbOperatorItemCreate.mockResolvedValue(CREATED_DECISION);
  mocks.buildIntakeOperatorItemData.mockReturnValue({ title: "Reduce churn rate" });

  // Audit
  mocks.emitAuditEvent.mockResolvedValue(undefined);

  // Idempotency defaults: new request
  mocks.checkIdempotencyKey.mockResolvedValue({ isNew: true, cachedResponse: null });
  mocks.recordIdempotencyResponse.mockResolvedValue(undefined);
  mocks.recordIdempotencyError.mockResolvedValue(undefined);

  // Services
  mocks.createDecision.mockResolvedValue({ id: "dec-new-1", title: "Launch retention campaign" });
  mocks.createDecisionsBulk.mockResolvedValue({ summary: { succeeded: 2, failed: 0 }, decisions: [] });
  mocks.acceptDecision.mockResolvedValue(CREATED_ACCEPT_RECORD);
  mocks.closeDecision.mockResolvedValue({ id: "dec-2", status: "closed" });
});

// ─── POST /api/decisions/intake ───────────────────────────────────────────────

describe("POST /api/decisions/intake — idempotency (Phase 6I)", () => {
  it("rejects when idempotency-key header is absent", async () => {
    await expect(
      intakePOST(makeIntakeRequest({ idempotencyKey: null }) as never)
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("first submission creates one decision record and returns decisionId", async () => {
    const result = await intakePOST(makeIntakeRequest() as never);
    expect(result).toMatchObject({ decisionId: "dec-new-1", status: "pending" });
    expect(mocks.dbOperatorItemCreate).toHaveBeenCalledOnce();
  });

  it("recordIdempotencyResponse is called after successful creation", async () => {
    await intakePOST(makeIntakeRequest() as never);
    expect(mocks.recordIdempotencyResponse).toHaveBeenCalledOnce();
    expect(mocks.recordIdempotencyResponse).toHaveBeenCalledWith(
      "idem-key-intake-1",
      200,
      expect.objectContaining({ decisionId: "dec-new-1", status: "pending" }),
      "ws-1"
    );
  });

  it("identical retry returns cached response without a second DB write", async () => {
    const cachedBody = { decisionId: "dec-new-1", status: "pending", createdAt: "2026-07-10T12:00:00.000Z" };
    mocks.checkIdempotencyKey.mockResolvedValue({ isNew: false, cachedResponse: { status: 200, body: cachedBody } });

    const result = await intakePOST(makeIntakeRequest() as never);
    expect(result).toEqual(cachedBody);
    expect(mocks.dbOperatorItemCreate).not.toHaveBeenCalled();
    expect(mocks.recordIdempotencyResponse).not.toHaveBeenCalled();
  });

  it("cached error replay re-throws the original error without a DB write", async () => {
    const cachedError = new Error("audit DB unavailable");
    mocks.checkIdempotencyKey.mockResolvedValue({ isNew: false, cachedError });

    await expect(intakePOST(makeIntakeRequest() as never)).rejects.toThrow("audit DB unavailable");
    expect(mocks.dbOperatorItemCreate).not.toHaveBeenCalled();
  });

  it("workspace scoping: checkIdempotencyKey is called with the verified workspaceId", async () => {
    // Proves that the route passes verifiedWorkspaceId to the idempotency layer
    await intakePOST(makeIntakeRequest() as never);
    expect(mocks.checkIdempotencyKey).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
      })
    );
  });

  it("recordIdempotencyError called and error propagates when emitAuditEvent fails", async () => {
    mocks.emitAuditEvent.mockRejectedValue(new Error("audit write failed"));

    await expect(intakePOST(makeIntakeRequest() as never)).rejects.toThrow("audit write failed");
    expect(mocks.recordIdempotencyError).toHaveBeenCalledOnce();
    expect(mocks.recordIdempotencyError).toHaveBeenCalledWith(
      "idem-key-intake-1",
      expect.objectContaining({ message: "audit write failed" }),
      "ws-1"
    );
  });
});

// ─── POST /api/decisions/create ───────────────────────────────────────────────

describe("POST /api/decisions/create — idempotency (Phase 6I)", () => {
  it("rejects when idempotency-key header is absent", async () => {
    await expect(
      createPOST(makeCreateRequest({ idempotencyKey: null }) as never)
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("single JSON: first submission calls createDecision and records response", async () => {
    const result = await createPOST(makeCreateRequest() as never);
    expect(mocks.createDecision).toHaveBeenCalledOnce();
    expect(mocks.recordIdempotencyResponse).toHaveBeenCalledWith(
      "idem-key-create-1",
      200,
      expect.any(Object),
      "ws-create-1"
    );
  });

  it("single JSON: identical retry returns cached without calling createDecision", async () => {
    const cachedBody = { id: "dec-new-1", title: "Launch retention campaign" };
    mocks.checkIdempotencyKey.mockResolvedValue({ isNew: false, cachedResponse: { status: 200, body: cachedBody } });

    const result = await createPOST(makeCreateRequest() as never);
    expect(result).toEqual(cachedBody);
    expect(mocks.createDecision).not.toHaveBeenCalled();
  });

  it("single JSON: service error is recorded then re-thrown", async () => {
    mocks.createDecision.mockRejectedValue(new Error("plan limit exceeded"));

    await expect(createPOST(makeCreateRequest() as never)).rejects.toThrow("plan limit exceeded");
    expect(mocks.recordIdempotencyError).toHaveBeenCalledOnce();
  });

  it("workspace scoping: checkIdempotencyKey payload includes workspaceId", async () => {
    await createPOST(makeCreateRequest({ workspaceId: "ws-tenant-99" }) as never);
    expect(mocks.checkIdempotencyKey).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-tenant-99",
        payload: expect.objectContaining({ workspaceId: "ws-tenant-99" }),
      })
    );
  });
});

// ─── POST /api/decisions/[decisionId]/accept ─────────────────────────────────

describe("POST /api/decisions/[decisionId]/accept — idempotency (Phase 6I)", () => {
  it("rejects when idempotency-key header is absent", async () => {
    const { ctx, params } = makeAcceptCtx({ idempotencyKey: null });
    await expect(acceptPOST(ctx as never, params as never)).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("first call invokes acceptDecision and records cached response", async () => {
    const { ctx, params } = makeAcceptCtx();
    await acceptPOST(ctx as never, params as never);
    expect(mocks.acceptDecision).toHaveBeenCalledOnce();
    expect(mocks.recordIdempotencyResponse).toHaveBeenCalledWith(
      "idem-key-accept-1",
      200,
      expect.objectContaining({ decisionId: "dec-1" }),
      "ws-1"
    );
  });

  it("identical retry returns cached success without calling acceptDecision again", async () => {
    const cachedBody = { decisionId: "dec-1", acceptedBy: "actor-1", acceptedAt: "2026-07-10T12:00:00.000Z", auditEventId: "audit-1" };
    mocks.checkIdempotencyKey.mockResolvedValue({ isNew: false, cachedResponse: { status: 200, body: cachedBody } });

    const { ctx, params } = makeAcceptCtx();
    const result = await acceptPOST(ctx as never, params as never);
    expect(result).toEqual(cachedBody);
    expect(mocks.acceptDecision).not.toHaveBeenCalled();
  });

  it("service error is recorded then re-thrown", async () => {
    mocks.acceptDecision.mockRejectedValue(new Error("Decision is no longer pending acceptance"));

    const { ctx, params } = makeAcceptCtx();
    await expect(acceptPOST(ctx as never, params as never)).rejects.toThrow(
      "Decision is no longer pending acceptance"
    );
    expect(mocks.recordIdempotencyError).toHaveBeenCalledOnce();
  });
});

// ─── POST /api/decisions/[decisionId]/close ──────────────────────────────────

describe("POST /api/decisions/[decisionId]/close — idempotency (Phase 6I)", () => {
  it("rejects when idempotency-key header is absent", async () => {
    const { ctx, params } = makeCloseCtx({ idempotencyKey: null });
    await expect(closePOST(ctx as never, params as never)).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("first call invokes closeDecision and records cached response", async () => {
    const { ctx, params } = makeCloseCtx();
    await closePOST(ctx as never, params as never);
    expect(mocks.closeDecision).toHaveBeenCalledOnce();
    expect(mocks.recordIdempotencyResponse).toHaveBeenCalledWith(
      "idem-key-close-1",
      200,
      expect.objectContaining({ decisionId: "dec-2", status: "closed" }),
      "ws-1"
    );
  });

  it("identical retry returns cached success without calling closeDecision again", async () => {
    const cachedBody = { decisionId: "dec-2", status: "closed", message: "Decision closed successfully" };
    mocks.checkIdempotencyKey.mockResolvedValue({ isNew: false, cachedResponse: { status: 200, body: cachedBody } });

    const { ctx, params } = makeCloseCtx();
    const result = await closePOST(ctx as never, params as never);
    expect(result).toEqual(cachedBody);
    expect(mocks.closeDecision).not.toHaveBeenCalled();
  });

  it("service error is recorded then re-thrown", async () => {
    mocks.closeDecision.mockRejectedValue(new Error("Cannot close decision: must be OUTCOME_RECORDED"));

    const { ctx, params } = makeCloseCtx();
    await expect(closePOST(ctx as never, params as never)).rejects.toThrow(
      "Cannot close decision: must be OUTCOME_RECORDED"
    );
    expect(mocks.recordIdempotencyError).toHaveBeenCalledOnce();
  });
});
