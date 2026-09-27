import { classifyOperatorError } from "@/lib/operator-error-governance";
import { logger } from "@/infra/logger";
import type { Prisma } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
  prismaPromise: Promise<any> | undefined;
  pgPool: any | undefined;
};

/**
 * Production pg.Pool connectionTimeoutMillis. Exported so callers of
 * withRawStatementTimeout() (and their own outer JS-side races) can derive
 * an accurate bound from the real, single source of truth instead of an
 * independently-chosen constant silently drifting out of sync — the exact
 * failure mode the withStatementTimeout()/TRANSACTION_ACQUIRE_MAX_WAIT_MS
 * pairing above already guards against.
 */
export const POOL_CONNECTION_TIMEOUT_MS = 90_000;

/**
 * Detect if URL is a Neon endpoint (serverless PostgreSQL)
 * Neon endpoints have:
 * - neon.tech or neon.database in hostname
 * - typically include sslmode=require
 */
async function createPrismaClient() {
  const rawUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

  if (!rawUrl) {
    throw new Error(
      "DATABASE_URL or TEST_DATABASE_URL environment variable is not set. " +
      "For production: Set DATABASE_URL=postgresql://user:password@host/dbname"
    );
  }

  // In test/vitest environments with a Neon pooler URL, use the direct endpoint instead.
  // pgbouncer (transaction mode, -pooler suffix) releases the Neon compute connection after every
  // transaction, so Neon's compute can suspend between test queries even with an 8-second keepalive
  // interval firing user.count(). The direct endpoint gives pg.Pool actual persistent TCP connections
  // to Neon compute, so pg.Pool's TCP keepAlive actually prevents suspension between sequential tests.
  const databaseUrl = (process.env.VITEST || process.env.NODE_ENV === "test") && rawUrl.includes("-pooler.")
    ? rawUrl.replace("-pooler.", ".")
    : rawUrl;

  try {
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { createWorkspaceEnforcementMiddleware } = await import("@/lib/prisma-workspace-enforcement");

    // Use standard PostgreSQL adapter for all environments (proven safe path)
    // Works for both local and Neon cloud PostgreSQL
    console.log("[DB] Using @prisma/adapter-pg (standard PostgreSQL)");
    const pg = await import("pg");
    const { PrismaPg } = await import("@prisma/adapter-pg");

    const isTestEnv = !!(process.env.VITEST || process.env.NODE_ENV === "test");
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      // P0-15: no manual `ssl` override. node-postgres/pg-connection-string already
      // parses `sslmode` (and channel_binding) from the connection string itself when
      // `ssl` is left unset. The prior `{ rejectUnauthorized: false }` here actively
      // disabled certificate verification instead of relying on the connection
      // string's own sslmode=require (currently aliased to verify-full semantics) —
      // a real weakening, and unrelated to the connectivity failures this fixes.
      // In test envs, connectionTimeoutMillis=0 (unlimited pool-queue wait) so cold-start
      // connection attempts block until Neon compute is ready. Production keeps 90s.
      connectionTimeoutMillis: isTestEnv ? 0 : POOL_CONNECTION_TIMEOUT_MS,
      // P0-15 (Neon production connectivity root-cause): Prisma's official serverless
      // guidance is connection_limit=1 per function instance, relying on an external
      // pooler (Neon's PgBouncer / pooled endpoint) for fan-in across concurrent
      // instances — the prior max:10 let a single cold instance alone open up to 10
      // direct connections, multiplying instantly under concurrent cold starts and
      // adding connection pressure during Neon's compute-wake window (source of the
      // observed "Authentication timed out" / "Connection terminated unexpectedly"
      // errors). This mirrors the max:1 already proven correct in the test-env branch
      // below, for the identical Neon-suspend reason documented in its own comment.
      max: isTestEnv ? 1 : 1,
      idleTimeoutMillis: isTestEnv ? 300000 : 120000,
      // TCP keepalive: prevents OS/NAT from silently dropping idle connections.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
    // Store pool reference so pingDatabase() can bypass Prisma's $extends() chain.
    globalForPrisma.pgPool = pool;

    // P0-15: keeps this function instance alive long enough for Vercel to drain idle
    // pool connections before the instance suspends, instead of the instance freezing
    // mid-connection and later resuming with a now-dead socket (the documented cause
    // of "Connection terminated unexpectedly" on resume). No-op outside a Vercel
    // function; failure here must never block DB initialization.
    try {
      const { attachDatabasePool } = await import("@vercel/functions");
      attachDatabasePool(pool);
    } catch (error) {
      console.warn("[DB] attachDatabasePool unavailable (non-Vercel runtime?)", String(error));
    }

    const adapter = new PrismaPg(pool);
    const client = new PrismaClient({ adapter });

    // Apply workspace isolation enforcement middleware
    const withEnforcement = client.$extends(createWorkspaceEnforcementMiddleware());

    // Extend client to auto-parse audit event payloads
    return withEnforcement.$extends({
      result: {
        auditEvent: {
          payload: {
            needs: { payload: true },
            compute(event: { payload: string | null }) {
              if (!event.payload) return null;
              if (typeof event.payload === "string") {
                try {
                  return JSON.parse(event.payload);
                } catch {
                  return null;
                }
              }
              return event.payload;
            },
          },
        },
      },
    });
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    throw new Error(
      `Failed to initialize Prisma client: ${governed.operatorMessage}`
    );
  }
}

