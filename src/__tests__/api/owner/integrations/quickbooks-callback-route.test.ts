/**
 * GET /api/owner/integrations/quickbooks/callback — route contract.
 *
 * Uses the REAL canonical response helpers (not mocked): a mocked
 * canonicalJson previously hid that a `location` header throws, which would
 * have turned every OAuth return into a 500 after the connection committed.
 * The canonical wrapper is replaced by a pass-through that supplies a verified
 * context; the envelope it returns is asserted to be a valid canonical
 * response the real wrapper converts verbatim (status + headers).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isCanonicalJsonResponse, canonicalRedirect } from "@/lib/canonical-json-response";
import { UnauthorizedError, ConflictError, FeatureDisabledError } from "@/infra/errors";
import { QboApiError } from "@/domain/quickbooks/qbo-contracts";

const { mockComplete, mockRequestSync, mockDrain, afterCallbacks, captured } = vi.hoisted(() => ({
  mockComplete: vi.fn(),
  mockRequestSync: vi.fn(),
  mockDrain: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  captured: { options: null as null | Record<string, unknown> },
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (cb: () => unknown) => { afterCallbacks.push(cb); },
}));
vi.mock("@/services/quickbooks/qbo-connection.service", () => ({ completeQuickBooksConnect: mockComplete }));
vi.mock("@/services/quickbooks/qbo-sync.service", () => ({ requestQuickBooksSync: mockRequestSync }));
vi.mock("@/services/quickbooks/qbo-sync-dispatch.service", () => ({ drainQuickBooksSyncTask: mockDrain }));
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown) => Promise<unknown>, options: Record<string, unknown>) => {
    captured.options = options;
    return (request: Request) =>
      handler({ request, verifiedWorkspaceId: "ws-1", verifiedActorId: "actor-1" });
  },
}));

import { GET } from "@/app/api/owner/integrations/quickbooks/callback/route";

const BASE = "https://app.example.com/api/owner/integrations/quickbooks/callback";

async function call(query: string) {
  const res = await (GET as unknown as (r: Request) => Promise<unknown>)(new Request(`${BASE}${query}`));
  expect(isCanonicalJsonResponse(res)).toBe(true);
  const env = res as { status: number; headers: Record<string, string> };
  expect(env.status).toBe(302);
  const loc = new URL(env.headers.location);
  expect(loc.origin).toBe("https://app.example.com");
  expect(loc.pathname).toBe("/owner/integrations");
  return loc.searchParams;
}

beforeEach(() => {
  vi.resetAllMocks();
  afterCallbacks.length = 0;
  process.env.QUICKBOOKS_CLIENT_ID = "cid";
  process.env.QUICKBOOKS_CLIENT_SECRET = "secret";
  process.env.QUICKBOOKS_REDIRECT_URI = "https://app.example.com/api/owner/integrations/quickbooks/callback";
  process.env.QUICKBOOKS_ENVIRONMENT = "sandbox";
});

describe("QuickBooks OAuth callback route", () => {
  it("is protected: OWNER_MANAGE + workspace required", () => {
    expect(captured.options).toMatchObject({ requireWorkspace: true, requireCapabilities: ["owner:manage"] });
  });

  it("success → completes with server-verified workspace/actor, enqueues INITIAL sync, redirects connected", async () => {
    mockComplete.mockResolvedValue({ connectorId: "c1", businessId: "b1", reconnected: false });
    mockRequestSync.mockResolvedValue({ taskId: "t1", deduplicated: false });
    const q = await call("?code=abc&state=st&realmId=123");
    expect(q.get("quickbooks")).toBe("connected");
    expect(mockComplete).toHaveBeenCalledWith({ workspaceId: "ws-1", actorId: "actor-1", code: "abc", state: "st", realmId: "123" });
    expect(mockRequestSync).toHaveBeenCalledWith({ workspaceId: "ws-1", actorId: "actor-1", trigger: "INITIAL" });
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(mockDrain).toHaveBeenCalledWith("t1");
  });

  it("provider denial → access_denied; any other provider error → unknown (never reflected)", async () => {
    expect((await call("?error=access_denied")).get("quickbooks_error")).toBe("access_denied");
    const q = await call("?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    expect(q.get("quickbooks_error")).toBe("unknown");
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("missing parameters → invalid_state without touching the service", async () => {
    expect((await call("?code=abc&state=st")).get("quickbooks_error")).toBe("invalid_state");
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it.each([
    [new UnauthorizedError("AUTH_INVALID", "replayed"), "invalid_state"],
    [new ConflictError("different company"), "company_mismatch"],
    [new FeatureDisabledError("QuickBooks", "not configured"), "not_configured"],
    [new QboApiError({ kind: "AUTH", message: "invalid_grant" }), "exchange_failed"],
    [new Error("boom"), "unknown"],
  ])("service failure %s → %s, no sync enqueued", async (err, code) => {
    mockComplete.mockRejectedValue(err);
    expect((await call("?code=abc&state=st&realmId=123")).get("quickbooks_error")).toBe(code);
    expect(mockRequestSync).not.toHaveBeenCalled();
  });

  it("connection succeeded but enqueue failed → still redirects connected (scheduler catches up)", async () => {
    mockComplete.mockResolvedValue({ connectorId: "c1", businessId: "b1", reconnected: false });
    mockRequestSync.mockRejectedValue(new Error("db down"));
    expect((await call("?code=abc&state=st&realmId=123")).get("quickbooks")).toBe("connected");
  });
});

describe("public redirect origin", () => {
  it("uses the registered public redirect origin even when the server sees an internal host", async () => {
    const res = (await (GET as unknown as (r: Request) => Promise<{ headers: Record<string, string> }>)(
      new Request("http://localhost:3001/api/owner/integrations/quickbooks/callback?error=access_denied"),
    ));
    expect(new URL(res.headers.location).origin).toBe("https://app.example.com");
  });
});

describe("canonicalRedirect", () => {
  it("rejects protocol-relative, absolute and backslash targets", () => {
    for (const bad of ["//evil.com/x", "https://evil.com/x", "/\\evil.com", "owner/x"]) {
      expect(() => canonicalRedirect("https://app.example.com/a", bad)).toThrow(TypeError);
    }
  });
  it("encodes query values and stays on the request origin", () => {
    const r = canonicalRedirect("https://app.example.com/a?x=1", "/owner/integrations", { quickbooks_error: "a&b=c" });
    expect(r.headers!.location).toBe("https://app.example.com/owner/integrations?quickbooks_error=a%26b%3Dc");
    expect(isCanonicalJsonResponse(r)).toBe(true);
  });
});
