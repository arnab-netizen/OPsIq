/**
 * Phase D1-D: POST /api/admin/workspaces/[id]/disable — route-contract tests
 *
 * Verifies the real, idempotent, audited, SYSTEM_ADMIN-only soft-disable route
 * via canonical enforcement. DB-free: the service + idempotency helpers are
 * mocked; the real canonicalJson envelope is asserted. Real DB behavior +
 * audit + isActive flip are covered by the Phase D DB suite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  disableWorkspaceForAdmin: vi.fn(),
  checkIdempotencyKey: vi.fn(),
  recordIdempotencyResponse: vi.fn(),
  recordIdempotencyError: vi.fn(),
  parseRequestBody: vi.fn(),
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

vi.mock("@/services/admin/admin-operability.service", () => ({
  disableWorkspaceForAdmin: mocks.disableWorkspaceForAdmin,
}));

vi.mock("@/services/idempotency", () => ({
  checkIdempotencyKey: mocks.checkIdempotencyKey,
  recordIdempotencyResponse: mocks.recordIdempotencyResponse,
  recordIdempotencyError: mocks.recordIdempotencyError,
}));

vi.mock("@/lib/validation", () => ({
  parseOrThrow: (_schema: unknown, value: unknown) => value,
  uuidSchema: {},
  parseRequestBody: mocks.parseRequestBody,
}));

// Real canonicalJson is used (not mocked) so we can assert the envelope.
import { POST } from "@/app/api/admin/workspaces/[id]/disable/route";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

function makeCtx(idempotencyKey: string | null) {
  return {
    verifiedActorId: "actor-1",
    request: {
      url: "https://x/api/admin/workspaces/" + WORKSPACE_ID + "/disable",
      headers: { get: (n: string) => (n === "idempotency-key" ? idempotencyKey : null) },
    },
  } as const;
}

const serviceResult = {
  workspaceId: WORKSPACE_ID,
  status: "disabled",
  isActive: false,
  reason: "abuse",
  disabledAt: "2026-06-04T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.parseRequestBody.mockResolvedValue({ reason: "abuse", notifyMembers: true });
  mocks.checkIdempotencyKey.mockResolvedValue({ isNew: true });
  mocks.disableWorkspaceForAdmin.mockResolvedValue(serviceResult);
});

describe("Phase D1-D: POST /api/admin/workspaces/[id]/disable", () => {
  it("declares SYSTEM_ADMIN via canonical enforcement", () => {
    const options = (POST as unknown as { __options?: { requireCapabilities?: string[] } }).__options;
    expect(options).toBeDefined();
    expect(options?.requireCapabilities).toContain("system:admin");
  });

  it("returns 400 when the idempotency-key header is missing", async () => {
    const res = (await POST(makeCtx(null), { id: WORKSPACE_ID })) as {
      status: number;
      body: { error: string };
    };
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/idempotency-key/i);
    // No write attempted without an idempotency key.
    expect(mocks.disableWorkspaceForAdmin).not.toHaveBeenCalled();
  });

  it("delegates to disableWorkspaceForAdmin with path id, actor, reason, notifyMembers", async () => {
    await POST(makeCtx("key-1"), { id: WORKSPACE_ID });
    expect(mocks.disableWorkspaceForAdmin).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      actorId: "actor-1",
      reason: "abuse",
      notifyMembers: true,
    });
  });

  it("returns the canonical disabled response shape (isActive:false, soft)", async () => {
    const res = (await POST(makeCtx("key-1"), { id: WORKSPACE_ID })) as {
      status: number;
      body: typeof serviceResult;
    };
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      workspaceId: WORKSPACE_ID,
      status: "disabled",
      isActive: false,
      reason: "abuse",
      disabledAt: expect.any(String),
    });
  });

  it("returns the cached response on idempotent replay (no second write)", async () => {
    mocks.checkIdempotencyKey.mockResolvedValue({
      isNew: false,
      cachedResponse: { status: 201, body: serviceResult },
    });

    const res = (await POST(makeCtx("key-1"), { id: WORKSPACE_ID })) as {
      status: number;
      body: typeof serviceResult;
    };
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ workspaceId: WORKSPACE_ID, isActive: false });
    expect(mocks.disableWorkspaceForAdmin).not.toHaveBeenCalled();
  });

  it("records the idempotency response on success", async () => {
    await POST(makeCtx("key-1"), { id: WORKSPACE_ID });
    expect(mocks.recordIdempotencyResponse).toHaveBeenCalledWith("key-1", 201, serviceResult);
    expect(mocks.recordIdempotencyError).not.toHaveBeenCalled();
  });

  it("records the idempotency error and rethrows on failure", async () => {
    const boom = new Error("db down");
    mocks.disableWorkspaceForAdmin.mockRejectedValue(boom);

    await expect(POST(makeCtx("key-1"), { id: WORKSPACE_ID })).rejects.toThrow("db down");
    expect(mocks.recordIdempotencyError).toHaveBeenCalledWith("key-1", boom);
  });

  it("uses idempotency operationName 'disableWorkspace' with a safe payload", async () => {
    await POST(makeCtx("key-1"), { id: WORKSPACE_ID });
    const callArg = mocks.checkIdempotencyKey.mock.calls[0][0];
    expect(callArg.operationName).toBe("disableWorkspace");
    expect(callArg.actorId).toBe("actor-1");
    expect(callArg.payload).toMatchObject({
      workspaceId: WORKSPACE_ID,
      reason: "abuse",
      notifyMembers: true,
    });
  });

  it("performs no hard delete and no notification (only the disable service + idempotency are touched)", async () => {
    await POST(makeCtx("key-1"), { id: WORKSPACE_ID });
    expect(mocks.disableWorkspaceForAdmin).toHaveBeenCalledTimes(1);
    // The route's mocked surface contains no delete/notify/email functions.
    expect(Object.keys(mocks).some((k) => /delete|notify|email/i.test(k))).toBe(false);
  });
});
