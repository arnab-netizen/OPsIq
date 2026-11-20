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
    ["schema other than public", 'CREATE TABLE "other"."t" ("id" TEXT)', /CREATE TABLE must be exactly|allow-list/],
    ["ADD CONSTRAINT with unsupported kind", 'ALTER TABLE "t" ADD CONSTRAINT "c" EXCLUDE USING gist (a WITH =);', /EXCLUDE is not allowed/],
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

describe("additive-only scan — review F1: lexer disagreement with PostgreSQL cannot hide a statement", () => {
  const reject = (label: string, sql: string, why: RegExp) =>
    it(`rejects ${label}`, () => {
      const r = scan(sql);
      expect(r.ok, JSON.stringify(sql)).toBe(false);
      expect(r.violations.map((v) => v.reason).join(" | ")).toMatch(why);
    });
  // (a) PostgreSQL ends a `--` comment at a bare CR, so everything after it EXECUTES. Verified against real PostgreSQL in the db differential test.
  reject("F1a repro: a bare CR ends the comment, a DROP follows", 'ALTER TABLE "subscriptions" ADD COLUMN "x" TEXT; -- harmless\r DROP TABLE "victim";', /BARE_CR/);
  reject("a bare CR inside a block comment", 'ALTER TABLE "t" ADD COLUMN "c" TEXT; /* a\rb */', /BARE_CR/);
  reject("a bare CR at the end of the file", 'ALTER TABLE "t" ADD COLUMN "c" TEXT;\r', /BARE_CR/);
  reject("a form feed", 'ALTER TABLE "t"\f ADD COLUMN "c" TEXT;', /CONTROL_CHAR/);
  reject("a vertical tab", 'ALTER TABLE "t"\v ADD COLUMN "c" TEXT;', /CONTROL_CHAR/);
  reject("an ESC control character inside a comment", 'ALTER TABLE "t" ADD COLUMN "c" TEXT; -- a\u001bb', /CONTROL_CHAR/);
  reject("DEL", 'ALTER TABLE "t" ADD COLUMN "c" TEXT;\u007f', /CONTROL_CHAR/);
  it("a legitimate CRLF file (every CR followed by LF) is accepted, with comments", () => {
    expect(scan('-- c1\r\nALTER TABLE "t" ADD COLUMN "c" TEXT; -- c2\r\n/* b\r\n */\r\nCREATE INDEX "i" ON "t"("c");\r\n').ok).toBe(true);
  });
  it("a destructive statement after a CRLF-terminated comment is still seen", () => {
    expect(scan('ALTER TABLE "t" ADD COLUMN "c" TEXT; -- c\r\nDROP TABLE "victim";').ok).toBe(false);
  });

  // (b) dollar quoting of any tag length or alphabet.
  reject("F1b repro: a non-ASCII dollar tag", 'ALTER TABLE "subscriptions" ADD COLUMN "x" TEXT DEFAULT $é$ -- $é$; DROP TABLE "victim";', /DOLLAR_QUOTE/);
  reject("F1b repro: a 90-character ASCII dollar tag", `ALTER TABLE "subscriptions" ADD COLUMN "x" TEXT DEFAULT $${"a".repeat(90)}$ -- $${"a".repeat(90)}$; DROP TABLE "victim";`, /DOLLAR_QUOTE/);
  reject("a 5000-character tag", `ALTER TABLE "t" ADD COLUMN "c" TEXT DEFAULT $${"z".repeat(5000)}$x$${"z".repeat(5000)}$;`, /DOLLAR_QUOTE/);
  reject("an empty-tag dollar quote", 'ALTER TABLE "t" ADD COLUMN "c" TEXT DEFAULT $$a$$;', /DOLLAR_QUOTE/);
  reject("a CJK dollar tag", 'ALTER TABLE "t" ADD COLUMN "c" TEXT DEFAULT $汉$ x $汉$;', /DOLLAR_QUOTE/);
  reject("a `$` inside a bare identifier", 'ALTER TABLE "t" ADD COLUMN a$b TEXT;', /DOLLAR_QUOTE/);
  reject("a `$` followed by letters", 'ALTER TABLE "t" ADD COLUMN "c" TEXT DEFAULT $a;', /DOLLAR_QUOTE/);
  it("a `$` inside a comment, string literal or quoted identifier is inert and accepted", () => {
    expect(scan(`-- cost is $5 $$\n/* $é$ */ ALTER TABLE "t" ADD COLUMN "p$q" TEXT DEFAULT 'a$$b';`).ok).toBe(true);
  });

  // non-ASCII / unusual whitespace and identifiers the scan cannot classify
  reject("a no-break space between tokens", 'ALTER TABLE "t" ADD COLUMN "c" TEXT;', /NON_ASCII/);
  reject("a line separator (U+2028) between tokens", 'ALTER TABLE "t" ADD COLUMN "c" TEXT;', /NON_ASCII/);
  reject("an ideographic space", 'ALTER TABLE "t"　ADD COLUMN "c" TEXT;', /NON_ASCII/);
  reject("a zero-width space", 'ALTER TABLE "t"​ADD COLUMN "c" TEXT;', /NON_ASCII/);
  reject("a non-ASCII bare identifier", 'ALTER TABLE téble ADD COLUMN "c" TEXT;', /NON_ASCII/);
  reject("a non-ASCII homoglyph keyword", 'ALTER TABLE "t" ADD COLUMN "c" TEXT; DRОP TABLE "victim";', /NON_ASCII/);
  it("non-ASCII text inside a comment, a string literal and a quoted identifier is accepted", () => {
    expect(scan(`-- em dash — and é\nALTER TABLE "té" ADD COLUMN "c" TEXT DEFAULT 'ü—';`).ok).toBe(true);
  });
  reject("a backslash inside a string literal (standard_conforming_strings is a server setting)", `ALTER TABLE "t" ADD COLUMN "c" TEXT DEFAULT 'a\\'; DROP TABLE "victim"; --';`, /BACKSLASH/);
  reject("a backslash inside a quoted identifier", 'ALTER TABLE "t\\" ADD COLUMN "c" TEXT;', /BACKSLASH/);
  reject("a unicode-escape quoted identifier U&\"...\"", 'ALTER TABLE U&"d\\0061t" ADD COLUMN "c" TEXT;', /ESCAPE_STRING|BACKSLASH/);
});

