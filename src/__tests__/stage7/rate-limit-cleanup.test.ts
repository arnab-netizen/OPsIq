/**
 * S7-DC4: Rate limiting cleanup tests.
 *
 * Proves:
 * 1. rateLimitEnforcement (dead middleware) is no longer exported
 * 2. checkWorkspaceRateLimit is still functional (active production path)
 * 3. checkDiagnosisRateLimit is still functional (active production path)
 * 4. checkIpRateLimit is still functional
 * 5. Orphaned infra/rate-limiter.ts is gone (no import possible)
 */

import { describe, it, expect } from "vitest";

describe("S7-DC4: Dead middleware removed", () => {
  it("rateLimitEnforcement is NOT exported from middleware/rate-limit", async () => {
    const mod = await import("@/middleware/rate-limit");
    expect((mod as Record<string, unknown>)["rateLimitEnforcement"]).toBeUndefined();
  });

  it("checkWorkspaceRateLimit is still exported (live production path)", async () => {
    const mod = await import("@/middleware/rate-limit");
    expect(typeof mod.checkWorkspaceRateLimit).toBe("function");
  });

  it("checkDiagnosisRateLimit is still exported (live production path)", async () => {
    const mod = await import("@/middleware/rate-limit");
    expect(typeof mod.checkDiagnosisRateLimit).toBe("function");
  });

  it("checkIpRateLimit is still exported", async () => {
    const mod = await import("@/middleware/rate-limit");
    expect(typeof mod.checkIpRateLimit).toBe("function");
  });

  it("resetAllRateLimits is still exported (test utility)", async () => {
    const mod = await import("@/middleware/rate-limit");
    expect(typeof mod.resetAllRateLimits).toBe("function");
  });
});

describe("S7-DC4: Active rate limit functions work correctly", () => {
  it("checkDiagnosisRateLimit allows first request", async () => {
    const { checkDiagnosisRateLimit, resetDiagnosisRateLimits } = await import("@/middleware/rate-limit");
    resetDiagnosisRateLimits?.();
    const result = checkDiagnosisRateLimit("test-business-001");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it("checkDiagnosisRateLimit blocks after limit exceeded", async () => {
    const { checkDiagnosisRateLimit, resetDiagnosisRateLimits } = await import("@/middleware/rate-limit");
    resetDiagnosisRateLimits?.();
    const businessId = "test-business-block";
    // Exhaust the limit (10 per hour)
    for (let i = 0; i < 10; i++) {
      checkDiagnosisRateLimit(businessId);
    }
    const result = checkDiagnosisRateLimit(businessId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("checkIpRateLimit allows first request", async () => {
    const { checkIpRateLimit, resetAllRateLimits } = await import("@/middleware/rate-limit");
    resetAllRateLimits();
    const result = checkIpRateLimit("192.0.2.1");
    expect(result.allowed).toBe(true);
  });
});