async function getDb() {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  if (globalForPrisma.prismaPromise) {
    return globalForPrisma.prismaPromise;
  }

  globalForPrisma.prismaPromise = createPrismaClient();
  globalForPrisma.prisma = await globalForPrisma.prismaPromise;
  return globalForPrisma.prisma;
}

let dbInitPromise: Promise<any> | null = null;

export async function getDbInstance() {
  if (!dbInitPromise) {
    dbInitPromise = getDb();
  }
  return dbInitPromise;
}

/**
 * Raw pg.Pool accessor for withRawStatementTimeout() callers. Ensures the
 * pool has been constructed (via getDbInstance(), which also creates the
 * Prisma client that shares this same pool) before returning it — same
 * initialization pattern already used by pingDatabase()/heartbeatPool().
 */
export async function getRawPool() {
  if (!globalForPrisma.pgPool) {
    await getDbInstance();
  }
  return globalForPrisma.pgPool;
}

/**
 * Run `fn` inside a Postgres transaction with a database-enforced
 * statement_timeout, so a query that hangs (e.g. a stalled Neon connection
 * mid-handshake) is actually cancelled server-side instead of merely
 * abandoned client-side by a JS `Promise.race`.
 *
 * P0-15 pool-starvation gap: with `max: 1` in production, the whole app
 * shares exactly one Postgres connection. A `Promise.race([query, timeout])`
 * lets calling code move on after the JS timer fires, but does nothing to
 * the underlying query — Postgres keeps executing it, and the pg.Pool
 * client stays checked out (not released back to the pool) until that query
 * eventually settles on its own, which can mean indefinitely. Every other
 * request needing the sole connection queues behind it. `SET LOCAL
 * statement_timeout` makes Postgres itself cancel the statement after
 * `timeoutMs`: the client receives a real error over the same socket, the
 * query promise settles, and the connection is returned to the pool usable.
 *
 * `SET LOCAL` scopes the timeout to this transaction only — it can never
 * affect any other query on the shared pool, including legitimate
 * long-running business/finance work elsewhere in the app. `timeoutMs` is
 * interpolated directly into the SQL text because Postgres's `SET` command
 * does not accept bind parameters; this is safe only because callers must
 * pass a trusted internal constant, never a value derived from user input.
 *
 * Deliberately opt-in and narrowly used (startup claim, migration
 * readiness, the DB readiness probe, session lookup) — never apply this as
 * a blanket pool-level default.
 *
 * F-PROD-STARTUP-COLDSTART root cause: this function used to call
 * `prisma.$transaction(fn)` with NO options object, so it silently inherited
 * Prisma's own default `maxWait` (2000ms — the time Prisma's client allows to
 * ACQUIRE/begin the transaction, separate from and BEFORE the `statement_timeout`
 * set above ever gets a chance to matter) and default `timeout` (5000ms — the
 * time the transaction body may run once begun). Neon's documented
 * cold-compute-wake tail (median ~1.8s, p95 ~2.6s; this codebase's own prior
 * production evidence cites "several seconds" under a concurrent cold-start
 * burst) routinely exceeds that 2000ms `maxWait`, producing
 * `PrismaClientKnownRequestError` P2028 ("Unable to start a transaction in
 * the given time") — not a connection-pool-starvation or CAS-contention
 * failure, a plain client-side acquisition-window that was too short for the
 * database it talks to. `maxWait` is now explicit and sized for that tail;
 * `timeout` is derived from the caller's own statement_timeout so Prisma's
 * transaction-execution clock can never fire before the Postgres-side
 * statement_timeout above would.
 */