describe("additive-only scan — review F2: tightened allow-list", () => {
  const reject = (label: string, sql: string, why: RegExp) =>
    it(`rejects ${label}`, () => {
      const r = scan(sql);
      expect(r.ok, sql).toBe(false);
      expect(r.violations.map((v) => v.reason).join(" | ")).toMatch(why);
    });
  const accept = (label: string, sql: string) => it(`accepts ${label}`, () => expect(scan(sql).violations).toEqual([]));

  reject("DEFAULT now()", 'ALTER TABLE "t" ADD COLUMN "c" TIMESTAMP DEFAULT now();', /not a literal/);
  reject("DEFAULT gen_random_uuid()", 'ALTER TABLE "t" ADD COLUMN "c" UUID DEFAULT gen_random_uuid();', /not a literal/);
  reject("DEFAULT with an expression", 'ALTER TABLE "t" ADD COLUMN "c" INTEGER DEFAULT 1 + 1;', /not a literal/);
  reject("DEFAULT with a parenthesised expression", 'ALTER TABLE "t" ADD COLUMN "c" INTEGER DEFAULT (1);', /not a literal/);
  reject("DEFAULT with a sub-select", 'ALTER TABLE "t" ADD COLUMN "c" INTEGER DEFAULT (SELECT 1);', /SELECT|not a literal/);
  reject("DEFAULT function in a CREATE TABLE column", 'CREATE TABLE "t" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), CONSTRAINT "t_pkey" PRIMARY KEY ("id"));', /not a literal/);
  reject("DEFAULT nextval call", "ALTER TABLE \"t\" ADD COLUMN \"c\" TEXT DEFAULT nextval('s');", /not a literal/);
  accept("DEFAULT integer, decimal, negative, boolean, NULL, string, cast string and CURRENT_TIMESTAMP",
    `ALTER TABLE "t" ADD COLUMN "a" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "b" DECIMAL(10,2) DEFAULT -1.5, ADD COLUMN "c" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "d" TEXT DEFAULT NULL, ADD COLUMN "e" TEXT NOT NULL DEFAULT 'x', ADD COLUMN "f" "Status" NOT NULL DEFAULT 'A'::"Status", ADD COLUMN "g" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "h" TEXT[] DEFAULT '{}'::text[], ADD COLUMN "i" VARCHAR(255);`);
  accept("DEFAULT CURRENT_TIMESTAMP inside CREATE TABLE", 'CREATE TABLE "t" ("id" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "t_pkey" PRIMARY KEY ("id"));');

  reject("GENERATED ... STORED column", 'ALTER TABLE "t" ADD COLUMN "c" INTEGER GENERATED ALWAYS AS (1) STORED;', /GENERATED/);
  reject("GENERATED identity column", 'ALTER TABLE "t" ADD COLUMN "c" INTEGER GENERATED ALWAYS AS IDENTITY;', /GENERATED/);
  reject("inline REFERENCES on ADD COLUMN", 'ALTER TABLE "t" ADD COLUMN "c" TEXT REFERENCES "o"("id");', /unsupported column modifier|plain type/);
  reject("inline CHECK on ADD COLUMN", 'ALTER TABLE "t" ADD COLUMN "c" INTEGER CHECK ("c" > 0);', /unsupported column modifier|plain type/);
  reject("inline UNIQUE on ADD COLUMN", 'ALTER TABLE "t" ADD COLUMN "c" TEXT UNIQUE;', /unsupported column modifier|plain type/);
  reject("inline PRIMARY KEY on ADD COLUMN", 'ALTER TABLE "t" ADD COLUMN "c" TEXT PRIMARY KEY;', /unsupported column modifier|plain type/);
  reject("COLLATE on ADD COLUMN", 'ALTER TABLE "t" ADD COLUMN "c" TEXT COLLATE "C";', /plain type|unsupported/);

  reject("ADD CONSTRAINT UNIQUE", 'ALTER TABLE "t" ADD CONSTRAINT "u" UNIQUE ("c");', /UNIQUE \/ PRIMARY KEY \/ EXCLUDE is not allowed/);
  reject("ADD CONSTRAINT PRIMARY KEY", 'ALTER TABLE "t" ADD CONSTRAINT "p" PRIMARY KEY ("c");', /UNIQUE \/ PRIMARY KEY \/ EXCLUDE is not allowed/);
  reject("ADD CONSTRAINT EXCLUDE", 'ALTER TABLE "t" ADD CONSTRAINT "x" EXCLUDE USING gist ("c" WITH =);', /EXCLUDE is not allowed/);
  accept("CREATE UNIQUE INDEX (the allowed replacement for a unique constraint)", 'CREATE UNIQUE INDEX "u" ON "t"("c");');

  reject("FOREIGN KEY on an existing table without NOT VALID", 'ALTER TABLE "t" ADD CONSTRAINT "f" FOREIGN KEY ("o") REFERENCES "o"("id") ON DELETE RESTRICT ON UPDATE CASCADE;', /must be NOT VALID/);
  accept("FOREIGN KEY on an existing table with NOT VALID", 'ALTER TABLE "t" ADD CONSTRAINT "f" FOREIGN KEY ("o") REFERENCES "o"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;');
  accept("FOREIGN KEY on a table created earlier in the same file (no existing rows)", 'CREATE TABLE "n" ("id" TEXT NOT NULL, "o" TEXT NOT NULL, CONSTRAINT "n_pkey" PRIMARY KEY ("id"));\nALTER TABLE "n" ADD CONSTRAINT "f" FOREIGN KEY ("o") REFERENCES "o"("id");');
  reject("FOREIGN KEY on a table created LATER in the file", 'ALTER TABLE "n" ADD CONSTRAINT "f" FOREIGN KEY ("o") REFERENCES "o"("id");\nCREATE TABLE "n" ("id" TEXT NOT NULL);', /must be NOT VALID/);
  reject("CHECK on an existing table without NOT VALID", 'ALTER TABLE "t" ADD CONSTRAINT "c" CHECK ("a" > 0);', /must be NOT VALID/);
  accept("CHECK on an existing table with NOT VALID", 'ALTER TABLE "t" ADD CONSTRAINT "c" CHECK ("a" > 0 AND "b" IN (\'x\', \'y\')) NOT VALID;');
  reject("a function call inside a CHECK", 'ALTER TABLE "t" ADD CONSTRAINT "c" CHECK (length("a") > 0) NOT VALID;', /function call inside a CHECK/);
  reject("a function call inside a CHECK in CREATE TABLE", 'CREATE TABLE "t" ("a" TEXT, CONSTRAINT "c" CHECK (char_length("a") > 0));', /function call inside a CHECK/);
  reject("a function call inside an index WHERE", 'CREATE INDEX "i" ON "t"("a") WHERE (lower("b") = \'x\');', /function call inside an index WHERE/);
  reject("a quoted-identifier call inside an index WHERE", 'CREATE INDEX "i" ON "t"("a") WHERE ("fn"("b"));', /function call inside an index WHERE/);
  accept("an index WHERE predicate without a call", 'CREATE UNIQUE INDEX "i" ON "t"("a") WHERE (reservation_entry = \'release\'::text);');
});

