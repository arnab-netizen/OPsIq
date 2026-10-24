/**
 * Preflight for any operation that mutates a remote STAGING database WITHOUT going through the Prisma CLI guard
 * (raw `psql` DROP SCHEMA, the staging seed, ...). Run it BEFORE the first write, with the SAME variable the
 * write will use:
 *
 *   npx tsx scripts/assert-approved-staging-database.ts DATABASE_URL
 *
 * It proves the URL is an approved staging database through the one shared validator
 * (src/infra/staging-database-target.ts): valid postgres URL with a provable host, not a known production
 * endpoint, a DIRECT (non-pooler) endpoint, and an exact match in OPSIQ_APPROVED_STAGING_ENDPOINT_IDS. An empty or
 * malformed allowlist fails closed.
 *
 * Output is generic by design: it never prints a URL, host, user, password or database name — only the variable
 * name and the refusal code. This script reads no database; it opens no connection.
 */
import { pathToFileURL } from "node:url";
import {
  APPROVED_STAGING_ENDPOINT_IDS_ENV,
  StagingTargetRefusal,
  assertApprovedStagingDatabaseUrl,
} from "../src/infra/staging-database-target";

export interface StagingPreflightOutcome {
  ok: boolean;
  lines: string[];
}

export function assertApprovedStagingTarget(
  variableName: string,
  env: Readonly<Record<string, string | undefined>>
): StagingPreflightOutcome {
  if (!/^[A-Z][A-Z0-9_]*$/.test(variableName)) {
    return { ok: false, lines: ["✗ usage: assert-approved-staging-database.ts <URL_VARIABLE_NAME>"] };
  }
  try {
    assertApprovedStagingDatabaseUrl(env[variableName], env[APPROVED_STAGING_ENDPOINT_IDS_ENV], env);
    return { ok: true, lines: [`✓ ${variableName}: approved staging database (endpoint matches ${APPROVED_STAGING_ENDPOINT_IDS_ENV})`] };
  } catch (e) {
    if (e instanceof StagingTargetRefusal) {
      return { ok: false, lines: [`✗ ${variableName}: STAGING_TARGET_REFUSED_${e.code} — ${e.message}`] };
    }
    return { ok: false, lines: [`✗ ${variableName}: STAGING_TARGET_UNVERIFIABLE`] };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outcome = assertApprovedStagingTarget(process.argv[2] ?? "", process.env);
  for (const line of outcome.lines) console.log(line);
  if (!outcome.ok) {
    console.error("::error::Staging target verification failed. No database write was attempted.");
    process.exit(1);
  }
}
