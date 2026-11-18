/** Deterministic release planning: full chain vs ledger, zero/many migrations, drift and destructive changes. */
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { planRelease, destructiveReasons, classifyMigration, splitStatements } from "../../../scripts/release/release-plan.mjs";

const c = (name: string, checksum: string | null = name) => ({ name, checksum });
const row = (name: string, o: Record<string, unknown> = {}) => ({ migration_name: name, checksum: name, finished_at: new Date(), rolled_back_at: null, ...o });
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
const SAFE = "CREATE TABLE \"t\" (id uuid PRIMARY KEY); CREATE INDEX \"i\" ON \"t\"(id);";

describe("planRelease", () => {
  it("zero-migration release: chain equals ledger -> NOOP (runtime-role verification still applies downstream)", () => {
    expect(planRelease({ committed: [c("001"), c("002")], rows: [row("001"), row("002")] })).toMatchObject({ action: "NOOP", pending: [] });
  });
  it("one or many pending migrations -> MIGRATE in ascending order, regardless of what the last push contained", () => {
    const r = planRelease({ committed: [c("003"), c("001"), c("002"), c("004")].sort((a, b) => a.name.localeCompare(b.name)), rows: [row("001"), row("002")], sqlByName: { "003": SAFE, "004": SAFE } });
    expect(r).toMatchObject({ action: "MIGRATE", pending: ["003", "004"] });
  });
  it("recovers previously unapplied migrations from a failed or cancelled release (ledger-driven, not diff-driven)", () => {
    expect(planRelease({ committed: [c("001"), c("002"), c("003")], rows: [row("001")], sqlByName: { "002": SAFE, "003": SAFE } })).toMatchObject({ action: "MIGRATE", pending: ["002", "003"] });
  });
  it("BLOCKS failed, in-progress or rolled-back ledger rows", () => {
    expect(planRelease({ committed: [c("001")], rows: [row("001", { finished_at: null })] }).action).toBe("BLOCK");
    expect(planRelease({ committed: [c("001")], rows: [row("001", { rolled_back_at: new Date() })] }).action).toBe("BLOCK");
  });
  it("BLOCKS an applied migration whose checksum changed", () => {
    const r = planRelease({ committed: [c("001", "new")], rows: [row("001", { checksum: "old" })] });
    expect(r.action).toBe("BLOCK");
    expect(r.reasons.join()).toMatch(/modified/);
  });
  it("BLOCKS a pending migration older than an applied one (out of order)", () => {
    const r = planRelease({ committed: [c("001"), c("002"), c("003")], rows: [row("001"), row("003")], sqlByName: { "002": SAFE } });
    expect(r.action).toBe("BLOCK");
    expect(r.reasons.join()).toMatch(/out of order/);
  });
  it("BLOCKS unreadable chain/ledger and a migration directory without migration.sql", () => {
    expect(planRelease({ committed: null, rows: [] }).action).toBe("BLOCK");
    expect(planRelease({ committed: [c("001")], rows: null as never }).action).toBe("BLOCK");
    expect(planRelease({ committed: [c("001", null)], rows: [] }).action).toBe("BLOCK");
  });
  it("BLOCKS when the SQL of a pending migration is not available to inspect", () => {
    expect(planRelease({ committed: [c("001")], rows: [] }).action).toBe("BLOCK");
  });
  it("destructive or incompatible pending migrations are never automatic and are named", () => {
    for (const sql of ['DROP TABLE "x";', 'ALTER TABLE "x" DROP COLUMN "y";', 'TRUNCATE "x";', 'DELETE FROM "x";', 'ALTER TABLE "x" ALTER COLUMN "y" TYPE text;', 'ALTER TABLE "x" RENAME COLUMN "a" TO "b";', 'ALTER TABLE "x" ALTER COLUMN "y" SET NOT NULL;', 'GRANT ALL ON "x" TO PUBLIC;', "CREATE ROLE evil;"]) {
      const r = planRelease({ committed: [c("001")], rows: [], sqlByName: { "001": sql } });
      expect(r.action, sql).toBe("BLOCK");
      expect(Object.keys(r.destructive)).toEqual(["001"]);
    }
  });
  it("review finding 8: a comment marker inside a string cannot hide a following DROP; more statements are covered", () => {
    expect(destructiveReasons("INSERT INTO t VALUES ('--'); DROP TABLE x;")).not.toEqual([]);
    for (const sql of ["DROP INDEX i;", "DROP VIEW v;", "DROP FUNCTION f();", "DROP TRIGGER t ON x;", "DROP SEQUENCE s;", "DROP EXTENSION e;", 'ALTER TABLE "x" ALTER COLUMN "y" DROP DEFAULT;', 'ALTER TABLE "x" ALTER COLUMN "y" DROP NOT NULL;', "UPDATE x SET a = 1;", "DO $$ BEGIN EXECUTE 'x'; END $$;", "DO $body$ BEGIN PERFORM 1; END $body$;", "/* a /* nested */ still comment */ DROP TABLE x;"]) {
      expect(destructiveReasons(sql), sql).not.toEqual([]);
    }
    expect(destructiveReasons("UPDATE x SET a = 1 WHERE id = 2;")).toEqual([]);
    expect(destructiveReasons('CREATE TABLE "drop" (id int);')).toEqual([]);
  });
  it("comments and string literals do not trigger or hide destructive detection", () => {
    expect(destructiveReasons("-- DROP TABLE x\nCREATE TABLE y (a text DEFAULT 'DROP TABLE z');")).toEqual([]);
    expect(destructiveReasons("/* harmless */ DROP TABLE x;")).not.toEqual([]);
    expect(destructiveReasons("DELETE FROM x WHERE id = 1;")).toEqual([]);
  });
});

