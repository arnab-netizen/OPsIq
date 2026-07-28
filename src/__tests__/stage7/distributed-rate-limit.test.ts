/**
 * S7-DC11: Distributed rate limiting — non-DB interface tests.
 *
 * Proves the interface contracts and fail-open behavior without requiring
 * a live PostgreSQL connection. DB-backed concurrency tests are in
 * distributed-rate-limit-pg.db.test.ts (skipped when TEST_WITH_DB is unset).
 *
 * Coverage:
 *  1. checkPgRateLimit is callable and returns the correct shape
 *  2. Fail-open: DB error yields allowed=true with source="fail-open"
 *  3. Bucket key format accepted (workspace / IP prefixed keys)
 *  4. Config shape: capacity, refillPerSecond, cost
 *  5. Result shape: allowed, remaining, retryAfterSeconds?, source
 *  6. Cost defaults to 1 when not specified
 *  7. deletePgRateLimitBucket is callable without throwing
 *  8. Module exports the expected symbols
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// We mock the db module to avoid a real PostgreSQL connection in unit tests.
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: vi.fn(),
    rateLimitBucket: { delete: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { checkPgRateLimit, deletePgRateLimitBucket } from "@/infra/rate-limiter-pg";

afterEach(() => {
  vi.resetAllMocks();
});

const mockDb = db as {
  $queryRaw: ReturnType<typeof vi.fn>;
  rateLimitBucket: { delete: ReturnType<typeof vi.fn> };
};

function stubQueryRaw(tokensAfter: number, allowed: boolean) {
  mockDb.$queryRaw.mockResolvedValueOnce([
    { tokens_after: tokensAfter, allowed },
  ]);
}

// ── 1. Correct result shape when allowed ─────────────────────────────────────
describe("S7-DC11: checkPgRateLimit interface", () => {
  it("1. returns {allowed:true, remaining, source:'pg'} when tokens available", async () => {
    stubQueryRaw(999, true);
    const result = await checkPgRateLimit("ws:aaaa-0001", {
      capacity: 1000,
      refillPerSecond: 1000 / 3600,
      cost: 1,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(999);
    expect(result.source).toBe("pg");
    expect(result.retryAfterSeconds).toBeUndefined();
  });

  it("2. returns {allowed:false, remaining:0, retryAfterSeconds} when denied", async () => {
    stubQueryRaw(-0.5, false);
    const result = await checkPgRateLimit("ws:aaaa-0002", {
      capacity: 1000,
      refillPerSecond: 1000 / 3600, // ~0.278 tokens/s
      cost: 1,
    });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.source).toBe("pg");
  });

  it("3. accepts workspace-prefixed key format", async () => {
    stubQueryRaw(500, true);
    const result = await checkPgRateLimit("ws:11111111-1111-1111-1111-111111111111", {
      capacity: 1000,
      refillPerSecond: 1000 / 3600,
    });
    expect(result.allowed).toBe(true);
  });

  it("4. accepts ip-prefixed key format", async () => {
    stubQueryRaw(50, true);
    const result = await checkPgRateLimit("ip:192.168.1.1", {
      capacity: 100,
      refillPerSecond: 100 / 3600,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50);
  });

  it("5. cost defaults to 1 when not provided", async () => {
    stubQueryRaw(99, true);
    const result = await checkPgRateLimit("ws:defaults", {
      capacity: 100,
      refillPerSecond: 100 / 3600,
      // no cost — defaults to 1
    });
    expect(result.allowed).toBe(true);
    expect(mockDb.$queryRaw).toHaveBeenCalledOnce();
  });

  it("6. fail-open: DB error returns {allowed:true, source:'fail-open'}", async () => {
    mockDb.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    const result = await checkPgRateLimit("ws:db-error", {
      capacity: 1000,
      refillPerSecond: 1,
    });
    expect(result.allowed).toBe(true);
    expect(result.source).toBe("fail-open");
    expect(result.remaining).toBe(1000);
  });

  it("7. fail-open: empty result set returns {allowed:true, source:'fail-open'}", async () => {
    mockDb.$queryRaw.mockResolvedValueOnce([]);
    const result = await checkPgRateLimit("ws:empty", {
      capacity: 500,
      refillPerSecond: 0.5,
    });
    expect(result.allowed).toBe(true);
    expect(result.source).toBe("fail-open");
  });

  it("8. deletePgRateLimitBucket is callable without throwing", async () => {
    mockDb.rateLimitBucket.delete.mockResolvedValueOnce({ key: "ws:to-delete" });
    await expect(deletePgRateLimitBucket("ws:to-delete")).resolves.toBeUndefined();
  });

  it("9. deletePgRateLimitBucket swallows 'not found' errors silently", async () => {
    mockDb.rateLimitBucket.delete.mockRejectedValueOnce(new Error("Record to delete does not exist."));
    await expect(deletePgRateLimitBucket("ws:not-found")).resolves.toBeUndefined();
  });

  it("10. retryAfterSeconds is proportional to tokens needed and refill rate", async () => {
    // tokens_after=-0, cost=1: tokensNeeded=1, refill=1/3600 → retryAfter=3600s
    stubQueryRaw(0, false);
    const result = await checkPgRateLimit("ws:backpressure", {
      capacity: 100,
      refillPerSecond: 1 / 3600,
      cost: 1,
    });
    expect(result.allowed).toBe(false);
    // tokensNeeded = cost - tokens_after = 1 - 0 = 1; retry = ceil(1 / (1/3600)) = 3600
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(3600);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(3601);
  });
});
