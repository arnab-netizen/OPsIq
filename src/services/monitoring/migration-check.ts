import path from "path";
import * as fs from "fs";
import { withRawStatementTimeout, getRawPool } from "@/lib/db";

/**
 * Database-enforced bound for the migration-history query below, matching
 * the caller's own MIGRATION_READINESS_TIMEOUT_MS JS-side race
 * (src/infra/startup-orchestrator.ts). Postgres cancels the statement
 * itself if exceeded, so a stalled connection can never hold the shared
 * pool's sole connection (max: 1) indefinitely — see withRawStatementTimeout()
 * in src/lib/db.ts. This query no longer runs inside a Prisma interactive
 * transaction (F-PROD-STARTUP-COLDSTART second-mechanism forensic — see
 * withRawStatementTimeout()'s own doc comment): it is a single read-only
 * SELECT with no multi-statement consistency requirement, so removing the
 * transaction wrapper removes dependence on Prisma's separate, narrower
 * maxWait acquisition race for this call site.
 */
export const MIGRATION_QUERY_STATEMENT_TIMEOUT_MS = 5000;

interface RawMigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export interface MigrationReadiness {
  ready: boolean;
  totalCommitted: number;
  applied: number;
  pending: number;
  failed: number;
  error?: string;
}

/**
 * Returns sorted migration directory names from prisma/migrations/.
 * Returns null when the directory cannot be read — caller treats this as
 * fail-closed (ready: false).
 */
function listCommittedMigrations(): string[] | null {
  try {
    const dir = path.join(process.cwd(), "prisma", "migrations");
    if (!fs.existsSync(dir)) return null;
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return null;
  }
}

/**
 * Checks that every committed Prisma migration has been applied to the database.
 *
 * Compares committed migration directories (prisma/migrations/<name>/) against
 * rows in the _prisma_migrations table.  A snapshot is ready only when:
 *   - every committed migration directory has a matching row with
 *     finished_at IS NOT NULL and rolled_back_at IS NULL
 *   - no row in _prisma_migrations is in a failed or in-progress state
 *
 * Fail-closed: if the migrations directory is inaccessible (e.g. not bundled
 * in the serverless function) this returns ready: false.
 */
export async function checkMigrationReadiness(): Promise<MigrationReadiness> {
  const committed = listCommittedMigrations();

  if (committed === null) {
    return {
      ready: false,
      totalCommitted: 0,
      applied: 0,
      pending: 0,
      failed: 0,
      error: "prisma/migrations directory not accessible",
    };
  }

  const totalCommitted = committed.length;

  if (totalCommitted === 0) {
    return { ready: true, totalCommitted: 0, applied: 0, pending: 0, failed: 0 };
  }

  try {
    const pool = await getRawPool();
    const result = (await withRawStatementTimeout(
      pool,
      MIGRATION_QUERY_STATEMENT_TIMEOUT_MS,
      (client) => client.query(
        `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`
      ),
      "checkMigrationReadiness"
    )) as { rows: RawMigrationRow[] };
    const rows = result.rows;

    const appliedSet = new Set<string>();
    let failed = 0;

    for (const row of rows) {
      if (row.rolled_back_at != null || row.finished_at == null) {
        failed++;
      } else {
        appliedSet.add(row.migration_name);
      }
    }

    const pending = committed.filter((name) => !appliedSet.has(name)).length;
    const applied = committed.filter((name) => appliedSet.has(name)).length;

    return {
      ready: failed === 0 && pending === 0,
      totalCommitted,
      applied,
      pending,
      failed,
    };
  } catch (e) {
    return {
      ready: false,
      totalCommitted,
      applied: 0,
      pending: 0,
      failed: 0,
      error: String(e),
    };
  }
}
