/**
 * `pg`-backed reader for the connected database's own identity (see production-db-identity.ts).
 *
 * Used by vitest-global-setup.ts and scripts/assert-non-production-database.ts. The session is opened READ-ONLY
 * (`default_transaction_read_only=on`) and runs exactly one SELECT of Neon's identity settings, then disconnects.
 * It never writes. Any failure is rethrown as a generic error: pg error messages can contain the host or user, so
 * they are never propagated.
 */
import type { DatabaseIdentityReader } from "./test-database-guard";

/** Cold-start allowance for a suspended Neon compute (setup already tolerates minutes of warm-up). */
const CONNECT_TIMEOUT_MS = 120_000;
const STATEMENT_TIMEOUT_MS = 15_000;

export const readDatabaseIdentity: DatabaseIdentityReader = async (url, sql) => {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: url,
    // Same TLS posture the test harness already uses for Neon (sslmode=require without CA pinning).
    ssl: /sslmode=require/i.test(url) ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    options: "-c default_transaction_read_only=on",
  });
  try {
    await client.connect();
    const result = await client.query(sql);
    return result.rows[0] as Record<string, unknown> | undefined;
  } catch {
    throw new Error("database identity read failed");
  } finally {
    try {
      await client.end();
    } catch {
      /* the connection is already gone */
    }
  }
};
