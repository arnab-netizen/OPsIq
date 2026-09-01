/**
 * P0-15 forensic audit finding: getSession() (the one real, user-facing DB
 * query on the root "/" cold-start path) had no bespoke timeout and no error
 * handling — a slow/failed Neon connection rode the raw pg.Pool 90s ceiling
 * and then surfaced as an unhandled render exception.
 *
 * This proves the fix is fail-CLOSED, not fail-open: a DB failure (thrown
 * error or timeout) during the session lookup must produce the exact same
 * "no session" (null) outcome this function already returns for a
 * missing/expired/revoked/inactive session — never a fabricated authenticated
 * result. No new security state is introduced by this change.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieHolder = { token: "some-session-token" as string | undefined };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "opsiq_session" && cookieHolder.token ? { value: cookieHolder.token } : undefined,
  }),
}));

const queryMock = vi.fn();

vi.mock("@/lib/db", () => {
  return {
    getRawPool: vi.fn().mockResolvedValue({
      connect: vi.fn().mockResolvedValue({ query: (...args: unknown[]) => queryMock(...args) }),
    }),
    // Unit-level simplification: skip the real BEGIN/SET LOCAL statement_timeout/
    // COMMIT wrapping (proven separately against real Postgres in
    // src/lib/__tests__/db-statement-timeout.db.test.ts) and just acquire the
    // mocked client via the same pool.connect() the real helper uses, then
    // invoke the callback with it.
    withRawStatementTimeout: async (
      pool: { connect: () => Promise<{ query: (...args: unknown[]) => unknown }> },
      _timeoutMs: number,
      fn: (client: { query: (...args: unknown[]) => unknown }) => unknown
    ) => fn(await pool.connect()),
    // F-PROD-STARTUP-COLDSTART second-mechanism forensic: auth.ts now imports
    // this named export at module scope (to derive SESSION_QUERY_TIMEOUT_MS)
    // — a full module mock must provide every export the mocked module's
    // callers use.
    POOL_CONNECTION_TIMEOUT_MS: 90_000,
    getDbInstance: vi.fn().mockResolvedValue({}),
  };
});

vi.mock("@/lib/runtime-shadow-read-enforcer", () => ({
  checkShadowRead: vi.fn(),
}));

import { getSession } from "@/services/auth";

beforeEach(() => {
  vi.clearAllMocks();
  cookieHolder.token = "some-session-token";
});

describe("getSession() — DB-failure resilience (P0-15)", () => {
  it("returns null (not a thrown error) when the session query throws a connection error", async () => {
    queryMock.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));

    await expect(getSession()).resolves.toBeNull();
  });

  it("returns null (not a thrown error) when the session query hangs past the bounded timeout", async () => {
    queryMock.mockImplementationOnce(
      () => new Promise(() => {}) // never resolves — must not hang the test or the caller
    );

    const result = await getSession();
    expect(result).toBeNull();
    // Test timeout (not an assertion) intentionally exceeds auth.ts's real
    // SESSION_QUERY_TIMEOUT_MS. F-PROD-STARTUP-COLDSTART second-mechanism
    // forensic: getSession() now derives this from
    // POOL_CONNECTION_TIMEOUT_MS(90s)+SESSION_STATEMENT_TIMEOUT_MS(4s)+3s = 97s,
    // matching the raw-client bound already used by claimStartup()/
    // checkDatabase()/checkMigrationReadiness() — so this test actually
    // observes the real race settle instead of vitest's own runner cutting
    // it off first.
  }, 100_000);

  it("never returns an authenticated session on DB failure, even for a token that would otherwise be valid", async () => {
    // Sanity: prove the mock CAN return a valid session when the query succeeds,
    // so the null result above is caused by the failure path, not a broken mock.
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          session_id: "s1",
          expires_at: new Date(Date.now() + 60_000),
          revoked_at: null,
          user_id: "u1",
          user_email: "a@b.com",
          user_name: "A",
          user_is_active: true,
        },
      ],
    });
    await expect(getSession()).resolves.toMatchObject({ sessionId: "s1" });

    // Now the failure path — must be null, never a session object of any kind.
    queryMock.mockRejectedValueOnce(new Error("DriverAdapterError: Authentication timed out"));
    const failed = await getSession();
    expect(failed).toBeNull();
  });

  it("still returns null (unchanged behavior) when there is no session cookie at all — no DB call attempted", async () => {
    cookieHolder.token = undefined;
    await expect(getSession()).resolves.toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
