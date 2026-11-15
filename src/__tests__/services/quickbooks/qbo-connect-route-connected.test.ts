/**
 * GET /api/owner/integrations/quickbooks/callback records quickbooks_connected — only once the OAuth
 * callback actually finalizes an ACTIVE connection. Never fired on a selection alone (see
 * qbo-connect-route-selected.test.ts), a denial, or an exchange/finalize failure.
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
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => undefined }));

const completeCallback = vi.hoisted(() => vi.fn());
const getContext = vi.hoisted(() => vi.fn().mockResolvedValue({ state: "NEEDS_DIAGNOSIS" }));
const recordOnce = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const requestSyncNow = vi.hoisted(() => vi.fn().mockRejectedValue(new Error("no sync in this test")));
vi.mock("@/services/quickbooks/qbo-connect-callback.service", () => ({ completeQboCallback: completeCallback }));
vi.mock("@/services/owner-first-run/first-run.service", () => ({ getFirstRunContext: getContext, recordProductEventOnce: recordOnce }));
vi.mock("@/services/quickbooks/qbo-sync-background", () => ({ requestQboSyncNow: requestSyncNow, processQboSyncChain: vi.fn() }));

import { GET } from "@/app/api/owner/integrations/quickbooks/callback/route";

beforeEach(() => { completeCallback.mockReset(); getContext.mockClear(); recordOnce.mockClear(); });

const call = async () => {
  const request = new NextRequest("http://localhost/api/owner/integrations/quickbooks/callback?state=" + "a".repeat(40) + "&code=c&realmId=123");
  return (GET as unknown as (ctx: Record<string, unknown>) => Promise<{ status: number }>)({
    request, verifiedWorkspaceId: WS, verifiedActorId: ACTOR,
  });
};

describe("quickbooks_connected", () => {
  it("records once the callback actually finalizes a connection", async () => {
    completeCallback.mockResolvedValue({ ok: true, businessId: BIZ, connectionId: "conn-1", environment: "sandbox", reconnected: false, next: "FIRST_RUN" });
    await call();
    expect(recordOnce).toHaveBeenCalledWith(expect.objectContaining({ name: "quickbooks_connected", workspaceId: WS, actorId: ACTOR, businessId: BIZ }));
  });

  it("never records on denial or failure", async () => {
    completeCallback.mockResolvedValue({ ok: false, code: "USER_DENIED" });
    await call();
    expect(recordOnce).not.toHaveBeenCalled();
  });
});
