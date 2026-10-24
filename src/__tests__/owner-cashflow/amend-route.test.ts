/**
 * POST /api/owner/cashflow/snapshots/[snapshotId]/amend — route contract (no server, no DB): OWNER_MANAGE + workspace, a STRICT
 * body (no period/currency, at least one figure, bounded finite non-negative numbers, a freshness token), and the 409s
 * returned with their MACHINE fields. The service behaviour (locking, compare-and-set, audit) is proven in amend.db.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const WS = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const ACTOR = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
const SNAP = "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7";
const T0 = "2026-10-01T10:00:00.000Z";

type Handler = ((ctx: Record<string, unknown>, params?: Record<string, string>) => Promise<{ body: Record<string, unknown>; status: number }>) & {
  __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
};

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: Record<string, unknown>, params?: Record<string, string>) => unknown, options: unknown) => {
    const wrapped = (ctx: Record<string, unknown>, params?: Record<string, string>) => handler(ctx, params);
    wrapped.__options = options;
    return wrapped;
  },
}));
vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
}));
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));
const amend = vi.hoisted(() => vi.fn());
vi.mock("@/services/owner-cashflow/snapshot.service", () => ({
  amendCashflowSnapshot: amend,
  getCashflowSnapshot: vi.fn().mockResolvedValue({ id: "x" }),
}));

import { POST as PATCH } from "@/app/api/owner/cashflow/snapshots/[snapshotId]/amend/route";
import { GET } from "@/app/api/owner/cashflow/snapshots/[snapshotId]/route";
import { CashflowConflictError } from "@/services/owner-cashflow/cashflow-conflict";
import { NotFoundError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const patch = PATCH as unknown as Handler;
const get = GET as unknown as Handler;
const ctx = (body: unknown) => ({
  verifiedWorkspaceId: WS,
  verifiedActorId: ACTOR,
  request: new NextRequest("http://localhost/api/owner/cashflow/snapshots/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
});

beforeEach(() => { amend.mockClear(); });

describe("POST cashflow amend — wiring", () => {
  it("is OWNER_MANAGE + workspace-bound; the existing snapshot route stays GET-only OWNER_VIEW (capability set unchanged)", async () => {
    expect(patch.__options?.requireCapabilities).toEqual([CAPABILITIES.OWNER_MANAGE]);
    expect(patch.__options?.requireWorkspace).toBe(true);
    expect(get.__options?.requireCapabilities).toEqual([CAPABILITIES.OWNER_VIEW]);
    expect(Object.keys(await import("@/app/api/owner/cashflow/snapshots/[snapshotId]/route")).filter((k) => ["POST", "PATCH", "PUT", "DELETE"].includes(k))).toEqual([]);
  });
  it("rejects a malformed id before anything else", async () => {
    await expect(patch(ctx({ expectedUpdatedAt: T0, bankBalance: 1 }), { snapshotId: "nope" })).rejects.toThrow();
    expect(amend).not.toHaveBeenCalled();
  });
});

describe("POST cashflow amend — strict body", () => {
  const bad: Array<[string, unknown]> = [
    ["no freshness token", { bankBalance: 1 }],
    ["an empty change", { expectedUpdatedAt: T0 }],
    ["only confirmReplace", { expectedUpdatedAt: T0, confirmReplace: true }],
    ["an unparseable token", { expectedUpdatedAt: "yesterday-ish", bankBalance: 1 }],
    ["a negative figure", { expectedUpdatedAt: T0, bankBalance: -1 }],
    ["a figure above the 1e12 ceiling", { expectedUpdatedAt: T0, cashInHand: 1e12 + 1 }],
    ["a string figure", { expectedUpdatedAt: T0, bankBalance: "100" }],
    ["a period (the entry's period cannot move)", { expectedUpdatedAt: T0, bankBalance: 1, periodStart: "2026-09-01" }],
    ["a currency (the entry's currency cannot change)", { expectedUpdatedAt: T0, bankBalance: 1, currency: "USD" }],
    ["any other field", { expectedUpdatedAt: T0, bankBalance: 1, receivables: 5 }],
    ["a non-boolean confirmReplace", { expectedUpdatedAt: T0, bankBalance: 1, confirmReplace: "yes" }],
  ];
  for (const [name, body] of bad) {
    it(`refuses ${name}`, async () => {
      await expect(patch(ctx(body), { snapshotId: SNAP })).rejects.toThrow();
      expect(amend).not.toHaveBeenCalled();
    });
  }
  it("accepts a figure, a cleared figure (null) and exactly 1e12", async () => {
    amend.mockResolvedValue({ snapshot: { id: SNAP }, changed: true, changedFields: {} });
    for (const body of [{ expectedUpdatedAt: T0, bankBalance: 0 }, { expectedUpdatedAt: T0, cashInHand: null }, { expectedUpdatedAt: T0, bankBalance: 1e12, confirmReplace: true }]) {
      const res = await patch(ctx(body), { snapshotId: SNAP });
      expect(res.status).toBe(200);
    }
    expect(amend).toHaveBeenCalledTimes(3);
    expect(amend).toHaveBeenLastCalledWith(SNAP, { expectedUpdatedAt: T0, bankBalance: 1e12, confirmReplace: true }, ACTOR, WS);
  });
});

describe("POST cashflow amend — outcomes", () => {
  it("a no-op is a 200 with changed:false (passed through from the service)", async () => {
    amend.mockResolvedValue({ snapshot: { id: SNAP }, changed: false, changedFields: {} });
    const res = await patch(ctx({ expectedUpdatedAt: T0, bankBalance: 5 }), { snapshotId: SNAP });
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(false);
  });
  it("CASHFLOW_STALE is a 409 carrying the code, the fresh updatedAt and the current figures", async () => {
    amend.mockRejectedValue(new CashflowConflictError("CASHFLOW_STALE", "This entry changed since you opened it.", { snapshotId: SNAP, updatedAt: T0, current: { bankBalance: 7, cashInHand: null } }));
    const res = await patch(ctx({ expectedUpdatedAt: T0, bankBalance: 5 }), { snapshotId: SNAP });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "CASHFLOW_STALE", error: "This entry changed since you opened it.", updatedAt: T0, current: { bankBalance: 7, cashInHand: null } });
  });
  it("CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED is a 409 with current and proposed values", async () => {
    amend.mockRejectedValue(new CashflowConflictError("CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED", "A figure is already recorded here.", { snapshotId: SNAP, updatedAt: T0, current: { bankBalance: 7, cashInHand: null }, proposed: { bankBalance: 9 } }));
    const res = await patch(ctx({ expectedUpdatedAt: T0, bankBalance: 9 }), { snapshotId: SNAP });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED", proposed: { bankBalance: 9 }, current: { bankBalance: 7 } });
  });
  it("an unknown or foreign entry is the service's NotFoundError, unchanged (a uniform 404 by the canonical wrapper)", async () => {
    amend.mockRejectedValue(new NotFoundError("OwnerCashflowSnapshot", SNAP));
    await expect(patch(ctx({ expectedUpdatedAt: T0, bankBalance: 5 }), { snapshotId: SNAP })).rejects.toBeInstanceOf(NotFoundError);
  });
  it("any other failure is not swallowed into a 409", async () => {
    amend.mockRejectedValue(new Error("db down"));
    await expect(patch(ctx({ expectedUpdatedAt: T0, bankBalance: 5 }), { snapshotId: SNAP })).rejects.toThrow("db down");
  });
});
