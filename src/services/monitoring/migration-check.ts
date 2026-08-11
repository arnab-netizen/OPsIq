import path from "path";
import * as fs from "fs";
import { getDbInstance } from "@/lib/db";

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
    const prisma = await getDbInstance();
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`
    )) as RawMigrationRow[];

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
