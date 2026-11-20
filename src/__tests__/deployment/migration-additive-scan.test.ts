/**
 * Static additive-only scan for production batch migrations (scripts/release/migration-additive-scan.mjs).
 *
 * The scan is the gate that lets MAIN_BATCH apply several migrations in one approved run: it must pass the real
 * pending migrations and must reject every destructive or unparseable shape (fail closed).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
// @ts-expect-error -- plain ESM script without type declarations
import { scanAdditiveOnly, sanitizeSql, splitStatements } from "../../../scripts/release/migration-additive-scan.mjs";

const ROOT = join(__dirname, "../../..");
const REAL = [
  "20261119120000_usage_event_quota_reservations",
  "20261119130000_subscription_last_event_id",
  "20261119140000_subscription_stripe_subscription_created_at",
];
const read = (n: string) => readFileSync(join(ROOT, "prisma/migrations", n, "migration.sql"), "utf8");
const scan = (sql: string) => scanAdditiveOnly(sql) as { ok: boolean; violations: { reason: string }[]; creates: Record<string, unknown[]>; statements: number };

describe("additive-only scan — the real pending migrations", () => {
  for (const name of REAL) {
    it(`${name} passes`, () => {
      const r = scan(read(name));
      expect(r.violations).toEqual([]);
      expect(r.ok).toBe(true);
    });
  }

  it("derives exactly the objects the SQL creates (partial unique index included)", () => {
    const r = scan(read(REAL[0]));
    expect(r.creates.columns).toEqual([
      { table: "usage_events", column: "reservation_entry", nullable: true },
      { table: "usage_events", column: "reservation_id", nullable: true },
    ]);
    expect(r.creates.indexes).toEqual([
      { table: "usage_events", name: "usage_events_reservation_id_reservation_entry_idx", unique: false },
      { table: "usage_events", name: "usage_events_reservation_entry_timestamp_idx", unique: false },
      { table: "usage_events", name: "usage_events_one_release_per_reservation", unique: true },
    ]);
  });

  it("the CLI exits 0 for the real migrations and non-zero for a destructive one", () => {
    const ok = spawnSync("node", ["scripts/release/migration-additive-scan.mjs", ...REAL.map((n) => `prisma/migrations/${n}/migration.sql`)], { cwd: ROOT, encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout.match(/ADDITIVE_ONLY=PASS/g)).toHaveLength(3);
    const bad = spawnSync("node", ["scripts/release/migration-additive-scan.mjs", "src/__tests__/deployment/fixtures/does-not-exist.sql"], { cwd: ROOT, encoding: "utf8" });
    expect(bad.status).toBe(1);
  });
});

describe("additive-only scan — destructive and non-allow-listed fixtures are rejected", () => {
  const destructive: Array<[string, string, RegExp]> = [
    ["DROP TABLE", 'DROP TABLE "usage_events";', /forbidden keyword 'DROP'|allow-list/],
    ["DROP COLUMN", 'ALTER TABLE "subscriptions" DROP COLUMN "status";', /DROP/],
    ["DROP INDEX", 'DROP INDEX "x_idx";', /DROP/],
    ["TRUNCATE", 'TRUNCATE TABLE "subscriptions";', /TRUNCATE/],
    ["DELETE", 'DELETE FROM "subscriptions";', /DELETE/],
    ["UPDATE", 'UPDATE "subscriptions" SET "status" = \'x\';', /UPDATE/],
    ["INSERT", 'INSERT INTO "subscriptions" ("id") VALUES (\'a\');', /INSERT/],
    ["RENAME TABLE", 'ALTER TABLE "subscriptions" RENAME TO "subs";', /RENAME/],
    ["RENAME COLUMN", 'ALTER TABLE "subscriptions" RENAME COLUMN "a" TO "b";', /RENAME/],
    ["ALTER COLUMN type", 'ALTER TABLE "subscriptions" ALTER COLUMN "status" TYPE INTEGER;', /ALTER COLUMN/],
    ["ALTER COLUMN SET NOT NULL", 'ALTER TABLE "subscriptions" ALTER COLUMN "status" SET NOT NULL;', /ALTER COLUMN/],
    ["ALTER COLUMN DROP NOT NULL", 'ALTER TABLE "subscriptions" ALTER COLUMN "status" DROP NOT NULL;', /ALTER COLUMN|DROP/],
    ["ALTER COLUMN DROP DEFAULT", 'ALTER TABLE "subscriptions" ALTER COLUMN "status" DROP DEFAULT;', /ALTER COLUMN|DROP/],
    ["ADD COLUMN NOT NULL without DEFAULT", 'ALTER TABLE "subscriptions" ADD COLUMN "x" TEXT NOT NULL;', /NOT NULL without a DEFAULT/],
    ["mixed: ADD then DROP in one ALTER", 'ALTER TABLE "subscriptions" ADD COLUMN "x" TEXT, DROP COLUMN "status";', /DROP/],
    ["GRANT", 'GRANT SELECT ON "subscriptions" TO someone;', /GRANT/],
    ["REVOKE", 'REVOKE ALL ON "subscriptions" FROM someone;', /REVOKE/],
    ["CREATE INDEX CONCURRENTLY", 'CREATE INDEX CONCURRENTLY "i" ON "t"("c");', /CONCURRENTLY/],
    ["CREATE TABLE AS SELECT", 'CREATE TABLE "t2" AS SELECT * FROM "subscriptions";', /SELECT|allow-list/],
    ["CREATE FUNCTION", 'CREATE FUNCTION f() RETURNS int AS \'select 1\' LANGUAGE sql;', /FUNCTION|allow-list/],
    ["CREATE TRIGGER", 'CREATE TRIGGER t BEFORE INSERT ON "x" FOR EACH ROW EXECUTE FUNCTION f();', /TRIGGER|INSERT|allow-list/],
    ["CREATE VIEW", 'CREATE VIEW v AS SELECT 1;', /VIEW|SELECT/],
    ["CREATE EXTENSION", 'CREATE EXTENSION pgcrypto;', /EXTENSION/],
    ["ALTER TYPE ADD VALUE (not on the allow-list)", "ALTER TYPE \"Status\" ADD VALUE 'X';", /ALTER TYPE|allow-list/],
    ["COMMENT ON", "COMMENT ON TABLE \"t\" IS 'x';", /COMMENT/],
    ["DO block", 'DO $$ BEGIN DROP TABLE "t"; END $$;', /DOLLAR_QUOTE/],
    ["explicit transaction control", 'BEGIN; ALTER TABLE "t" ADD COLUMN "c" TEXT; COMMIT;', /BEGIN|COMMIT|allow-list/],
    ["destructive statement after a valid one", 'ALTER TABLE "t" ADD COLUMN "c" TEXT;\nDROP TABLE "t";', /DROP/],
    ["destructive statement hidden after a comment on the same line", 'ALTER TABLE "t" ADD COLUMN "c" TEXT; -- ok\n/* x */ DELETE FROM "t";', /DELETE/],
    ["schema other than public", 'CREATE TABLE "other"."t" ("id" TEXT)', /allow-list/],
    ["ADD CONSTRAINT with unsupported kind", 'ALTER TABLE "t" ADD CONSTRAINT "c" EXCLUDE USING gist (a WITH =);', /allow-list|ADD COLUMN \/ ADD CONSTRAINT/],
  ];
  for (const [label, sql, why] of destructive) {
    it(`rejects ${label}`, () => {
      const r = scan(sql);
      expect(r.ok, sql).toBe(false);
      expect(r.violations.map((v) => v.reason).join(" | ")).toMatch(why);
    });
  }
});

