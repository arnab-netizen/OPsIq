#!/usr/bin/env tsx
/**
 * Read-only release plan against the REAL migration ledger of the target database (never a git diff).
 *
 *   OWNER_DATABASE_URL=<operator login> EXPECTED_DATABASE_HOST=<bare direct host> OPSIQ_DB_TARGET=production \
 *     OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true  npx tsx scripts/release/release-plan-cli.ts --target production
 *
 * Output (sanitized: migration folder names only, never a URL or credential): one JSON line plus `RELEASE_PLAN=NOOP|MIGRATE|BLOCK`.
 * The target and the connected database identity are proven by the same reviewed checks the role tool uses; the ledger is read
 * inside an explicit BEGIN READ ONLY transaction that is always rolled back. It never applies anything.
 */
import { Client } from "pg";
import { resolve } from "path";
import { readFileSync } from "fs";
import { DATABASE_IDENTITY_SQL, databaseIdentityFromRow } from "../../src/infra/production-db-identity";
import { RoleCutoverRefusal, assertRoleCutoverConnectedIdentity, assertRoleCutoverStaticTarget } from "../../src/infra/role-cutover-target";
import { planRelease } from "./release-plan.mjs";
import { listCommittedMigrations } from "./production-migration-gate.mjs";

export interface LedgerReader { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> }
export interface ReleasePlanResult { action: "NOOP" | "MIGRATE" | "BLOCK"; pending: string[]; reasons: string[] }

/** Pure core, used by the CLI and by the tests (against a disposable PostgreSQL or a fake client). */
export async function computeReleasePlan(c: LedgerReader, migrationsDir: string): Promise<ReleasePlanResult> {
  await c.query("BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ");
  try {
    const mode = String((await c.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only);
    if (mode !== "on") throw new Error("READ_ONLY_NOT_ENFORCED");
    const rows = (await c.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"')).rows;
    await c.query("ROLLBACK");
    const committed = listCommittedMigrations(migrationsDir);
    const have = new Set((rows as { migration_name: string }[]).map((r) => r.migration_name));
    const sqlByName: Record<string, string> = {};
    for (const m of (committed ?? []) as { name: string }[]) if (!have.has(m.name)) sqlByName[m.name] = readFileSync(resolve(migrationsDir, m.name, "migration.sql"), "utf8");
    const plan = planRelease({ committed, rows, sqlByName });
    return { action: plan.action, pending: plan.pending, reasons: plan.reasons };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const target = argv[argv.indexOf("--target") + 1];
  const env = process.env;
  const url = env.OWNER_DATABASE_URL;
  const proven = assertRoleCutoverStaticTarget({ command: "verify", target, url, env, expectedHost: env.EXPECTED_DATABASE_HOST });
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 60_000 });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const identity = databaseIdentityFromRow((await c.query(DATABASE_IDENTITY_SQL)).rows[0]);
    await c.query("ROLLBACK");
    assertRoleCutoverConnectedIdentity(proven, identity, env);
    const r = await computeReleasePlan(c as unknown as LedgerReader, resolve(process.cwd(), "prisma", "migrations"));
    console.log(JSON.stringify({ RELEASE_PLAN: r.action, target: proven, pending: r.pending, reasons: r.reasons }));
    console.log(`RELEASE_PLAN=${r.action}`);
    process.exitCode = r.action === "NOOP" ? 0 : r.action === "MIGRATE" ? 3 : 1;
  } finally {
    await c.end();
  }
}

if (process.argv[1] && /release-plan-cli\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    const code = e instanceof RoleCutoverRefusal ? e.code : "ERROR";
    console.error(JSON.stringify({ error: code }));
    console.log("RELEASE_PLAN=BLOCK");
    process.exit(1);
  });
}
