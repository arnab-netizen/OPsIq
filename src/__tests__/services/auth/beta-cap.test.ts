/**
 * reservePublicBetaCapacity — race-safe beta workspace cap, boundary logic.
 *
 * This is the pure-logic half of the cap's test coverage: it drives the real
 * function against a scriptable fake Prisma.TransactionClient (no real
 * database), pinning the boundary condition (>= cap refuses, < cap allows),
 * the fail-closed behavior when the count cannot be evaluated, and that the
 * advisory lock is always acquired before the count is read.
 *
 * What this file does NOT prove — and cannot, without a real Postgres — is
 * that two genuinely concurrent transactions actually serialize on
 * pg_advisory_xact_lock rather than both reading a stale count. That is
 * covered separately by the DB-gated concurrency test in
 * beta-cap-race.db.test.ts, which exercises the same function against a real
 * database with real concurrent transactions.
 */
import { describe, it, expect, vi } from "vitest";
import { reservePublicBetaCapacity, BetaCapExceededError, BetaCapUnavailableError } from "@/services/auth/beta-cap";
import { PUBLIC_BETA_WORKSPACE_CAP } from "@/lib/beta";

/** A fake Prisma.TransactionClient exposing only $executeRaw/$queryRaw, in call order. */
function fakeTx(count: number, opts: { queryThrows?: boolean; lockThrows?: boolean } = {}) {
  const calls: string[] = [];
  return {
    tx: {
      $executeRaw: vi.fn(async () => {
        calls.push("lock");
        if (opts.lockThrows) throw new Error("lock acquisition failed");
        return 0;
      }),
      $queryRaw: vi.fn(async () => {
        calls.push("count");
        if (opts.queryThrows) throw new Error("count query failed");
        return [{ count: BigInt(count) }];
      }),
    } as unknown as Parameters<typeof reservePublicBetaCapacity>[0],
    calls,
  };
}

describe("reservePublicBetaCapacity", () => {
  it("allows when the current count is strictly below the cap", async () => {
    const { tx } = fakeTx(PUBLIC_BETA_WORKSPACE_CAP - 1);
    await expect(reservePublicBetaCapacity(tx)).resolves.toBeUndefined();
  });

  it("refuses at exactly the cap (>= cap, not only > cap)", async () => {
    const { tx } = fakeTx(PUBLIC_BETA_WORKSPACE_CAP);
    await expect(reservePublicBetaCapacity(tx)).rejects.toBeInstanceOf(BetaCapExceededError);
  });

  it("refuses above the cap", async () => {
    const { tx } = fakeTx(PUBLIC_BETA_WORKSPACE_CAP + 5);
    await expect(reservePublicBetaCapacity(tx)).rejects.toBeInstanceOf(BetaCapExceededError);
  });

  it("allows at zero (no beta workspaces yet)", async () => {
    const { tx } = fakeTx(0);
    await expect(reservePublicBetaCapacity(tx)).resolves.toBeUndefined();
  });

  it("fails closed — refuses, does not silently allow — when the count query throws", async () => {
    const { tx } = fakeTx(0, { queryThrows: true });
    await expect(reservePublicBetaCapacity(tx)).rejects.toBeInstanceOf(BetaCapUnavailableError);
  });

  it("fails closed when the advisory-lock statement itself throws", async () => {
    const { tx } = fakeTx(0, { lockThrows: true });
    await expect(reservePublicBetaCapacity(tx)).rejects.toBeInstanceOf(BetaCapUnavailableError);
  });

  it("always acquires the advisory lock before reading the count (order matters for race safety)", async () => {
    const { tx, calls } = fakeTx(0);
    await reservePublicBetaCapacity(tx);
    expect(calls).toEqual(["lock", "count"]);
  });

  it("never uses an in-memory counter — every call re-derives the count from the injected tx, not from module state", async () => {
    const low = fakeTx(0);
    const high = fakeTx(PUBLIC_BETA_WORKSPACE_CAP);
    await expect(reservePublicBetaCapacity(low.tx)).resolves.toBeUndefined();
    // A prior call resolving successfully must not memoize "capacity available"
    // anywhere — the very next call, against a tx reporting the cap reached,
    // must independently refuse.
    await expect(reservePublicBetaCapacity(high.tx)).rejects.toBeInstanceOf(BetaCapExceededError);
  });
});
