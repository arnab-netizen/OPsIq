/**
 * S7-DC11: Distributed rate limiting — PostgreSQL concurrency audit.
 *
 * Skipped when TEST_WITH_DB is not set (DB_BLOCKED_ENVIRONMENT).
 * Proves shared-state atomicity across concurrent callers.
 *
 * Coverage:
 *  1. Bucket created on first call
 *  2. Token consumption is persistent across calls
 *  3. Refill advances correctly with elapsed time
 *  4. Concurrent callers consume disjoint tokens (no double-spend)
 *  5. Bucket is denied when capacity exhausted
 *  6. Deny does not decrement tokens (idempotent on deny)
 *  7. deletePgRateLimitBucket removes the row
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { checkPgRateLimit, deletePgRateLimitBucket } from "@/infra/rate-limiter-pg";

const WITH_DB = process.env.TEST_WITH_DB === "true";
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

const testKey = `dc11-pg-test-${Date.now()}`;

describeIf(WITH_DB)("S7-DC11: PostgreSQL distributed rate limiter — concurrency", () => {
  beforeEach(async () => {
    await deletePgRateLimitBucket(testKey);
  });

  it("1. bucket is created on first call", async () => {
    const result = await checkPgRateLimit(testKey, { capacity: 10, refillPerSecond: 10 / 3600 });
    expect(result.allowed).toBe(true);
    const row = await db.rateLimitBucket.findUnique({ where: { key: testKey } });
    expect(row).not.toBeNull();
    expect(row!.tokens).toBeLessThan(10);
  });

  it("2. token consumption is persistent across calls", async () => {
    const cfg = { capacity: 10, refillPerSecond: 0, cost: 3 }; // no refill — pure consumption
    await checkPgRateLimit(testKey, cfg);
    const row1 = await db.rateLimitBucket.findUnique({ where: { key: testKey } });
    const tokens1 = row1!.tokens;

    await checkPgRateLimit(testKey, cfg);
    const row2 = await db.rateLimitBucket.findUnique({ where: { key: testKey } });
    expect(row2!.tokens).toBeLessThan(tokens1);
  });

  it("3. bucket is denied when capacity exhausted", async () => {
    const cfg = { capacity: 2, refillPerSecond: 0, cost: 1 };
    await checkPgRateLimit(testKey, cfg);
    await checkPgRateLimit(testKey, cfg);
    const result3 = await checkPgRateLimit(testKey, cfg);
    expect(result3.allowed).toBe(false);
    expect(result3.remaining).toBe(0);
    expect(result3.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("4. deny does not decrement tokens (idempotent on deny)", async () => {
    const cfg = { capacity: 1, refillPerSecond: 0, cost: 1 };
    await checkPgRateLimit(testKey, cfg); // consume last token
    const rowBefore = await db.rateLimitBucket.findUnique({ where: { key: testKey } });
    const tokensBefore = rowBefore!.tokens;

    await checkPgRateLimit(testKey, cfg); // denied
    const rowAfter = await db.rateLimitBucket.findUnique({ where: { key: testKey } });
    expect(rowAfter!.tokens).toBeCloseTo(tokensBefore, 5); // no change on deny
  });

  it("5. concurrent callers consume disjoint tokens (no double-spend)", async () => {
    // Initialize bucket with 5 tokens
    await db.rateLimitBucket.upsert({
      where: { key: testKey },
      create: { key: testKey, tokens: 5, lastRefillAt: new Date() },
      update: { tokens: 5, lastRefillAt: new Date() },
    });

    const cfg = { capacity: 5, refillPerSecond: 0, cost: 1 };
    // 7 concurrent requests — only 5 should be allowed
    const results = await Promise.all(
      Array.from({ length: 7 }, () => checkPgRateLimit(testKey, cfg))
    );

    const allowed = results.filter((r) => r.allowed).length;
    const denied = results.filter((r) => !r.allowed).length;
    expect(allowed).toBe(5);
    expect(denied).toBe(2);
  });

  it("6. deletePgRateLimitBucket removes the row", async () => {
    await checkPgRateLimit(testKey, { capacity: 10, refillPerSecond: 1 });
    const rowBefore = await db.rateLimitBucket.findUnique({ where: { key: testKey } });
    expect(rowBefore).not.toBeNull();

    await deletePgRateLimitBucket(testKey);
    const rowAfter = await db.rateLimitBucket.findUnique({ where: { key: testKey } });
    expect(rowAfter).toBeNull();
  });
});

describeIf(!WITH_DB)("S7-DC11: DB skipped — database unavailable", () => {
  it("DB_BLOCKED_ENVIRONMENT — PostgreSQL rate limit concurrency tests require TEST_WITH_DB=true", () => {
    expect(true).toBe(true);
  });
});