describe("additive-only scan — delta review R1: CREATE TABLE is strictly structural", () => {
  const reject = (label: string, sql: string, why: RegExp) =>
    it(`rejects ${label}`, () => {
      const r = scan(sql);
      expect(r.ok, sql).toBe(false);
      expect(r.violations.map((v) => v.reason).join(" | ")).toMatch(why);
    });
  const accept = (label: string, sql: string) => it(`accepts ${label}`, () => expect(scan(sql).violations).toEqual([]));
  const TAIL = /must close at the very end|CREATE TABLE must be exactly|forbidden keyword|CREATE TABLE column/;

  reject("CREATE TABLE ... AS VALUES (function call) (runs an existing function)", 'CREATE TABLE "t" ("a") AS VALUES (ev.evil())', TAIL);
  reject("CREATE TABLE ... AS (VALUES ...)", 'CREATE TABLE "t" ("a") AS (VALUES (ev.evil()))', TAIL);
  reject("CREATE TABLE ... AS VALUES (set_config(...))", `CREATE TABLE "t" ("a") AS VALUES (set_config('x.y','1',false))`, TAIL);
  reject("CREATE TABLE ... AS VALUES (pg_sleep(0)::text)", 'CREATE TABLE "t" ("a") AS VALUES (pg_sleep(0)::text)', TAIL);
  reject("CREATE TABLE ... AS SELECT", 'CREATE TABLE "t" ("a") AS SELECT 1', TAIL);
  reject("IF NOT EXISTS (must not count as created-in-this-file)", 'CREATE TABLE IF NOT EXISTS "t" ("a" int)', /CREATE TABLE must be exactly/);
  reject("IF NOT EXISTS then an un-NOT-VALID FK relying on the created-table exemption", 'CREATE TABLE IF NOT EXISTS "t" ("a" int);\nALTER TABLE "t" ADD CONSTRAINT "f" FOREIGN KEY ("a") REFERENCES "o"("id");', /CREATE TABLE must be exactly|must be NOT VALID/);
  reject("PARTITION BY", 'CREATE TABLE "t" ("a" int) PARTITION BY RANGE ("a")', TAIL);
  reject("PARTITION OF", 'CREATE TABLE "t" PARTITION OF "p" FOR VALUES FROM (1) TO (2)', /CREATE TABLE must be exactly/);
  reject("INHERITS", 'CREATE TABLE "t" ("a" int) INHERITS ("p")', TAIL);
  reject("LIKE", 'CREATE TABLE "t" (LIKE "p" INCLUDING ALL)', TAIL);
  reject("WITH (storage parameters)", 'CREATE TABLE "t" ("a" int) WITH (fillfactor = 50)', TAIL);
  reject("TABLESPACE", 'CREATE TABLE "t" ("a" int) TABLESPACE "x"', TAIL);
  reject("USING (access method)", 'CREATE TABLE "t" ("a" int) USING heap', TAIL);
  reject("ON COMMIT", 'CREATE TABLE "t" ("a" int) ON COMMIT DROP', TAIL);
  reject("UNLOGGED", 'CREATE UNLOGGED TABLE "t" ("a" int)', /allow-list/);
  reject("TEMP / TEMPORARY", 'CREATE TEMP TABLE "t" ("a" int)', /allow-list/);
  reject("trailing parenthesised text after the column list", 'CREATE TABLE "t" ("a" int) ("b")', TAIL);
  reject("an empty column list", 'CREATE TABLE "t" ()', /empty element|no column/);
  reject("an inline PRIMARY KEY on a column", 'CREATE TABLE "t" ("a" int PRIMARY KEY)', /plain type/);
  reject("an inline REFERENCES on a column", 'CREATE TABLE "t" ("a" int REFERENCES "o"("id"))', /plain type/);
  reject("EXCLUDE as a table constraint", 'CREATE TABLE "t" ("a" int, EXCLUDE USING gist ("a" WITH =))', /plain type|table constraint/);
  reject("DEFERRABLE foreign key", 'CREATE TABLE "t" ("a" int, CONSTRAINT "f" FOREIGN KEY ("a") REFERENCES "o"("id") DEFERRABLE)', /table constraint/);
  reject("a column definition containing a nested select", 'CREATE TABLE "t" ("a" int DEFAULT (SELECT 1))', /SELECT|not a literal/);
  accept("a Prisma-shaped CREATE TABLE (columns, primary key, unique, foreign key with actions, check)",
    'CREATE TABLE "t" ("id" TEXT NOT NULL, "n" INTEGER NOT NULL DEFAULT 0, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "o" TEXT, "s" "Status" NOT NULL DEFAULT \'A\'::"Status", "tags" TEXT[], CONSTRAINT "t_pkey" PRIMARY KEY ("id"), CONSTRAINT "t_u" UNIQUE ("n", "o"), CONSTRAINT "t_o_fkey" FOREIGN KEY ("o") REFERENCES "o"("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "t_c" CHECK ("n" >= 0));');
  it("only a plain CREATE TABLE counts as created in this file (the NOT VALID exemption)", () => {
    expect(scan('CREATE TABLE "n" ("id" TEXT NOT NULL, "o" TEXT NOT NULL);\nALTER TABLE "n" ADD CONSTRAINT "f" FOREIGN KEY ("o") REFERENCES "o"("id");').ok).toBe(true);
  });
});

