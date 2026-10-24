/** QuickBooks owner status, disconnect (with revocation), reconnect — real PostgreSQL, fake Intuit. */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { runQboProducerForTest } from "@/__tests__/test-helpers/qbo-task-cleanup";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { cfg, connectQbo, envFor, grant, makeFakeIntuit, monthKeys, seedQboTenant, type MonthBooks } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { getQboOwnerStatus } from "@/services/quickbooks/qbo-status.service";
import { disconnectQuickBooks } from "@/services/quickbooks/qbo-lifecycle.service";
import { runQboSync } from "@/services/quickbooks/qbo-sync.service";
import { markQboReauthorizationRequired } from "@/services/quickbooks/qbo-connection.service";
import { amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { enqueueDueQboSyncTasks, qboSyncKey } from "@/services/quickbooks/qbo-sync-scheduling";

const books = (n: number): MonthBooks => ({ income: 10_000 + n, cogs: 4_000, bank: 20_000, arTotal: 7_000, arCurrent: 5_000, apTotal: 2_500, apCurrent: 2_500 });
const allMonths = () => Object.fromEntries(monthKeys(12).map((k, i) => [k, books(i)]));
const env = envFor("production");
const status = (t: { ws: string; biz: string }, now?: Date) => getQboOwnerStatus({ workspaceId: t.ws, businessId: t.biz }, { env, now: now ? () => now : undefined });
const sync = (t: { ws: string }, connectionId: string, f = makeFakeIntuit(allMonths())) => runQboSync({ workspaceId: t.ws, connectionId, trigger: "SCHEDULED" }, { env, readClientFactory: () => f.reader });
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO owner status (real Postgres)", () => {
  it("walks the truthful lifecycle: not connected -> connecting -> importing -> connected -> stale -> error -> reauth -> disconnected", async () => {
    const t = await seedQboTenant();
    expect(await status(t)).toMatchObject({ available: true, environment: "production", state: "NOT_CONNECTED", freshness: "NEVER", companyName: null, actions: { connect: true, disconnect: false } });
    const { connectionId } = await connectQbo(t);
    expect(await status(t)).toMatchObject({ state: "CONNECTING", actions: { connect: false, disconnect: true, refresh: false } });
    await sync(t, connectionId);
    const importing = await status(t);
    expect(importing).toMatchObject({ state: "IMPORTING", companyName: "Fake Co", monthsRemaining: 9 });
    for (let i = 0; i < 3; i++) await sync(t, connectionId);
    const ok = await status(t);
    expect(ok).toMatchObject({ state: "CONNECTED", freshness: "FRESH", failure: null, staleNotice: null, accountingBasis: "ACCRUAL", actions: { refresh: true } });
    expect(ok.lastSuccessAt).not.toBeNull();
    expect(ok.periods.filter((p) => p.finance === "QUICKBOOKS")).toHaveLength(12);

    const later = new Date(Date.now() + 48 * 3_600_000);
    expect(await status(t, later)).toMatchObject({ state: "STALE", freshness: "STALE" });
    expect((await status(t, later)).staleNotice).toMatch(/last refreshed/);

    const bad = makeFakeIntuit(allMonths());
    bad.failNext.push(new (await import("@/domain/quickbooks/qbo-errors")).QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE" }));
    await expect(sync(t, connectionId, bad)).rejects.toBeDefined();
    const err = await status(t);
    expect(err.state).toBe("SYNC_ERROR");
    expect(err.failure).toMatch(/try again automatically/);

    await markQboReauthorizationRequired({ workspaceId: t.ws, connectionId, reasonCode: "TOKEN_REJECTED" });
    expect(await status(t)).toMatchObject({ state: "REAUTH_REQUIRED", actions: { reconnect: true, connect: false, refresh: false } });

    await db.qboConnection.update({ where: { id: connectionId }, data: { status: "ACTIVE", reauthRequiredAt: null } });
    await disconnectQuickBooks({ workspaceId: t.ws, businessId: t.biz, actorId: t.actor }, { env, fetchImpl: (async () => new Response("{}", { status: 200 })) as never });
    expect(await status(t)).toMatchObject({ state: "DISCONNECTED", actions: { connect: true, disconnect: false } });
  });

  it("shows QuickBooks vs Manually entered per period, and flips to Manual when the owner amends", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    for (let i = 0; i < 4; i++) await sync(t, connectionId);
    const k = monthKeys(12)[0];
    let s = await status(t);
    expect(s.periods[0]).toMatchObject({ periodStart: k, finance: "QUICKBOOKS", cashflow: "QUICKBOOKS" });
    const row = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k), supersededById: null } });
    await amendFinancialSnapshot(row.id, { amendmentReason: "mine", revenue: 1 }, t.actor, t.ws);
    s = await status(t);
    expect(s.periods[0].finance).toBe("MANUAL");
    expect(s.periods[1].finance).toBe("QUICKBOOKS");
  });

  it("never exposes tokens, ciphertext, realm ids, provider bodies or ids of other tenants", async () => {
    const t = await seedQboTenant();
    const g = grant();
    const { connectionId, realmId } = await connectQbo(t, "production", undefined, g);
    await sync(t, connectionId);
    const dump = JSON.stringify(await status(t));
    for (const secret of [g.accessToken, g.refreshToken, "v1gcm", realmId, connectionId, "csecret", t.ws]) expect(dump).not.toContain(secret);
  });

  it("a business outside the workspace is a uniform NotFound; unconfigured deployment says unavailable and offers no Connect", async () => {
    const a = await seedQboTenant(); const b = await seedQboTenant();
    await expect(getQboOwnerStatus({ workspaceId: a.ws, businessId: b.biz }, { env })).rejects.toMatchObject({ name: "NotFoundError" });
    const s = await getQboOwnerStatus({ workspaceId: a.ws, businessId: a.biz }, { env: {} });
    expect(s).toMatchObject({ available: false, environment: null, state: "NOT_CONNECTED", actions: { connect: false } });
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO disconnect / reconnect (real Postgres)", () => {
  const ok = () => (async () => new Response("{}", { status: 200 })) as never;

  it("disconnect revokes the refresh token at Intuit, invalidates local credentials, ends scheduling, keeps history, audits", async () => {
    const t = await seedQboTenant();
    const g = grant();
    const { connectionId } = await connectQbo(t, "production", undefined, g);
    for (let i = 0; i < 4; i++) await sync(t, connectionId);
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => { calls.push({ url, body: String(init?.body) }); return new Response("{}", { status: 200 }); }) as never;
    const r = await disconnectQuickBooks({ workspaceId: t.ws, businessId: t.biz, actorId: t.actor }, { env, fetchImpl });
    expect(r).toEqual({ changed: true, revocation: "REVOKED" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(cfg().revokeUrl);
    expect(JSON.parse(calls[0].body)).toEqual({ token: g.refreshToken });
    const conn = await db.qboConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(conn.status).toBe("DISCONNECTED");
    expect(await db.qboConnectionToken.count({ where: { connectionId } })).toBe(0);
    // history preserved
    expect(await db.qboReportSnapshot.count({ where: { connectionId } })).toBe(48);
    expect(await db.qboCanonicalProvenance.count({ where: { connectionId } })).toBe(24);
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(12);
    // not schedulable, not syncable
    const now = new Date(Date.now() + 86_400_000);
    await runQboProducerForTest(() => enqueueDueQboSyncTasks(now));
    expect(await db.scheduledTask.count({ where: { idempotencyKey: qboSyncKey(connectionId, "daily", now) } })).toBe(0);
    expect(await sync(t, connectionId)).toEqual({ status: "SKIPPED", reason: "NOT_ACTIVE" });
    expect(await db.auditEvent.count({ where: { workspaceId: t.ws, eventName: "qbo.connection_disconnected" } })).toBe(1);
    // idempotent
    expect(await disconnectQuickBooks({ workspaceId: t.ws, businessId: t.biz, actorId: t.actor }, { env, fetchImpl: ok() })).toEqual({ changed: false, revocation: "SKIPPED" });
  });

  it("revocation failure is reported and audited but the local disconnect still happens; an already-invalid token is reported as such", async () => {
    const t = await seedQboTenant(); const u = await seedQboTenant();
    const a = await connectQbo(t); const b = await connectQbo(u);
    const r1 = await disconnectQuickBooks({ workspaceId: t.ws, businessId: t.biz, actorId: t.actor }, { env, fetchImpl: (async () => new Response("{}", { status: 503 })) as never });
    expect(r1).toEqual({ changed: true, revocation: "FAILED" });
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: a.connectionId } })).status).toBe("DISCONNECTED");
    expect(await db.auditEvent.count({ where: { workspaceId: t.ws, eventName: "qbo.revocation_failed" } })).toBe(1);
    const r2 = await disconnectQuickBooks({ workspaceId: u.ws, businessId: u.biz, actorId: u.actor }, { env, fetchImpl: (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as never });
    expect(r2.revocation).toBe("ALREADY_INVALID");
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: b.connectionId } })).status).toBe("DISCONNECTED");
  });

  it("business scoping: another workspace's business cannot be disconnected; nothing connected => NotFound", async () => {
    const a = await seedQboTenant(); const b = await seedQboTenant();
    const cb = await connectQbo(b);
    await expect(disconnectQuickBooks({ workspaceId: a.ws, businessId: b.biz, actorId: a.actor }, { env, fetchImpl: ok() })).rejects.toMatchObject({ name: "NotFoundError" });
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: cb.connectionId } })).status).toBe("ACTIVE");
    await expect(disconnectQuickBooks({ workspaceId: a.ws, businessId: a.biz, actorId: a.actor }, { env, fetchImpl: ok() })).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("reconnect SAME company: same connection row reactivated, no duplicate live connection, history continues, sync resumes", async () => {
    const t = await seedQboTenant();
    const first = await connectQbo(t);
    for (let i = 0; i < 4; i++) await sync(t, first.connectionId);
    await disconnectQuickBooks({ workspaceId: t.ws, businessId: t.biz, actorId: t.actor }, { env, fetchImpl: ok() });
    const again = await connectQbo(t, "production", first.realmId);
    expect(again.connectionId).toBe(first.connectionId);
    const conn = await db.qboConnection.findUniqueOrThrow({ where: { id: first.connectionId } });
    expect(conn).toMatchObject({ status: "ACTIVE", disconnectedAt: null });
    expect(await db.qboConnection.count({ where: { workspaceId: t.ws, businessId: t.biz, status: { not: "DISCONNECTED" } } })).toBe(1);
    expect(await db.qboConnectionToken.count({ where: { connectionId: first.connectionId } })).toBe(1);
    // the baseline already completed: the next run is a REFRESH, and QBO-controlled months stay QBO-controlled (same realm)
    const f = makeFakeIntuit({ ...allMonths(), [monthKeys(12)[0]]: { ...books(0), income: 11_111 } });
    const o = await sync(t, first.connectionId, f);
    expect(o.status === "SYNCED" && o.kind).toBe("REFRESH");
    expect(o.status === "SYNCED" && o.counts.canonicalAmended).toBe(1);
    expect(await status(t)).toMatchObject({ state: "CONNECTED" });
  });

  it("reconnect DIFFERENT company: refused while the first is live; after disconnect it gets its own row and never re-binds old evidence", async () => {
    const t = await seedQboTenant();
    const first = await connectQbo(t);
    await expect(connectQbo(t)).rejects.toThrow(/BUSINESS_BOUND_TO_OTHER_REALM/);
    await disconnectQuickBooks({ workspaceId: t.ws, businessId: t.biz, actorId: t.actor }, { env, fetchImpl: ok() });
    const second = await connectQbo(t);
    expect(second.connectionId).not.toBe(first.connectionId);
    expect(second.realmId).not.toBe(first.realmId);
    const rows = await db.qboConnection.findMany({ where: { workspaceId: t.ws, businessId: t.biz }, select: { realmId: true, status: true } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === "ACTIVE")).toHaveLength(1);
  });

  it("reauthorization then reconnect of the same company restores ACTIVE without losing history", async () => {
    const t = await seedQboTenant();
    const first = await connectQbo(t);
    await sync(t, first.connectionId);
    await markQboReauthorizationRequired({ workspaceId: t.ws, connectionId: first.connectionId, reasonCode: "TOKEN_REJECTED" });
    const again = await connectQbo(t, "production", first.realmId);
    expect(again.connectionId).toBe(first.connectionId);
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: first.connectionId } })).status).toBe("ACTIVE");
    expect(await db.qboReportSnapshot.count({ where: { connectionId: first.connectionId } })).toBeGreaterThan(0);
    expect(randomUUID()).toBeTruthy();
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO admin health (aggregate only)", () => {
  it("counts connection states, failing/stale/never-synced and failure causes — and exposes no identifiers or secrets", async () => {
    const { getQboAdminHealth } = await import("@/services/quickbooks/qbo-admin-health.service");
    const before = await getQboAdminHealth();
    const t = await seedQboTenant(); const u = await seedQboTenant(); const w = await seedQboTenant();
    const a = await connectQbo(t); const b = await connectQbo(u); await connectQbo(w);
    await sync(t, a.connectionId);
    const bad = makeFakeIntuit(allMonths());
    bad.failNext.push(new (await import("@/domain/quickbooks/qbo-errors")).QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE" }));
    await expect(sync(u, b.connectionId, bad)).rejects.toBeDefined();
    await db.qboSyncState.update({ where: { connectionId: a.connectionId }, data: { lastSuccessAt: new Date(Date.now() - 72 * 3_600_000) } });
    const after = await getQboAdminHealth();
    expect(after.connections.active - before.connections.active).toBeGreaterThanOrEqual(3); // other suites share this database
    expect(after.activeHealth.failing - before.activeHealth.failing).toBeGreaterThanOrEqual(1);
    expect(after.activeHealth.stale - before.activeHealth.stale).toBeGreaterThanOrEqual(1);
    expect(after.activeHealth.neverSynced - before.activeHealth.neverSynced).toBeGreaterThanOrEqual(2);
    expect((after.lastFailureCodes.TRANSIENT_PROVIDER_FAILURE ?? 0) - (before.lastFailureCodes.TRANSIENT_PROVIDER_FAILURE ?? 0)).toBeGreaterThanOrEqual(1);
    const dump = JSON.stringify(after);
    for (const secret of [t.ws, u.ws, a.connectionId, a.realmId, "v1gcm", "ACCESS-", "REFRESH-"]) expect(dump).not.toContain(secret);
  });

  describe("Sandbox / test-business isolation is explained, not just enforced", () => {
    const statusIn = (t: { ws: string; biz: string }, environment: "sandbox" | "production") =>
      getQboOwnerStatus({ workspaceId: t.ws, businessId: t.biz }, { env: envFor(environment) });

    it("a Sandbox deployment does not offer Connect for a real business and says why", async () => {
      const real = await seedQboTenant();
      const s = await statusIn(real, "sandbox");
      expect(s.actions.connect).toBe(false);
      expect(s.connectBlockedReason).toMatch(/test business/i);
    });

    it("a Sandbox deployment offers Connect for a test business; a production deployment does not (and says why)", async () => {
      const fx = await seedQboTenant({ fixture: true });
      expect((await statusIn(fx, "sandbox")).actions.connect).toBe(true);
      expect((await statusIn(fx, "sandbox")).connectBlockedReason).toBeNull();
      const prodOnTest = await statusIn(fx, "production");
      expect(prodOnTest.actions.connect).toBe(false);
      expect(prodOnTest.connectBlockedReason).toMatch(/sandbox/i);
      const real = await seedQboTenant();
      expect((await statusIn(real, "production")).actions.connect).toBe(true);
    });
  });
});
