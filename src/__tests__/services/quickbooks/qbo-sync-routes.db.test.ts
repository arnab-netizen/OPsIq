/**
 * Manual sync + status routes through the REAL canonical wrapper (only the auth boundary is mocked) and the REAL services
 * over real PostgreSQL with a fake Intuit. Proves capability gates, strict bodies, server-controlled authority and tenancy.
 * Requires TEST_WITH_DB=true. Self-skips otherwise.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedConnected, testDeps, type ConnectedTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { customer } from "@/__tests__/test-helpers/qbo-fake-intuit";

let mockSessionValid = true;
let mockActorId = randomUUID();
let mockRoles: Array<{ role: string; scope?: string | null; scopeId?: string | null }> = [];
let current: ConnectedTenant | null = null;
const syncSpy = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () =>
    mockSessionValid
      ? { valid: true, session: { user: { id: mockActorId, email: "qbo-route@example.com", name: "QBO Route", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) }, invalidReason: undefined }
      : { valid: false, session: null, invalidReason: "not_found" }),
  getSession: vi.fn(async () => (mockSessionValid ? { user: { id: mockActorId, email: "qbo-route@example.com", name: "QBO Route", isActive: true }, sessionId: "s", expiresAt: new Date(Date.now() + 86400000) } : null)),
  getPolicyContextFact: vi.fn(async () =>
    mockSessionValid ? { valid: true, policy: { userId: mockActorId, roles: mockRoles, engagementMemberships: [] }, invalidReason: undefined } : { valid: false, policy: null, invalidReason: "no_session" }),
}));
vi.mock("@/infra/critical-readiness", () => ({ ensureCriticalReadiness: async () => ({ status: "READY", errors: [] }) }));

// The route calls runQboReadSync({ env: process.env }). Delegate to the REAL service, but inject the fake Intuit + QBO config.
vi.mock("@/services/quickbooks/qbo-sync.service", async (orig) => {
  const actual = await orig<typeof import("@/services/quickbooks/qbo-sync.service")>();
  return {
    ...actual,
    runQboReadSync: vi.fn(async (input: Parameters<typeof actual.runQboReadSync>[0]) => {
      syncSpy.calls.push(input);
      if (!current) throw new Error("no fake");
      return actual.runQboReadSync(input, testDeps(current, { now: () => new Date("2026-10-10T03:00:00Z") }));
    }),
  };
});

import * as syncRoute from "@/app/api/owner/integrations/quickbooks/sync/route";
import * as statusRoute from "@/app/api/owner/integrations/quickbooks/status/route";

const ADMIN = [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: null }];
const CONSULTANT = [{ role: ROLES.EXPERIENCED_CONSULTANT, scope: "workspace", scopeId: null }];
const CLIENT = [{ role: ROLES.CLIENT_OWNER, scope: "workspace", scopeId: null }];
const ctx = { params: Promise.resolve({}) };

const post = (body: unknown) =>
  syncRoute.POST(new NextRequest("http://localhost/api/owner/integrations/quickbooks/sync", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), ctx);
const getStatus = (qs: string) => statusRoute.GET(new NextRequest(`http://localhost/api/owner/integrations/quickbooks/status${qs}`), ctx);

async function asMember(t: { ws: string; actor: string }, roles = ADMIN) {
  mockActorId = t.actor;
  mockRoles = roles;
  mockSessionValid = true;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO sync + status routes (real wrapper, real services)", () => {
  let A: ConnectedTenant;
  let B: ConnectedTenant;
  beforeAll(async () => {
    A = await seedConnected();
    B = await seedConnected();
    A.fake.data.Customer.push(customer("1", "2026-09-01T00:00:00Z"));
    for (const x of [A, B]) {
      await db.workspace.create({ data: { id: x.t.ws, name: `QBO route ${x.t.ws}`, slug: `qbo-${x.t.ws.slice(0, 8)}` } });
      await db.workspaceMembership.create({ data: { userId: x.t.actor, workspaceId: x.t.ws, role: "owner", isActive: true } });
    }
  });
  beforeEach(() => { syncSpy.calls.length = 0; current = A; mockSessionValid = true; });

  it("without a session nothing runs (401) and the status route is equally closed", async () => {
    mockSessionValid = false;
    const res = await post({ businessId: A.t.biz, connectionId: A.connectionId });
    expect([401, 403]).toContain(res.status);
    expect(syncSpy.calls).toHaveLength(0);
    expect([401, 403]).toContain((await getStatus(`?businessId=${A.t.biz}`)).status);
    expect(A.fake.requests).toHaveLength(0);
  });

  it("wrong capability: a consultant or client role is refused (403) before any service call", async () => {
    for (const roles of [CONSULTANT, CLIENT]) {
      await asMember(A.t, roles);
      const res = await post({ businessId: A.t.biz, connectionId: A.connectionId });
      expect(res.status).toBe(403);
      expect((await getStatus(`?businessId=${A.t.biz}`)).status).toBe(403);
    }
    expect(syncSpy.calls).toHaveLength(0);
    expect(A.fake.requests).toHaveLength(0);
  });

  it("the body is strict: tokens, realm, environment, base URL, workspace and actor overrides are all rejected", async () => {
    await asMember(A.t);
    for (const extra of [{ accessToken: "x" }, { refreshToken: "x" }, { realmId: "123" }, { environment: "production" }, { apiBaseUrl: "https://evil.example" }, { workspaceId: B.t.ws }, { actorId: B.t.actor }]) {
      const res = await post({ businessId: A.t.biz, connectionId: A.connectionId, ...extra });
      expect(res.status).toBe(400);
    }
    for (const bad of [{}, { businessId: A.t.biz }, { businessId: "nope", connectionId: A.connectionId }]) expect((await post(bad)).status).toBe(400);
    expect(syncSpy.calls).toHaveLength(0);
    expect(A.fake.requests).toHaveLength(0);
  });

  it("an authorised owner runs a sync end to end: workspace and actor come from the session, QuickBooks sees GET only", async () => {
    await asMember(A.t);
    const requestId = randomUUID();
    const res = await post({ businessId: A.t.biz, connectionId: A.connectionId, requestId });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ status: "SUCCEEDED", mode: "FULL", changed: true });
    expect(body.summary.inserted).toBe(2);
    expect(syncSpy.calls[0]).toEqual({ workspaceId: A.t.ws, businessId: A.t.biz, connectionId: A.connectionId, trigger: "MANUAL", actorId: A.t.actor, requestId });
    expect(A.fake.accountingRequests().every((r) => r.method === "GET")).toBe(true);
    expect(A.fake.nonTokenPosts()).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/ACCESS-|REFRESH-|realm|v1gcm/i);
    expect(JSON.stringify(body)).not.toContain(A.realmId);
  });

  it("repeating the request id replays (200 ALREADY_COMPLETED) without touching QuickBooks again", async () => {
    await asMember(A.t);
    const requestId = randomUUID();
    const first = await (await post({ businessId: A.t.biz, connectionId: A.connectionId, requestId })).json();
    const requests = A.fake.requests.length;
    const again = await post({ businessId: A.t.biz, connectionId: A.connectionId, requestId });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ status: "ALREADY_COMPLETED", runId: first.runId ?? expect.any(String), runStatus: "SUCCEEDED" });
    expect(A.fake.requests.length).toBe(requests);
  });

  it("tenancy: another workspace's owner cannot sync, learn about, or probe this connection (uniform 404, zero provider traffic)", async () => {
    await asMember(B.t);
    const before = A.fake.requests.length;
    for (const body of [
      { businessId: A.t.biz, connectionId: A.connectionId },
      { businessId: B.t.biz, connectionId: A.connectionId },
      { businessId: A.t.bizB, connectionId: A.connectionId },
      { businessId: B.t.biz, connectionId: randomUUID() },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe("CONNECTION_NOT_FOUND");
    }
    // Same workspace, wrong business for the connection:
    await asMember(A.t);
    expect((await post({ businessId: A.t.bizB, connectionId: A.connectionId })).status).toBe(404);
    expect(A.fake.requests.length).toBe(before);
    expect(await db.qboSyncRun.count({ where: { workspaceId: B.t.ws } })).toBe(0);
  });

  it("status: token-free, realm-free, correct for connected / failed / reauth states, and 404 for a foreign business", async () => {
    await asMember(A.t);
    const ok = await getStatus(`?businessId=${A.t.biz}`);
    expect(ok.status).toBe(200);
    const s = await ok.json();
    expect(s).toMatchObject({ connected: true, connectionId: A.connectionId, environment: "sandbox", connectionStatus: "ACTIVE", reauthorizationRequired: false, syncRunning: false, lastOutcome: "SUCCEEDED", lastErrorCode: null, consecutiveFailures: 0 });
    expect(s.recordCounts).toEqual({ CompanyInfo: 1, Customer: 1 });
    expect(s.reportObservationCount).toBeGreaterThan(0);
    expect(s.lastSucceededAt).toBeTruthy();
    expect(Object.keys(s).join()).not.toMatch(/realm|token|cipher|state|secret/i);
    expect(JSON.stringify(s)).not.toContain(A.realmId);

    await db.qboConnection.update({ where: { id: A.connectionId }, data: { status: "REAUTH_REQUIRED", reauthRequiredAt: new Date() } });
    expect(await (await getStatus(`?businessId=${A.t.biz}`)).json()).toMatchObject({ connected: false, connectionStatus: "REAUTH_REQUIRED", reauthorizationRequired: true });
    await db.qboConnection.update({ where: { id: A.connectionId }, data: { status: "ACTIVE", reauthRequiredAt: null } });

    expect((await getStatus(`?businessId=${B.t.biz}`)).status).toBe(404); // A's session, B's business
    const none = await (await getStatus(`?businessId=${A.t.bizB}`)).json(); // own business without a connection
    expect(none).toMatchObject({ connected: false, connectionId: null, environment: null, recordCounts: {}, reportObservationCount: 0 });
    expect((await getStatus("")).status).toBe(400);
    expect((await getStatus(`?businessId=${A.t.biz}&realmId=1`)).status).toBe(400);
  });

  it("status reports a running sync and the last safe error", async () => {
    await asMember(B.t);
    current = B;
    B.fake.inject(`companyinfo/${B.realmId}`, ...Array.from({ length: 4 }, () => ({ status: 503 })));
    const res = await post({ businessId: B.t.biz, connectionId: B.connectionId });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ status: "FAILED", code: "PROVIDER_UNAVAILABLE", retry: "LATER" });
    const s = await (await getStatus(`?businessId=${B.t.biz}`)).json();
    expect(s).toMatchObject({ connected: true, lastOutcome: "FAILED", lastErrorCode: "PROVIDER_UNAVAILABLE", consecutiveFailures: 1, syncRunning: false });
    expect(s.nextAttemptNotBefore).toBeTruthy();
    await db.qboSyncState.update({ where: { connectionId: B.connectionId }, data: { leaseToken: randomUUID(), leaseRunId: randomUUID(), leaseExpiresAt: new Date(Date.now() + 60_000) } });
    expect((await (await getStatus(`?businessId=${B.t.biz}`)).json()).syncRunning).toBe(true);
    const busy = await post({ businessId: B.t.biz, connectionId: B.connectionId });
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ status: "BUSY", retry: "LATER" });
  });
});
