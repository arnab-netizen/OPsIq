/**
 * QuickBooks connect + callback ROUTES, end to end on real PostgreSQL with a mocked Intuit token endpoint.
 * The canonical wrapper is replaced by an identity wrapper that passes a verified context, so these tests exercise the
 * real route handlers, the real orchestration and the real (released) persistence layer. The wrapper's own
 * 401/403 behaviour is asserted via the declared options. Requires TEST_WITH_DB=true; self-skips otherwise.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown, params: Record<string, string>) => unknown, options?: Record<string, unknown>) => {
    const wrapped = (ctx: unknown, params: Record<string, string> = {}) => handler(ctx, params);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedTenant, seedUser, type Tenant } from "@/__tests__/owner-outcome/outcome-db-fixtures";
import * as connectRoute from "@/app/api/owner/integrations/quickbooks/connect/route";
import * as callbackRoute from "@/app/api/owner/integrations/quickbooks/callback/route";

const CALLBACK_URL = "https://app.example.com/api/owner/integrations/quickbooks/callback";
const SECRET = "csecret-DO-NOT-LEAK-7731";
const ENV_KEYS = ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET", "QUICKBOOKS_REDIRECT_URI", "QUICKBOOKS_ENVIRONMENT"] as const;
const savedEnv: Record<string, string | undefined> = {};

type Ctx = { verifiedWorkspaceId: string; verifiedActorId: string; request: Request };
type Envelope = { body: Record<string, unknown>; status: number; headers?: Record<string, string> };
const asRoute = (r: unknown) => r as (c: Ctx, p?: Record<string, string>) => Promise<Envelope>;
const postCtx = (t: { ws: string; actor: string }, body: unknown): Ctx => ({
  verifiedWorkspaceId: t.ws, verifiedActorId: t.actor,
  request: new Request("http://t/api/owner/integrations/quickbooks/connect", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
});
const getCtx = (t: { ws: string; actor: string }, qs: Record<string, string>): Ctx => ({
  verifiedWorkspaceId: t.ws, verifiedActorId: t.actor,
  request: new Request(`http://t/api/owner/integrations/quickbooks/callback?${new URLSearchParams(qs).toString()}`),
});

let fetchCalls: Array<{ url: string; body: string }> = [];
let tokenResponder: () => Response;
/** Answers the realm-verification GET companyinfo made with the freshly issued token. Default: the company reports the realm asked for. */
let companyInfoResponder: (realm: string, id: string) => Response;
const companyOk = (realm: string) => new Response(JSON.stringify({ CompanyInfo: { Id: realm, CompanyName: "Co", SyncToken: "0", MetaData: { LastUpdatedTime: "2026-01-01T00:00:00Z" } } }), { status: 200, headers: { "content-type": "application/json" } });
let seq = 0;
const nextRealm = () => `9341${String(Date.now()).slice(-6)}${++seq}`;
const mkTokens = () => ({ access: `ACCESS-${randomUUID()}`, refresh: `REFRESH-${randomUUID()}` });
let tokens = mkTokens();
const okResponse = () =>
  new Response(JSON.stringify({ access_token: tokens.access, refresh_token: tokens.refresh, token_type: "bearer", expires_in: 3600, x_refresh_token_expires_in: 8640000 }), { status: 200, headers: { "content-type": "application/json" } });

let logged: string[] = [];
const spies: Array<{ mockRestore: () => void }> = [];

