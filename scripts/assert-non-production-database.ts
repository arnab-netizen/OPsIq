/**
 * CI / operator preflight: refuse to proceed when a database variable points at PRODUCTION.
 *
 * Usage (run after `npm ci`, BEFORE any test, `prisma migrate deploy` or `prisma db push` that uses the variable):
 *
 *   npx tsx scripts/assert-non-production-database.ts DATABASE_URL TEST_DATABASE_URL MIGRATION_DATABASE_URL?
 *
 * A trailing `?` marks a variable as optional (skipped when unset); any other named variable must be set.
 * Loopback URLs (a runner's own throwaway Postgres) pass without a connection. Every remote URL must (1) be a
 * well-formed postgres URL with a plain hostname and not a known production endpoint (static, no connection),
 * then (2) report a non-production identity inside the database (read-only session). Production or an unreadable
 * identity fails closed.
 *
 * Output is generic by design: it never prints a URL, host, user, password or database name — only variable names
 * and the refusal codes REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION / REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE.
 * This script reads a database only to learn its identity; it writes nothing.
 */
import { pathToFileURL } from "node:url";
import { classifyRemoteDatabaseUrl } from "../src/infra/production-db-identity";
import {
  REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION,
  REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE,
  isLoopbackDatabaseUrl,
  verifyRemoteTestDatabaseIdentity,
  type DatabaseIdentityReader,
  type RemoteDatabaseVariable,
} from "../src/infra/test-database-guard";

export interface PreflightOutcome {
  ok: boolean;
  lines: string[];
}

export async function assertNonProductionDatabases(
  specs: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  readIdentity: DatabaseIdentityReader
): Promise<PreflightOutcome> {
  const lines: string[] = [];
  const remote: RemoteDatabaseVariable[] = [];
  let ok = true;

  for (const spec of specs) {
    const optional = spec.endsWith("?");
    const name = optional ? spec.slice(0, -1) : spec;
    const value = env[name]?.trim();
    if (!value) {
      if (optional) {
        lines.push(`- ${name}: not set (optional) — skipped`);
      } else {
        ok = false;
        lines.push(`✗ ${name}: REMOTE_TEST_DB_VARIABLE_UNSET — a required database variable is not set.`);
      }
      continue;
    }
    if (isLoopbackDatabaseUrl(value)) {
      lines.push(`✓ ${name}: loopback (runner's own throwaway database)`);
      continue;
    }
    const verdict = classifyRemoteDatabaseUrl(value, env);
    if (verdict === "production") {
      ok = false;
      lines.push(`✗ ${name}: ${REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION}`);
    } else if (verdict === "unverifiable") {
      ok = false;
      lines.push(`✗ ${name}: ${REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE} (not a well-formed postgres URL with a plain hostname)`);
    } else {
      remote.push({ name, url: value });
    }
  }

  // Runtime identity only when every static check passed: never open a connection for a URL already refused.
  if (ok) {
    for (const variable of remote) {
      try {
        await verifyRemoteTestDatabaseIdentity([variable], env, readIdentity);
        lines.push(`✓ ${variable.name}: remote database reports a non-production identity`);
      } catch (e) {
        ok = false;
        const message = e instanceof Error ? e.message.replace(/^\[test-database-guard\] REFUSED: /, "") : "REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE";
        lines.push(`✗ ${variable.name}: ${message}`);
      }
    }
  }
  return { ok, lines };
}

async function main(): Promise<void> {
  const specs = process.argv.slice(2);
  if (specs.length === 0) {
    console.error("usage: assert-non-production-database.ts VARIABLE_NAME [VARIABLE_NAME? ...]");
    process.exit(2);
  }
  const { readDatabaseIdentity } = await import("../src/infra/pg-database-identity-reader");
  const outcome = await assertNonProductionDatabases(specs, process.env, readDatabaseIdentity);
  for (const line of outcome.lines) console.log(line);
  if (!outcome.ok) {
    console.error("REFUSED: a database variable is production, unverifiable, or unset. Nothing was executed against it.");
    process.exit(1);
  }
  console.log("Database identity preflight passed (no variable points at production).");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("REFUSED: database identity preflight failed (REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE).");
    process.exit(1);
  });
}
