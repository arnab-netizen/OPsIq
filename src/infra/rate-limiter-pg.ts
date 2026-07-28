/**
 * S7-DC11: PostgreSQL-backed distributed rate limiter.
 *
 * Solves the serverless split-brain problem: in-memory token buckets are
 * instance-local and do not communicate. On Vercel, each cold-start creates
 * an independent bucket, so 10 concurrent instances each see a "full" bucket
 * and the effective limit is 10× the configured value.
 *
 * This implementation persists bucket state in PostgreSQL using an atomic
 * INSERT … ON CONFLICT DO UPDATE that reads and writes in a single statement,
 * guaranteeing serialized token consumption without application-level locks.
 *
 * Guarantees:
 *   - Shared state across all serverless instances (one row per bucket key)
 *   - Atomic token check-and-decrement (no TOCTOU race)
 *   - Refill is computed from elapsed real time (continuous token bucket)
 *   - Fail-open on DB error: if PostgreSQL is unreachable, the call is ALLOWED
 *     and the error is logged (prefer availability over hard lockout)
 *
 * Fail-open rationale:
 *   Rate limiting is a best-effort protection, not a security gate. If the DB
 *   is down the owner session is also likely broken; locking out a degraded
 *   session compounds the incident. The legitimate security gate is auth
 *   (withCanonicalEnforcement) which is DB-backed and will fail closed.
 *
 * Usage:
 *   const result = await checkPgRateLimit("workspace:<id>", {
 *     capacity: 1000,          // max tokens per hour
 *     refillPerSecond: 1000/3600,
 *     cost: 1,                 // tokens this request costs
 *   });
 *   if (!result.allowed) return 429;
 */

import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export interface PgRateLimitConfig {
  capacity: number;
  refillPerSecond: number;
  cost?: number;
}

export interface PgRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
  source: "pg" | "fail-open";
}

/**
 * Check and consume tokens from a PostgreSQL-backed bucket.
 * The bucket key should be low-cardinality: e.g. "ws:<uuid>", "ip:<hash>".
 */
export async function checkPgRateLimit(
  key: string,
  config: PgRateLimitConfig
): Promise<PgRateLimitResult> {
  const cost = config.cost ?? 1;
  const now = new Date();

  try {
    // Atomic upsert:
    //   1. If row doesn't exist: create it with (capacity - cost) tokens.
    //   2. If row exists: refill elapsed tokens, then subtract cost.
    //      If tokens < cost: return remaining without decrementing (denied).
    //
    // We use a single CTE + UPDATE to avoid a round-trip.
    const rows = await db.$queryRaw<
      Array<{ tokens_after: number; allowed: boolean }>
    >`
      WITH
        current AS (
          SELECT "tokens", "last_refill_at"
          FROM "rate_limit_buckets"
          WHERE "key" = ${key}
          FOR UPDATE
        ),
        refilled AS (
          SELECT LEAST(
            ${config.capacity}::double precision,
            COALESCE((SELECT "tokens" FROM current), ${config.capacity}::double precision)
            + EXTRACT(EPOCH FROM (${now}::timestamptz - COALESCE(
                (SELECT "last_refill_at" FROM current),
                ${now}::timestamptz
              ))) * ${config.refillPerSecond}::double precision
          ) AS tokens
        ),
        result AS (
          SELECT
            (SELECT tokens FROM refilled) AS tokens_before,
            (SELECT tokens FROM refilled) >= ${cost}::double precision AS allowed
        ),
        upserted AS (
          INSERT INTO "rate_limit_buckets" ("key", "tokens", "last_refill_at", "updated_at")
          VALUES (
            ${key},
            LEAST(
              ${config.capacity}::double precision,
              (SELECT CASE
                WHEN (SELECT allowed FROM result) THEN (SELECT tokens_before FROM result) - ${cost}::double precision
                ELSE (SELECT tokens_before FROM result)
              END)
            ),
            ${now}::timestamptz,
            ${now}::timestamptz
          )
          ON CONFLICT ("key") DO UPDATE SET
            "tokens" = LEAST(
              ${config.capacity}::double precision,
              CASE
                WHEN (SELECT allowed FROM result)
                THEN (SELECT tokens_before FROM result) - ${cost}::double precision
                ELSE (SELECT tokens_before FROM result)
              END
            ),
            "last_refill_at" = ${now}::timestamptz,
            "updated_at" = ${now}::timestamptz
          RETURNING "tokens"
        )
      SELECT
        (SELECT tokens FROM upserted) AS tokens_after,
        (SELECT allowed FROM result) AS allowed
    `;

    if (!rows || rows.length === 0) {
      logger.warn("S7-DC11: rate limiter query returned no rows (fail-open)", { key });
      return { allowed: true, remaining: config.capacity, source: "fail-open" };
    }

    const { tokens_after, allowed } = rows[0];
    const remaining = Math.max(0, Math.floor(tokens_after));

    if (!allowed) {
      const tokensNeeded = cost - tokens_after;
      const retryAfterSeconds = Math.ceil(tokensNeeded / config.refillPerSecond);
      return { allowed: false, remaining: 0, retryAfterSeconds, source: "pg" };
    }

    return { allowed: true, remaining, source: "pg" };
  } catch (err) {
    const governed = classifyOperatorError(
      err instanceof Error ? err : new Error(String(err)),
      { context: "load" }
    );
    logger.error("S7-DC11: rate limiter DB error (fail-open)", {
      key,
      error: governed.operatorMessage,
    });
    return { allowed: true, remaining: config.capacity, source: "fail-open" };
  }
}

/**
 * Delete a rate limit bucket key (for testing / admin reset).
 * Safe to call even if the key does not exist.
 */
export async function deletePgRateLimitBucket(key: string): Promise<void> {
  await db.rateLimitBucket.delete({ where: { key } }).catch(() => {});
}
