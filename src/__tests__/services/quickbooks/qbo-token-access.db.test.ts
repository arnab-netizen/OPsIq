/**
 * QuickBooks token access / refresh wired into real reads — real PostgreSQL, fake Intuit.
 * Requires TEST_WITH_DB=true. Self-skips otherwise.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getUsableQboAccessToken } from "@/services/quickbooks/qbo-token-access.service";
import { runQboReadSync, runScheduledQboSync } from "@/services/quickbooks/qbo-sync.service";
import { loadQboTokensForUse } from "@/services/quickbooks/qbo-connection.service";
import { enqueueDueQboReadSyncTasks } from "@/services/scheduler/scheduler-producers";
import { seedConnected, testDeps, qboConfig, scopeOf, grantOf, QBO_TEST_ENV, type ConnectedTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { customer } from "@/__tests__/test-helpers/qbo-fake-intuit";

const NOW = new Date();
const tokenDeps = (c: ConnectedTenant) => ({ config: qboConfig(), fetchImpl: c.fake.fetchImpl });
const tokenBody = (n: number) => ({ access_token: `fresh-access-${n}`, refresh_token: `fresh-refresh-${n}`, token_type: "bearer", expires_in: 3600, x_refresh_token_expires_in: 8_640_000 });
const get = (c: ConnectedTenant, extra: { forceRefresh?: boolean } = {}, deps = tokenDeps(c)) =>
  getUsableQboAccessToken({ workspaceId: c.t.ws, connectionId: c.connectionId, ...extra }, deps);
const tokenRow = (c: ConnectedTenant) => db.qboConnectionToken.findUniqueOrThrow({ where: { connectionId: c.connectionId } });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO token access + refresh (real Postgres)", () => {
  it("a valid access token is returned without any refresh", async () => {
    const c = await seedConnected({ grant: grantOf({ tag: "valid" }) });
    const r = await get(c);
    expect(r).toMatchObject({ ok: true, accessToken: "ACCESS-valid", refreshed: false, environment: "sandbox", realmId: c.realmId });
    expect(c.fake.tokenCalls).toBe(0);
    expect((await tokenRow(c)).revision).toBe(1);
  });

  it("an expired (or about-to-expire) access token is refreshed ONCE through the revision-fenced rotation", async () => {
    for (const accessInMs of [-1000, 30_000]) {
      const c = await seedConnected({ grant: grantOf({ accessInMs, tag: "old" }) });
      c.fake.tokenResponses.push({ status: 200, body: tokenBody(1) });
      const before = await tokenRow(c);
      const r = await get(c);
      expect(r).toMatchObject({ ok: true, accessToken: "fresh-access-1", refreshed: true });
      const after = await tokenRow(c);
      expect(after.revision).toBe(2);
      expect(after.accessTokenCiphertext).not.toBe(before.accessTokenCiphertext);
      expect(after.refreshTokenCiphertext).not.toBe(before.refreshTokenCiphertext);
      // Stored encrypted only; the rotated refresh token is the one used from now on.
      expect(JSON.stringify(await db.$queryRawUnsafe(`select * from qbo_connection_tokens where connection_id = '${c.connectionId}'`))).not.toMatch(/fresh-access|fresh-refresh|ACCESS-old|REFRESH-old/);
      const stored = await loadQboTokensForUse({ workspaceId: c.t.ws, connectionId: c.connectionId });
      expect(stored.ok && stored.tokens.refreshToken).toBe("fresh-refresh-1");
      expect(c.fake.tokenCalls).toBe(1);
      expect(c.fake.nonTokenPosts()).toEqual([]);
      const rotated = await db.auditEvent.findMany({ where: { workspaceId: c.t.ws, eventName: "qbo.tokens_rotated" } });
      expect(rotated).toHaveLength(1);
      expect(JSON.stringify(rotated)).not.toMatch(/fresh-|ACCESS-|REFRESH-/);
    }
  });

  it("concurrent refresh: both refreshers call Intuit, exactly ONE rotation persists, and the loser adopts the winner's token (stale writer discarded)", async () => {
    const c = await seedConnected({ grant: grantOf({ accessInMs: -1000, tag: "race" }) });
    c.fake.tokenResponses.push({ status: 200, body: tokenBody(1) }, { status: 200, body: tokenBody(2) });
    // Park the first token call until the second arrives, so both refreshers hold revision 1.
    let arrived = 0;
    let releaseBoth!: () => void;
    const both = new Promise<void>((r) => { releaseBoth = r; });
    const fetchImpl = async (input: string, init?: RequestInit) => {
      if (new URL(input).pathname.endsWith("/tokens/bearer")) {
        arrived++;
        if (arrived === 2) releaseBoth();
        await both;
      }
      return c.fake.fetchImpl(input, init);
    };
    const [a, b] = await Promise.all([get(c, {}, { config: qboConfig(), fetchImpl }), get(c, {}, { config: qboConfig(), fetchImpl })]);
    expect(a.ok && b.ok).toBe(true);
    expect(c.fake.tokenCalls).toBe(2);
    expect((await tokenRow(c)).revision).toBe(2); // one rotation only
    const stored = await loadQboTokensForUse({ workspaceId: c.t.ws, connectionId: c.connectionId });
    if (!stored.ok || !a.ok || !b.ok) throw new Error("setup");
    // Both callers hold the SAME (winning, persisted) access token; the losing grant exists nowhere.
    expect(a.accessToken).toBe(stored.tokens.accessToken);
    expect(b.accessToken).toBe(stored.tokens.accessToken);
    expect([a.refreshed, b.refreshed]).toEqual([true, true]);
    expect(await db.auditEvent.count({ where: { workspaceId: c.t.ws, eventName: "qbo.tokens_rotated" } })).toBe(1);
  });

  it("invalid_grant on refresh marks REAUTH_REQUIRED, audits it, and is never retried (no refresh storm)", async () => {
    const c = await seedConnected({ grant: grantOf({ accessInMs: -1000, tag: "dead" }) });
    c.fake.tokenResponses.push({ status: 400, body: { error: "invalid_grant" } });
    expect(await get(c)).toEqual({ ok: false, code: "REAUTH_REQUIRED", retryAfterMs: null });
    const conn = await db.qboConnection.findUniqueOrThrow({ where: { id: c.connectionId } });
    expect(conn).toMatchObject({ status: "REAUTH_REQUIRED", lastErrorCode: "REFRESH_INVALID" });
    expect(conn.reauthRequiredAt).not.toBeNull();
    expect(await db.auditEvent.count({ where: { workspaceId: c.t.ws, eventName: "qbo.reauthorization_required" } })).toBe(1);
    // Hammering again does nothing: the connection is no longer ACTIVE, so the token endpoint is not called again.
    for (let i = 0; i < 5; i++) expect(await get(c)).toMatchObject({ ok: false, code: "CONNECTION_NOT_ACTIVE" });
    expect(c.fake.tokenCalls).toBe(1);
  });

  it("an expired or hard-expired refresh token needs reauthorization without calling Intuit", async () => {
    const exp = await seedConnected({ grant: grantOf({ accessInMs: -1000, refreshInMs: -1000 }) });
    expect(await get(exp)).toMatchObject({ ok: false, code: "REAUTH_REQUIRED" });
    const hard = await seedConnected({ grant: grantOf({ accessInMs: -1000, hardInMs: -5 }) });
    expect(await get(hard)).toMatchObject({ ok: false, code: "REAUTH_REQUIRED" });
    expect(exp.fake.tokenCalls + hard.fake.tokenCalls).toBe(0);
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: exp.connectionId } })).lastErrorCode).toBe("REFRESH_TOKEN_EXPIRED");
  });

  it("transient refresh failures change no state, are not retried here, and carry Retry-After", async () => {
    const c = await seedConnected({ grant: grantOf({ accessInMs: -1000, tag: "t" }) });
    c.fake.tokenResponses.push({ status: 500, body: {} }, { status: 429, body: {} });
    expect(await get(c)).toMatchObject({ ok: false, code: "PROVIDER_UNAVAILABLE" });
    expect(await get(c)).toMatchObject({ ok: false, code: "PROVIDER_RATE_LIMITED" });
    expect(c.fake.tokenCalls).toBe(2); // one call per attempt, never an internal retry
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: c.connectionId } })).status).toBe("ACTIVE");
    expect((await tokenRow(c)).revision).toBe(1);
  });

  it("a connection of another workspace, a disconnected one and an environment mismatch yield nothing", async () => {
    const a = await seedConnected();
    const b = await seedConnected();
    expect(await getUsableQboAccessToken({ workspaceId: b.t.ws, connectionId: a.connectionId }, tokenDeps(a))).toMatchObject({ ok: false, code: "CONNECTION_NOT_FOUND" });
    expect(await getUsableQboAccessToken({ workspaceId: a.t.ws, connectionId: a.connectionId }, { config: qboConfig("production"), fetchImpl: a.fake.fetchImpl })).toMatchObject({ ok: false, code: "ENVIRONMENT_MISMATCH" });
    await db.qboConnection.update({ where: { id: a.connectionId }, data: { status: "DISCONNECTED", disconnectedAt: new Date() } });
    expect(await get(a)).toMatchObject({ ok: false, code: "CONNECTION_NOT_ACTIVE" });
  });

  describe("inside a sync", () => {
    const run = (c: ConnectedTenant, extra = {}) => runQboReadSync({ ...scopeOf(c), trigger: "MANUAL", actorId: c.t.actor, requestId: randomUUID() }, testDeps(c, { now: () => NOW, ...extra }));

    it("an expired token is refreshed before the first read, once, and the sync then succeeds with the new token", async () => {
      const c = await seedConnected({ grant: grantOf({ accessInMs: -1000, tag: "s1" }) });
      c.fake.tokenResponses.push({ status: 200, body: tokenBody(1) });
      c.fake.validAccessTokens = new Set(["fresh-access-1"]);
      const out = await run(c);
      expect(out.status).toBe("SUCCEEDED");
      expect(c.fake.tokenCalls).toBe(1);
      expect(c.fake.accountingRequests().every((r) => r.authorization === "Bearer fresh-access-1")).toBe(true);
      expect(JSON.stringify(out)).not.toMatch(/fresh-|ACCESS-|REFRESH-/);
    });

    it("a 401 from the API triggers exactly ONE forced refresh and a retry; a second 401 is terminal REAUTH_REQUIRED (no loop)", async () => {
      const ok = await seedConnected({ grant: grantOf({ tag: "stale-at" }) });
      ok.fake.validAccessTokens = new Set(["fresh-access-1"]); // the stored token is rejected, the refreshed one is accepted
      ok.fake.tokenResponses.push({ status: 200, body: tokenBody(1) });
      expect((await run(ok)).status).toBe("SUCCEEDED");
      expect(ok.fake.tokenCalls).toBe(1);

      const bad = await seedConnected({ grant: grantOf({ tag: "revoked" }) });
      bad.fake.validAccessTokens = new Set(); // nothing is ever accepted
      bad.fake.tokenResponses.push({ status: 200, body: tokenBody(1) }, { status: 200, body: tokenBody(2) });
      const out = await run(bad);
      expect(out).toMatchObject({ status: "FAILED", code: "REAUTH_REQUIRED", terminal: true, nextAttemptNotBefore: null });
      expect(bad.fake.tokenCalls).toBe(1);
      expect((await db.qboConnection.findUniqueOrThrow({ where: { id: bad.connectionId } })).status).toBe("REAUTH_REQUIRED");
    });

    it("invalid refresh during a sync ends terminally: REAUTH_REQUIRED, no records, no retry, and the scheduler stops offering the connection", async () => {
      const c = await seedConnected({ grant: grantOf({ accessInMs: -1000, tag: "dead2" }) });
      c.fake.data.Customer.push(customer("1", "2026-09-01T00:00:00Z"));
      c.fake.tokenResponses.push({ status: 400, body: { error: "invalid_grant" } });
      const out = await run(c);
      expect(out).toMatchObject({ status: "FAILED", code: "REAUTH_REQUIRED", terminal: true, nextAttemptNotBefore: null });
      expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId } })).toBe(0);
      expect(await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } })).toMatchObject({ lastOutcome: "FAILED", lastErrorCode: "REAUTH_REQUIRED", leaseToken: null });
      // Later attempts (any trigger) are refused up front; the producer never lists it.
      const again = await runScheduledQboSync({ workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "SCHEDULED" }, testDeps(c, { now: () => new Date(NOW.getTime() + 86_400_000) }));
      expect(again).toMatchObject({ status: "FAILED", code: "REAUTH_REQUIRED" });
      expect(c.fake.tokenCalls).toBe(1);
      const before = await db.scheduledTask.count({ where: { workspaceId: c.t.ws } });
      await enqueueDueQboReadSyncTasks(QBO_TEST_ENV("sandbox"));
      expect(await db.scheduledTask.count({ where: { workspaceId: c.t.ws } })).toBe(before);
    });

    it("a transient refresh failure fails the run with a retryable code and back-off, leaving the connection ACTIVE", async () => {
      const c = await seedConnected({ grant: grantOf({ accessInMs: -1000, tag: "tr" }) });
      c.fake.tokenResponses.push({ status: 503, body: {} });
      const out = await run(c);
      expect(out).toMatchObject({ status: "FAILED", code: "PROVIDER_UNAVAILABLE", terminal: false });
      expect(out.status === "FAILED" && out.nextAttemptNotBefore).toBeInstanceOf(Date);
      expect((await db.qboConnection.findUniqueOrThrow({ where: { id: c.connectionId } })).status).toBe("ACTIVE");
    });
  });
});