async function startFlow(t: Tenant, biz = t.biz): Promise<{ state: string; url: string }> {
  const r = await asRoute(connectRoute.POST)(postCtx(t, { businessId: biz, environment: "sandbox" }));
  expect(r.status).toBe(200);
  const url = r.body.authorizationUrl as string;
  return { state: new URL(url).searchParams.get("state") as string, url };
}
const callback = (t: { ws: string; actor: string }, qs: Record<string, string>) => asRoute(callbackRoute.GET)(getCtx(t, qs));
const exchangeCalls = () => fetchCalls.filter((c) => c.url.includes("oauth.platform.intuit.com"));

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO connect + callback routes (real Postgres, mocked Intuit)", () => {
  beforeAll(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  });
  afterAll(() => {
    for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  });
  beforeEach(() => {
    process.env.QUICKBOOKS_CLIENT_ID = "cid-test";
    process.env.QUICKBOOKS_CLIENT_SECRET = SECRET;
    process.env.QUICKBOOKS_REDIRECT_URI = CALLBACK_URL;
    process.env.QUICKBOOKS_ENVIRONMENT = "sandbox";
    fetchCalls = []; tokens = mkTokens(); tokenResponder = okResponse; companyInfoResponder = (realm) => companyOk(realm); logged = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), body: String(init?.body ?? "") });
      const company = /\/v3\/company\/(\d+)\/companyinfo\/(\d+)/.exec(String(url));
      if (company) return companyInfoResponder(company[1], company[2]);
      return tokenResponder();
    }));
    for (const m of ["log", "info", "warn", "error", "debug"] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(" ")); }));
    }
  });
  afterEach(() => { vi.unstubAllGlobals(); while (spies.length) spies.pop()!.mockRestore(); });

  describe("route contract", () => {
    it("connect and callback require OWNER_MANAGE, a verified workspace and a human actor", () => {
      for (const r of [connectRoute.POST, callbackRoute.GET]) {
        expect((r as unknown as { __options?: unknown }).__options).toEqual({ requireCapabilities: ["owner:manage"], requireWorkspace: true, requireActorType: "user" });
      }
    });
    it("connect rejects client-supplied authority fields", async () => {
      const t = await seedTenant();
      for (const extra of [{ workspaceId: randomUUID() }, { actorId: randomUUID() }, { realmId: "123" }, { redirectUri: "https://evil.example/cb" }, { clientId: "x" }, { scope: "x" }, { host: "evil.example" }]) {
        await expect(asRoute(connectRoute.POST)(postCtx(t, { businessId: t.biz, environment: "sandbox", ...extra }))).rejects.toThrow();
      }
      expect(await db.qboOAuthState.count({ where: { workspaceId: t.ws } })).toBe(0);
    });
  });

  describe("realm verification (the realm in the URL is client-relayed)", () => {
    it("a realm the NEW token cannot read, or that reports a different company id, is never bound (INVALID_REALM, nothing created)", async () => {
      for (const respond of [
        () => new Response(JSON.stringify({ Fault: { Error: [{ code: "403" }] } }), { status: 403, headers: { "content-type": "application/json" } }),
        () => companyOk("9999999999999999"),
      ]) {
        const t = await seedTenant();
        const { state } = await startFlow(t);
        companyInfoResponder = (realm) => respond(realm);
        const r = await callback(t, { state, code: "AUTHCODE-" + randomUUID(), realmId: nextRealm() });
        expect(JSON.stringify(r.body)).toContain("INVALID_REALM");
        expect(await db.qboConnection.count({ where: { workspaceId: t.ws } })).toBe(0);
        // The grant that was issued but not kept is revoked at Intuit (best effort).
        expect(fetchCalls.some((c) => c.url.includes("/revoke"))).toBe(true);
      }
    });
    it("verification is one read-only GET on the claimed realm with the freshly issued token", async () => {
      const t = await seedTenant();
      const { state } = await startFlow(t);
      const realm = nextRealm();
      const r = await callback(t, { state, code: "AUTHCODE-" + randomUUID(), realmId: realm });
      expect(r.status).toBeLessThan(400);
      const probes = fetchCalls.filter((c) => c.url.includes(`/v3/company/${realm}/companyinfo/${realm}`));
      expect(probes).toHaveLength(1);
      expect(fetchCalls.filter((c) => !c.url.includes("oauth.platform.intuit.com") && c.body !== "")).toEqual([]);
    });
  });

  describe("connect", () => {
    it("returns only the Intuit URL + expiry; host fixed; configured redirect/scope; no secret; no-store", async () => {
      const t = await seedTenant();
      const r = await asRoute(connectRoute.POST)(postCtx(t, { businessId: t.biz, environment: "sandbox" }));
      expect(Object.keys(r.body).sort()).toEqual(["authorizationUrl", "stateExpiresAt"]);
      const u = new URL(r.body.authorizationUrl as string);
      expect(u.origin + u.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
      expect(u.searchParams.get("redirect_uri")).toBe(CALLBACK_URL);
      expect(u.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
      expect(JSON.stringify(r)).not.toContain(SECRET);
      expect(r.headers?.["cache-control"]).toBe("no-store");
      const row = await db.qboOAuthState.findFirstOrThrow({ where: { workspaceId: t.ws } });
      expect(row).toMatchObject({ businessId: t.biz, initiatedById: t.actor, environment: "sandbox" });
      expect(row.stateHash).not.toBe(u.searchParams.get("state"));
    });
    it("rejects a foreign-workspace, fixture and archived business, and an environment mismatch", async () => {
      const t = await seedTenant(); const other = await seedTenant();
      await expect(asRoute(connectRoute.POST)(postCtx(t, { businessId: other.biz, environment: "sandbox" }))).rejects.toMatchObject({ name: "NotFoundError" });
      const fx = randomUUID();
      await db.ownerBusiness.create({ data: { id: fx, workspaceId: t.ws, name: "fx", businessType: "generic_local_service", currency: "INR", isFixtureBusiness: true } });
      await expect(asRoute(connectRoute.POST)(postCtx(t, { businessId: fx, environment: "sandbox" }))).rejects.toMatchObject({ name: "ValidationError" });
      await db.ownerBusiness.update({ where: { id: t.bizB }, data: { isActive: false } });
      await expect(asRoute(connectRoute.POST)(postCtx(t, { businessId: t.bizB, environment: "sandbox" }))).rejects.toMatchObject({ name: "ValidationError" });
      await expect(asRoute(connectRoute.POST)(postCtx(t, { businessId: t.biz, environment: "production" }))).rejects.toMatchObject({ name: "ValidationError" });
      expect(await db.qboOAuthState.count({ where: { workspaceId: t.ws } })).toBe(0);
    });
    it("fails closed with no state row and no secret when QuickBooks is not configured", async () => {
      const t = await seedTenant();
      delete process.env.QUICKBOOKS_CLIENT_SECRET;
      const r = await asRoute(connectRoute.POST)(postCtx(t, { businessId: t.biz, environment: "sandbox" }));
      expect(r.status).toBe(503);
      expect(r.body.code).toBe("CONFIGURATION_UNAVAILABLE");
      expect(JSON.stringify(r)).not.toMatch(/QUICKBOOKS_|secret/i);
      expect(await db.qboOAuthState.count({ where: { workspaceId: t.ws } })).toBe(0);
    });
  });

  describe("callback success", () => {
    it("consumes state, exchanges once, finalizes one ACTIVE connection with encrypted tokens, leaks nothing", async () => {
      const t = await seedTenant(); const realm = nextRealm();
      const { state, url } = await startFlow(t);
      const r = await callback(t, { state, code: "AUTHCODE-xyz-123", realmId: realm });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ status: "CONNECTED", businessId: t.biz, environment: "sandbox", reconnected: false, next: "/owner/home" });
      expect(exchangeCalls()).toHaveLength(1);
      expect(exchangeCalls()[0].body).toContain(`redirect_uri=${encodeURIComponent(CALLBACK_URL)}`);
      expect(exchangeCalls()[0].body).toContain("code=AUTHCODE-xyz-123");

      const st = await db.qboOAuthState.findFirstOrThrow({ where: { workspaceId: t.ws } });
      expect(st.consumedAt).not.toBeNull(); expect(st.finalizedAt).not.toBeNull();
      const conns = await db.qboConnection.findMany({ where: { workspaceId: t.ws } });
      expect(conns).toHaveLength(1);
      expect(conns[0]).toMatchObject({ businessId: t.biz, environment: "sandbox", realmId: realm, status: "ACTIVE", connectedById: t.actor });
      const tok = await db.qboConnectionToken.findFirstOrThrow({ where: { workspaceId: t.ws } });
      expect(tok.accessTokenCiphertext).not.toBe(tokens.access);
      expect(tok.refreshTokenCiphertext).not.toBe(tokens.refresh);
      expect(tok.accessTokenCiphertext.startsWith("v1gcm.")).toBe(true);

      const audits = JSON.stringify(await db.auditEvent.findMany({ where: { workspaceId: t.ws } }));
      const everything = [JSON.stringify(r), audits, logged.join("\n"), JSON.stringify(tok), JSON.stringify(st)].join("\n");
      for (const secret of [SECRET, "AUTHCODE-xyz-123", tokens.access, tokens.refresh, state, Buffer.from(`cid-test:${SECRET}`).toString("base64"), url]) {
        expect(everything, `leak of ${secret.slice(0, 8)}`).not.toContain(secret);
      }
    });
    it("ignores callback-supplied tenant/env/redirect parameters and any return URL", async () => {
      const t = await seedTenant(); const other = await seedTenant(); const realm = nextRealm();
      const { state } = await startFlow(t);
      const r = await callback(t, {
        state, code: "c0de", realmId: realm, businessId: other.biz, workspaceId: other.ws, actorId: other.actor, environment: "production",
        returnTo: "https://evil.example/x", redirect_uri: "https://evil.example/cb", next: "https://evil.example", redirect: "//evil.example",
      });
      expect(r.status).toBe(200);
      expect(JSON.stringify(r)).not.toContain("evil.example");
      expect(r.body.next).toBe("/owner/home");
      expect(r.body.businessId).toBe(t.biz);
      expect(await db.qboConnection.count({ where: { workspaceId: other.ws } })).toBe(0);
      expect(exchangeCalls()[0].body).not.toContain("evil.example");
    });
  });

  describe("state / replay / tenancy — all fail BEFORE the token exchange", () => {
    it("replay: second identical callback is refused and the provider is called exactly once", async () => {
      const t = await seedTenant(); const q = { code: "c0de", realmId: nextRealm() };
      const { state } = await startFlow(t);
      expect((await callback(t, { state, ...q })).status).toBe(200);
      const again = await callback(t, { state, ...q });
      expect(again.status).toBe(409); expect(again.body.code).toBe("ALREADY_CONSUMED");
      expect(exchangeCalls()).toHaveLength(1);
      expect(await db.qboConnection.count({ where: { workspaceId: t.ws } })).toBe(1);
    });
    it("concurrent callbacks: one consume, one exchange, one finalize", async () => {
      const t = await seedTenant(); const q = { code: "c0de", realmId: nextRealm() };
      const { state } = await startFlow(t);
      const rs = await Promise.all(Array.from({ length: 10 }, () => callback(t, { state, ...q })));
      expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
      expect(rs.filter((r) => r.status !== 200).every((r) => r.body.code === "ALREADY_CONSUMED")).toBe(true);
      expect(exchangeCalls()).toHaveLength(1);
      expect(await db.qboConnection.count({ where: { workspaceId: t.ws } })).toBe(1);
      expect(await db.qboConnectionToken.count({ where: { workspaceId: t.ws } })).toBe(1);
    });
    it("wrong actor, wrong workspace, expired, unknown, missing and malformed state: no exchange, no connection", async () => {
      const t = await seedTenant(); const other = await seedTenant(); const q = { code: "c0de", realmId: nextRealm() };
      const { state } = await startFlow(t);
      const stranger = await seedUser();
      expect((await callback({ ws: t.ws, actor: stranger }, { state, ...q })).body.code).toBe("CONTEXT_MISMATCH");
      expect((await callback(other, { state, ...q })).body.code).toBe("INVALID_STATE");
      expect((await callback(t, { state: "A".repeat(40), ...q })).body.code).toBe("INVALID_STATE");
      expect((await callback(t, { ...q })).body.code).toBe("INVALID_STATE");
      expect((await callback(t, { state: "short", ...q })).body.code).toBe("INVALID_STATE");
      expect((await callback(t, { state: `${state}&state=${state}`, ...q })).body.code).toBe("INVALID_STATE");
      const dup = new Request(`http://t/cb?state=${state}&state=${state}&code=c&realmId=${q.realmId}`);
      expect((await asRoute(callbackRoute.GET)({ verifiedWorkspaceId: t.ws, verifiedActorId: t.actor, request: dup })).body.code).toBe("INVALID_STATE");
      await db.qboOAuthState.updateMany({ where: { workspaceId: t.ws }, data: { createdAt: new Date(Date.now() - 7_200_000), expiresAt: new Date(Date.now() - 3_600_000) } });
      expect((await callback(t, { state, ...q })).body.code).toBe("EXPIRED");
      expect(exchangeCalls()).toHaveLength(0);
      expect(await db.qboConnection.count({ where: { workspaceId: t.ws } })).toBe(0);
    });
    it("missing code, missing/invalid realm: refused before any exchange (state not burned by malformed input)", async () => {
      const t = await seedTenant(); const { state } = await startFlow(t);
      expect((await callback(t, { state, realmId: nextRealm() })).body.code).toBe("MALFORMED_CALLBACK");
      expect((await callback(t, { state, code: "c0de" })).body.code).toBe("INVALID_REALM");
      expect((await callback(t, { state, code: "c0de", realmId: "12;DROP" })).body.code).toBe("INVALID_REALM");
      expect(exchangeCalls()).toHaveLength(0);
      expect((await callback(t, { state, code: "c0de", realmId: nextRealm() })).status).toBe(200);
    });
  });

  describe("denial and provider failure", () => {
    it("user denial burns the state, exchanges nothing, connects nothing, and echoes no provider text", async () => {
      const t = await seedTenant(); const { state } = await startFlow(t);
      const r = await callback(t, { state, error: "access_denied", error_description: "<script>alert(1)</script>SECRET-DESC" });
      expect(r.status).toBe(400); expect(r.body).toMatchObject({ status: "DENIED", code: "USER_DENIED" });
      expect(JSON.stringify(r)).not.toMatch(/script|SECRET-DESC/);
      expect(exchangeCalls()).toHaveLength(0);
      expect((await callback(t, { state, code: "c0de", realmId: nextRealm() })).body.code).toBe("ALREADY_CONSUMED");
      expect(exchangeCalls()).toHaveLength(0);
      expect(await db.qboConnection.count({ where: { workspaceId: t.ws } })).toBe(0);
      const ev = await db.auditEvent.findMany({ where: { workspaceId: t.ws, eventName: "qbo.authorization_denied" } });
      expect(ev).toHaveLength(1);
      expect(JSON.stringify(ev)).not.toMatch(/script|SECRET-DESC/);
    });
    it("an unrecognised provider error code collapses to a fixed value", async () => {
      const t = await seedTenant(); const { state } = await startFlow(t);
      const r = await callback(t, { state, error: "weird_code_with_SECRET" });
      expect(r.body.code).toBe("PROVIDER_DENIED");
      const ev = await db.auditEvent.findMany({ where: { workspaceId: t.ws, eventName: "qbo.authorization_denied" } });
      expect(JSON.stringify(ev)).toContain("OTHER");
      expect(JSON.stringify(ev)).not.toContain("SECRET");
    });
    it("token-exchange failure: no ACTIVE connection, no token row, state burned, safe restart, provider body not leaked", async () => {
      const t = await seedTenant(); const realm = nextRealm();
      tokenResponder = () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "PROVIDER-BODY-LEAK" }), { status: 400 });
      const { state } = await startFlow(t);
      const r = await callback(t, { state, code: "c0de", realmId: realm });
      expect(r.status).toBe(400); expect(r.body.code).toBe("CODE_REJECTED");
      expect(JSON.stringify(r) + logged.join("")).not.toContain("PROVIDER-BODY-LEAK");
      expect(await db.qboConnection.count({ where: { workspaceId: t.ws } })).toBe(0);
      expect(await db.qboConnectionToken.count({ where: { workspaceId: t.ws } })).toBe(0);
      const st = await db.qboOAuthState.findFirstOrThrow({ where: { workspaceId: t.ws } });
      expect(st.consumedAt).not.toBeNull(); expect(st.finalizedAt).toBeNull();
      tokenResponder = okResponse;
      const again = await startFlow(t);
      expect((await callback(t, { state: again.state, code: "c0de", realmId: realm })).status).toBe(200);
    });
    it("provider outage and malformed response map to retryable closed codes", async () => {
      const t = await seedTenant();
      tokenResponder = () => new Response("oops", { status: 503 });
      let f = await startFlow(t);
      expect((await callback(t, { state: f.state, code: "c0de", realmId: nextRealm() })).body.code).toBe("PROVIDER_TEMPORARY");
      tokenResponder = () => new Response(JSON.stringify({ nope: true }), { status: 200 });
      f = await startFlow(t);
      expect((await callback(t, { state: f.state, code: "c0de", realmId: nextRealm() })).body.code).toBe("PROVIDER_MALFORMED");
      expect(await db.qboConnection.count({ where: { workspaceId: t.ws } })).toBe(0);
    });
  });

  describe("finalize conflicts — generic, no cross-tenant detail, no false ACTIVE, no stray token", () => {
    it("realm already bound elsewhere", async () => {
      const t = await seedTenant(); const u = await seedTenant(); const realm = nextRealm();
      const a = await startFlow(t);
      expect((await callback(t, { state: a.state, code: "c0de", realmId: realm })).status).toBe(200);
      const b = await startFlow(u);
      const r = await callback(u, { state: b.state, code: "c0de", realmId: realm });
      expect(r.status).toBe(409); expect(r.body.code).toBe("REALM_UNAVAILABLE");
      expect(JSON.stringify(r)).not.toContain(t.ws); expect(JSON.stringify(r)).not.toContain(t.biz);
      expect(await db.qboConnection.count({ where: { workspaceId: u.ws } })).toBe(0);
      expect(await db.qboConnectionToken.count({ where: { workspaceId: u.ws } })).toBe(0);
    });
    it("business already bound to another company", async () => {
      const t = await seedTenant();
      const a = await startFlow(t);
      expect((await callback(t, { state: a.state, code: "c0de", realmId: nextRealm() })).status).toBe(200);
      const b = await startFlow(t);
      const r = await callback(t, { state: b.state, code: "c0de", realmId: nextRealm() });
      expect(r.body.code).toBe("BUSINESS_HAS_OTHER_COMPANY");
      expect(await db.qboConnection.count({ where: { workspaceId: t.ws } })).toBe(1);
      expect(await db.qboConnectionToken.count({ where: { workspaceId: t.ws } })).toBe(1);
    });
  });

  it("missing configuration at callback time: fail closed, no exchange, state untouched", async () => {
    const t = await seedTenant(); const { state } = await startFlow(t);
    delete process.env.QUICKBOOKS_CLIENT_ID;
    const r = await callback(t, { state, code: "c0de", realmId: nextRealm() });
    expect(r.status).toBe(503);
    expect(exchangeCalls()).toHaveLength(0);
    expect((await db.qboOAuthState.findFirstOrThrow({ where: { workspaceId: t.ws } })).consumedAt).toBeNull();
  });
});