describe("additive-only scan — comment and literal handling is exact", () => {
  it("a destructive keyword inside a line comment or block comment is NOT a violation", () => {
    const sql = `-- DROP TABLE "x"; DELETE FROM "y";\n/* TRUNCATE "z"; /* nested DROP */ still comment */\nALTER TABLE "t" ADD COLUMN "c" TEXT;`;
    expect(scan(sql).ok).toBe(true);
  });
  it("a destructive keyword inside a string literal is NOT a violation, and a quote escape does not end the string early", () => {
    const sql = `CREATE TYPE "k" AS ENUM ('DROP TABLE x', 'it''s; DELETE FROM y');`;
    const r = scan(sql);
    expect(r.ok).toBe(true);
    expect(r.statements).toBe(1);
  });
  it("a column or table named like a keyword (quoted) is fine", () => {
    expect(scan(`ALTER TABLE "t" ADD COLUMN "update" TEXT, ADD COLUMN "delete" TEXT;`).ok).toBe(true);
  });
  it("'--' inside a string is not a comment (it cannot hide the rest of the line from the scan)", () => {
    const r = scan(`CREATE TYPE "k" AS ENUM ('a--b');\nDROP TABLE "t";`);
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.reason).join()).toMatch(/DROP/);
  });
  it("ON DELETE / ON UPDATE referential actions (Prisma foreign keys) are allowed", () => {
    const sql = `CREATE TABLE "child" ("id" TEXT NOT NULL, "parent_id" TEXT NOT NULL, CONSTRAINT "child_pkey" PRIMARY KEY ("id"));\nALTER TABLE "child" ADD CONSTRAINT "child_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`;
    const r = scan(sql);
    expect(r.violations).toEqual([]);
    expect(r.creates.tables).toEqual(["child"]);
    expect(r.creates.constraints).toEqual([{ table: "child", name: "child_parent_id_fkey" }]);
  });
  it("NOT NULL with a DEFAULT on ADD COLUMN is allowed; the derived nullability is recorded", () => {
    const r = scan(`ALTER TABLE "t" ADD COLUMN "c" BOOLEAN NOT NULL DEFAULT false;`);
    expect(r.ok).toBe(true);
    expect(r.creates.columns).toEqual([{ table: "t", column: "c", nullable: false }]);
  });
  it("splitStatements ignores a semicolon inside a quoted identifier", () => {
    expect(splitStatements(sanitizeSql(`ALTER TABLE "a;b" ADD COLUMN "c" TEXT;`))).toHaveLength(1);
  });
});