/**
 * Exported so every caller's own outer JS-side race (checkDatabase(),
 * checkMigrationReadiness(), getSession()) can derive a timeout that is
 * guaranteed longer than withStatementTimeout()'s own worst case, instead of
 * an independently-chosen constant silently drifting shorter than this one
 * and re-introducing the exact bug this fix closes (an outer race firing
 * before the inner, Postgres-aware timeout/error path ever gets a chance to).
 */
export const TRANSACTION_ACQUIRE_MAX_WAIT_MS = 10_000;

/**
 * F-PROD-STARTUP-COLDSTART recurrence (production evidence: identical P2028
 * on the same deployment ~25min after deploy AND again ~6h later mid-steady
 * once-per-minute traffic — a pattern the original "Neon cold-wake tail"
 * explanation cannot account for on its own). Reproduced locally with real
 * Postgres and NO Neon dependency: src/__tests__/lib/
 * startup-coldstart-pool-contention-hostile.db.test.ts.
 *
 * Root cause: production's pg.Pool is `max: 1`, and at least four call
 * sites (claimStartup(), checkDatabase(), checkMigrationReadiness(),
 * getSession()) each independently call withStatementTimeout() ->
 * prisma.$transaction({maxWait}). Prisma's maxWait clock starts the instant
 * $transaction() is invoked and keeps ticking while queued for the pool's
 * sole physical connection — it does not pause or reset. Two callers in the
 * same process can genuinely race (e.g. instrumentation.ts's non-blocking
 * register() -> ensureStartupComplete() -> claimStartup() against the very
 * first real request's own getSession() call on a freshly-booted instance).
 * When the first caller's connection hold time exceeds the second caller's
 * REMAINING maxWait budget, the second fails with P2028 — even though the
 * database itself is fully awake and healthy throughout, and even though no
 * single query involved is slow.
 *
 * Fix: serialize interactive-transaction ACQUISITION attempts within this
 * process with a bounded FIFO queue. A caller that arrives while another is
 * still acquiring/running waits for its turn instead of silently burning
 * down its own maxWait clock behind a caller it doesn't know about. Once
 * free, the waiting caller starts its OWN full, fresh 10s maxWait window
 * against a pool connection that is now actually likely to be free.
 * `maxWait` itself is deliberately left untouched — per the recurrence
 * investigation, increasing it further is prohibited absent proof that
 * acquisition latency itself (not queuing) is the limiting factor, and this
 * fix targets queuing specifically, not acquisition latency.
 *
 * PRE-MERGE HOSTILE CORRECTION: the queue wait itself must be bounded, not
 * an unbounded in-memory promise wait — an unbounded wait would convert a
 * finite Prisma P2028 acquisition failure into unbounded application-level
 * head-of-line blocking, which is strictly worse and violates
 * FINITE_FAILURE_BOUND. ACQUISITION_QUEUE_WAIT_MS bounds how long a caller
 * may wait for its TURN before it even attempts acquisition; a caller that
 * exceeds this throws AcquisitionQueueTimeoutError immediately rather than
 * waiting indefinitely. Cancellation is safe: a timed-out waiter does NOT
 * later acquire the mutex and run its work once its turn eventually
 * arrives — see the `abandoned` handling below, which releases the turn to
 * the next queued caller without ever invoking `fn`. This guarantees the
 * queue can never deadlock on an abandoned slot, and a caller that has
 * already reported failure to its own caller can never silently produce a
 * late, unexpected side effect.
 *
 * This is process-local by design, matching the process-local scope of the
 * `pg.Pool` it protects: it does nothing for cross-instance contention
 * (each Vercel instance owns its own pool), which is correct because
 * cross-instance callers never share this pool's sole connection in the
 * first place.
 */

