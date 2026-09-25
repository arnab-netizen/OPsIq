/**
 * Release-migration gate against a REAL Postgres migration history (the guarded
 * loopback throwaway test database — see src/infra/test-database-guard.ts).
 *
 * The test database's own _prisma_migrations table is never modified: its rows
 * are copied into an isolated fixture schema and the gate's real reader is
 * pointed at that schema via the connection's search_path.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { resolve } from "path";
// @ts-expect-error -- plain ESM script without type declarations
import { runGate } from "../../../scripts/release/production-migration-gate.mjs";

const ROOT = resolve(__dirname, "../../..");
const SCHEMA = "release_gate_fixture";
const INCIDENT = "20260925120000_add_verification_baseline_provenance";
const baseUrl = process.env.DATABASE_URL ?? "";
const fixtureUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}options=${encodeURIComponent(`-c search_path=${SCHEMA}`)}`;
let admin: Client;

async function gate() {
  return runGate({ env: { OPSIQ_RELEASE_GATE_FORCE: "1", DATABASE_URL: fixtureUrl }, cwd: ROOT });
}

describe("[db] production migration release gate — real migration history", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: baseUrl });
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.query(`CREATE TABLE ${SCHEMA}."_prisma_migrations" AS SELECT * FROM public."_prisma_migrations"`);
  });

  afterAll(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  });

  it("Case B — every committed migration applied (fresh migrated DB) → PASS", async () => {
    const out = await gate();
    expect(out.output).toContain("PASS: MIGRATIONS_CURRENT");
    expect(out.exitCode).toBe(0);
  });

  it("Case A — the incident: newest migration missing from history → BLOCKED, PRODUCTION MIGRATION REQUIRED", async () => {
    await admin.query(`DELETE FROM ${SCHEMA}."_prisma_migrations" WHERE migration_name = $1`, [INCIDENT]);
    const out = await gate();
    expect(out.exitCode).toBe(1);
    expect(out.result.pending).toEqual([INCIDENT]);
    expect(out.output).toContain("PRODUCTION MIGRATION REQUIRED");
    expect(out.output).not.toContain("localhost");
    await admin.query(
      `INSERT INTO ${SCHEMA}."_prisma_migrations" SELECT * FROM public."_prisma_migrations" WHERE migration_name = $1`,
      [INCIDENT]
    );
    expect((await gate()).exitCode).toBe(0);
  });

  it("Case F — a failed (unfinished) migration row → BLOCKED", async () => {
    await admin.query(
      `INSERT INTO ${SCHEMA}."_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count)
       VALUES ('release-gate-failed-row', 'x', '29990101000000_failed_fixture', now(), 0)`
    );
    const out = await gate();
    expect(out.exitCode).toBe(1);
    expect(out.result.verdict).toBe("FAILED_MIGRATION_PRESENT");
    await admin.query(`DELETE FROM ${SCHEMA}."_prisma_migrations" WHERE id = 'release-gate-failed-row'`);
  });

  it("an applied migration edited after it was applied (checksum drift) → BLOCKED", async () => {
    await admin.query(`UPDATE ${SCHEMA}."_prisma_migrations" SET checksum = 'drifted' WHERE migration_name = $1`, [INCIDENT]);
    const out = await gate();
    expect(out.exitCode).toBe(1);
    expect(out.result.verdict).toBe("APPLIED_MIGRATION_MODIFIED");
  });

  it("the gate's transaction is READ ONLY — it cannot mutate the history it inspects", async () => {
    const c = new Client({ connectionString: fixtureUrl });
    await c.connect();
    try {
      await c.query("BEGIN READ ONLY");
      await expect(c.query(`DELETE FROM "_prisma_migrations"`)).rejects.toThrow(/read-only transaction/);
    } finally {
      await c.query("ROLLBACK").catch(() => {});
      await c.end();
    }
  });
});
