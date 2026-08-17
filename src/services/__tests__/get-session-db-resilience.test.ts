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

const findUniqueMock = vi.fn();

vi.mock("@/lib/db", () => {
  const mockPrisma = { session: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } };
  return {
    db: mockPrisma,
    getDbInstance: vi.fn().mockResolvedValue(mockPrisma),
    // Unit-level simplification: skip the real SET LOCAL statement_timeout
    // transaction wrapping (proven separately against real Postgres in
    // src/lib/__tests__/db-statement-timeout.db.test.ts) and just invoke the
    // callback with the same mocked client.
    withStatementTimeout: (prisma: unknown, _timeoutMs: number, fn: (tx: unknown) => unknown) => fn(prisma),
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
    findUniqueMock.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));

    await expect(getSession()).resolves.toBeNull();
  });

  it("returns null (not a thrown error) when the session query hangs past the bounded timeout", async () => {
    findUniqueMock.mockImplementationOnce(
      () => new Promise(() => {}) // never resolves — must not hang the test or the caller
    );

    const result = await getSession();
    expect(result).toBeNull();
  }, 8000);

  it("never returns an authenticated session on DB failure, even for a token that would otherwise be valid", async () => {
    // Sanity: prove the mock CAN return a valid session when the query succeeds,
    // so the null result above is caused by the failure path, not a broken mock.
    findUniqueMock.mockResolvedValueOnce({
      id: "s1",
      token: cookieHolder.token,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "u1", email: "a@b.com", name: "A", isActive: true },
    });
    await expect(getSession()).resolves.toMatchObject({ sessionId: "s1" });

    // Now the failure path — must be null, never a session object of any kind.
    findUniqueMock.mockRejectedValueOnce(new Error("DriverAdapterError: Authentication timed out"));
    const failed = await getSession();
    expect(failed).toBeNull();
  });

  it("still returns null (unchanged behavior) when there is no session cookie at all — no DB call attempted", async () => {
    cookieHolder.token = undefined;
    await expect(getSession()).resolves.toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});