/**
 * Bound on how long a caller may wait for its TURN in the process-local
 * acquisition queue before its own acquisition attempt even begins.
 * Deliberately reuses TRANSACTION_ACQUIRE_MAX_WAIT_MS rather than
 * introducing a second, independently-tunable magic number: a caller that
 * cannot even reach the front of the queue within this window has no
 * realistic chance of then also completing a fresh maxWait+timeout cycle
 * within any reasonable caller-side budget, so failing fast here (with an
 * explicit, typed error) is strictly better than letting it wait the full
 * window for nothing.
 *
 * Every caller's OWN finite end-to-end worst case is therefore:
 *   ACQUISITION_QUEUE_WAIT_MS + TRANSACTION_ACQUIRE_MAX_WAIT_MS + txnTimeout
 * where txnTimeout is the `timeout` this function passes to $transaction()
 * (Math.max(safeTimeoutMs + 2_000, 5_000) below). Any outer JS-side race a
 * caller adds on top of withStatementTimeout() must exceed this sum.
 * (F-PROD-STARTUP-COLDSTART second-mechanism forensic: claimStartup(),
 * checkDatabase(), checkMigrationReadiness(), and getSession() have since
 * migrated off withStatementTimeout() entirely, onto withRawStatementTimeout()
 * below — their own outer races now derive from POOL_CONNECTION_TIMEOUT_MS
 * instead. This constant and its formula remain live for any future caller
 * that still needs Prisma interactive-transaction semantics.)
 */
export const ACQUISITION_QUEUE_WAIT_MS = TRANSACTION_ACQUIRE_MAX_WAIT_MS;

/**
 * Thrown when a caller could not even reach the front of the process-local
 * acquisition queue within ACQUISITION_QUEUE_WAIT_MS. Distinct from Prisma's
 * own P2028 ("Unable to start a transaction in the given time"): this error
 * means the caller never got as far as attempting acquisition against the
 * pool at all — it was still waiting behind other same-process callers.
 * Callers must treat this exactly like any other withStatementTimeout()
 * failure (fail closed) — none of the current call sites special-case it,
 * matching every other unclassified failure already handled that way (see
 * claimStartup()'s catch-all, getSession()'s catch, checkDatabase()'s
 * catch).
 */
export class AcquisitionQueueTimeoutError extends Error {
  constructor(waitedMs: number, queueDepthAtEnqueue: number) {
    super(
      `withStatementTimeout: timed out after ${waitedMs}ms waiting for the process-local ` +
      `acquisition queue (bound=${ACQUISITION_QUEUE_WAIT_MS}ms, queueDepthAtEnqueue=${queueDepthAtEnqueue}). ` +
      `The pool's sole connection was occupied by another caller in this process for longer ` +
      `than this bound allows.`
    );
    this.name = "AcquisitionQueueTimeoutError";
  }
}

interface QueueNode {
  /** Resolves once all queue entries ahead of this one have released. */
  turn: Promise<void>;
  /** Hands off to the next queued entry. Must be called exactly once. */
  release: () => void;
}

let acquisitionQueueTail: Promise<void> = Promise.resolve();
let acquisitionQueueDepth = 0;

function enqueueAcquisition(): QueueNode {
  let release: () => void;
  const settled = new Promise<void>((resolve) => {
    release = resolve;
  });
  const turn = acquisitionQueueTail;
  acquisitionQueueTail = acquisitionQueueTail.then(() => settled);
  return { turn, release: release! };
}