describe("additive-only scan — delta review R2: column type allow-list", () => {
  const reject = (label: string, sql: string, why: RegExp) =>
    it(`rejects ${label}`, () => {
      const r = scan(sql);
      expect(r.ok, sql).toBe(false);
      expect(r.violations.map((v) => v.reason).join(" | ")).toMatch(why);
    });
  const accept = (label: string, sql: string) => it(`accepts ${label}`, () => expect(scan(sql).violations).toEqual([]));

  for (const t of ["serial", "bigserial", "smallserial", "SERIAL", "serial4", "serial8", "serial2", "serial[]"]) reject(`ADD COLUMN ${t}`, `ALTER TABLE "t" ADD COLUMN "c" ${t};`, /serial-family/);
  reject("serial in CREATE TABLE (sequence invisible to the manifest)", 'CREATE TABLE "t" ("id" SERIAL NOT NULL, CONSTRAINT "t_pkey" PRIMARY KEY ("id"))', /serial-family/);
  for (const t of ["money", "citext", "inet", "cidr", "macaddr", "xml", "tsvector", "point", "int4range", "oid", "name", "foo", "some_enum"]) reject(`ADD COLUMN of non-allow-listed type ${t}`, `ALTER TABLE "t" ADD COLUMN "c" ${t};`, /allow-list|plain type/);
  reject("a schema-qualified type outside public", 'ALTER TABLE "t" ADD COLUMN "c" "other"."Status";', /allow-list|plain type/);
  reject("a pg_catalog-qualified type", 'ALTER TABLE "t" ADD COLUMN "c" pg_catalog.serial;', /allow-list|plain type/);
  accept("every allow-listed type, with sizes, zones and array suffixes",
    ['text', 'varchar(255)', 'character varying(10)', 'char(2)', 'character(3)', 'integer', 'int', 'int4', 'bigint', 'int8', 'smallint', 'int2', 'boolean', 'bool', 'uuid', 'timestamp', 'timestamp(3)', 'timestamp(6) without time zone', 'timestamp with time zone', 'timestamptz', 'timestamptz(3)', 'date', 'time', 'time(3) with time zone', 'timetz', 'jsonb', 'json', 'numeric', 'numeric(10,2)', 'decimal(12)', 'double precision', 'real', 'float4', 'float8', 'bytea', 'text[]', 'integer[][]', '"Status"', '"public"."Status"', '"Status"[]']
      .map((t, i) => `ALTER TABLE "t" ADD COLUMN "c${i}" ${t};`).join("\n"));
  it("the 3 real pending migrations still pass", () => {
    for (const n of REAL) expect(scan(read(n)).ok).toBe(true);
  });
});

