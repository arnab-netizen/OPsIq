/**
 * REAL-PostgreSQL proof for scripts/restore-database.sh (F-RESTORE-SCRIPT-MACOS-PORTABILITY): real `pg_dump --create`
 * | gzip, real `psql`, a disposable loopback server, the real script, both with the host's native tools and with a
 * simulated stock-macOS tool environment (no sha256sum, BSD-style grep that rejects -P).
 *
 * Isolation: only a loopback admin URL is accepted; databases are uniquely named and created/dropped by this test.
 * Never Production, never a shared database.
 *
 * Environment:
 *   RESTORE_PORTABILITY_DATABASE_URL   admin URL of the disposable server (default: DATABASE_URL, loopback only)
 *   RESTORE_PORTABILITY_EXPECT_MAJOR   if set, the server AND the pg_dump/psql client majors must equal it
 *                                      (used by CI to prove a real PostgreSQL 18 client + server pair)
 *   OPSIQ_REQUIRE_RESTORE_PORTABILITY  =1: the proof is mandatory (a missing binary or gate FAILS instead of skipping)
 * pg_dump/psql majors must equal the server major (a mismatched dump is not restorable; see F-RESTORE-PROOF-PG-MAJOR-MISMATCH).
 *
 * This is Linux proof (or native macOS proof when run on a Mac). It is not a substitute for a native macOS run of
 * the non-DB portability test on the machine that will actually perform a recovery.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { Client } from "pg";

import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { toolDir, type EnvKind } from "@/__tests__/test-helpers/restore-script-harness";

const have = (bin: string) => spawnSync(bin, ["--version"]).status === 0;
const CAN_RUN = SHOULD_RUN_DB_TESTS && have("pg_dump") && have("psql");
const REQUIRED = process.env.OPSIQ_REQUIRE_RESTORE_PORTABILITY === "1";
const ROOT = process.cwd();
const SCRIPT = resolve(ROOT, "scripts/restore-database.sh");

function adminParts() {
  const u = new URL(process.env.RESTORE_PORTABILITY_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "");
  if (!/^(localhost|127\.|\[?::1\]?$)/.test(u.hostname)) throw new Error("SAFETY GATE: this proof only runs against a loopback database");
  return { host: u.hostname === "::1" ? "localhost" : u.hostname, port: u.port || "5432", user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}
const urlFor = (db: string, query = "") => {
  const a = adminParts();
  return `postgresql://${encodeURIComponent(a.user)}:${encodeURIComponent(a.password)}@${a.host}:${a.port}/${db}${query}`;
};
async function withClient<T>(db: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: urlFor(db) });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}
const majorOf = (text: string) => Number(/(\d+)(?:\.\d+)*/.exec(text.replace(/^\D*/, ""))?.[1]);

describe("restore portability proof is mandatory in CI (cannot silently skip)", () => {
  it("OPSIQ_REQUIRE_RESTORE_PORTABILITY=1 requires TEST_WITH_DB=true, pg_dump and psql", () => {
    if (!REQUIRED) return;
    expect(SHOULD_RUN_DB_TESTS, "TEST_WITH_DB must be true when the portability proof is required").toBe(true);
    for (const bin of ["pg_dump", "psql"]) expect(have(bin), `required binary missing or not runnable: ${bin}`).toBe(true);
    expect(CAN_RUN, "portability proof would be skipped").toBe(true);
  });
});