export async function withStatementTimeout<T>(
  prisma: { $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number }) => Promise<T> },
  timeoutMs: number,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  label = "unlabeled"
): Promise<T> {
  const safeTimeoutMs = Math.trunc(timeoutMs);
  if (!Number.isFinite(safeTimeoutMs) || safeTimeoutMs <= 0) {
    throw new Error(`withStatementTimeout: timeoutMs must be a positive finite number, got ${timeoutMs}`);
  }

  const queueDepthAtEnqueue = ++acquisitionQueueDepth;
  const node = enqueueAcquisition();
  const enqueuedAt = Date.now();

  let queueTimer: ReturnType<typeof setTimeout> | undefined;
  const queueTimeout = new Promise<never>((_, reject) => {
    queueTimer = setTimeout(() => {
      reject(new AcquisitionQueueTimeoutError(Date.now() - enqueuedAt, queueDepthAtEnqueue));
    }, ACQUISITION_QUEUE_WAIT_MS);
  });

  try {
    await Promise.race([node.turn, queueTimeout]);
  } catch (err) {
    // Abandon this slot WITHOUT ever running `fn`. `node.turn` will still
    // resolve on its own schedule once every entry ahead of us releases
    // (every entry's release() always fires, success or failure — see the
    // finally block below and this same catch for the abandonment path
    // itself) — attach a pass-through continuation so we release OUR slot
    // the moment it becomes ours, letting whoever is queued behind us
    // proceed. We never call `fn` here: a caller that has already been
    // told it failed must never silently produce a late side effect.
    void node.turn.then(node.release, node.release);
    acquisitionQueueDepth--;
    clearTimeout(queueTimer);
    logger.warn("[db] withStatementTimeout acquisition-queue timeout", {
      label,
      waitedMs: Date.now() - enqueuedAt,
      queueDepthAtEnqueue,
      boundMs: ACQUISITION_QUEUE_WAIT_MS,
    });
    throw err;
  }
  clearTimeout(queueTimer);
  acquisitionQueueDepth--;
  const acquiredAt = Date.now();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${safeTimeoutMs}`);
        return fn(tx);
      },
      {
        maxWait: TRANSACTION_ACQUIRE_MAX_WAIT_MS,
        timeout: Math.max(safeTimeoutMs + 2_000, 5_000),
      }
    );
    logger.debug("[db] withStatementTimeout completed", {
      label,
      queueDepthAtEnqueue,
      queueWaitMs: acquiredAt - enqueuedAt,
      transactionMs: Date.now() - acquiredAt,
      outcome: "success",
    });
    return result;
  } catch (err) {
    logger.debug("[db] withStatementTimeout completed", {
      label,
      queueDepthAtEnqueue,
      queueWaitMs: acquiredAt - enqueuedAt,
      transactionMs: Date.now() - acquiredAt,
      outcome: "error",
      errorName: err instanceof Error ? err.name : typeof err,
    });
    throw err;
  } finally {
    node.release();
  }
}

/**
 * F-PROD-STARTUP-COLDSTART second-mechanism forensic (production evidence:
 * a P2028 recurrence on the merged PR #322 deployment with NO
 * AcquisitionQueueTimeoutError anywhere in the logs — i.e. not a
 * same-process queuing case at all — on a deployment whose raw logs show
 * every ~60s poll re-triggering a brand-new pg.Pool). Reproduced directly:
 * src/__tests__/lib/fresh-connection-acquisition-hostile.db.test.ts proves
 * that prisma.$transaction({maxWait: 10_000}) races its own maxWait clock
 * against the FIRST-EVER physical connection attempt on a fresh pool,
 * completely independent of whether that connection would have succeeded
 * well within the pool's own much longer connectionTimeoutMillis (90s in
 * production). A fresh pool whose first connection takes anywhere from 10s
 * to 90s — plausible under ordinary network/TLS/auth latency, unrelated to
 * same-process contention or Neon compute-wake — always produces P2028
 * through that path, even though the connection itself was never actually
 * going to fail.
 *
 * withStatementTimeout() only needs an interactive transaction to run `SET
 * LOCAL statement_timeout` before the real query — none of its current
 * callers (claimStartup, checkDatabase, checkMigrationReadiness) need
 * actual multi-statement transactional semantics; each is already a single
 * atomic statement (see the per-caller audit in the F-PROD-STARTUP-
 * COLDSTART second-mechanism forensic report). This function runs `fn`
 * against a single checked-out raw pg client with a bounded SESSION-level
 * statement_timeout instead — connection ACQUISITION is now bounded only
 * by the pool's own connectionTimeoutMillis (a pre-existing, unchanged
 * setting; this is not "raising maxWait", it is removing dependence on
 * Prisma's separate, narrower acquisition-race mechanism entirely for
 * these call sites), and query EXECUTION is still bounded by a genuine
 * Postgres-side statement_timeout exactly as before.
 *
 * Client release is failure-aware: a Postgres statement_timeout
 * cancellation (SQLSTATE 57014) leaves the SESSION itself healthy (no
 * explicit BEGIN was ever issued, so there is no aborted transaction to
 * roll back) — the timeout is reset and the client is safely returned to
 * the pool for reuse, which matters under production's max:1 pool where
 * discarding a still-healthy connection would force the next caller to pay
 * a full fresh-connection cost (the exact failure mode this function
 * exists to avoid) for no reason. Any OTHER error is treated as
 * potentially leaving the connection in an unknown state and the client is
 * released with the error, telling pg.Pool to discard rather than reuse it.
 */
const POSTGRES_QUERY_CANCELED_SQLSTATE = "57014";

export interface RawQueryClient {
  query: <T = unknown>(text: string, values?: readonly unknown[]) => Promise<{ rows: T[] }>;
}

export async function withRawStatementTimeout<T>(
  pool: { connect: () => Promise<RawQueryClient & { release: (err?: Error) => void }> },
  timeoutMs: number,
  fn: (client: RawQueryClient) => Promise<T>,
  label = "unlabeled"
): Promise<T> {
  const safeTimeoutMs = Math.trunc(timeoutMs);
  if (!Number.isFinite(safeTimeoutMs) || safeTimeoutMs <= 0) {
    throw new Error(`withRawStatementTimeout: timeoutMs must be a positive finite number, got ${timeoutMs}`);
  }

  const acquireStart = Date.now();
  const client = await pool.connect();
  const acquiredAt = Date.now();

  try {
    await client.query(`SET statement_timeout = ${safeTimeoutMs}`);
    const result = await fn(client);
    await client.query(`SET statement_timeout = DEFAULT`);
    client.release();
    logger.debug("[db] withRawStatementTimeout completed", {
      label,
      acquireMs: acquiredAt - acquireStart,
      executionMs: Date.now() - acquiredAt,
      outcome: "success",
    });
    return result;
  } catch (err) {
    const sqlState = (err as { code?: unknown } | null)?.code;
    const isQueryCancellation = sqlState === POSTGRES_QUERY_CANCELED_SQLSTATE;
    const errorObj = err instanceof Error ? err : new Error(String(err));

    if (isQueryCancellation) {
      try {
        await client.query(`SET statement_timeout = DEFAULT`);
        client.release();
      } catch {
        // Reset itself failed on a client we already know is in a
        // questionable state -- discard rather than risk returning a
        // poisoned connection to the shared pool.
        client.release(errorObj);
      }
    } else {
      // Connection-level or otherwise unclassified failure -- the
      // session's state is not trustworthy; discard so pg.Pool
      // establishes a fresh connection for the next caller instead of
      // reusing a possibly-broken one.
      client.release(errorObj);
    }

    logger.debug("[db] withRawStatementTimeout completed", {
      label,
      acquireMs: acquiredAt - acquireStart,
      executionMs: Date.now() - acquiredAt,
      outcome: "error",
      errorName: errorObj.name,
      wasQueryCancellation: isQueryCancellation,
    });
    throw errorObj;
  }
}

/**
 * Connectivity ping using a dedicated temporary pg.Client — completely separate
 * from Prisma's pg.Pool. This prevents the keepalive/beforeEach pings from
 * competing with Prisma queries for pool slots (critical with max:1 in test envs,
 * where a hung pool.connect() in a keepalive would deadlock Prisma transactions).
 *
 * Each attempt is bounded by timeoutMs (default 90s). On timeout the temporary
 * client is forcibly ended so it doesn't leak as an orphaned TCP connection.
 */
export async function pingDatabase(timeoutMs = 90000): Promise<void> {
  // Ensure the Prisma pool is initialised (for subsequent Prisma queries)
  if (!globalForPrisma.pgPool) {
    await getDbInstance();
  }

  const rawUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "";
  const dbUrl =
    (process.env.VITEST || process.env.NODE_ENV === "test") && rawUrl.includes("-pooler.")
      ? rawUrl.replace("-pooler.", ".")
      : rawUrl;

  const pg = await import("pg");
  const ssl = dbUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined;
  const deadline = Date.now() + timeoutMs;

  // Retry loop: each attempt is capped at PER_ATTEMPT_MS via Promise.race.
  // pg.Client has no connectionTimeoutMillis option (that is pool-only); the race
  // timer is the only reliable per-attempt cap. At 6s/attempt + 500ms gap a 30-min
  // budget yields ~295 attempts vs ~13 with the OS-default 135s TCP SYN timeout.
  // When Neon compute becomes ready, connect() takes <1s, so no penalty on the
  // happy path.
  const PER_ATTEMPT_MS = 6000;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`pingDatabase timeout after ${timeoutMs}ms`);

    const client = new pg.Client({ connectionString: dbUrl, ssl });
    let success = false;
    try {
      await Promise.race([
        (async () => {
          await client.connect();
          await client.query("SELECT 1");
        })(),
        new Promise<never>((_, reject) => {
          const t = setTimeout(
            () => reject(new Error("attempt timeout")),
            Math.min(PER_ATTEMPT_MS, remaining)
          );
          if (typeof t === "object" && t.unref) t.unref();
        }),
      ]);
      success = true;
    } catch {
      // attempt failed — will retry after cleanup
    } finally {
      client.end().catch(() => {});
    }

    if (success) return;
    if (Date.now() + 500 < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

/**
 * Direct pool heartbeat — bypasses Prisma's client/proxy layer entirely.
 * Sends SELECT 1 through the raw pg.Pool so the pool's connection is marked
 * "recently used" and idleTimeoutMillis never fires. Also keeps Neon compute
 * alive since a real query flows over the pool's TCP connection.
 *
 * Safe to call in setInterval: silently no-ops if the pool isn't ready yet.
 */
export async function heartbeatPool(): Promise<void> {
  if (!globalForPrisma.pgPool) return;
  await (globalForPrisma.pgPool as any).query("SELECT 1");
}

// NOTE: Removed auto-initialization on module load
// Reason: This was causing issues when db.ts is imported in Edge Runtime (middleware context)
// Auto-initialization now happens explicitly in app startup (see src/app/route.ts or startup sequence)
// This allows middleware to import db.ts without triggering Prisma initialization

// Export db as a lazy-loading proxy that auto-initializes on first access
export const db = new Proxy({} as any, {
  get(target, prop) {
    // If already initialized, return immediately (fast path)
    if (globalForPrisma.prisma) {
      return Reflect.get(globalForPrisma.prisma, prop);
    }

    // Ensure initialization is in progress (auto-start if needed)
    if (!globalForPrisma.prismaPromise) {
      const init = getDb();
      // This auto-start is fire-and-forget: a property access alone (e.g. `db.user`) never awaits it.
      // If initialization fails and no caller has awaited yet, the rejection must not surface as an
      // unhandled rejection; every deferred method below still receives it through its own `.then`.
      init.catch(() => undefined);
      globalForPrisma.prismaPromise = init;
    }

    // Prisma's own top-level client methods ($queryRaw, $queryRawUnsafe,
    // $executeRaw, $executeRawUnsafe, $transaction, $connect, $disconnect,
    // $extends, $on, $use, ...) are always `$`-prefixed by convention — this
    // is how Prisma itself avoids colliding with model delegate names (user,
    // startupStatus, ...), and is stable across the whole Prisma Client API
    // surface. A caller invoking one of these directly on a cold instance
    // (e.g. db.$queryRaw`...`) needs a callable FUNCTION back, not a
    // further-nested proxy: returning the two-level deferred-model proxy
    // below for a one-level access made the caller's own invocation
    // (`db.$queryRaw` used as a tag function) throw "is not a function"
    // before any SQL was ever sent — the P0-15 cold-proxy regression
    // (see src/services/startup-status.ts claimStartup(), the first caller
    // to hit this). Detecting the `$` prefix and returning a directly
    // callable deferred function closes this for every one-level call site
    // project-wide, not just the one that happened to be discovered first.
    if (typeof prop === "string" && prop.startsWith("$")) {
      return function deferredTopLevelMethod(...args: any[]) {
        return globalForPrisma.prismaPromise!.then(prisma => {
          const method = Reflect.get(prisma, prop);
          if (typeof method === "function") {
            return method.apply(prisma, args);
          }
          return method;
        });
      };
    }

    // Return a proxy for this property that defers to the actual model once ready
    // This allows db.user.findUnique(...) to work even if DB isn't initialized yet
    return new Proxy({}, {
      get(modelTarget, modelProp) {
        // When accessing a method on the model (like findUnique), return a deferred function
        return function deferredMethod(...args: any[]) {
          return globalForPrisma.prismaPromise!.then(prisma => {
            const model = Reflect.get(prisma, prop);
            const method = Reflect.get(model, modelProp);
            if (typeof method === 'function') {
              return method.apply(model, args);
            }
            return method;
          });
        };
      },
    });
  },
});

