/**
 * Finance snapshot routes — contract at the HTTP boundary (no server, no DB).
 *   - amend is OWNER_MANAGE + workspace-bound and takes the VERIFIED workspace (never one from the body);
 *   - the amend body is validated (reason required, at least one figure, negatives refused, null = UNKNOWN accepted);
 *   - a stale amendment and a duplicate period come back as 409 WITH their machine code and ids, which is what the owner's
 *     screen branches on (the screen never parses message text).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const WS = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const ACTOR = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
const SNAP = "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7";
const BIZ = "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7";

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
const createSnapshot = vi.hoisted(() => vi.fn());
vi.mock("@/services/owner-finance/snapshot.service", () => ({
  amendFinancialSnapshot: amend,
  createFinancialSnapshot: createSnapshot,
  listFinancialSnapshots: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/services/owner-first-run/first-run.service", () => ({
  assertEvidenceQualityStatedForFirstEvidence: vi.fn().mockResolvedValue(undefined),
  recordProductEventOnce: vi.fn().mockResolvedValue(true),
}));

import { POST as AMEND } from "@/app/api/owner/finance/snapshots/[snapshotId]/amend/route";
import { POST as CREATE } from "@/app/api/owner/finance/businesses/[businessId]/snapshots/route";
import { FinanceConflictError } from "@/services/owner-finance/finance-conflict";
import { FINANCE_CONFLICT_CODES } from "@/domain/owner-finance/snapshot-conflict";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const amendRoute = AMEND as unknown as Handler;
const createRoute = CREATE as unknown as Handler;
const ctx = (body: unknown) => ({
  verifiedWorkspaceId: WS,
  verifiedActorId: ACTOR,
  request: new NextRequest("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});
const REASON = "Owner completed figures that were not known when the period was first saved";

beforeEach(() => { amend.mockReset(); createSnapshot.mockReset(); });

describe("POST finance snapshot amend", () => {
  it("is OWNER_MANAGE + workspace-bound", () => {
    expect(amendRoute.__options?.requireCapabilities).toEqual([CAPABILITIES.OWNER_MANAGE]);
    expect(amendRoute.__options?.requireWorkspace).toBe(true);
  });

  it("passes the snapshot id, the validated body, the verified actor and the VERIFIED workspace to the service; 201 with the new version", async () => {
    amend.mockResolvedValue({ snapshot: { id: "new-id", version: 2 }, previousSnapshotId: SNAP });
    const res = await amendRoute(ctx({ amendmentReason: REASON, revenue: 80_000, cashOnHand: null }), { snapshotId: SNAP });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ newSnapshotId: "new-id", previousSnapshotId: SNAP, version: 2 });
    expect(amend).toHaveBeenCalledWith(SNAP, expect.objectContaining({ amendmentReason: REASON, revenue: 80_000, cashOnHand: null }), ACTOR, WS);
  });

  it("refuses an invalid body before the service runs: no reason, nothing to change, a negative, an unknown field, a bad id", async () => {
    await expect(amendRoute(ctx({ revenue: 5 }), { snapshotId: SNAP })).rejects.toBeDefined(); // reason required
    await expect(amendRoute(ctx({ amendmentReason: REASON }), { snapshotId: SNAP })).rejects.toBeDefined(); // at least one field
    await expect(amendRoute(ctx({ amendmentReason: REASON, revenue: -1 }), { snapshotId: SNAP })).rejects.toBeDefined();
    await expect(amendRoute(ctx({ amendmentReason: REASON, revenue: 1, workspaceId: "other" }), { snapshotId: SNAP })).rejects.toBeDefined();
    await expect(amendRoute(ctx({ amendmentReason: REASON, revenue: 1 }), { snapshotId: "not-a-uuid" })).rejects.toBeDefined();
    expect(amend).not.toHaveBeenCalled();
  });

  it("a stale amendment is a 409 carrying FINANCE_SNAPSHOT_SUPERSEDED and the current id", async () => {
    amend.mockRejectedValue(new FinanceConflictError(FINANCE_CONFLICT_CODES.SUPERSEDED, "superseded", { currentSnapshotId: "cur" }));
    const res = await amendRoute(ctx({ amendmentReason: REASON, revenue: 1 }), { snapshotId: SNAP });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: FINANCE_CONFLICT_CODES.SUPERSEDED, currentSnapshotId: "cur", error: "superseded" });
  });

  it("any other failure is not swallowed", async () => {
    amend.mockRejectedValue(new Error("boom"));
    await expect(amendRoute(ctx({ amendmentReason: REASON, revenue: 1 }), { snapshotId: SNAP })).rejects.toThrow("boom");
  });
});

describe("POST finance snapshot create — duplicate period", () => {
  const body = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", revenue: 1000, fixedCosts: 400, evidenceQuality: "ACTUAL" };
  it("is a 409 carrying FINANCE_PERIOD_EXISTS and the existing snapshot's id", async () => {
    createSnapshot.mockRejectedValue(new FinanceConflictError(FINANCE_CONFLICT_CODES.PERIOD_EXISTS, "exists", { snapshotId: SNAP }));
    const res = await createRoute(ctx(body), { businessId: BIZ });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: FINANCE_CONFLICT_CODES.PERIOD_EXISTS, snapshotId: SNAP });
  });
  it("a successful create is unchanged (201)", async () => {
    createSnapshot.mockResolvedValue({ id: "s1" });
    const res = await createRoute(ctx(body), { businessId: BIZ });
    expect(res.status).toBe(201);
  });
});
