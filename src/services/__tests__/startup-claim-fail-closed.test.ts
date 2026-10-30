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
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import { claimStartup, completeStartup } from "@/services/startup-status";
import { logger } from "@/infra/logger";

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

describe("claimStartup() — startup-claim diagnostic (sanitized, best-effort, never masks the original failure)", () => {
  it("1. INSERT fails with SQLSTATE 25006 (read-only) — the sanitized diagnostic is logged, and the ORIGINAL error still propagates", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const insertError = Object.assign(new Error("cannot execute INSERT in a read-only transaction"), { code: "25006" });
    queryMock.mockRejectedValueOnce(insertError);
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          current_user: "opsiq_app",
          session_user: "opsiq_app",
          transaction_read_only: "on",
          default_transaction_read_only: "off",
          neon_branch_id: "br-purple-boat-ayjn6zl6",
          neon_endpoint_id: "ep-empty-sky-ay1e6c27",
        },
      ],
    });

    await expect(claimStartup()).rejects.toThrow("cannot execute INSERT in a read-only transaction");

    expect(errorSpy).toHaveBeenCalledWith(
      "[STARTUP-STATUS] claim INSERT failed — sanitized diagnostic captured",
      undefined,
      expect.objectContaining({
        diagnostic: expect.objectContaining({
          currentUser: "opsiq_app",
          sessionUser: "opsiq_app",
          transactionReadOnly: "on",
          defaultTransactionReadOnly: "off",
          neonBranchId: "br-purple-boat-ayjn6zl6",
          neonEndpointId: "ep-empty-sky-ay1e6c27",
          insertSqlState: "25006",
        }),
      }),
    );
    errorSpy.mockRestore();
  });

  it("2. the diagnostic query itself fails — the ORIGINAL claim error is still preserved and propagated unchanged", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const insertError = Object.assign(new Error("Connection terminated unexpectedly"), { code: undefined });
    queryMock.mockRejectedValueOnce(insertError);
    queryMock.mockRejectedValueOnce(new Error("diagnostic query also failed"));

    await expect(claimStartup()).rejects.toThrow("Connection terminated unexpectedly");

    expect(errorSpy).toHaveBeenCalledWith(
      "[STARTUP-STATUS] claim INSERT failed — sanitized diagnostic captured",
      undefined,
      expect.objectContaining({
        diagnostic: expect.objectContaining({ diagnosticUnavailable: true }),
      }),
    );
    errorSpy.mockRestore();
  });

  it("3. no secret ever enters the structured diagnostic payload, even when the original error message carries connection text", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const insertError = Object.assign(
      new Error("password authentication failed for user \"opsiq_app\" at postgresql://opsiq_app:S3cr3t@ep-empty-sky.neon.tech/neondb"),
      { code: "28P01" },
    );
    queryMock.mockRejectedValueOnce(insertError);
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          current_user: "opsiq_app",
          session_user: "opsiq_app",
          transaction_read_only: "off",
          default_transaction_read_only: "off",
          neon_branch_id: "br-purple-boat-ayjn6zl6",
          neon_endpoint_id: "ep-empty-sky-ay1e6c27",
        },
      ],
    });

    await expect(claimStartup()).rejects.toThrow(/password authentication failed/);

    // Isolate the diagnostic log call specifically — the pre-existing generic fail-closed catch
    // (unrelated to this diagnostic) also logs once, using the raw error object, which this test does
    // not exercise or need to touch.
    const diagnosticCall = errorSpy.mock.calls.find((c) => c[0] === "[STARTUP-STATUS] claim INSERT failed — sanitized diagnostic captured");
    expect(diagnosticCall).toBeTruthy();
    const loggedPayload = JSON.stringify(diagnosticCall);
    expect(loggedPayload).not.toContain("S3cr3t");
    expect(loggedPayload).not.toContain("postgresql://");
    expect(loggedPayload).not.toContain("ep-empty-sky.neon.tech");
    // The diagnostic carries only the bounded, 5-character SQLSTATE — never the raw message.
    expect(diagnosticCall?.[2]).toEqual(
      expect.objectContaining({
        diagnostic: expect.objectContaining({ insertSqlState: "28P01" }),
      }),
    );
    errorSpy.mockRestore();
  });
});
