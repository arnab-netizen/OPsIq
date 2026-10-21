/**
 * Capacity INCREASES need an explicit confirmation of that exact increase plus a reason; decreases and mode-only
 * changes need neither. Mocked transaction (no live database): the real-Postgres proof of "a refused increase changes
 * nothing", the audit row contents and the stale-confirmation race lives in platform-capacity-increase-guard.db.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError } from "@/infra/errors";

const state = vi.hoisted(() => ({
  row: { id: "global", admissionMode: "INVITE_ONLY", capacityLimit: 10, version: 3 } as { id: string; admissionMode: string; capacityLimit: number; version: number },
  consumed: 4,
  writes: 0,
  audits: [] as Array<{ eventName: string; actorId: string; payload: Record<string, unknown> }>,
}));

vi.mock("@/lib/db", () => {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => [{ verified: BigInt(state.consumed), pending: BigInt(0), ledger: BigInt(state.consumed) }]),
    platformSetting: {
      findUnique: vi.fn(async () => ({ ...state.row })),
      findUniqueOrThrow: vi.fn(async () => ({ ...state.row })),
      updateMany: vi.fn(async ({ data }: { data: { admissionMode: string; capacityLimit: number } }) => {
        state.writes += 1;
        state.row = { ...state.row, admissionMode: data.admissionMode, capacityLimit: data.capacityLimit, version: state.row.version + 1 };
        return { count: 1 };
      }),
    },
  };
  return { db: { $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } };
});
vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn(async (e: { eventName: string; actorId: string; payload: Record<string, unknown> }) => {
    state.audits.push({ eventName: e.eventName, actorId: e.actorId, payload: e.payload });
    return "evt";
  }),
}));
vi.mock("@/services/beta/capacity-alerts.service", () => ({ checkAndSendCapacityAlert: vi.fn(async () => undefined) }));

import { updatePlatformSettings, ADMIN_CAPACITY_ABSOLUTE_CEILING } from "@/services/beta/platform-settings.service";

const capacityAudits = () => state.audits.filter((a) => a.eventName === "platform_settings.capacity_changed");

beforeEach(() => {
  state.row = { id: "global", admissionMode: "INVITE_ONLY", capacityLimit: 10, version: 3 };
  state.consumed = 4;
  state.writes = 0;
  state.audits = [];
});

describe("mode changes are independent of capacity", () => {
  it("INVITE_ONLY -> OPEN_BETA with capacity 10 results in OPEN_BETA / 10", async () => {
    const result = await updatePlatformSettings({ actorId: "admin", admissionMode: "OPEN_BETA" });
    expect(result).toMatchObject({ admissionMode: "OPEN_BETA", capacityLimit: 10 });
    expect(state.row.capacityLimit).toBe(10);
  });

  it("a mode-only save needs no confirmation or reason, cannot alter capacity and writes no capacity audit event", async () => {
    await expect(updatePlatformSettings({ actorId: "admin", admissionMode: "OPEN_BETA" })).resolves.toBeTruthy();
    expect(state.row.capacityLimit).toBe(10);
    expect(capacityAudits()).toHaveLength(0);
    expect(state.audits.map((a) => a.eventName)).toEqual(["platform_settings.admission_mode_changed"]);
  });
});

describe("a capacity increase must be explicitly confirmed and explained", () => {
  it("10 -> 25 without a confirmation is refused and changes nothing", async () => {
    await expect(updatePlatformSettings({ actorId: "admin", capacityLimit: 25, reason: "launch wave" })).rejects.toBeInstanceOf(ValidationError);
    expect(state.writes).toBe(0);
    expect(state.row).toMatchObject({ capacityLimit: 10, version: 3 });
    expect(state.audits).toHaveLength(0);
  });

  it("10 -> 25 with the confirmation but no reason (or a blank one) is refused and changes nothing", async () => {
    const confirmation = { from: 10, to: 25 };
    await expect(updatePlatformSettings({ actorId: "admin", capacityLimit: 25, capacityIncreaseConfirmation: confirmation })).rejects.toBeInstanceOf(ValidationError);
    await expect(updatePlatformSettings({ actorId: "admin", capacityLimit: 25, capacityIncreaseConfirmation: confirmation, reason: "   " })).rejects.toBeInstanceOf(ValidationError);
    expect(state.writes).toBe(0);
    expect(state.row.capacityLimit).toBe(10);
  });

  it("10 -> 25 with the exact confirmation and a reason succeeds and records old value, new value, reason and actor", async () => {
    const result = await updatePlatformSettings({ actorId: "admin-1", capacityLimit: 25, capacityIncreaseConfirmation: { from: 10, to: 25 }, reason: "  second wave of invitees  " });
    expect(result.capacityLimit).toBe(25);
    expect(capacityAudits()).toEqual([
      { eventName: "platform_settings.capacity_changed", actorId: "admin-1", payload: { oldValue: 10, newValue: 25, reason: "second wave of invitees" } },
    ]);
  });

  it("a confirmation for 10 -> 25 cannot authorize 10 -> 1000", async () => {
    await expect(
      updatePlatformSettings({ actorId: "admin", capacityLimit: 1000, capacityIncreaseConfirmation: { from: 10, to: 25 }, reason: "launch wave" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(state.writes).toBe(0);
    expect(state.row.capacityLimit).toBe(10);
  });

  it("a stale confirmation (the live capacity is no longer the 'from' value) cannot authorize the change", async () => {
    state.row.capacityLimit = 20; // someone else raised it after this page loaded
    await expect(
      updatePlatformSettings({ actorId: "admin", capacityLimit: 25, capacityIncreaseConfirmation: { from: 10, to: 25 }, reason: "launch wave" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(state.writes).toBe(0);
    expect(state.row.capacityLimit).toBe(20);
  });

  it("a refused increase does not apply a mode change supplied in the same request", async () => {
    await expect(updatePlatformSettings({ actorId: "admin", admissionMode: "OPEN_BETA", capacityLimit: 1000, reason: "x" })).rejects.toBeInstanceOf(ValidationError);
    expect(state.writes).toBe(0);
    expect(state.row.admissionMode).toBe("INVITE_ONLY");
  });

  it("an over-long reason is refused", async () => {
    await expect(
      updatePlatformSettings({ actorId: "admin", capacityLimit: 25, capacityIncreaseConfirmation: { from: 10, to: 25 }, reason: "x".repeat(501) })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(state.writes).toBe(0);
  });
});

describe("decreases stay a fast path, and the existing protections remain", () => {
  it("1000 -> 10 succeeds with no increase confirmation and no reason", async () => {
    state.row.capacityLimit = 1000;
    const result = await updatePlatformSettings({ actorId: "admin", capacityLimit: 10 });
    expect(result.capacityLimit).toBe(10);
    expect(capacityAudits()).toEqual([
      { eventName: "platform_settings.capacity_changed", actorId: "admin", payload: { oldValue: 1000, newValue: 10, reason: null } },
    ]);
  });

  it("setting the capacity to its current value is not an increase and needs nothing", async () => {
    await expect(updatePlatformSettings({ actorId: "admin", capacityLimit: 10 })).resolves.toBeTruthy();
    expect(capacityAudits()).toHaveLength(0);
  });

  it("a capacity below current usage is still refused", async () => {
    state.row.capacityLimit = 50;
    state.consumed = 7;
    await expect(updatePlatformSettings({ actorId: "admin", capacityLimit: 6 })).rejects.toBeInstanceOf(ValidationError);
    expect(state.writes).toBe(0);
  });

  it("a capacity above the absolute ceiling is still refused, even with a matching confirmation and reason", async () => {
    const over = ADMIN_CAPACITY_ABSOLUTE_CEILING + 1;
    await expect(
      updatePlatformSettings({ actorId: "admin", capacityLimit: over, capacityIncreaseConfirmation: { from: 10, to: over }, reason: "too big" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(state.writes).toBe(0);
  });
});