describe.skipIf(!CAN_RUN)("restore-database.sh against a real PostgreSQL server (real pg_dump --create | gzip, real psql)", () => {
  let work: string;
  const suffix = randomBytes(4).toString("hex");
  const dbs: string[] = [];
  let serverMajor = 0;

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), "restore-portability-db-"));
    serverMajor = await withClient("postgres", async (c) => Math.floor(Number((await c.query("show server_version_num")).rows[0].server_version_num) / 10000));
  });
  afterAll(async () => {
    for (const db of dbs) await withClient("postgres", (c) => c.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`)).catch(() => undefined);
    rmSync(work, { recursive: true, force: true });
  });

  it("client and server majors match (and equal RESTORE_PORTABILITY_EXPECT_MAJOR when set)", () => {
    const dump = majorOf(spawnSync("pg_dump", ["--version"], { encoding: "utf8" }).stdout);
    const psql = majorOf(spawnSync("psql", ["--version"], { encoding: "utf8" }).stdout);
    expect(dump, "pg_dump major must equal the server major").toBe(serverMajor);
    expect(psql, "psql major must equal the server major").toBe(serverMajor);
    if (process.env.RESTORE_PORTABILITY_EXPECT_MAJOR) expect(serverMajor).toBe(Number(process.env.RESTORE_PORTABILITY_EXPECT_MAJOR));
  });

  async function seed(name: string, rows: number): Promise<string> {
    const db = `opsiq_port_${name}_${suffix}`;
    dbs.push(db);
    await withClient("postgres", async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
      await c.query(`CREATE DATABASE ${db}`);
    });
    await withClient(db, async (c) => {
      await c.query(`CREATE TABLE customers (id int PRIMARY KEY, name text NOT NULL, notes text)`);
      await c.query(`CREATE TABLE invoices (id serial PRIMARY KEY, customer_id int REFERENCES customers(id), amount numeric(12,2) NOT NULL)`);
      for (let i = 0; i < rows; i++) {
        await c.query(`INSERT INTO customers VALUES ($1, $2, $3)`, [i, `Customer ${i}`, i % 3 === 0 ? null : `note ${i} with 'quotes', \\backslash and unicode é`]);
        await c.query(`INSERT INTO invoices (customer_id, amount) VALUES ($1, $2)`, [i, (i * 13.37).toFixed(2)]);
      }
    });
    return db;
  }
  const digest = (db: string) =>
    withClient(db, async (c) => (await c.query(`SELECT md5(string_agg(id::text || name || coalesce(notes,''), ',' ORDER BY id)) AS d, (SELECT count(*) FROM invoices) AS inv FROM customers`)).rows[0] as { d: string | null; inv: string });

  /** Real pg_dump --create | gzip + sidecar; then the source database is DROPPED so the restore must recreate it. */
  async function dumpAndDrop(db: string): Promise<{ file: string; hash: string }> {
    const r = spawnSync("pg_dump", [urlFor(db), "--create", "--clean", "--if-exists", "--no-owner", "--no-acl"], { maxBuffer: 256 * 1024 * 1024 });
    expect(r.status, String(r.stderr)).toBe(0);
    const gz = gzipSync(r.stdout);
    const file = join(mkdtempSync(join(work, "d-")), `${db}.sql.gz`);
    writeFileSync(file, gz);
    const hash = createHash("sha256").update(gz).digest("hex");
    writeFileSync(`${file}.sha256`, `${hash}\n`);
    await withClient("postgres", (c) => c.query(`DROP DATABASE ${db} WITH (FORCE)`));
    return { file, hash };
  }

  function restore(file: string, kind: EnvKind, env: Record<string, string> = {}) {
    const bin = toolDir(work, kind, "real");
    const r = spawnSync("/bin/bash", [SCRIPT, file, "verify"], {
      env: { PATH: kind === "native" ? `${bin}${delimiter}${process.env.PATH ?? ""}` : bin, HOME: work, ...(process.env.LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH } : {}), OPSIQ_DB_TARGET: "local", DATABASE_URL: urlFor("postgres", "?sslmode=disable&application_name=proof"), ...env },
      encoding: "utf8",
      cwd: ROOT,
      timeout: 120_000,
    });
    return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  }
  const exists = (db: string) => withClient("postgres", async (c) => (await c.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [db])).rowCount === 1);

  for (const [label, kind] of [
    ["native tool environment", "native"],
    ["simulated stock macOS (no sha256sum, grep rejects -P)", "no-sha256sum"],
  ] as Array<[string, EnvKind]>) {
    it(`restores a real dump with identical data and correct verification output — ${label}`, async () => {
      const db = await seed(kind === "native" ? "n" : "m", 40);
      const before = await digest(db);
      const { file, hash } = await dumpAndDrop(db);
      expect(await exists(db)).toBe(false);
      const r = restore(file, kind);
      expect(r.status, r.out).toBe(0);
      expect(r.out).toContain(`Checksum verified: ${hash}`);
      expect(r.out).toContain(`Restored database name (from dump): ${db}`);
      expect(r.out).toContain("Tables in restored database: 2");
      expect(r.out).toContain("Total rows across all public-schema tables: 80");
      expect(r.out).toContain("Database restore verified: 2 tables, 80 total rows");
      expect(await digest(db)).toEqual(before);
    });
  }

  it("a populated restore is never reported as 0 rows, and a genuinely empty one is reported as 0 with the warning (real count parse)", async () => {
    const empty = await seed("e", 0);
    const { file } = await dumpAndDrop(empty);
    const r = restore(file, "no-sha256sum");
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("Total rows across all public-schema tables: 0");
    expect(r.out).toContain("RESTORE VERIFICATION WARNING: schema restored but zero rows found");
  });

  it("a tampered backup is refused before any database change (checksum), on both tool environments", async () => {
    for (const kind of ["native", "no-sha256sum"] as EnvKind[]) {
      const db = await seed(`t${kind === "native" ? "n" : "m"}`, 5);
      const { file } = await dumpAndDrop(db);
      writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from("x")]));
      const r = restore(file, kind);
      expect(r.status).toBe(1);
      expect(r.out).toContain("Checksum mismatch!");
      expect(await exists(db), "no database may be created by a refused restore").toBe(false);
    }
  });

  it("production target and a non-loopback URL are refused; nothing is created", async () => {
    const db = await seed("p", 3);
    const { file } = await dumpAndDrop(db);
    const prod = restore(file, "native", { OPSIQ_DB_TARGET: "production" });
    expect(prod.status).toBe(1);
    expect(prod.out).toContain("PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW");
    const remote = restore(file, "native", { DATABASE_URL: "postgresql://u:p@db.example-host.net:5432/x" });
    expect(remote.status).toBe(1);
    expect(remote.out).toContain("RESTORE_LOCAL_REQUIRES_LOOPBACK");
    expect(await exists(db)).toBe(false);
  });
});
