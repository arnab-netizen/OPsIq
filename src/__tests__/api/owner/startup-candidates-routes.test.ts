/**
 * G13: Route-level unit tests for startup candidate routes:
 *   GET  /api/owner/startup/sessions/[sessionId]/candidates
 *   POST /api/owner/startup/sessions/[sessionId]/candidates/[batchId]/[conceptIndex]/accept
 *   POST /api/owner/startup/sessions/[sessionId]/candidates/[batchId]/[conceptIndex]/reject
 *
 * Tests cover:
 *   - Enforcement options (requireCapabilities, requireWorkspace)
 *   - Input validation (conceptIndex parsing, rejectionRationale schema)
 *   - Service delegation and response shaping
 *   - Error propagation (BadRequestError, NotFoundError, ConflictError)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  recordCandidateDecision: vi.fn(),
  db: {
    ownerStartupSession: {
      findFirst: vi.fn(),
    },
    startupIdeaGenerationBatch: {
      findMany: vi.fn(),
    },
    startupIdeaCandidate: {
      findMany: vi.fn(),
    },
  },
  parseRequestBody: vi.fn(),
  BadRequestError: class BadRequestError extends Error {
    statusCode = 400;
    constructor(msg: string) { super(msg); this.name = "BadRequestError"; }
  },
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown, params: Record<string, string>) => unknown,
    options?: Record<string, unknown>
  ) => {
    const wrapped = (ctx: unknown, params: Record<string, string>) => handler(ctx, params);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

vi.mock("@/services/owner-strategy/startup-session.service", () => ({
  recordCandidateDecision: mocks.recordCandidateDecision,
}));

vi.mock("@/lib/db", () => ({ db: mocks.db, getDbInstance: vi.fn().mockResolvedValue(mocks.db) }));

vi.mock("@/lib/validation", () => ({
  parseRequestBody: mocks.parseRequestBody,
}));

vi.mock("@/infra/errors", () => ({
  BadRequestError: mocks.BadRequestError,
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    constructor(entity: string, id: string) { super(`${entity} ${id} not found`); }
  },
  ConflictError: class ConflictError extends Error {
    statusCode = 409;
    constructor(msg: string) { super(msg); }
  },
}));

vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
}));

vi.mock("@/domain/constants/capabilities", () => ({
  CAPABILITIES: {
    OWNER_MANAGE: "OWNER_MANAGE",
    OWNER_VIEW: "OWNER_VIEW",
  },
}));

const makeCtx = (overrides: Record<string, unknown> = {}) => ({
  verifiedWorkspaceId: "ws-1",
  verifiedActorId: "actor-1",
  request: null,
  ...overrides,
});

// ── Candidates list route ──────────────────────────────────────────────────
describe("GET /candidates — startup-candidates list route", () => {
  let GET: (ctx: unknown, params: Record<string, string>) => unknown;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import(
      "@/app/api/owner/startup/sessions/[sessionId]/candidates/route"
    );
    GET = mod.GET as typeof GET;
    vi.clearAllMocks();
  });

  it("requires OWNER_VIEW capability", () => {
    const opts = (GET as { __options?: { requireCapabilities?: string[] } }).__options;
    expect(opts?.requireCapabilities).toContain("OWNER_VIEW");
  });

  it("requires workspace", () => {
    const opts = (GET as { __options?: { requireWorkspace?: boolean } }).__options;
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("delegates to db.startupIdeaGenerationBatch.findMany with workspaceId and sessionId", async () => {
    mocks.db.ownerStartupSession.findFirst.mockResolvedValueOnce({ id: "sess-1" });
    mocks.db.startupIdeaGenerationBatch.findMany.mockResolvedValueOnce([
      { id: "batch-1", conceptCount: 3, candidates: [] },
    ]);
    const result = await GET(makeCtx(), { sessionId: "sess-1" }) as { body: unknown };
    expect(mocks.db.startupIdeaGenerationBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "ws-1", sessionId: "sess-1" }),
      })
    );
    expect(result.body).toHaveProperty("batches");
  });

  it("returns empty batches array when none exist", async () => {
    mocks.db.ownerStartupSession.findFirst.mockResolvedValueOnce({ id: "sess-2" });
    mocks.db.startupIdeaGenerationBatch.findMany.mockResolvedValueOnce([]);
    const result = await GET(makeCtx(), { sessionId: "sess-2" }) as { body: { batches: unknown[] } };
    expect(result.body.batches).toHaveLength(0);
  });

  it("throws NotFoundError when session not found", async () => {
    mocks.db.ownerStartupSession.findFirst.mockResolvedValueOnce(null);
    await expect(GET(makeCtx(), { sessionId: "missing" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── Accept route ───────────────────────────────────────────────────────────
describe("POST /candidates/[batchId]/[conceptIndex]/accept", () => {
  let POST: (ctx: unknown, params: Record<string, string>) => unknown;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import(
      "@/app/api/owner/startup/sessions/[sessionId]/candidates/[batchId]/[conceptIndex]/accept/route"
    );
    POST = mod.POST as typeof POST;
    mocks.recordCandidateDecision.mockReset();
  });

  it("requires OWNER_MANAGE capability", () => {
    const opts = (POST as { __options?: { requireCapabilities?: string[] } }).__options;
    expect(opts?.requireCapabilities).toContain("OWNER_MANAGE");
  });

  it("requires workspace", () => {
    const opts = (POST as { __options?: { requireWorkspace?: boolean } }).__options;
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("throws BadRequestError for non-numeric conceptIndex", async () => {
    await expect(
      POST(makeCtx(), { sessionId: "s1", batchId: "b1", conceptIndex: "abc" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws BadRequestError for negative conceptIndex", async () => {
    await expect(
      POST(makeCtx(), { sessionId: "s1", batchId: "b1", conceptIndex: "-1" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("calls recordCandidateDecision with ACCEPTED and returns 201", async () => {
    mocks.recordCandidateDecision.mockResolvedValueOnce({
      candidateId: "cand-1",
      ideaId: "idea-1",
    });
    const result = await POST(
      makeCtx(),
      { sessionId: "s1", batchId: "b1", conceptIndex: "0" }
    ) as { body: { decision: string }; status: number };
    expect(mocks.recordCandidateDecision).toHaveBeenCalledWith(
      "ws-1", "s1", "b1", 0, "actor-1", { decision: "ACCEPTED" }
    );
    expect(result.body.decision).toBe("ACCEPTED");
    expect(result.status).toBe(201);
  });

  it("returns candidateId and ideaId in response body", async () => {
    mocks.recordCandidateDecision.mockResolvedValueOnce({
      candidateId: "cand-42",
      ideaId: "idea-99",
    });
    const result = await POST(
      makeCtx(),
      { sessionId: "s1", batchId: "b1", conceptIndex: "2" }
    ) as { body: { candidateId: string; ideaId: string } };
    expect(result.body.candidateId).toBe("cand-42");
    expect(result.body.ideaId).toBe("idea-99");
  });

  it("propagates NotFoundError from recordCandidateDecision", async () => {
    const err = Object.assign(new Error("batch not found"), { statusCode: 404 });
    mocks.recordCandidateDecision.mockRejectedValueOnce(err);
    await expect(
      POST(makeCtx(), { sessionId: "s1", batchId: "missing", conceptIndex: "0" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("propagates ConflictError when decision changes", async () => {
    const err = Object.assign(new Error("conflict"), { statusCode: 409 });
    mocks.recordCandidateDecision.mockRejectedValueOnce(err);
    await expect(
      POST(makeCtx(), { sessionId: "s1", batchId: "b1", conceptIndex: "1" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("accepts conceptIndex 0 (boundary)", async () => {
    mocks.recordCandidateDecision.mockResolvedValueOnce({ candidateId: "c0", ideaId: "i0" });
    const result = await POST(
      makeCtx(),
      { sessionId: "s1", batchId: "b1", conceptIndex: "0" }
    ) as { body: { decision: string } };
    expect(result.body.decision).toBe("ACCEPTED");
  });
});

// ── Reject route ───────────────────────────────────────────────────────────
describe("POST /candidates/[batchId]/[conceptIndex]/reject", () => {
  let POST: (ctx: unknown, params: Record<string, string>) => unknown;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import(
      "@/app/api/owner/startup/sessions/[sessionId]/candidates/[batchId]/[conceptIndex]/reject/route"
    );
    POST = mod.POST as typeof POST;
    mocks.recordCandidateDecision.mockReset();
    mocks.parseRequestBody.mockReset();
  });

  it("requires OWNER_MANAGE capability", () => {
    const opts = (POST as { __options?: { requireCapabilities?: string[] } }).__options;
    expect(opts?.requireCapabilities).toContain("OWNER_MANAGE");
  });

  it("requires workspace", () => {
    const opts = (POST as { __options?: { requireWorkspace?: boolean } }).__options;
    expect(opts?.requireWorkspace).toBe(true);
  });

  it("throws BadRequestError for non-numeric conceptIndex", async () => {
    await expect(
      POST(makeCtx(), { sessionId: "s1", batchId: "b1", conceptIndex: "NaN" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("calls recordCandidateDecision with REJECTED and rationale, returns 200", async () => {
    mocks.parseRequestBody.mockResolvedValueOnce({ rejectionRationale: "Not viable" });
    mocks.recordCandidateDecision.mockResolvedValueOnce({ candidateId: "cand-5" });
    const result = await POST(
      makeCtx({ request: {} }),
      { sessionId: "s1", batchId: "b1", conceptIndex: "2" }
    ) as { body: { decision: string }; status: number };
    expect(mocks.recordCandidateDecision).toHaveBeenCalledWith(
      "ws-1", "s1", "b1", 2, "actor-1",
      { decision: "REJECTED", rejectionRationale: "Not viable" }
    );
    expect(result.body.decision).toBe("REJECTED");
    expect(result.status).toBe(200);
  });

  it("returns candidateId in response body", async () => {
    mocks.parseRequestBody.mockResolvedValueOnce({ rejectionRationale: "Too expensive" });
    mocks.recordCandidateDecision.mockResolvedValueOnce({ candidateId: "cand-7" });
    const result = await POST(
      makeCtx({ request: {} }),
      { sessionId: "s1", batchId: "b1", conceptIndex: "0" }
    ) as { body: { candidateId: string } };
    expect(result.body.candidateId).toBe("cand-7");
  });

  it("does not include ideaId in reject response", async () => {
    mocks.parseRequestBody.mockResolvedValueOnce({ rejectionRationale: "Out of scope" });
    mocks.recordCandidateDecision.mockResolvedValueOnce({ candidateId: "cand-8" });
    const result = await POST(
      makeCtx({ request: {} }),
      { sessionId: "s1", batchId: "b1", conceptIndex: "3" }
    ) as { body: Record<string, unknown> };
    expect(result.body).not.toHaveProperty("ideaId");
  });

  it("propagates error from parseRequestBody (e.g. missing rationale)", async () => {
    const err = Object.assign(new Error("validation failed"), { statusCode: 400 });
    mocks.parseRequestBody.mockRejectedValueOnce(err);
    await expect(
      POST(makeCtx({ request: {} }), { sessionId: "s1", batchId: "b1", conceptIndex: "1" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("propagates ConflictError from recordCandidateDecision", async () => {
    mocks.parseRequestBody.mockResolvedValueOnce({ rejectionRationale: "Changed mind" });
    const err = Object.assign(new Error("conflict"), { statusCode: 409 });
    mocks.recordCandidateDecision.mockRejectedValueOnce(err);
    await expect(
      POST(makeCtx({ request: {} }), { sessionId: "s1", batchId: "b1", conceptIndex: "0" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
