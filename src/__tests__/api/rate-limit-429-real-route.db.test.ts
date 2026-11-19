/**
 * Rate-limited requests are HTTP 429 with Retry-After — REAL routes + REAL canonical-route-enforcement, Postgres.
 *
 * Root cause: POST /api/actions and POST /api/run threw a plain Error("Rate limit exceeded…") when their limiter
 * denied, which the canonical wrapper (correctly) classifies as an unknown 500 — a client cannot tell "slow down"
 * from "server broke", so retry/back-off logic misbehaves. They now throw the existing RateLimitError
 * (TooManyRequestsError, 429, details.retryAfterSeconds) and the wrapper sets Retry-After from that window.
 *
 * Only @/services/auth is mocked; the limiters are tripped for real (in-memory bucket drained / PG bucket row at 0).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/rate-limit-429-real-route.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { checkWorkspaceRateLimit, resetAllRateLimits } from "@/middleware/rate-limit";
import { checkRateLimit, PRODUCTION_CONFIG } from "@/services/production/safety-config";
import type { VerifiedWorkspaceId } from "@/lib/workspace-identity";
import { logger } from "@/infra/logger";

let mockActorId = randomUUID();
let mockWorkspaceId = randomUUID();

vi.mock("@/services/auth", () => {
  const session = () => ({
    user: { id: mockActorId, email: "ratelimit-qa@example.com", name: "Rate QA", isActive: true },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  });
  const policy = () => ({
    userId: mockActorId,
    roles: [{ role: "system_admin", scope: "workspace", scopeId: mockWorkspaceId }],
    engagementMemberships: [],
  });
  return {
    getSessionFact: vi.fn(async () => ({ valid: true, session: session(), invalidReason: undefined })),
    getSession: vi.fn(async () => session()),
    getPolicyContextFact: vi.fn(async () => ({ valid: true, policy: policy(), invalidReason: undefined })),
    getPolicyContext: vi.fn(async () => policy()),
  };
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`https://example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const ACTION_BODY = {
  engagementId: randomUUID(),
  recommendationId: randomUUID(),
  title: "Call the supplier",
  priority: "high",
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] rate-limited requests are 429 + Retry-After (real routes, real wrapper)", () => {
  let actorId: string;
  let workspaceId: string;

  beforeEach(async () => {
    actorId = randomUUID();
    workspaceId = randomUUID();
    mockActorId = actorId;
    mockWorkspaceId = workspaceId;
    resetAllRateLimits();
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Rate WS", slug: `rate-${workspaceId.slice(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
  });

  afterEach(async () => {
    resetAllRateLimits();
    await db.rateLimitBucket.deleteMany({ where: { key: `ws:${workspaceId}` } });
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it("POST /api/actions: in-memory workspace limiter tripped → 429, owner-safe body, Retry-After = bucket window", async () => {
    // Drain the free-tier hourly bucket (1000 tokens) in one call, then one more check reports the window.
    checkWorkspaceRateLimit(workspaceId as VerifiedWorkspaceId, "free", 1000);
    const { POST } = await import("@/app/api/actions/route");
    const res = await POST(post("/api/actions", ACTION_BODY, { "Idempotency-Key": randomUUID() }), { params: Promise.resolve({}) });

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(4); // 1 token at 1000/3600 tokens/s
    const body = await res.json();
    expect(body.error).toBe(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    expect(body.classification).toBe("handler_invocation_rate_limited");
    expect(JSON.stringify(body)).not.toMatch(/stack|at \w+ \(/);
    expect(await db.auditEvent.count({ where: { workspaceId, eventName: { contains: "action" } } })).toBe(0);
  });

  it("POST /api/actions: distributed PG limiter tripped → 429 with Retry-After from the PG bucket", async () => {
    await db.rateLimitBucket.create({
      data: { key: `ws:${workspaceId}`, tokens: 0, lastRefillAt: new Date(), updatedAt: new Date() },
    });
    const { POST } = await import("@/app/api/actions/route");
    const res = await POST(post("/api/actions", ACTION_BODY, { "Idempotency-Key": randomUUID() }), { params: Promise.resolve({}) });

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(4);
    expect((await res.json()).error).toBe(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
  });

  it("POST /api/run: per-workspace per-minute limiter tripped → 429 with Retry-After within the 60s window", async () => {
    for (let i = 0; i < PRODUCTION_CONFIG.rateLimit.requestsPerMinute; i++) checkRateLimit(workspaceId);
    expect(checkRateLimit(workspaceId)).toBe(false);
    const { POST } = await import("@/app/api/run/route");
    const res = await POST(post("/api/run", { problem: "x" }), { params: Promise.resolve({}) });

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect((await res.json()).error).toBe(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
  });

  it("a 429 is logged as an expected client rejection (WARN), never as a server failure ([WRAPPER_FAILED] at ERROR)", async () => {
    for (let i = 0; i < PRODUCTION_CONFIG.rateLimit.requestsPerMinute; i++) checkRateLimit(workspaceId);
    const { POST } = await import("@/app/api/run/route");
    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");
    try {
      const res = await POST(post("/api/run", { problem: "x" }), { params: Promise.resolve({}) });
      expect(res.status).toBe(429);
      expect(warn).toHaveBeenCalledWith(
        "[WRAPPER_CLIENT_REJECTION]",
        expect.objectContaining({ statusCode: 429, classification: "handler_invocation_rate_limited" })
      );
      const errorMessages = error.mock.calls.map((c) => String(c[0]));
      expect(errorMessages).not.toContain("[WRAPPER_FAILED]");
      expect(errorMessages).not.toContain("Handler failed");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("a non-rate-limit 4xx carries no Retry-After header", async () => {
    const { POST } = await import("@/app/api/actions/route");
    const res = await POST(post("/api/actions", ACTION_BODY), { params: Promise.resolve({}) }); // no Idempotency-Key
    expect(res.status).not.toBe(429);
    expect(res.headers.get("retry-after")).toBeNull();
  });
});