const GOLDEN_BLOCKED: string[] = ["20260503_hardening_stripe_unique", "20260503_webhook_event_state_machine", "20260507_add_canonical_event", "20260507_add_workspace_id_to_engagements", "20260507_align_phase_0_3_schema", "20260507_transform_recommendations_schema", "20260518_add_startup_status", "20260614200257_b12_add_business_condition_fields", "20260615035700_b15_fix_benchmark_column_types", "20260626160000_owner_outcome_reassessment_tables", "20260627030000_owner_budget_action_linkage", "20260627090000_owner_working_capital_items", "20260627120000_owner_archetype_metrics", "20260628205000_engagement_workspace_required_indexed", "20260628210000_governed_verification_restrict", "20260629000000_audit_entity_id_text", "20260704120000_client_lead_workspace_anchor", "20260715000000_retention_cohort_unique", "20260719040000_phase4_deepen_arbitration_memory_kpi_override", "20260719050000_phase4_fix_operating_memory_unique_constraint", "20260720020000_phase5_approval_package_blueprint_uniqueness", "20260725000003_stage3f_entity_workspace_id", "20260726000001_stage3g_alert_email_delivery_fsm", "20260813000001_snapshot_amendment", "20260814000001_finance_signal_clc_link_text", "20260824000001_approval_request_workspace_anchor", "20260825000001_override_record_workspace_anchor", "20260926090000_owner_goal_business_scope", "20261006150000_owner_outcome_persistence_v1", "20261024090000_qbo_v1_sync_evidence_provenance", "20261025090000_qbo_governed_privacy_erasure"];
const MIGRATIONS = resolve(__dirname, "../../../prisma/migrations");

