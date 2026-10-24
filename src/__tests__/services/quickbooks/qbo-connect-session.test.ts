/**
 * REAL canonical wrapper (not mocked): a callback or connect request without an authenticated OpsIQ session is
 * rejected before the handler runs, so no state is consumed and no authorization code is exchanged.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const svc = vi.hoisted(() => ({ completeQboCallback: vi.fn(), startQboConnect: vi.fn() }));
vi.mock("@/services/quickbooks/qbo-connect-callback.service", () => svc);
vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({ valid: false, session: null, invalidReason: "not_found" })),
  getSession: vi.fn(async () => null),
  getPolicyContextFact: vi.fn(async () => ({ valid: false, policy: null, invalidReason: "no_session" })),
}));
vi.mock("@/infra/critical-readiness", () => ({ ensureCriticalReadiness: async () => ({ status: "READY", errors: [] }) }));

import * as callbackRoute from "@/app/api/owner/integrations/quickbooks/callback/route";
import * as connectRoute from "@/app/api/owner/integrations/quickbooks/connect/route";

const ctx = { params: Promise.resolve({}) };

describe("no session -> no OAuth work", () => {
  it("callback without a session is refused (401) and never reaches the orchestration", async () => {
    const res = await callbackRoute.GET(
      new NextRequest("http://localhost/api/owner/integrations/quickbooks/callback?state=" + "A".repeat(40) + "&code=c&realmId=123"),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(svc.completeQboCallback).not.toHaveBeenCalled();
    const text = await res.text();
    expect(text).not.toContain("A".repeat(40));
  });
  it("connect without a session is refused and never reaches the orchestration", async () => {
    const res = await connectRoute.POST(
      new NextRequest("http://localhost/api/owner/integrations/quickbooks/connect", {
        method: "POST", body: JSON.stringify({ businessId: "11111111-1111-4111-8111-111111111111", environment: "sandbox" }),
        headers: { "content-type": "application/json" },
      }),
      ctx,
    );
    expect([401, 403]).toContain(res.status);
    expect(svc.startQboConnect).not.toHaveBeenCalled();
  });
});
