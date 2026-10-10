/**
 * reservePublicBetaCapacity — race-safe beta admission (mode + capacity),
 * boundary logic.
 *
 * This is the pure-logic half of the cap's test coverage: it drives the real
 * function against a scriptable fake Prisma.TransactionClient (no real
 * database), pinning the boundary condition (>= cap refuses, < cap allows),
 * the fail-closed behavior when settings/count cannot be evaluated, that the
 * advisory lock is always acquired before the settings/count are read, and
 * the mode-based refusal paths (CLOSED/WAITLIST/INVITE_ONLY-not-invited).
 *
 * All boundary/capacity tests below run with no PlatformSetting row present
 * (platformSetting.findUnique returns null), i.e. the LEGACY fallback path —
 * admissionMode derives to INVITE_ONLY (PUBLIC_BETA_ENABLED unset in test
 * env) and capacityLimit is PUBLIC_BETA_WORKSPACE_CAP — with isInvited=true
 * throughout so mode never masks the capacity boundary under test.
 *
 * What this file does NOT prove — and cannot, without a real Postgres — is
 * that two genuinely concurrent transactions actually serialize on
 * pg_advisory_xact_lock rather than both reading a stale count/limit. That is
 * covered separately by the DB-gated concurrency tests in
 * platform-capacity-locking.db.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  reservePublicBetaCapacity,
  BetaCapExceededError,
  BetaCapUnavailableError,
  BetaAdmissionRefusedError,
} from "@/services/auth/beta-cap";
import { PUBLIC_BETA_WORKSPACE_CAP } from "@/lib/beta";

// vitest.setup.ts defaults PUBLIC_BETA_ENABLED=true globally so most of the
// suite exercises the open-beta path without per-test setup. This file's
// "legacy fallback" tests specifically want the INVITE_ONLY leg of the
// legacy mapping (PUBLIC_BETA_ENABLED=false), so it's pinned explicitly here
// and restored after.
const ORIGINAL_PUBLIC_BETA_ENABLED = process.env.PUBLIC_BETA_ENABLED;
beforeEach(() => {
  process.env.PUBLIC_BETA_ENABLED = "false";
});
afterEach(() => {
  if (ORIGINAL_PUBLIC_BETA_ENABLED === undefined) delete process.env.PUBLIC_BETA_ENABLED;
  else process.env.PUBLIC_BETA_ENABLED = ORIGINAL_PUBLIC_BETA_ENABLED;
});

/** A fake Prisma.TransactionClient exposing only what reservePublicBetaCapacity touches, in call order. */
function fakeTx(
  count: number,
  opts: {
    lockThrows?: boolean;
    settingsThrow?: boolean;
    countThrows?: boolean;
    settingsRow?: { admissionMode: string; capacityLimit: number; version: number } | null;
  } = {}
) {
  const calls: string[] = [];
  return {
    tx: {
      $executeRaw: vi.fn(async () => {
        calls.push("lock");
        if (opts.lockThrows) throw new Error("lock acquisition failed");
        return 0;
      }),
      platformSetting: {
        findUnique: vi.fn(async () => {
          calls.push("settings");
          if (opts.settingsThrow) throw new Error("settings read failed");
          return opts.settingsRow ?? null;
        }),
      },
      // Capacity usage (verified + still-pending places) is one raw aggregate; the fake reports `count` verified places.
      $queryRaw: vi.fn(async () => {
        calls.push("count");
        if (opts.countThrows) throw new Error("count query failed");
        return [{ verified: BigInt(count), pending: BigInt(0), ledger: BigInt(count) }];
      }),
    } as unknown as Parameters<typeof reservePublicBetaCapacity>[0],
    calls,
  };
}

