/**
 * GET /api/owner/first-run records quickbooks_offered — server-decided (resolveFirstRunSources), never a
 * client claim. Only role === "OFFER" counts as the owner actually being shown the QuickBooks route;
 * ATTENTION/IN_PROGRESS/HIDDEN, and every state outside NEEDS_EVIDENCE, must never fire it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const WS = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const ACTOR = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
const BIZ = "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: Record<string, unknown>, params?: Record<string, string>) => unknown) => handler,
}));

const getContext = vi.hoisted(() => vi.fn());
const recordOnce = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/services/owner-first-run/first-run.service", () => ({
  getFirstRunContext: getContext,
  recordProductEventOnce: recordOnce,
}));

import { GET } from "@/app/api/owner/first-run/route";

beforeEach(() => { getContext.mockReset(); recordOnce.mockClear(); });

const call = async () => {
  const request = new NextRequest("http://localhost/api/owner/first-run");
  return (GET as unknown as (ctx: Record<string, unknown>) => Promise<unknown>)({
    request, verifiedWorkspaceId: WS, verifiedActorId: ACTOR,
  });
};

describe("quickbooks_offered", () => {
  it("records once the server resolves the QuickBooks role to OFFER", async () => {
    getContext.mockResolvedValue({ state: "NEEDS_EVIDENCE", business: { id: BIZ }, evidenceSources: { quickBooks: "OFFER", manual: true, poll: false } });
    await call();
    expect(recordOnce).toHaveBeenCalledWith(expect.objectContaining({ name: "quickbooks_offered", workspaceId: WS, actorId: ACTOR, businessId: BIZ }));
  });

  it.each(["IN_PROGRESS", "ATTENTION", "HIDDEN"] as const)("never records for role %s", async (role) => {
    getContext.mockResolvedValue({ state: "NEEDS_EVIDENCE", business: { id: BIZ }, evidenceSources: { quickBooks: role, manual: true, poll: false } });
    await call();
    expect(recordOnce).not.toHaveBeenCalledWith(expect.objectContaining({ name: "quickbooks_offered" }));
  });

  it("never records outside NEEDS_EVIDENCE (evidenceSources is null elsewhere)", async () => {
    getContext.mockResolvedValue({ state: "NEEDS_DIAGNOSIS", business: { id: BIZ }, evidenceSources: null });
    await call();
    expect(recordOnce).not.toHaveBeenCalledWith(expect.objectContaining({ name: "quickbooks_offered" }));
  });

  it("never records when there is no business yet", async () => {
    getContext.mockResolvedValue({ state: "NEEDS_BUSINESS", business: null, evidenceSources: null });
    await call();
    expect(recordOnce).not.toHaveBeenCalledWith(expect.objectContaining({ name: "quickbooks_offered" }));
  });
});

describe("PRODUCT_EVENTS catalog carries the 4 new first-run-source events, correctly classified", () => {
  it("maps to AUDIT_EVENTS, is recognised, and is never an anonymous client event", async () => {
    const { PRODUCT_EVENTS, isProductEventName, isAnonymousClientEvent } = await import("@/domain/analytics/product-events");
    const { AUDIT_EVENTS } = await import("@/domain/constants/audit-events");
    for (const name of ["quickbooks_offered", "quickbooks_selected", "manual_entry_selected", "quickbooks_connected"] as const) {
      expect(isProductEventName(name)).toBe(true);
      expect(isAnonymousClientEvent(name)).toBe(false);
    }
    expect(PRODUCT_EVENTS.quickbooks_offered).toBe(AUDIT_EVENTS.PRODUCT_QUICKBOOKS_OFFERED);
    expect(PRODUCT_EVENTS.quickbooks_selected).toBe(AUDIT_EVENTS.PRODUCT_QUICKBOOKS_SELECTED);
    expect(PRODUCT_EVENTS.manual_entry_selected).toBe(AUDIT_EVENTS.PRODUCT_MANUAL_ENTRY_SELECTED);
    expect(PRODUCT_EVENTS.quickbooks_connected).toBe(AUDIT_EVENTS.PRODUCT_QUICKBOOKS_CONNECTED);
  });
});
