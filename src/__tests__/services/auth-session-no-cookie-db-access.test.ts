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
 * wiring, not a network round trip). The actual unbounded-query root cause
 * and its fix are in src/services/beta/public-presentation.service.ts's own
 * doc comment and src/lib/db.ts's withRawStatementTimeout() doc comment;
 * src/__tests__/stage8/root-route-admission-pool-starvation-hostile.db.test.ts
 * covers the acquisition-bound layer specifically (see that file's own
 * header for exactly what it does and does not prove), and
 * src/__tests__/lib/db-raw-statement-timeout-hostile.db.test.ts covers the
 * execution-bound and dead-connection-backstop layers generically. Mocking
 * `@/lib/db` entirely keeps THIS test fast and DB-free.
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

  it("no opsiq_session cookie: resolves near-instantly (secondary sanity check only -- with @/lib/db fully mocked, even the OLD call order would also resolve near-instantly; the call-count assertion in the test above is the one that actually discriminates old from new)", async () => {
    const { getSession } = await import("@/services/auth");

    const start = Date.now();
    await getSession();
    const elapsed = Date.now() - start;

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

  it("a present cookie whose lookup query itself errors (e.g. a connection failure) still fails closed to null -- never authenticated on a DB error", async () => {
    const { getRawPool, withRawStatementTimeout } = await import("@/lib/db");
    (getRawPool as ReturnType<typeof vi.fn>).mockResolvedValue({ connect: vi.fn(), query: vi.fn() });
    (withRawStatementTimeout as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connection reset"));

    const { getSession } = await import("@/services/auth");
    cookieHolder.token = "garbage-token";

    await expect(getSession()).resolves.toBeNull();
  });
});
