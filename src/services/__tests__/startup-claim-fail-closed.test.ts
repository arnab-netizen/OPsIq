/**
 * P0-15 cross-instance startup race remediation — unit-level (mocked DB)
 * proof that claimStartup()/completeStartup() fail closed when the database
 * is unavailable, without needing a live Postgres instance. The full
 * cross-instance concurrency guarantees (exactly-one-owner, stale reclaim,
 * no poisoning) are proven against real Postgres in
 * src/__tests__/stage8/startup-status-claim-concurrency.db.test.ts — this
 * file covers only the "DB is unreachable" edge, which real-DB integration
 * tests cannot safely simulate against a shared local/CI database.
 *
 * The invariant under test: a DB failure during a claim attempt must never
 * produce a CLAIMED result (which would let the caller proceed to eventually
 * write READY), and a DB failure during completion must never crash the
 * caller.
 *
 * claimStartup()'s error taxonomy (post cold-proxy-regression remediation):
 *   - missing table / missing column (known rollout-compatibility gaps,
 *     e.g. deploy-before-migrate ordering): IN_PROGRESS, unchanged.
 *   - everything else — a transient connection failure (Neon cold-start
 *     timeout) or a genuinely unexpected error — THROWS. IN_PROGRESS is a
 *     specific claim ("a live claimant exists elsewhere") that neither case
 *     has any evidence for; returning it instead would make
 *     ensureStartupComplete() silently skip every real startup check while
 *     instrumentation logs a false success (the exact production incident
 *     this replaces — a TypeError from a client method that failed to
 *     resolve was previously swallowed into IN_PROGRESS the same way a real
 *     connection timeout was).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("VERCEL", "1");
vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_test_fail_closed");
vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");

const queryMock = vi.fn();
const updateManyMock = vi.fn();
const connectMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    startupStatus: {
      updateMany: (...args: unknown[]) => updateManyMock(...args),
    },
  },
  getRawPool: vi.fn().mockResolvedValue({
    connect: (...args: unknown[]) => connectMock(...args),
  }),
  // Unit-level simplification: skip the real BEGIN/SET LOCAL statement_timeout/
  // COMMIT wrapping (proven separately against real Postgres in
  // src/lib/__tests__/db-statement-timeout.db.test.ts) and just acquire the
  // mocked client via the same pool.connect() the real helper uses, then
  // invoke the callback with it — preserving every existing mock's control
  // flow (a connect() rejection or a query() rejection both propagate
  // exactly as they would through the real helper).
  withRawStatementTimeout: async (
    pool: { connect: () => Promise<{ query: (...args: unknown[]) => unknown }> },
    _timeoutMs: number,
    fn: (client: { query: (...args: unknown[]) => unknown }) => unknown
  ) => fn(await pool.connect()),
}));

import { claimStartup, completeStartup } from "@/services/startup-status";

beforeEach(() => {
  vi.clearAllMocks();
  connectMock.mockResolvedValue({
    query: (...args: unknown[]) => queryMock(...args),
  });
});

describe("claimStartup() — fails closed when the database is unavailable", () => {
  it("throws (never CLAIMED, never IN_PROGRESS) when the claim query throws a connection error", async () => {
    queryMock.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));

    await expect(claimStartup()).rejects.toThrow("Connection terminated unexpectedly");
  });

  it("throws (never CLAIMED, never IN_PROGRESS) when the claim query throws an auth-timeout error", async () => {
    queryMock.mockRejectedValueOnce(new Error("DriverAdapterError: Authentication timed out"));

    await expect(claimStartup()).rejects.toThrow(/Authentication timed out/);
  });

  it("throws when pool.connect() itself rejects (DB unreachable before any query is sent)", async () => {
    connectMock.mockRejectedValueOnce(new Error("connect ETIMEDOUT"));

    await expect(claimStartup()).rejects.toThrow("connect ETIMEDOUT");
  });

  it("returns IN_PROGRESS (never CLAIMED) when the claim_token column is missing (deploy-before-migrate)", async () => {
    queryMock.mockRejectedValueOnce(
      new Error('column "claim_token" of relation "startup_status" does not exist')
    );

    const result = await claimStartup();

    expect(result.outcome).not.toBe("CLAIMED");
    expect(result.outcome).toBe("IN_PROGRESS");
  });

  it("throws — not IN_PROGRESS — on an unrecognized error message (e.g. a pg-pool acquisition timeout string this classifier doesn't know)", async () => {
    queryMock.mockRejectedValueOnce(new Error("some genuinely unrecognized driver error"));

    await expect(claimStartup()).rejects.toThrow("some genuinely unrecognized driver error");
  });

  it("throws — never returns IN_PROGRESS — when the client's query method itself is not callable (the P0-15 cold-proxy regression this test guards against, now exercised via the raw pg client contract)", async () => {
    // Simulates a client object whose expected .query() resolved to a
    // non-function value (the same failure class the original Prisma lazy-
    // proxy regression produced), so invoking it throws "TypeError: ... is
    // not a function" before any SQL reaches Postgres.
    connectMock.mockResolvedValueOnce({
      query: undefined,
    });

    await expect(claimStartup()).rejects.toThrow(TypeError);
  });
});

describe("completeStartup() — degrades safely when the database is unavailable", () => {
  it("does not throw when the completion write fails", async () => {
    updateManyMock.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));

    await expect(
      completeStartup("11111111-1111-1111-1111-111111111111", "READY", { completedAt: new Date() })
    ).resolves.toBeUndefined();
  });

  it("treats zero affected rows (stale/superseded claim) as a safe no-op, not an error", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 });

    await expect(
      completeStartup("11111111-1111-1111-1111-111111111111", "FAILED", { error: "boom" })
    ).resolves.toBeUndefined();
    expect(updateManyMock).toHaveBeenCalledTimes(1);
  });

  it("only claims success (count:1) when the row still matches this exact claim token", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 1 });

    await completeStartup("22222222-2222-2222-2222-222222222222", "READY", { completedAt: new Date() });

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "STARTING",
          claimToken: "22222222-2222-2222-2222-222222222222",
        }),
      })
    );
  });
});