describe("reservePublicBetaCapacity — capacity boundary (legacy fallback, isInvited=true)", () => {
  it("allows when the current count is strictly below the cap", async () => {
    const { tx } = fakeTx(PUBLIC_BETA_WORKSPACE_CAP - 1);
    await expect(reservePublicBetaCapacity(tx, true)).resolves.toMatchObject({ admissionMode: "INVITE_ONLY" });
  });

  it("refuses at exactly the cap (>= cap, not only > cap)", async () => {
    const { tx } = fakeTx(PUBLIC_BETA_WORKSPACE_CAP);
    await expect(reservePublicBetaCapacity(tx, true)).rejects.toBeInstanceOf(BetaCapExceededError);
  });

  it("refuses above the cap", async () => {
    const { tx } = fakeTx(PUBLIC_BETA_WORKSPACE_CAP + 5);
    await expect(reservePublicBetaCapacity(tx, true)).rejects.toBeInstanceOf(BetaCapExceededError);
  });

  it("allows at zero (no beta workspaces yet)", async () => {
    const { tx } = fakeTx(0);
    await expect(reservePublicBetaCapacity(tx, true)).resolves.toBeDefined();
  });

  it("fails closed — refuses, does not silently allow — when the count query throws", async () => {
    const { tx } = fakeTx(0, { countThrows: true });
    await expect(reservePublicBetaCapacity(tx, true)).rejects.toBeInstanceOf(BetaCapUnavailableError);
  });

  it("fails closed when the settings read throws", async () => {
    const { tx } = fakeTx(0, { settingsThrow: true });
    await expect(reservePublicBetaCapacity(tx, true)).rejects.toBeInstanceOf(BetaCapUnavailableError);
  });

  it("fails closed when the advisory-lock statement itself throws", async () => {
    const { tx } = fakeTx(0, { lockThrows: true });
    await expect(reservePublicBetaCapacity(tx, true)).rejects.toBeInstanceOf(BetaCapUnavailableError);
  });

  it("always acquires the advisory lock, then reads settings, then reads the count (order matters for race safety)", async () => {
    const { tx, calls } = fakeTx(0);
    await reservePublicBetaCapacity(tx, true);
    expect(calls).toEqual(["lock", "settings", "count"]);
  });

  it("never uses an in-memory counter — every call re-derives state from the injected tx, not from module state", async () => {
    const low = fakeTx(0);
    const high = fakeTx(PUBLIC_BETA_WORKSPACE_CAP);
    await expect(reservePublicBetaCapacity(low.tx, true)).resolves.toBeDefined();
    await expect(reservePublicBetaCapacity(high.tx, true)).rejects.toBeInstanceOf(BetaCapExceededError);
  });
});

describe("reservePublicBetaCapacity — mode-based refusal", () => {
  it("CLOSED always refuses, regardless of capacity or invited status", async () => {
    const { tx } = fakeTx(0, { settingsRow: { admissionMode: "CLOSED", capacityLimit: 50, version: 0 } });
    const err = await reservePublicBetaCapacity(tx, true).catch((e) => e);
    expect(err).toBeInstanceOf(BetaAdmissionRefusedError);
    expect(err.reason).toBe("admission_closed");
  });

  it("WAITLIST always refuses signup, regardless of capacity or invited status", async () => {
    const { tx } = fakeTx(0, { settingsRow: { admissionMode: "WAITLIST", capacityLimit: 50, version: 0 } });
    const err = await reservePublicBetaCapacity(tx, true).catch((e) => e);
    expect(err).toBeInstanceOf(BetaAdmissionRefusedError);
    expect(err.reason).toBe("admission_waitlist");
  });

  it("INVITE_ONLY refuses an uninvited email even with capacity available", async () => {
    const { tx } = fakeTx(0, { settingsRow: { admissionMode: "INVITE_ONLY", capacityLimit: 50, version: 0 } });
    const err = await reservePublicBetaCapacity(tx, false).catch((e) => e);
    expect(err).toBeInstanceOf(BetaAdmissionRefusedError);
    expect(err.reason).toBe("not_invited");
  });

  it("INVITE_ONLY admits an invited email when capacity is available", async () => {
    const { tx } = fakeTx(0, { settingsRow: { admissionMode: "INVITE_ONLY", capacityLimit: 50, version: 0 } });
    await expect(reservePublicBetaCapacity(tx, true)).resolves.toMatchObject({ admissionMode: "INVITE_ONLY" });
  });

  it("OPEN_BETA admits regardless of invited status, subject to capacity", async () => {
    const { tx } = fakeTx(0, { settingsRow: { admissionMode: "OPEN_BETA", capacityLimit: 50, version: 0 } });
    await expect(reservePublicBetaCapacity(tx, false)).resolves.toMatchObject({ admissionMode: "OPEN_BETA" });
  });

  it("OPEN_BETA still refuses (capacity, not mode) once the limit is reached", async () => {
    const { tx } = fakeTx(50, { settingsRow: { admissionMode: "OPEN_BETA", capacityLimit: 50, version: 0 } });
    await expect(reservePublicBetaCapacity(tx, false)).rejects.toBeInstanceOf(BetaCapExceededError);
  });
});
