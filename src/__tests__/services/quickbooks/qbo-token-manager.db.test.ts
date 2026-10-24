/** QuickBooks token lifecycle — refresh-on-demand, serialization, CAS rotation, reauth. Real PostgreSQL, fake token endpoint. */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { cfg, connectQbo, grant, seedQboTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { createQboTokenProvider, QboReauthRequiredError } from "@/services/quickbooks/qbo-token-manager";
import { loadQboTokensForUse, rotateQboTokens } from "@/services/quickbooks/qbo-connection.service";
import { acquireQboLock, releaseQboLock, withQboConnectionLock } from "@/services/quickbooks/qbo-connection-lock";

const tokenResponse = (access: string, refresh: string, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { access_token: access, refresh_token: refresh, token_type: "bearer", expires_in: 3600, x_refresh_token_expires_in: 8_640_000 } : { error: "invalid_grant" }), { status, headers: { "content-type": "application/json" } });

function tokenEndpoint(handler: (n: number, body: string) => Response | Promise<Response>) {
  let n = 0;
  const calls: string[] = [];
  const fetchImpl = async (_url: string, init?: RequestInit) => { calls.push(String(init?.body)); return handler(++n, String(init?.body)); };
  return { fetchImpl: fetchImpl as never, calls };
}
const expiring = () => grant({ accessTokenExpiresAt: new Date(Date.now() + 30_000) });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO token lifecycle (real Postgres)", () => {
  it("a fresh access token is used as-is: no provider call", async () => {
    const t = await seedQboTenant();
    const g = grant();
    const { connectionId } = await connectQbo(t, "production", undefined, g);
    const ep = tokenEndpoint(() => { throw new Error("must not be called"); });
    const p = createQboTokenProvider({ workspaceId: t.ws, connectionId, config: cfg(), fetchImpl: ep.fetchImpl });
    expect(await p.getAccessToken()).toBe(g.accessToken);
    expect(ep.calls).toHaveLength(0);
  });

  it("an expiring token is refreshed once, the ROTATED refresh token is persisted (revision+1, encrypted)", async () => {
    const t = await seedQboTenant();
    const g = expiring();
    const { connectionId } = await connectQbo(t, "production", undefined, g);
    const ep = tokenEndpoint(() => tokenResponse("ACCESS-NEW", "REFRESH-NEW"));
    const p = createQboTokenProvider({ workspaceId: t.ws, connectionId, config: cfg(), fetchImpl: ep.fetchImpl });
    expect(await p.getAccessToken()).toBe("ACCESS-NEW");
    expect(ep.calls[0]).toContain(`refresh_token=${encodeURIComponent(g.refreshToken)}`);
    const stored = await loadQboTokensForUse({ workspaceId: t.ws, connectionId });
    expect(stored.ok && stored.tokens).toMatchObject({ accessToken: "ACCESS-NEW", refreshToken: "REFRESH-NEW", revision: 2 });
    const raw = await db.qboConnectionToken.findUniqueOrThrow({ where: { connectionId } });
    expect(JSON.stringify(raw)).not.toContain("REFRESH-NEW");
    expect(raw.refreshTokenCiphertext.startsWith("v1gcm.")).toBe(true);
    // the next call finds a fresh token and does not refresh again
    expect(await p.getAccessToken()).toBe("ACCESS-NEW");
    expect(ep.calls).toHaveLength(1);
  });

  it("concurrent callers on an expiring token cause exactly ONE refresh (serialized, waiters reuse the new token)", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t, "production", undefined, expiring());
    const ep = tokenEndpoint(async () => { await new Promise((r) => setTimeout(r, 60)); return tokenResponse("ACCESS-ONE", "REFRESH-ONE"); });
    const mk = () => createQboTokenProvider({ workspaceId: t.ws, connectionId, config: cfg(), fetchImpl: ep.fetchImpl });
    const results = await Promise.all([mk().getAccessToken(), mk().getAccessToken(), mk().getAccessToken()]);
    expect(results).toEqual(["ACCESS-ONE", "ACCESS-ONE", "ACCESS-ONE"]);
    expect(ep.calls).toHaveLength(1);
    expect((await db.qboConnectionToken.findUniqueOrThrow({ where: { connectionId } })).revision).toBe(2);
  });

  it("stale-revision recovery: another worker rotated while we were at Intuit — we keep THEIR grant and write nothing", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t, "production", undefined, expiring());
    const ep = tokenEndpoint(async () => {
      // simulate a different process winning the rotation before our write lands
      await rotateQboTokens({ workspaceId: t.ws, connectionId, expectedRevision: 1, grant: grant({ accessToken: "ACCESS-THEIRS", refreshToken: "REFRESH-THEIRS" }) });
      return tokenResponse("ACCESS-OURS", "REFRESH-OURS");
    });
    const p = createQboTokenProvider({ workspaceId: t.ws, connectionId, config: cfg(), fetchImpl: ep.fetchImpl });
    expect(await p.getAccessToken()).toBe("ACCESS-THEIRS");
    const stored = await loadQboTokensForUse({ workspaceId: t.ws, connectionId });
    expect(stored.ok && stored.tokens.refreshToken).toBe("REFRESH-THEIRS");
  });

  it("invalid_grant (revoked/expired refresh token) => REAUTH_REQUIRED, terminal, no retry loop", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t, "production", undefined, expiring());
    const ep = tokenEndpoint(() => tokenResponse("", "", 400));
    const p = createQboTokenProvider({ workspaceId: t.ws, connectionId, config: cfg(), fetchImpl: ep.fetchImpl });
    await expect(p.getAccessToken()).rejects.toBeInstanceOf(QboReauthRequiredError);
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: connectionId } })).status).toBe("REAUTH_REQUIRED");
    expect(ep.calls).toHaveLength(1);
    const ev = await db.auditEvent.count({ where: { workspaceId: t.ws, eventName: "qbo.reauthorization_required" } });
    expect(ev).toBe(1);
  });

  it("a refresh token already past its expiry is not even sent to Intuit", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t, "production", undefined, grant({ accessTokenExpiresAt: new Date(Date.now() - 1000), refreshTokenExpiresAt: new Date(Date.now() - 1000) }));
    const ep = tokenEndpoint(() => { throw new Error("must not be called"); });
    const p = createQboTokenProvider({ workspaceId: t.ws, connectionId, config: cfg(), fetchImpl: ep.fetchImpl });
    await expect(p.getAccessToken()).rejects.toBeInstanceOf(QboReauthRequiredError);
    expect(ep.calls).toHaveLength(0);
  });

  it("transient provider failure keeps the connection ACTIVE and propagates a retryable error", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t, "production", undefined, expiring());
    const ep = tokenEndpoint(() => new Response("{}", { status: 503 }));
    const p = createQboTokenProvider({ workspaceId: t.ws, connectionId, config: cfg(), fetchImpl: ep.fetchImpl });
    await expect(p.getAccessToken()).rejects.toMatchObject({ kind: "TRANSIENT_PROVIDER_FAILURE", retryable: true });
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: connectionId } })).status).toBe("ACTIVE");
  });

  it("after a 401, a token another worker already replaced is used without calling Intuit", async () => {
    const t = await seedQboTenant();
    const g = grant();
    const { connectionId } = await connectQbo(t, "production", undefined, g);
    await rotateQboTokens({ workspaceId: t.ws, connectionId, expectedRevision: 1, grant: grant({ accessToken: "ACCESS-REPLACED" }) });
    const ep = tokenEndpoint(() => { throw new Error("must not be called"); });
    const p = createQboTokenProvider({ workspaceId: t.ws, connectionId, config: cfg(), fetchImpl: ep.fetchImpl });
    expect(await p.refreshAfterRejection(g.accessToken)).toBe("ACCESS-REPLACED");
    expect(ep.calls).toHaveLength(0);
  });

  it("a disconnected connection cannot be refreshed", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t, "production", undefined, expiring());
    const { disconnectQboConnection } = await import("@/services/quickbooks/qbo-connection.service");
    await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId });
    const p = createQboTokenProvider({ workspaceId: t.ws, connectionId, config: cfg(), fetchImpl: (() => { throw new Error("no"); }) as never });
    await expect(p.getAccessToken()).rejects.toMatchObject({ code: "CONNECTION_NOT_ACTIVE" });
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO per-connection resource lock (real Postgres)", () => {
  it("mutual exclusion per (connection, scope); independent across scopes and connections; renew and release", async () => {
    const t = await seedQboTenant();
    const a = await connectQbo(t, "production");
    const t2 = await seedQboTenant();
    const b = await connectQbo(t2, "production");
    const k1 = await acquireQboLock("sync", t.ws, a.connectionId, 5000);
    expect(k1).not.toBeNull();
    expect(await acquireQboLock("sync", t.ws, a.connectionId, 5000)).toBeNull();
    expect(await acquireQboLock("refresh", t.ws, a.connectionId, 5000)).not.toBeNull(); // other scope
    expect(await acquireQboLock("sync", t2.ws, b.connectionId, 5000)).not.toBeNull(); // other connection
    await releaseQboLock("sync", a.connectionId, k1 as string);
    expect(await acquireQboLock("sync", t.ws, a.connectionId, 5000)).not.toBeNull();
  });

  it("a crashed holder's lock expires on the database clock; its late renew/release cannot hurt the new holder", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t, "production");
    const old = await acquireQboLock("sync", t.ws, connectionId, 1);
    await new Promise((r) => setTimeout(r, 30));
    const fresh = await acquireQboLock("sync", t.ws, connectionId, 60_000);
    expect(fresh).not.toBeNull();
    const { renewQboLock } = await import("@/services/quickbooks/qbo-connection-lock");
    expect(await renewQboLock("sync", connectionId, old as string, 60_000)).toBe(false);
    await releaseQboLock("sync", connectionId, old as string);
    expect(await acquireQboLock("sync", t.ws, connectionId, 1000)).toBeNull(); // still held by `fresh`
  });

  it("withQboConnectionLock releases on error; a contender gets acquired:false while held", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t, "production");
    let inner: unknown;
    await expect(withQboConnectionLock("sync", t.ws, connectionId, async () => {
      inner = await withQboConnectionLock("sync", t.ws, connectionId, async () => 1, { ttlMs: 1000 });
      throw new Error("boom");
    }, { ttlMs: 5000 })).rejects.toThrow("boom");
    expect(inner).toEqual({ acquired: false });
    const again = await withQboConnectionLock("sync", t.ws, connectionId, async () => 7, { ttlMs: 1000 });
    expect(again).toEqual({ acquired: true, value: 7 });
  });

  it("the lock table is tenant-bound by composite FK", async () => {
    const t = await seedQboTenant(); const o = await seedQboTenant();
    const { connectionId } = await connectQbo(t, "production");
    await expect(db.qboResourceLock.create({ data: { connectionId, scope: "sync", workspaceId: o.ws, holderToken: randomUUID(), acquiredAt: new Date(), expiresAt: new Date(Date.now() + 1000) } })).rejects.toThrow();
  });
});
