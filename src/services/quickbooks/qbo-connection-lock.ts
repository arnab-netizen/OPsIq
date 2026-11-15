/**
 * QuickBooks Online — per-connection provider-resource locks (scope "sync" and "refresh").
 *
 * Two different resources, two different protections (independent, tested independently):
 *   - the scheduler's fenced task lease protects a TASK from double execution (src/infra/scheduler.ts);
 *   - this lock protects the PROVIDER RESOURCE — one connection's report synchronisation, one connection's refresh-token
 *     rotation — from overlapping, regardless of which task, webhook or owner click asked for them.
 *
 * Why a lock ROW and not pg_advisory_lock: the application database pool has a single connection (src/lib/db.ts, max: 1) and
 * runs behind a pooler. A lock held by an open transaction would starve every other query of the process (deadlock), and a
 * session lock is not reliable through a pooler. Short critical sections inside ONE statement/transaction (observation
 * identity, canonical period writes) still use transaction-scoped advisory locks, which are safe.
 *
 * Semantics: acquisition is ONE atomic INSERT .. ON CONFLICT DO UPDATE .. WHERE expired statement stamped with the DATABASE
 * clock, so app-server clock skew cannot grant a second holder. The holder renews between units of work (renew()), and a holder
 * that lost the lock (renew() === false) must stop. A crashed holder is not "owed" anything: its lock expires on its own.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

export type QboLockScope = "sync" | "refresh";

type LockClient = Pick<typeof db, "$queryRaw" | "$executeRaw">;

export interface QboLockHandle {
  readonly token: string;
  /** Extend the lease. False = this holder no longer owns the lock and must stop before any further side effect. */
  renew(): Promise<boolean>;
}

export type QboLockResult<T> = { acquired: true; value: T } | { acquired: false };

export interface QboLockOptions {
  /** Lease length; renewed by the holder. */
  ttlMs: number;
  /** 0 = try once (sync). >0 = poll until acquired or this long has passed (refresh). */
  waitMs?: number;
  pollMs?: number;
  client?: LockClient;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function acquireQboLock(
  scope: QboLockScope, workspaceId: string, connectionId: string, ttlMs: number, client: LockClient = db,
): Promise<string | null> {
  const token = randomUUID();
  const rows = await client.$queryRaw<Array<{ holder_token: string }>>`
    INSERT INTO qbo_resource_locks (connection_id, scope, workspace_id, holder_token, acquired_at, expires_at)
    VALUES (${connectionId}::uuid, ${scope}, ${workspaceId}::uuid, ${token}::uuid, now(), now() + (${ttlMs}::double precision * interval '1 millisecond'))
    ON CONFLICT (connection_id, scope) DO UPDATE
      SET holder_token = EXCLUDED.holder_token, workspace_id = EXCLUDED.workspace_id,
          acquired_at = EXCLUDED.acquired_at, expires_at = EXCLUDED.expires_at
      WHERE qbo_resource_locks.expires_at <= now()
    RETURNING holder_token::text AS holder_token`;
  return rows.length === 1 && rows[0].holder_token === token ? token : null;
}

export async function renewQboLock(
  scope: QboLockScope, connectionId: string, token: string, ttlMs: number, client: LockClient = db,
): Promise<boolean> {
  const n = await client.$executeRaw`
    UPDATE qbo_resource_locks
    SET expires_at = now() + (${ttlMs}::double precision * interval '1 millisecond')
    WHERE connection_id = ${connectionId}::uuid AND scope = ${scope} AND holder_token = ${token}::uuid AND expires_at > now()`;
  return n === 1;
}

export async function releaseQboLock(scope: QboLockScope, connectionId: string, token: string, client: LockClient = db): Promise<void> {
  await client.$executeRaw`DELETE FROM qbo_resource_locks WHERE connection_id = ${connectionId}::uuid AND scope = ${scope} AND holder_token = ${token}::uuid`;
}

export async function withQboConnectionLock<T>(
  scope: QboLockScope,
  workspaceId: string,
  connectionId: string,
  fn: (handle: QboLockHandle) => Promise<T>,
  opts: QboLockOptions,
): Promise<QboLockResult<T>> {
  const client = opts.client ?? db;
  const sleep = opts.sleep ?? defaultSleep;
  const deadline = Date.now() + (opts.waitMs ?? 0);
  let token = await acquireQboLock(scope, workspaceId, connectionId, opts.ttlMs, client);
  while (token === null && Date.now() < deadline) {
    await sleep(opts.pollMs ?? 200);
    token = await acquireQboLock(scope, workspaceId, connectionId, opts.ttlMs, client);
  }
  if (token === null) return { acquired: false };
  const held = token;
  try {
    return { acquired: true, value: await fn({ token: held, renew: () => renewQboLock(scope, connectionId, held, opts.ttlMs, client) }) };
  } finally {
    await releaseQboLock(scope, connectionId, held, client).catch(() => undefined);
  }
}
