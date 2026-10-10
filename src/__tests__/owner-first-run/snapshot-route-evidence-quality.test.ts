/**
 * SERVER_EVIDENCE_QUALITY_ENFORCEMENT at the HTTP boundary: the snapshot-create route asks the first-run service whether
 * the evidence must state its reliability BEFORE anything is written, and a refusal means nothing is created.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const WS = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const ACTOR = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
const BIZ = "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: Record<string, unknown>, params?: Record<string, string>) => unknown) => handler,
}));
vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
}));
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

const order: string[] = [];
const assertStated = vi.hoisted(() => vi.fn());
const createSnapshot = vi.hoisted(() => vi.fn());
vi.mock("@/services/owner-first-run/first-run.service", () => ({
  assertEvidenceQualityStatedForFirstEvidence: assertStated,
  recordProductEventOnce: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/services/owner-finance/snapshot.service", () => ({
  createFinancialSnapshot: createSnapshot,
  listFinancialSnapshots: vi.fn().mockResolvedValue([]),
}));

import { POST } from "@/app/api/owner/finance/businesses/[businessId]/snapshots/route";

const body = (extra: Record<string, unknown> = {}) => ({
  periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "GBP", revenue: 1000, fixedCosts: 400, cashOnHand: 50, ...extra,
});
const call = async (payload: Record<string, unknown>) => {
  const request = new NextRequest("http://localhost/api/owner/finance/businesses/x/snapshots", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  return (POST as unknown as (ctx: Record<string, unknown>, p: Record<string, string>) => Promise<{ status: number }>)(
    { request, verifiedWorkspaceId: WS, verifiedActorId: ACTOR }, { businessId: BIZ },
  );
};

beforeEach(() => {
  order.length = 0;
  assertStated.mockReset().mockImplementation(async () => { order.push("assert"); });
  createSnapshot.mockReset().mockImplementation(async () => { order.push("create"); return { id: "s1" }; });
});

describe("snapshot POST enforces evidence quality server-side", () => {
  it("asks the service BEFORE creating, passing the stated (or omitted) quality, scoped to the verified workspace", async () => {
    await call(body({ evidenceQuality: "GOOD_ESTIMATE" }));
    expect(order).toEqual(["assert", "create"]);
    expect(assertStated).toHaveBeenCalledWith(WS, BIZ, "GOOD_ESTIMATE");
    await call(body());
    expect(assertStated).toHaveBeenLastCalledWith(WS, BIZ, undefined);
  });
  it("a refusal from the service means nothing is created", async () => {
    assertStated.mockRejectedValue(new Error("Tell OpsIQ how reliable these numbers are"));
    await expect(call(body())).rejects.toThrow(/how reliable/);
    expect(createSnapshot).not.toHaveBeenCalled();
  });
  it("an invalid quality value is rejected by validation before either runs", async () => {
    await expect(call(body({ evidenceQuality: "VERIFIED" }))).rejects.toBeDefined();
    expect(assertStated).not.toHaveBeenCalled();
    expect(createSnapshot).not.toHaveBeenCalled();
  });
});