describe("additive-only scan — R2b: a quoted type name must not be able to collide with a built-in or pseudo type", () => {
  const reject = (label: string, sql: string, why: RegExp) =>
    it(`rejects ${label}`, () => {
      const r = scan(sql);
      expect(r.ok, sql).toBe(false);
      expect(r.violations.map((v) => v.reason).join(" | ")).toMatch(why);
    });
  const accept = (label: string, sql: string) => it(`accepts ${label}`, () => expect(scan(sql).violations).toEqual([]));

  // reviewer repros (each emits CREATE SEQUENCE on PostgreSQL)
  reject('R2b repro: ADD COLUMN "serial"', 'ALTER TABLE "canary_big" ADD COLUMN "g" "serial"', /serial-family/);
  reject('R2b repro: CREATE TABLE column "serial"', 'CREATE TABLE "t1" ("a" "serial" NOT NULL)', /serial-family/);
  reject('R2b repro: CREATE TABLE column "bigserial"', 'CREATE TABLE "t1" ("a" "bigserial")', /serial-family/);
  reject('"smallserial"', 'ALTER TABLE "t" ADD COLUMN "c" "smallserial"', /serial-family/);
  reject('"serial4" / "serial8" / "serial2"', 'ALTER TABLE "t" ADD COLUMN "a" "serial4", ADD COLUMN "b" "serial8", ADD COLUMN "c" "serial2"', /serial-family/);
  reject('"serial"[]', 'ALTER TABLE "t" ADD COLUMN "c" "serial"[]', /serial-family/);
  reject('"public"."serial"', 'ALTER TABLE "t" ADD COLUMN "c" "public"."serial"', /serial-family/);
  reject('"pg_catalog"."serial"', 'ALTER TABLE "t" ADD COLUMN "c" "pg_catalog"."serial"', /allow-list|plain type/);
  reject('"pg_catalog"."int4"', 'ALTER TABLE "t" ADD COLUMN "c" "pg_catalog"."int4"', /allow-list|plain type/);
  reject('"SERIAL" (case-folds to the serial family; a different, nonexistent type on PostgreSQL)', 'ALTER TABLE "t" ADD COLUMN "c" "SERIAL"', /serial-family/);
  reject('"BigSerial" and "Serial"', 'ALTER TABLE "t" ADD COLUMN "a" "BigSerial", ADD COLUMN "b" "Serial"', /serial-family/);
  reject("unquoted Serial / BIGSERIAL case variants", 'ALTER TABLE "t" ADD COLUMN "a" Serial, ADD COLUMN "b" BIGSERIAL', /serial-family/);
  reject('an all-lowercase quoted built-in name "int4"', 'ALTER TABLE "t" ADD COLUMN "c" "int4"', /no uppercase letter/);
  reject('an all-lowercase quoted name "text"', 'ALTER TABLE "t" ADD COLUMN "c" "text"', /no uppercase letter/);
  reject('an all-lowercase quoted name that is not built in "my_enum"', 'ALTER TABLE "t" ADD COLUMN "c" "my_enum"', /no uppercase letter/);
  reject('a quoted name that folds to a built-in ("TEXT")', 'ALTER TABLE "t" ADD COLUMN "c" "TEXT"', /folds to a built-in/);
  reject('a quoted other-schema type "other"."Status"', 'ALTER TABLE "t" ADD COLUMN "c" "other"."Status"', /allow-list|plain type/);
  reject("an unquoted schema-qualified type", 'ALTER TABLE "t" ADD COLUMN "c" public.Status', /allow-list|plain type/);
  accept('PascalCase quoted enum types, unqualified, "public"-qualified and arrays', 'ALTER TABLE "t" ADD COLUMN "a" "Status", ADD COLUMN "b" "public"."Status", ADD COLUMN "c" "Status"[], ADD COLUMN "d" "OrderStatus"[][], ADD COLUMN "e" "aB";');
  accept("a quoted type with an uppercase letter that is not built in ('Status' default cast)", `ALTER TABLE "t" ADD COLUMN "a" "Status" NOT NULL DEFAULT 'A'::"Status";`);
});