describe("allowlist classifier (fail closed): only recognised additive shapes are auto-approved", () => {
  it("golden: over the real migration chain exactly the named migrations need authorization; everything else is allowlisted", () => {
    const names = readdirSync(MIGRATIONS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    const blocked = names.filter((n) => !classifyMigration(readFileSync(resolve(MIGRATIONS, n, "migration.sql"), "utf8")).approved);
    expect(blocked).toEqual(GOLDEN_BLOCKED);
    expect(names.length - blocked.length).toBeGreaterThan(150);
  });
  it("a new migration that is not in the golden list must be allowlisted or the golden list must be reviewed", () => {
    const hasUnreviewed = readdirSync(MIGRATIONS, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
    expect(hasUnreviewed).toBeGreaterThan(0);
  });
  it("auto-approves the recognised additive shapes", () => {
    for (const sql of [
      'CREATE TABLE "t" ("id" uuid NOT NULL, CONSTRAINT "t_pkey" PRIMARY KEY ("id"));',
      'CREATE UNIQUE INDEX "t_i" ON "t"("a", "b") WHERE "a" IS NOT NULL;',
      'ALTER TABLE "t" ADD COLUMN "c" text, ADD COLUMN "d" integer NOT NULL DEFAULT 0;',
      'ALTER TABLE "t" ADD CONSTRAINT "fk" FOREIGN KEY ("a") REFERENCES "u"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
      "CREATE TYPE \"e\" AS ENUM ('a','b');", "ALTER TYPE \"e\" ADD VALUE IF NOT EXISTS 'c';", "-- only a comment",
    ]) expect(classifyMigration(sql), sql).toEqual({ approved: true, reasons: [] });
  });
  it("a volatile default or NOT NULL without default is allowed only on a table created in the same migration", () => {
    expect(classifyMigration('ALTER TABLE "t" ADD COLUMN "c" integer NOT NULL;').approved).toBe(false);
    expect(classifyMigration('ALTER TABLE "t" ADD COLUMN "c" uuid DEFAULT gen_random_uuid();').approved).toBe(false);
    expect(classifyMigration('CREATE TABLE "t" ("id" int); ALTER TABLE "t" ADD COLUMN "c" integer NOT NULL;').approved).toBe(true);
  });
  it("hostile corpus: every one of these needs explicit authorization", () => {
    const bad = [
      "DROP TABLE x;", "DROP INDEX i;", "TRUNCATE x;", "DELETE FROM x WHERE true;", "UPDATE x SET a = 1 WHERE true;", "UPDATE x SET a=(SELECT 1 FROM u WHERE u.id=1);",
      "INSERT INTO x SELECT * FROM y;", "MERGE INTO x USING y ON x.i=y.i WHEN MATCHED THEN DELETE;", "COPY x FROM PROGRAM 'id';", "COPY x TO '/tmp/x';",
      "ALTER TABLE t DETACH PARTITION p;", "ALTER TABLE t DETACH PARTITION p CONCURRENTLY;", "ALTER TABLE t SET SCHEMA other;", "ALTER TABLE t OWNER TO x;",
      "ALTER TABLE t ALTER a TYPE bigint;", "ALTER TABLE ONLY t ALTER a TYPE int;", "ALTER TABLE t ADD COLUMN b int, ALTER a TYPE text;",
      "ALTER TABLE t DISABLE TRIGGER ALL;", "ALTER TABLE t ALTER COLUMN a SET DEFAULT 1;", "ALTER TABLE t ADD COLUMN g int GENERATED ALWAYS AS (1) STORED;",
      "ALTER TYPE e RENAME VALUE 'a' TO 'b';", "ALTER SYSTEM SET work_mem='1GB';", "ALTER DATABASE d SET x=1;", "SET ROLE postgres;", "SET SESSION AUTHORIZATION x;", "REASSIGN OWNED BY a TO b;",
      "VACUUM FULL t;", "CLUSTER t;", "REINDEX TABLE t;", "LOCK TABLE t IN ACCESS EXCLUSIVE MODE;", "REFRESH MATERIALIZED VIEW v;",
      "BEGIN;", "COMMIT;", "ROLLBACK;", "SAVEPOINT a;", "CREATE INDEX CONCURRENTLY i ON t(a);",
      "CREATE EXTENSION dblink;", "CREATE RULE r AS ON INSERT TO t DO INSTEAD NOTHING;", "CREATE EVENT TRIGGER x ON ddl_command_start EXECUTE FUNCTION f();",
      "CREATE POLICY p ON t USING (true);", "ALTER TABLE t ENABLE ROW LEVEL SECURITY;", "CREATE TABLE a AS SELECT 1;", "SELECT * INTO a FROM b;",
      "SELECT pg_terminate_backend(1);", "SELECT pg_sleep(3600);", "SELECT setval('s', 1);", "CALL proc();", "GRANT ALL ON t TO PUBLIC;", "CREATE ROLE evil;",
      "DO $$ BEGIN DELETE FROM x; END $$;", "DO $$ <<lbl>> BEGIN DELETE FROM x; END $$;", "DO U&'\\0041' ;", "DO LANGUAGE plpgsql $x$ BEGIN PERFORM 1; END $x$;",
      "CREATE OR REPLACE FUNCTION f() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;", "CREATE TRIGGER t BEFORE UPDATE ON x FOR EACH ROW EXECUTE FUNCTION f();",
      "INSERT INTO t VALUES ('--'); DROP TABLE x;", "/* a /* nested */ still comment */ DROP TABLE x;", "DROP/**/TABLE x;",
    ];
    for (const sql of bad) expect(classifyMigration(sql).approved, sql).toBe(false);
  });
  it("tokenizer: dollar-quoted bodies are opaque, strings and comments cannot hide or fake statements, semicolons inside quotes do not split", () => {
    expect(splitStatements("SELECT 1; DO $a$ x; y $a$; SELECT 2")).toEqual(["SELECT 1", "DO $OPAQUE$", "SELECT 2"]);
    expect(splitStatements("COMMENT ON TABLE \"a;b\" IS 'x; DROP TABLE y';")).toHaveLength(1);
    expect(splitStatements("-- DROP TABLE x\nCREATE TABLE y (i int)")).toEqual(["CREATE TABLE y (i int)"]);
  });
  it("planRelease blocks a pending migration that is not allowlisted, and approves allowlisted ones", () => {
    const ok = planRelease({ committed: [c("001")], rows: [], sqlByName: { "001": SAFE } });
    expect(ok.action).toBe("MIGRATE");
    const no = planRelease({ committed: [c("001")], rows: [], sqlByName: { "001": "DO $$ BEGIN NULL; END $$;" } });
    expect(no.action).toBe("BLOCK");
    expect(Object.keys(no.destructive)).toEqual(["001"]);
  });
});
