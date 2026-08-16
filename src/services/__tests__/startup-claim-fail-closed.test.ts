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
 * write READY) and a DB failure during completion must never crash the
 * caller — it must degrade to the same "not owned"/"skipped" outcomes the
 * legacy setStartupStatus() already used for a transient connection error.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("VERCEL", "1");
vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_test_fail_closed");
vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");

const queryRawMock = vi.fn();
const updateManyMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
    startupStatus: {
      updateMany: (...args: unknown[]) => updateManyMock(...args),
    },
  },
}));

import { claimStartup, completeStartup } from "@/services/startup-status";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimStartup() — fails closed when the database is unavailable", () => {
  it("returns IN_PROGRESS (never CLAIMED) when the claim query throws a connection error", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));

    const result = await claimStartup();

    expect(result.outcome).not.toBe("CLAIMED");
    expect(result.outcome).toBe("IN_PROGRESS");
  });

  it("returns IN_PROGRESS (never CLAIMED) when the claim query throws an auth-timeout error", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("DriverAdapterError: Authentication timed out"));

    const result = await claimStartup();

    expect(result.outcome).not.toBe("CLAIMED");
  });

  it("returns IN_PROGRESS (never CLAIMED) when the claim_token column is missing (deploy-before-migrate)", async () => {
    queryRawMock.mockRejectedValueOnce(
      new Error('column "claim_token" of relation "startup_status" does not exist')
    );

    const result = await claimStartup();

    expect(result.outcome).not.toBe("CLAIMED");
  });

  it("never throws out of claimStartup() itself on a DB failure", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"));

    await expect(claimStartup()).resolves.toBeDefined();
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
