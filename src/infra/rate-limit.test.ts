import { describe, it, expect } from "vitest";
import { checkRateLimit, requireRateLimit, RateLimitError } from "./rate-limit";

describe("Rate limiting", () => {
  it("allows requests within the limit", () => {
    const config = { windowMs: 60_000, maxAttempts: 3 };
    const key = `test-allow-${Date.now()}`;

    const r1 = checkRateLimit(key, config);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(key, config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit(key, config);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests exceeding the limit", () => {
    const config = { windowMs: 60_000, maxAttempts: 2 };
    const key = `test-block-${Date.now()}`;

    checkRateLimit(key, config);
    checkRateLimit(key, config);

    const r3 = checkRateLimit(key, config);
    expect(r3.allowed).toBe(false);
    expect(r3.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("requireRateLimit throws RateLimitError when exceeded", () => {
    const config = { windowMs: 60_000, maxAttempts: 1 };
    const key = `test-throw-${Date.now()}`;

    requireRateLimit(key, config); // first call OK

    expect(() => requireRateLimit(key, config)).toThrow(RateLimitError);
  });

  it("resets after window expires", async () => {
    const config = { windowMs: 50, maxAttempts: 1 }; // 50ms window
    const key = `test-reset-${Date.now()}`;

    checkRateLimit(key, config);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    const r2 = checkRateLimit(key, config);
    expect(r2.allowed).toBe(true);
  });

  it("tracks different keys independently", () => {
    const config = { windowMs: 60_000, maxAttempts: 1 };
    const key1 = `test-ind1-${Date.now()}`;
    const key2 = `test-ind2-${Date.now()}`;

    checkRateLimit(key1, config);
    const r2 = checkRateLimit(key2, config);
    expect(r2.allowed).toBe(true);
  });
});
