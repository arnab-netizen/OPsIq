/**
 * QuickBooks Online connection / OAuth-state / token persistence — real PostgreSQL proof.
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { resolveQboConfig, type QboEnvironment, type QboProviderConfig } from "@/domain/quickbooks/qbo-config";
import { seedTenant, type Tenant } from "@/__tests__/owner-outcome/outcome-db-fixtures";
import {
  beginQboAuthorization, consumeQboAuthorizationState, finalizeQboConnection, rotateQboTokens, loadQboTokensForUse,
  markQboReauthorizationRequired, disconnectQboConnection, listQboConnectionsForBusiness,
} from "@/services/quickbooks/qbo-connection.service";
import type { QboTokenGrant } from "@/services/quickbooks/qbo-oauth.service";
import { hashQboOAuthState } from "@/services/quickbooks/qbo-oauth.service";

const cfg = (environment: QboEnvironment): QboProviderConfig => {
  const r = resolveQboConfig({
    QUICKBOOKS_CLIENT_ID: "cid", QUICKBOOKS_CLIENT_SECRET: "csecret-DO-NOT-LEAK", QUICKBOOKS_REDIRECT_URI: "https://app.example.com/cb",
    QUICKBOOKS_ENVIRONMENT: environment,
  });
  if (!r.available) throw new Error("config");
  return r.config;
};
const grant = (tag = "a"): QboTokenGrant => ({
  accessToken: `ACCESS-${tag}-${randomUUID()}`, refreshToken: `REFRESH-${tag}-${randomUUID()}`, tokenType: "Bearer",
  accessTokenExpiresAt: new Date(Date.now() + 3_600_000), refreshTokenExpiresAt: new Date(Date.now() + 8_000_000_000),
  refreshTokenHardExpiresAt: null, issuedAt: new Date(), intuitTid: "tid-1",
});
const stateOf = (url: string) => new URL(url).searchParams.get("state") as string;
let realmSeq = 0;
const nextRealm = () => `9341${String(Date.now()).slice(-6)}${++realmSeq}`;

async function connect(t: Tenant, biz: string, env: QboEnvironment, realm: string, g = grant()) {
  const b = await beginQboAuthorization({ workspaceId: t.ws, actorId: t.actor, businessId: biz, environment: env }, cfg(env));
  const c = await consumeQboAuthorizationState({ workspaceId: t.ws, actorId: t.actor, environment: env, state: stateOf(b.authorizationUrl) });
  if (!c.ok) throw new Error(`consume ${c.reason}`);
  return { b, fin: await finalizeQboConnection({ authorization: c.authorization, realmId: realm, grant: g }) , g };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO connection persistence (real Postgres)", () => {
  let A: Tenant; let B: Tenant;
  beforeAll(async () => { A = await seedTenant(); B = await seedTenant(); });

  describe("one-time state", () => {
    it("stores only the hash; consumes once; replay is ALREADY_CONSUMED", async () => {
      const b = await beginQboAuthorization({ workspaceId: A.ws, actorId: A.actor, businessId: A.biz, environment: "sandbox" }, cfg("sandbox"));
      const state = stateOf(b.authorizationUrl);
      const row = await db.qboOAuthState.findUniqueOrThrow({ where: { id: b.authorizationId } });
      expect(row.stateHash).toBe(hashQboOAuthState(state));
      expect(JSON.stringify(row)).not.toContain(state);
      const raw = JSON.stringify(await db.$queryRawUnsafe(`select * from qbo_oauth_states where id = '${b.authorizationId}'`));
      expect(raw).not.toContain(state);
      const ctx = { workspaceId: A.ws, actorId: A.actor, environment: "sandbox" as const, state };
      expect((await consumeQboAuthorizationState(ctx)).ok).toBe(true);
      expect(await consumeQboAuthorizationState(ctx)).toEqual({ ok: false, reason: "ALREADY_CONSUMED" });
    });
    it("concurrent replay: exactly one winner", async () => {
      const b = await beginQboAuthorization({ workspaceId: A.ws, actorId: A.actor, businessId: A.biz, environment: "sandbox" }, cfg("sandbox"));
      const ctx = { workspaceId: A.ws, actorId: A.actor, environment: "sandbox" as const, state: stateOf(b.authorizationUrl) };
      const rs = await Promise.all(Array.from({ length: 12 }, () => consumeQboAuthorizationState(ctx)));
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(rs.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "ALREADY_CONSUMED")).toBe(true);
    });
    it("wrong workspace/actor/environment, unknown and malformed state are refused without consuming", async () => {
      const b = await beginQboAuthorization({ workspaceId: A.ws, actorId: A.actor, businessId: A.biz, environment: "sandbox" }, cfg("sandbox"));
      const state = stateOf(b.authorizationUrl);
      expect(await consumeQboAuthorizationState({ workspaceId: B.ws, actorId: B.actor, environment: "sandbox", state })).toEqual({ ok: false, reason: "INVALID_STATE" });
      expect(await consumeQboAuthorizationState({ workspaceId: A.ws, actorId: randomUUID(), environment: "sandbox", state })).toEqual({ ok: false, reason: "CONTEXT_MISMATCH" });
      expect(await consumeQboAuthorizationState({ workspaceId: A.ws, actorId: A.actor, environment: "production", state })).toEqual({ ok: false, reason: "CONTEXT_MISMATCH" });
      expect(await consumeQboAuthorizationState({ workspaceId: A.ws, actorId: A.actor, environment: "sandbox", state: "x".repeat(40) })).toEqual({ ok: false, reason: "INVALID_STATE" });
      expect(await consumeQboAuthorizationState({ workspaceId: A.ws, actorId: A.actor, environment: "sandbox", state: "short" })).toEqual({ ok: false, reason: "INVALID_STATE" });
      expect((await consumeQboAuthorizationState({ workspaceId: A.ws, actorId: A.actor, environment: "sandbox", state })).ok).toBe(true);
    });
    it("expired state is EXPIRED", async () => {
      const t0 = new Date(Date.now() - 3_600_000);
      const b = await beginQboAuthorization({ workspaceId: A.ws, actorId: A.actor, businessId: A.biz, environment: "sandbox" }, cfg("sandbox"), { now: () => t0 });
      expect(await consumeQboAuthorizationState({ workspaceId: A.ws, actorId: A.actor, environment: "sandbox", state: stateOf(b.authorizationUrl) })).toEqual({ ok: false, reason: "EXPIRED" });
    });
    it("begin: foreign-workspace business, fixture business, environment mismatch are rejected", async () => {
      await expect(beginQboAuthorization({ workspaceId: A.ws, actorId: A.actor, businessId: B.biz, environment: "sandbox" }, cfg("sandbox"))).rejects.toMatchObject({ name: "NotFoundError" });
      const fx = randomUUID();
      await db.ownerBusiness.create({ data: { id: fx, workspaceId: A.ws, name: "fx", businessType: "generic_local_service", currency: "INR", isFixtureBusiness: true } });
      await expect(beginQboAuthorization({ workspaceId: A.ws, actorId: A.actor, businessId: fx, environment: "sandbox" }, cfg("sandbox"))).rejects.toMatchObject({ name: "ValidationError" });
      await expect(beginQboAuthorization({ workspaceId: A.ws, actorId: A.actor, businessId: A.biz, environment: "production" }, cfg("sandbox"))).rejects.toMatchObject({ name: "ValidationError" });
    });
  });

  describe("finalize + tenancy + realm binding", () => {
    it("binds realm, stores only ciphertext, round-trips under the workspace key, is atomic and replay-safe", async () => {
      const realm = nextRealm();
      const { b, fin, g } = await connect(A, A.biz, "sandbox", realm);
      expect(fin.ok).toBe(true);
      if (!fin.ok) return;
      expect(fin.connection).toMatchObject({ workspaceId: A.ws, businessId: A.biz, realmId: realm, environment: "sandbox", status: "ACTIVE" });
      const tok = await db.qboConnectionToken.findUniqueOrThrow({ where: { connectionId: fin.connection.id } });
      const dump = JSON.stringify(tok) + JSON.stringify(await db.$queryRawUnsafe(`select * from qbo_connection_tokens`));
      expect(dump).not.toContain(g.accessToken);
      expect(dump).not.toContain(g.refreshToken);
      expect(tok.accessTokenCiphertext.startsWith("v1gcm.")).toBe(true);
      const loaded = await loadQboTokensForUse({ workspaceId: A.ws, connectionId: fin.connection.id });
      expect(loaded.ok && loaded.tokens.accessToken === g.accessToken && loaded.tokens.refreshToken === g.refreshToken).toBe(true);
      // another workspace cannot read or decrypt it
      expect(await loadQboTokensForUse({ workspaceId: B.ws, connectionId: fin.connection.id })).toEqual({ ok: false, reason: "NOT_FOUND" });
      const audits = JSON.stringify(await db.auditEvent.findMany({ where: { workspaceId: A.ws } }));
      for (const secret of [g.accessToken, g.refreshToken, stateOf(b.authorizationUrl), "csecret-DO-NOT-LEAK"]) expect(audits).not.toContain(secret);
      // finalize replay with the same consumed authorization is refused
      const again = await finalizeQboConnection({ authorization: { authorizationId: b.authorizationId, workspaceId: A.ws, businessId: A.biz, actorId: A.actor, environment: "sandbox" }, realmId: realm, grant: grant() });
      expect(again).toEqual({ ok: false, reason: "AUTHORIZATION_ALREADY_FINALIZED" });
    });
    it("finalize refuses an unconsumed or forged authorization", async () => {
      const b = await beginQboAuthorization({ workspaceId: A.ws, actorId: A.actor, businessId: A.bizB, environment: "sandbox" }, cfg("sandbox"));
      const auth = { authorizationId: b.authorizationId, workspaceId: A.ws, businessId: A.bizB, actorId: A.actor, environment: "sandbox" as const };
      expect(await finalizeQboConnection({ authorization: auth, realmId: nextRealm(), grant: grant() })).toEqual({ ok: false, reason: "AUTHORIZATION_NOT_CONSUMED" });
      expect(await finalizeQboConnection({ authorization: { ...auth, workspaceId: B.ws }, realmId: nextRealm(), grant: grant() })).toEqual({ ok: false, reason: "AUTHORIZATION_NOT_CONSUMED" });
      expect(await db.qboConnection.count({ where: { businessId: A.bizB } })).toBe(0);
    });
    it("invalid realm id is rejected before any write", async () => {
      const b = await beginQboAuthorization({ workspaceId: A.ws, actorId: A.actor, businessId: A.bizB, environment: "sandbox" }, cfg("sandbox"));
      const c = await consumeQboAuthorizationState({ workspaceId: A.ws, actorId: A.actor, environment: "sandbox", state: stateOf(b.authorizationUrl) });
      if (!c.ok) throw new Error("x");
      await expect(finalizeQboConnection({ authorization: c.authorization, realmId: "12; DROP", grant: grant() })).rejects.toMatchObject({ name: "ValidationError" });
    });
    it("two businesses, two realms, one workspace; sandbox and production are separate", async () => {
      const r1 = nextRealm(); const r2 = nextRealm();
      const t = await seedTenant();
      expect((await connect(t, t.biz, "sandbox", r1)).fin.ok).toBe(true);
      expect((await connect(t, t.bizB, "sandbox", r2)).fin.ok).toBe(true);
      expect((await connect(t, t.biz, "production", r1)).fin.ok).toBe(true); // same business, other environment, same numeric realm id
      expect((await listQboConnectionsForBusiness({ workspaceId: t.ws, businessId: t.biz })).map((c) => c.environment).sort()).toEqual(["production", "sandbox"]);
    });
    it("same realm cannot bind to a second business or workspace; no disclosure; original untouched", async () => {
      const realm = nextRealm();
      const t = await seedTenant(); const u = await seedTenant();
      const first = await connect(t, t.biz, "sandbox", realm);
      expect(first.fin.ok).toBe(true);
      const sameWs = await connect(t, t.bizB, "sandbox", realm);
      expect(sameWs.fin).toEqual({ ok: false, reason: "REALM_ALREADY_BOUND" });
      const crossWs = await connect(u, u.biz, "sandbox", realm);
      expect(crossWs.fin).toEqual({ ok: false, reason: "REALM_ALREADY_BOUND" });
      expect(JSON.stringify(crossWs.fin)).not.toContain(t.ws);
      expect(await db.qboConnection.count({ where: { realmId: realm, environment: "sandbox" } })).toBe(1);
      const conflict = await db.auditEvent.findMany({ where: { workspaceId: u.ws, eventName: "qbo.realm_binding_conflict" } });
      expect(conflict).toHaveLength(1);
      expect(JSON.stringify(conflict)).not.toContain(t.ws);
      expect(await db.auditEvent.count({ where: { workspaceId: t.ws, eventName: "qbo.realm_binding_conflict" } })).toBe(1); // only t's own same-workspace attempt
    });
    it("concurrent finalize of one realm by two tenants: exactly one wins", async () => {
      const realm = nextRealm();
      const t = await seedTenant(); const u = await seedTenant();
      const prep = async (x: Tenant) => {
        const b = await beginQboAuthorization({ workspaceId: x.ws, actorId: x.actor, businessId: x.biz, environment: "sandbox" }, cfg("sandbox"));
        const c = await consumeQboAuthorizationState({ workspaceId: x.ws, actorId: x.actor, environment: "sandbox", state: stateOf(b.authorizationUrl) });
        if (!c.ok) throw new Error("x");
        return c.authorization;
      };
      const [a1, a2] = [await prep(t), await prep(u)];
      const rs = await Promise.all([a1, a2].map((a) => finalizeQboConnection({ authorization: a, realmId: realm, grant: grant() })));
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(await db.qboConnection.count({ where: { realmId: realm, environment: "sandbox", status: { not: "DISCONNECTED" } } })).toBe(1);
    });
    it("same business, different realm requires disconnect; same-realm reconnect reuses the row", async () => {
      const t = await seedTenant();
      const r1 = nextRealm(); const r2 = nextRealm();
      const c1 = await connect(t, t.biz, "sandbox", r1);
      if (!c1.fin.ok) throw new Error("x");
      expect((await connect(t, t.biz, "sandbox", r2)).fin).toEqual({ ok: false, reason: "BUSINESS_BOUND_TO_OTHER_REALM" });
      expect(await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId: c1.fin.connection.id })).toEqual({ changed: true });
      expect(await db.qboConnectionToken.count({ where: { connectionId: c1.fin.connection.id } })).toBe(0);
      const c2 = await connect(t, t.biz, "sandbox", r2);
      expect(c2.fin.ok).toBe(true);
      const back = await connect(t, t.bizB, "sandbox", r1); // freed realm may bind elsewhere in the workspace
      expect(back.fin.ok).toBe(true);
      expect(await db.qboConnection.count({ where: { realmId: r1 } })).toBe(2); // history kept
    });
    it("reconnect of the same realm to the same business after disconnect reactivates the same row", async () => {
      const t = await seedTenant(); const realm = nextRealm();
      const c1 = await connect(t, t.biz, "sandbox", realm);
      if (!c1.fin.ok) throw new Error("x");
      await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId: c1.fin.connection.id });
      const c2 = await connect(t, t.biz, "sandbox", realm);
      expect(c2.fin.ok && c2.fin.reconnected && c2.fin.connection.id === c1.fin.connection.id && c2.fin.connection.status === "ACTIVE").toBe(true);
    });
  });

  describe("database backstops (raw writes bypassing services)", () => {
    it("rejects a foreign-workspace business, bare tokens, bad status/environment/hash, and a cross-workspace token row", async () => {
      const id = randomUUID();
      const A = await seedTenant(); const B = await seedTenant();
      const base = { id, workspaceId: A.ws, businessId: B.biz, environment: "sandbox", realmId: "123", status: "ACTIVE", connectedById: A.actor, connectedAt: new Date() };
      await expect(db.qboConnection.create({ data: base })).rejects.toThrow();
      const ok = await db.qboConnection.create({ data: { ...base, businessId: A.biz, realmId: nextRealm() } });
      await expect(db.qboConnection.update({ where: { id: ok.id }, data: { status: "HACKED" } })).rejects.toThrow();
      await expect(db.qboConnection.update({ where: { id: ok.id }, data: { environment: "prod" } })).rejects.toThrow();
      const tk = { connectionId: ok.id, accessTokenCiphertext: "plain", refreshTokenCiphertext: "v1gcm.a.b.c", tokenType: "Bearer", accessTokenExpiresAt: new Date(), refreshTokenExpiresAt: new Date(), grantedScope: "s" };
      await expect(db.qboConnectionToken.create({ data: { ...tk, workspaceId: A.ws } })).rejects.toThrow();
      await expect(db.qboConnectionToken.create({ data: { ...tk, accessTokenCiphertext: "v1gcm.a.b.c", workspaceId: B.ws } })).rejects.toThrow();
      await expect(db.qboOAuthState.create({ data: { id: randomUUID(), workspaceId: A.ws, businessId: A.biz, initiatedById: A.actor, environment: "sandbox", scope: "s", stateHash: "not-a-hash", expiresAt: new Date(Date.now() + 1000) } })).rejects.toThrow();
      await expect(db.qboOAuthState.create({ data: { id: randomUUID(), workspaceId: A.ws, businessId: B.biz, initiatedById: A.actor, environment: "sandbox", scope: "s", stateHash: "a".repeat(64), expiresAt: new Date(Date.now() + 1000) } })).rejects.toThrow();
    });
  });

  describe("token rotation fence + lifecycle", () => {
    it("stale writer cannot overwrite a newer token; concurrent rotation has one winner", async () => {
      const t = await seedTenant();
      const c = await connect(t, t.biz, "sandbox", nextRealm());
      if (!c.fin.ok) throw new Error("x");
      const id = c.fin.connection.id;
      const g1 = grant("r1"); const g2 = grant("r2");
      const rs = await Promise.all([g1, g2].map((g) => rotateQboTokens({ workspaceId: t.ws, connectionId: id, expectedRevision: 1, grant: g })));
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(rs.find((r) => !r.ok)).toEqual({ ok: false, reason: "STALE_REVISION" });
      const winner = rs[0].ok ? g1 : g2;
      const loaded = await loadQboTokensForUse({ workspaceId: t.ws, connectionId: id });
      expect(loaded.ok && loaded.tokens.refreshToken === winner.refreshToken && loaded.tokens.revision === 2).toBe(true);
      expect(await rotateQboTokens({ workspaceId: t.ws, connectionId: id, expectedRevision: 1, grant: grant("late") })).toEqual({ ok: false, reason: "STALE_REVISION" });
      // another workspace cannot rotate it
      expect(await rotateQboTokens({ workspaceId: B.ws, connectionId: id, expectedRevision: 2, grant: grant("x") })).toEqual({ ok: false, reason: "CONNECTION_NOT_ACTIVE" });
    });
    it("reauth-required blocks use and rotation; disconnect is tenant-scoped and idempotent", async () => {
      const t = await seedTenant();
      const c = await connect(t, t.biz, "sandbox", nextRealm());
      if (!c.fin.ok) throw new Error("x");
      const id = c.fin.connection.id;
      expect(await markQboReauthorizationRequired({ workspaceId: B.ws, connectionId: id, reasonCode: "REFRESH_INVALID" })).toEqual({ changed: false });
      expect(await markQboReauthorizationRequired({ workspaceId: t.ws, connectionId: id, reasonCode: "REFRESH_INVALID" })).toEqual({ changed: true });
      expect(await markQboReauthorizationRequired({ workspaceId: t.ws, connectionId: id, reasonCode: "REFRESH_INVALID" })).toEqual({ changed: false });
      expect(await loadQboTokensForUse({ workspaceId: t.ws, connectionId: id })).toEqual({ ok: false, reason: "NOT_ACTIVE" });
      expect(await rotateQboTokens({ workspaceId: t.ws, connectionId: id, expectedRevision: 1, grant: grant() })).toEqual({ ok: false, reason: "CONNECTION_NOT_ACTIVE" });
      await expect(disconnectQboConnection({ workspaceId: B.ws, actorId: B.actor, connectionId: id })).rejects.toMatchObject({ name: "NotFoundError" });
      expect(await db.qboConnectionToken.count({ where: { connectionId: id } })).toBe(1);
      expect(await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId: id })).toEqual({ changed: true });
      expect(await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId: id })).toEqual({ changed: false });
      const names = (await db.auditEvent.findMany({ where: { workspaceId: t.ws } })).map((e) => e.eventName);
      expect(names).toEqual(expect.arrayContaining(["qbo.authorization_started", "qbo.authorization_completed", "qbo.reauthorization_required", "qbo.connection_disconnected"]));
    });
    it("failed token persistence leaves no connection (atomic finalize); missing encryption key fails closed before any write", async () => {
      const t = await seedTenant();
      const b = await beginQboAuthorization({ workspaceId: t.ws, actorId: t.actor, businessId: t.biz, environment: "sandbox" }, cfg("sandbox"));
      const c = await consumeQboAuthorizationState({ workspaceId: t.ws, actorId: t.actor, environment: "sandbox", state: stateOf(b.authorizationUrl) });
      if (!c.ok) throw new Error("x");
      const bad = { ...grant(), refreshTokenExpiresAt: new Date("invalid") };
      await expect(finalizeQboConnection({ authorization: c.authorization, realmId: nextRealm(), grant: bad })).rejects.toThrow();
      expect(await db.qboConnection.count({ where: { workspaceId: t.ws } })).toBe(0);
      expect((await db.qboOAuthState.findUniqueOrThrow({ where: { id: b.authorizationId } })).finalizedAt).toBeNull();
      const saved = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
      delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
      try {
        await expect(finalizeQboConnection({ authorization: c.authorization, realmId: nextRealm(), grant: grant() })).rejects.toThrow(/not configured/);
      } finally { process.env.OAUTH_TOKEN_ENCRYPTION_KEY = saved; }
      expect(await db.qboConnection.count({ where: { workspaceId: t.ws } })).toBe(0);
    });
  });
});
