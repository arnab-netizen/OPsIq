/** Real-Postgres fixtures for the QuickBooks read-only sync tests. */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { resolveQboConfig, type QboEnvironment, type QboProviderConfig } from "@/domain/quickbooks/qbo-config";
import { seedTenant, type Tenant } from "@/__tests__/owner-outcome/outcome-db-fixtures";
import { beginQboAuthorization, consumeQboAuthorizationState, finalizeQboConnection } from "@/services/quickbooks/qbo-connection.service";
import type { QboTokenGrant } from "@/services/quickbooks/qbo-oauth.service";
import type { QboSyncDeps } from "@/services/quickbooks/qbo-sync.service";
import { QboRealmRateLimiter } from "@/services/quickbooks/qbo-rate-limiter";
import { createFakeIntuit, type FakeIntuit } from "./qbo-fake-intuit";

export const QBO_TEST_ENV = (environment: QboEnvironment = "sandbox"): Record<string, string> => ({
  QUICKBOOKS_CLIENT_ID: "cid-test",
  QUICKBOOKS_CLIENT_SECRET: "csecret-DO-NOT-LEAK",
  QUICKBOOKS_REDIRECT_URI: "https://app.example.com/cb",
  QUICKBOOKS_ENVIRONMENT: environment,
});

export function qboConfig(environment: QboEnvironment = "sandbox"): QboProviderConfig {
  const r = resolveQboConfig(QBO_TEST_ENV(environment));
  if (!r.available) throw new Error("config");
  return r.config;
}

/**
 * Scope cleanup of `qbo-read-sync` scheduler tasks to the rows a test FILE created: snapshot the existing ids in beforeAll, delete
 * everything that appeared since in afterAll. (Producers scan every active connection in the database, so a workspace filter alone
 * would leak rows for connections seeded by other files - and an unscoped delete would remove other files' rows.)
 */
export function trackQboTasks(): { snapshot: () => Promise<void>; cleanup: () => Promise<void> } {
  let before = new Set<string>();
  const ids = async (): Promise<string[]> => (await db.scheduledTask.findMany({ where: { taskName: "qbo-read-sync" }, select: { id: true } })).map((r: { id: string }) => r.id);
  return {
    snapshot: async () => { before = new Set(await ids()); },
    cleanup: async () => { await db.scheduledTask.deleteMany({ where: { id: { in: (await ids()).filter((id) => !before.has(id)) } } }).catch(() => undefined); },
  };
}

let realmSeq = 0;
export const nextRealm = () => `9341${String(Date.now()).slice(-7)}${++realmSeq}`;

export const ACCESS_PREFIX = "ACCESS-";
export const REFRESH_PREFIX = "REFRESH-";

export function grantOf(o: { accessInMs?: number; refreshInMs?: number; hardInMs?: number | null; tag?: string } = {}): QboTokenGrant {
  const tag = o.tag ?? randomUUID();
  const now = Date.now();
  return {
    accessToken: `${ACCESS_PREFIX}${tag}`, refreshToken: `${REFRESH_PREFIX}${tag}`, tokenType: "Bearer",
    accessTokenExpiresAt: new Date(now + (o.accessInMs ?? 3_600_000)),
    refreshTokenExpiresAt: new Date(now + (o.refreshInMs ?? 8_000_000_000)),
    refreshTokenHardExpiresAt: o.hardInMs === undefined || o.hardInMs === null ? null : new Date(now + o.hardInMs),
    issuedAt: new Date(now), intuitTid: "tid-seed",
  };
}

export interface ConnectedTenant { t: Tenant; connectionId: string; realmId: string; grant: QboTokenGrant; fake: FakeIntuit }

/** Seed a tenant with an ACTIVE QuickBooks connection (real OAuth persistence path) and a matching fake Intuit. */
export async function seedConnected(o: { environment?: QboEnvironment; realmId?: string; grant?: QboTokenGrant; tenant?: Tenant; businessKey?: "biz" | "bizB"; currency?: string } = {}): Promise<ConnectedTenant> {
  const t = o.tenant ?? (await seedTenant());
  const environment = o.environment ?? "sandbox";
  const realmId = o.realmId ?? nextRealm();
  const grant = o.grant ?? grantOf();
  const businessId = t[o.businessKey ?? "biz"];
  const b = await beginQboAuthorization({ workspaceId: t.ws, actorId: t.actor, businessId, environment }, qboConfig(environment));
  const state = new URL(b.authorizationUrl).searchParams.get("state") as string;
  const c = await consumeQboAuthorizationState({ workspaceId: t.ws, actorId: t.actor, environment, state });
  if (!c.ok) throw new Error(`consume ${c.reason}`);
  const fin = await finalizeQboConnection({ authorization: c.authorization, realmId, grant });
  if (!fin.ok) throw new Error(`finalize ${fin.reason}`);
  return { t, connectionId: fin.connection.id, realmId, grant, fake: createFakeIntuit({ realmId, currency: o.currency }) };
}

/** Permissive limiter + instant sleeps so tests never wait on real back-off. */
export function testDeps(c: ConnectedTenant, extra: Partial<QboSyncDeps> = {}): QboSyncDeps {
  return {
    env: QBO_TEST_ENV("sandbox"),
    fetchImpl: c.fake.fetchImpl,
    limiter: new QboRealmRateLimiter({ perSecond: 10_000, perMinute: 1_000_000, maxConcurrent: 100 }),
    sleep: async () => undefined,
    random: () => 0,
    clientOptions: { timeoutMs: 5_000, maxRetries: 3 },
    manualCooldownMs: 0,
    claimPollMs: 1,
    ...extra,
  };
}

export const scopeOf = (c: ConnectedTenant, businessKey: "biz" | "bizB" = "biz") => ({ workspaceId: c.t.ws, businessId: c.t[businessKey], connectionId: c.connectionId });

export async function countRows(c: ConnectedTenant): Promise<{ records: number; observations: number; runs: number }> {
  const where = { connectionId: c.connectionId, workspaceId: c.t.ws };
  return {
    records: await db.qboSyncedRecord.count({ where }),
    observations: await db.qboReportObservation.count({ where }),
    runs: await db.qboSyncRun.count({ where }),
  };
}
