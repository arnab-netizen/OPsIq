/**
 * POST /api/owner/integrations/quickbooks/connect records quickbooks_selected — the owner initiated a
 * connect and an authorization URL was issued. Not a successful connection: that is
 * quickbooks_connected, recorded separately by the callback route only once Intuit's OAuth flow
 * actually finalizes (qbo-connect-route-connected.test.ts).
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

const startConnect = vi.hoisted(() => vi.fn());
const recordOnce = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/services/quickbooks/qbo-connect-callback.service", () => ({ startQboConnect: startConnect }));
vi.mock("@/services/owner-first-run/first-run.service", () => ({ recordProductEventOnce: recordOnce }));

import { POST } from "@/app/api/owner/integrations/quickbooks/connect/route";

beforeEach(() => { startConnect.mockReset(); recordOnce.mockClear(); });

const call = async () => {
  const request = new NextRequest("http://localhost/api/owner/integrations/quickbooks/connect", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ businessId: BIZ, environment: "sandbox" }),
  });
  return (POST as unknown as (ctx: Record<string, unknown>) => Promise<{ status: number }>)({
    request, verifiedWorkspaceId: WS, verifiedActorId: ACTOR,
  });
};

describe("quickbooks_selected", () => {
  it("records once an authorization URL is issued", async () => {
    startConnect.mockResolvedValue({ ok: true, authorizationUrl: "https://intuit.example/authorize", stateExpiresAt: new Date() });
    await call();
    expect(recordOnce).toHaveBeenCalledWith(expect.objectContaining({ name: "quickbooks_selected", workspaceId: WS, actorId: ACTOR, businessId: BIZ }));
  });

  it("never records when the connect attempt itself fails", async () => {
    startConnect.mockResolvedValue({ ok: false, code: "CONFIGURATION_UNAVAILABLE" });
    await call();
    expect(recordOnce).not.toHaveBeenCalled();
  });
});
