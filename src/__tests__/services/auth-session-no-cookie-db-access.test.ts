/**
 * F-ROOT-ROUTE-300S Phase 5 hostile proof (unit, no DB): getSession()'s
 * `opsiq_session` cookie read must happen BEFORE any DB initialization.
 *
 * Contract under test: DATABASE_ACCESS_REQUIRED=NO for a request with no
 * session cookie. Every anonymous visitor to the public root route (`/`) --
 * including every external uptime/HEAD monitor, which never carries a
 * session cookie -- must never pay for pg.Pool construction/connection at
 * all when there is no session to look up.
 *
 * This is a narrow latency/robustness improvement, NOT the proven root cause
 * of the 300s timeout (pool/client construction here is synchronous module
 * wiring, not a network round trip -- see
 * src/__tests__/stage8/root-route-admission-pool-starvation-hostile.db.test.ts
 * for the actual unbounded-query root cause and its fix). Mocking
 * `@/lib/db` entirely keeps this test fast and DB-free.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn(),
  getRawPool: vi.fn(),
  withRawStatementTimeout: vi.fn(),
  withStatementTimeout: vi.fn(),
  POOL_CONNECTION_TIMEOUT_MS: 90_000,
}));

vi.mock("@/lib/runtime-shadow-read-enforcer", () => ({
  checkShadowRead: vi.fn(),
}));

const cookieHolder = { token: undefined as string | undefined };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "opsiq_session" && cookieHolder.token ? { value: cookieHolder.token } : undefined,
  }),
}));

describe("getSession() reads the session cookie before any DB initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieHolder.token = undefined;
  });

  it("no opsiq_session cookie: getRawPool() is never called, no DB query occurs, result is null", async () => {
    const { getSession } = await import("@/services/auth");
    const { getRawPool, withRawStatementTimeout } = await import("@/lib/db");

    const result = await getSession();

    expect(result).toBeNull();
    expect(getRawPool).not.toHaveBeenCalled();
    expect(withRawStatementTimeout).not.toHaveBeenCalled();
  });

  it("no opsiq_session cookie: resolves near-instantly (no awaited DB-bound work on this path)", async () => {
    const { getSession } = await import("@/services/auth");

    const start = Date.now();
    await getSession();
    const elapsed = Date.now() - start;

    // Generous ceiling for CI scheduling jitter -- a real DB round trip
    // (even a fast one) would never be this close to zero; the old
    // call-order (getRawPool() before the cookie check) made this path pay
    // for pool/client construction unconditionally.
    expect(elapsed).toBeLessThan(50);
  });

  it("opsiq_session cookie present: the pool IS still used for the legitimate session-lookup query (unchanged behavior)", async () => {
    const { getRawPool, withRawStatementTimeout } = await import("@/lib/db");
    (getRawPool as ReturnType<typeof vi.fn>).mockResolvedValue({ connect: vi.fn(), query: vi.fn() });
    (withRawStatementTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

    const { getSession } = await import("@/services/auth");
    cookieHolder.token = "some-token-value";

    const result = await getSession();

    expect(getRawPool).toHaveBeenCalledTimes(1);
    expect(withRawStatementTimeout).toHaveBeenCalledTimes(1);
    // No matching row -> fails closed to null, exactly as before this change.
    expect(result).toBeNull();
  });

  it("invalid/unrecognized cookie still fails closed to null (never authenticated) even though the pool is consulted", async () => {
    const { getRawPool, withRawStatementTimeout } = await import("@/lib/db");
    (getRawPool as ReturnType<typeof vi.fn>).mockResolvedValue({ connect: vi.fn(), query: vi.fn() });
    (withRawStatementTimeout as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connection reset"));

    const { getSession } = await import("@/services/auth");
    cookieHolder.token = "garbage-token";

    await expect(getSession()).resolves.toBeNull();
  });
});
