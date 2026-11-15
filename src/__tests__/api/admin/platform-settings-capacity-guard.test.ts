/**
 * POST /api/admin/platform-settings — the browser is not the security boundary. The REAL route handler and the REAL
 * service run over a mocked transaction; only the auth/idempotency wrappers are bypassed. A direct authenticated POST
 * that raises capacity without an exact confirmation and a reason is refused with 400 and changes nothing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  row: { id: "global", admissionMode: "INVITE_ONLY", capacityLimit: 10, version: 1 } as { id: string; admissionMode: string; capacityLimit: number; version: number },
  writes: 0,
  audits: [] as Array<{ eventName: string; actorId: string; payload: Record<string, unknown> }>,
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown) => Promise<Response>) => async (request: Request) =>
    handler({ request, verifiedActorId: "admin-1" }),
}));
vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { "content-type": "application/json" } }),
}));
vi.mock("@/services/idempotency", () => ({
  checkIdempotencyKey: vi.fn(async () => ({ isNew: true })),
  recordIdempotencyResponse: vi.fn(async () => undefined),
  recordIdempotencyError: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db", () => {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => [{ verified: BigInt(4), pending: BigInt(0), ledger: BigInt(4) }]),
    platformSetting: {
      findUnique: vi.fn(async () => ({ ...state.row })),
      findUniqueOrThrow: vi.fn(async () => ({ ...state.row })),
      updateMany: vi.fn(async ({ data }: { data: { admissionMode: string; capacityLimit: number } }) => {
        state.writes += 1;
        state.row = { ...state.row, ...data, version: state.row.version + 1 };
        return { count: 1 };
      }),
    },
  };
  return { db: { $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) }, getDbInstance: vi.fn(async () => undefined) };
});
vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn(async (e: { eventName: string; actorId: string; payload: Record<string, unknown> }) => {
    state.audits.push({ eventName: e.eventName, actorId: e.actorId, payload: e.payload });
    return "evt";
  }),
}));
vi.mock("@/services/beta/capacity-alerts.service", () => ({ checkAndSendCapacityAlert: vi.fn(async () => undefined) }));

import { POST } from "@/app/api/admin/platform-settings/route";

const post = (payload: unknown) =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/admin/platform-settings", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "k-1" },
      body: JSON.stringify(payload),
    })
  );

beforeEach(() => {
  state.row = { id: "global", admissionMode: "INVITE_ONLY", capacityLimit: 10, version: 1 };
  state.writes = 0;
  state.audits = [];
});

describe("POST /api/admin/platform-settings — capacity increase guard", () => {
  it("a direct POST raising 10 -> 1000 with no confirmation is refused (400) and nothing changes", async () => {
    const res = await post({ capacityLimit: 1000 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/explicit confirmation/);
    expect(state.writes).toBe(0);
    expect(state.row).toMatchObject({ capacityLimit: 10, version: 1 });
    expect(state.audits).toHaveLength(0);
  });

  it("a POST carrying a mode AND an unconfirmed increase is refused as a whole — the mode is not applied either", async () => {
    const res = await post({ admissionMode: "OPEN_BETA", capacityLimit: 1000, reason: "launch" });
    expect(res.status).toBe(400);
    expect(state.row.admissionMode).toBe("INVITE_ONLY");
    expect(state.writes).toBe(0);
  });

  it("a POST with the confirmation but no reason is refused (400)", async () => {
    const res = await post({ capacityLimit: 25, capacityIncreaseConfirmation: { from: 10, to: 25 } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/short reason/);
    expect(state.writes).toBe(0);
  });

  it("a confirmation for a different value does not authorize the request (400)", async () => {
    const res = await post({ capacityLimit: 1000, capacityIncreaseConfirmation: { from: 10, to: 25 }, reason: "launch" });
    expect(res.status).toBe(400);
    expect(state.writes).toBe(0);
  });

  it("an unknown confirmation field (a generic 'I understand' flag) is rejected by the request schema before the service runs", async () => {
    // Schema failures are thrown to the canonical wrapper (bypassed here), which answers 400.
    await expect(
      post({ capacityLimit: 25, capacityIncreaseConfirmation: { from: 10, to: 25, acknowledged: true }, reason: "launch" })
    ).rejects.toThrow(/Validation failed/);
    expect(state.writes).toBe(0);
  });

  it("an exactly confirmed, explained increase is applied (200) and audited with its reason and actor", async () => {
    const res = await post({ capacityLimit: 25, capacityIncreaseConfirmation: { from: 10, to: 25 }, reason: "second wave" });
    expect(res.status).toBe(200);
    expect(state.row.capacityLimit).toBe(25);
    expect(state.audits).toEqual([
      { eventName: "platform_settings.capacity_changed", actorId: "admin-1", payload: { oldValue: 10, newValue: 25, reason: "second wave" } },
    ]);
  });

  it("a mode-only POST (the OPEN_BETA activation) succeeds with capacity untouched and no capacity audit event", async () => {
    const res = await post({ admissionMode: "OPEN_BETA" });
    expect(res.status).toBe(200);
    expect(state.row).toMatchObject({ admissionMode: "OPEN_BETA", capacityLimit: 10 });
    expect(state.audits.map((a) => a.eventName)).toEqual(["platform_settings.admission_mode_changed"]);
  });

  it("a decrease from the emergency ceiling needs nothing extra (200)", async () => {
    state.row.capacityLimit = 1000;
    const res = await post({ capacityLimit: 10 });
    expect(res.status).toBe(200);
    expect(state.row.capacityLimit).toBe(10);
  });
});