describe("additive-only scan — fails closed on anything it cannot classify", () => {
  const unparseable: Array<[string, string, RegExp]> = [
    ["empty file", "", /NO_STATEMENTS/],
    ["comments only", "-- nothing\n/* here */", /NO_STATEMENTS/],
    ["unterminated block comment", 'ALTER TABLE "t" ADD COLUMN "c" TEXT; /* never closed', /UNTERMINATED_COMMENT/],
    ["unterminated string", "CREATE TYPE \"k\" AS ENUM ('a);", /UNTERMINATED_STRING/],
    ["unterminated quoted identifier", 'ALTER TABLE "t ADD COLUMN c TEXT;', /UNTERMINATED_IDENTIFIER/],
    ["dollar-quoted body", 'CREATE TABLE "t" ("a" TEXT DEFAULT $$x$$)', /DOLLAR_QUOTE/],
    ["tagged dollar quote", "SELECT $tag$ DROP $tag$;", /DOLLAR_QUOTE/],
    ["escape string", "CREATE TYPE \"k\" AS ENUM (E'a\\'');", /ESCAPE_STRING/],
    ["backslash outside a string", 'ALTER TABLE "t" ADD COLUMN "c" TEXT; \\i evil.sql', /BACKSLASH/],
    ["NUL byte", 'ALTER TABLE "t" ADD COLUMN "c" TEXT;\u0000', /NUL_BYTE/],
    ["unbalanced parentheses", 'CREATE TABLE "t" ("id" TEXT', /allow-list|unbalanced/],
    ["unknown statement", "FROBNICATE THE DATABASE;", /allow-list/],
  ];
  for (const [label, sql, why] of unparseable) {
    it(`rejects ${label}`, () => {
      const r = scan(sql);
      expect(r.ok).toBe(false);
      expect(r.violations.map((v) => v.reason).join(" | ")).toMatch(why);
    });
  }
  it("non-text input is rejected, never thrown", () => {
    expect(scanAdditiveOnly(undefined as unknown as string).ok).toBe(false);
  });
});

describe("additive-only scan — repository-wide sanity", () => {
  it("the scan is selective: the committed history contains migrations it rejects (it is not vacuously permissive)", () => {
    const dir = join(ROOT, "prisma/migrations");
    const names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    const rejected = names.filter((n) => !scan(readFileSync(join(dir, n, "migration.sql"), "utf8")).ok);
    expect(rejected.length).toBeGreaterThan(0);
    expect(names.length - rejected.length).toBeGreaterThan(0);
  });
});
