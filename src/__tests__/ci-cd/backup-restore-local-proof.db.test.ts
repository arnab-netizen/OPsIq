/**
 * LOCAL RESTORE PROOF (F-LOCAL-RESTORE-PROOF) + least-privilege backup role + erasure reconciliation,
 * against REAL, disposable PostgreSQL databases created and dropped by this test (never Production, never
 * a shared database): the real scripts end to end, with real `age`, `pg_dump`, `psql`.
 *
 *   disposable source DB --(opsiq_backup role)--> backup-database-r2.sh (BACKUP_LOCAL_ONLY_DIR, 2 recipients)
 *     --> decrypt with EITHER identity alone --> restore-database-r2.sh (loopback target) into a second
 *     disposable DB --> per-table row counts + content digest identical --> erasure reconciliation gate.
 *
 * Requires TEST_WITH_DB=true and the `age`, `pg_dump`, `psql` binaries (skips otherwise; run locally with
 * them installed -- the CI DB job does not ship `age`).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";

import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { buildNextLedgerRecord, type ErasureLedgerRecord } from "@/services/privacy-erasure/erasure-ledger";

const have = (bin: string) => spawnSync(bin, ["--version"]).status === 0;
const CAN_RUN = SHOULD_RUN_DB_TESTS && have("age") && have("age-keygen") && have("pg_dump") && have("psql");

const ROOT = process.cwd();
const BACKUP = resolve(ROOT, "scripts/backup-database-r2.sh");
const RESTORE = resolve(ROOT, "scripts/restore-database-r2.sh");
const CRED_CHECK = resolve(ROOT, "scripts/backup-credential-check.sh");
const ROLE_SQL = resolve(ROOT, "scripts/backup/opsiq-backup-role.sql");
const VERIFY_LEDGER = resolve(ROOT, "scripts/privacy/verify-erasure-ledger.ts");

const ROLE_PW = "bk-" + randomBytes(8).toString("hex");
const SIGNING_KEY = "ledger-signing-key-for-tests-" + randomBytes(8).toString("hex");
const MANIFEST_KEY = "manifest-signing-key-at-least-32-chars-" + randomBytes(6).toString("hex");
const suffix = randomBytes(4).toString("hex");
const SRC_DB = `opsiq_proof_src_${suffix}`;
const DST_DB = `opsiq_proof_dst_${suffix}`;
const ROLE = "opsiq_backup";

function adminParts() {
  const u = new URL(process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "");
  if (!/^(localhost|127\.|\[?::1\]?$)/.test(u.hostname)) throw new Error("SAFETY GATE: this proof only runs against a loopback database");
  return { host: u.hostname === "::1" ? "localhost" : u.hostname, port: u.port || "5432", user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}
function urlFor(db: string, user?: string, password?: string) {
  const a = adminParts();
  const cred = `${encodeURIComponent(user ?? a.user)}:${encodeURIComponent(password ?? a.password)}`;
  return `postgresql://${cred}@${a.host}:${a.port}/${db}`;
}
async function admin<T>(db: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: urlFor(db) });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}
function keypair() {
  const r = spawnSync("age-keygen", [], { encoding: "utf8" });
  return { identity: r.stdout, recipient: r.stderr.match(/Public key: (age1\S+)/)![1] };
}
function sh(script: string, env: Record<string, string>, args: string[] = []) {
  return spawnSync("bash", [script, ...args], { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env }, encoding: "utf8", timeout: 120_000 });
}
async function digest(db: string): Promise<Record<string, { rows: number; md5: string }>> {
  return admin(db, async (c) => {
    const out: Record<string, { rows: number; md5: string }> = {};
    for (const t of ["customers", "invoices", "privacy_erasure_requests"]) {
      const r = await c.query(`SELECT count(*)::int AS n, coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '') AS m FROM ${t} x`);
      out[t] = { rows: r.rows[0].n, md5: r.rows[0].m };
    }
    return out;
  });
}

/**
 * FAIL-CLOSED: in CI (OPSIQ_REQUIRE_RESTORE_PROOF=1) the real-age + real-PostgreSQL restore proof below
 * is mandatory. Without this, a runner lacking `age` made every test in the suite SKIP and the DB job
 * stayed green while proving nothing about restore.
 */
describe("restore proof is mandatory in CI (cannot silently skip)", () => {
  it("OPSIQ_REQUIRE_RESTORE_PROOF=1 requires real age, age-keygen, pg_dump, psql and TEST_WITH_DB=true", () => {
    if (process.env.OPSIQ_REQUIRE_RESTORE_PROOF !== "1") return;
    expect(SHOULD_RUN_DB_TESTS, "TEST_WITH_DB must be true when the restore proof is required").toBe(true);
    for (const bin of ["age", "age-keygen", "pg_dump", "psql"]) {
      expect(have(bin), `required binary missing or not runnable: ${bin}`).toBe(true);
    }
    expect(CAN_RUN, "restore proof would be skipped").toBe(true);
  });
});

describe.skipIf(!CAN_RUN)("local backup → restore proof, least-privilege role, erasure reconciliation (real PostgreSQL + real age)", () => {
  let work: string;
  let primary: ReturnType<typeof keypair>;
  let escrow: ReturnType<typeof keypair>;
  let outDir: string;
  let objectName: string;
  let manifestTs: string;
  const erasedId = randomUUID();

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), "backup-proof-"));
    outDir = join(work, "out");
    primary = keypair();
    escrow = keypair();

    await admin("postgres", async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${SRC_DB}`);
      await c.query(`DROP DATABASE IF EXISTS ${DST_DB}`);
      await c.query(`CREATE DATABASE ${SRC_DB}`);
      await c.query(`CREATE DATABASE ${DST_DB}`);
    });
    await admin(SRC_DB, async (c) => {
      await c.query(`CREATE TABLE customers (id uuid PRIMARY KEY, name text NOT NULL, notes text)`);
      await c.query(`CREATE TABLE invoices (id serial PRIMARY KEY, customer_id uuid REFERENCES customers(id), amount numeric(12,2) NOT NULL)`);
      await c.query(`CREATE TABLE privacy_erasure_requests (id uuid PRIMARY KEY, status text NOT NULL)`);
      await c.query(`CREATE TABLE qbo_connections (id uuid PRIMARY KEY)`); // empty: the QBO gate must ALLOW
      for (let i = 0; i < 40; i++) {
        const id = randomUUID();
        await c.query(`INSERT INTO customers VALUES ($1, $2, $3)`, [id, `Customer ${i}`, i % 3 === 0 ? null : `note ${i} with 'quotes' and unicode é`]);
        await c.query(`INSERT INTO invoices (customer_id, amount) VALUES ($1, $2)`, [id, (i * 13.37).toFixed(2)]);
      }
      await c.query(`INSERT INTO privacy_erasure_requests VALUES ($1, 'EXECUTED')`, [randomUUID()]);
    });

    // Provision the least-privilege role with the REAL role script, in the source database.
    const apply = spawnSync("psql", [urlFor(SRC_DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", ROLE_SQL], { encoding: "utf8" });
    expect(apply.status, apply.stderr).toBe(0);
    await admin(SRC_DB, async (c) => {
      await c.query(`ALTER ROLE ${ROLE} PASSWORD '${ROLE_PW}'`);
    });
  });

  afterAll(async () => {
    rmSync(work, { recursive: true, force: true });
    await admin("postgres", async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${SRC_DB}`);
      await c.query(`DROP DATABASE IF EXISTS ${DST_DB}`);
    }).catch(() => undefined);
    await admin("postgres", async (c) => {
      await c.query(`DROP ROLE IF EXISTS bk_writer`).catch(() => undefined);
      await c.query(`DROP ROLE IF EXISTS bk_partial`).catch(() => undefined);
      await c.query(`DROP OWNED BY ${ROLE}`).catch(() => undefined);
      await c.query(`DROP ROLE IF EXISTS ${ROLE}`).catch(() => undefined);
    }).catch(() => undefined);
  });

  // ---------------------------------------------------------------------------------- credential check
  describe("scripts/backup-credential-check.sh (read-only; counts only)", () => {
    it("PASSES for the provisioned opsiq_backup role and prints no data, host or credential", () => {
      const r = sh(CRED_CHECK, { DATABASE_URL: urlFor(SRC_DB, ROLE, ROLE_PW) });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/BACKUP_CREDENTIAL=OK/);
      expect(r.stdout).toMatch(/tables_unreadable=0/);
      expect(r.stdout).toMatch(/tables_with_write_privilege=0/);
      expect(r.stdout).toMatch(/is_superuser=false/);
      expect(r.stdout + r.stderr).not.toContain(ROLE_PW);
      expect(r.stdout + r.stderr).not.toMatch(/Customer \d|localhost|127\.0\.0\.1/);
    });

    it("REFUSES a schema-owner / superuser credential (over-privileged) but can still be inspected with REQUIRE_LEAST_PRIVILEGE=0", () => {
      const strict = sh(CRED_CHECK, { DATABASE_URL: urlFor(SRC_DB) });
      expect(strict.status).toBe(1);
      expect(strict.stdout).toMatch(/BACKUP_CREDENTIAL=FAIL reason=over_privileged_superuser/);
      const lax = sh(CRED_CHECK, { DATABASE_URL: urlFor(SRC_DB), REQUIRE_LEAST_PRIVILEGE: "0" });
      expect(lax.status, lax.stdout).toBe(0);
    });

    it("REFUSES a role that can write, and a role that cannot read every table (a silently partial backup)", async () => {
      await admin(SRC_DB, async (c) => {
        await c.query(`DROP ROLE IF EXISTS bk_writer`);
        await c.query(`CREATE ROLE bk_writer LOGIN PASSWORD 'w'`);
        await c.query(`GRANT pg_read_all_data TO bk_writer`);
        await c.query(`GRANT INSERT ON customers TO bk_writer`);
        await c.query(`DROP ROLE IF EXISTS bk_partial`);
        await c.query(`CREATE ROLE bk_partial LOGIN PASSWORD 'p'`);
        await c.query(`GRANT USAGE ON SCHEMA public TO bk_partial`);
        await c.query(`GRANT SELECT ON customers TO bk_partial`);
      });
      const writer = sh(CRED_CHECK, { DATABASE_URL: urlFor(SRC_DB, "bk_writer", "w") });
      expect(writer.status).toBe(1);
      expect(writer.stdout).toMatch(/reason=over_privileged_write_access/);
      const partial = sh(CRED_CHECK, { DATABASE_URL: urlFor(SRC_DB, "bk_partial", "p") });
      expect(partial.status).toBe(1);
      expect(partial.stdout).toMatch(/reason=tables_unreadable/);
    });

    it("fails closed with a CLASSIFIED reason (never raw error text) on a bad password, a pooled endpoint and a placeholder", () => {
      // A role that does not exist is refused under every pg_hba mode (trust-auth local clusters accept ANY
      // password for an existing role, so a "wrong password" cannot be forced portably).
      const bad = sh(CRED_CHECK, { DATABASE_URL: urlFor(SRC_DB, "no_such_backup_role", "wrong-password") });
      expect(bad.status).toBe(1);
      expect(bad.stdout).toMatch(/reason=connection_(AUTH_FAILED|CONNECT_FAILED)/);
      expect(bad.stdout + bad.stderr).not.toMatch(/wrong-password|FATAL|no_such_backup_role/);
      expect(sh(CRED_CHECK, { DATABASE_URL: "postgresql://u:p@ep-x-pooler.neon.tech/db" }).stdout).toMatch(/reason=pooled_endpoint/);
      expect(sh(CRED_CHECK, { DATABASE_URL: "postgresql://u:REPLACE_ME@localhost/db" }).stdout).toMatch(/reason=placeholder_url/);
    });

    it("the role really cannot change anything, even with default_transaction_read_only switched off in-session", async () => {
      const c = new Client({ connectionString: urlFor(SRC_DB, ROLE, ROLE_PW) });
      await c.connect();
      try {
        await c.query(`SET default_transaction_read_only = off`);
        await expect(c.query(`INSERT INTO customers VALUES (gen_random_uuid(), 'x', 'y')`)).rejects.toMatchObject({ code: "42501" });
        await expect(c.query(`DELETE FROM invoices`)).rejects.toMatchObject({ code: "42501" });
        await expect(c.query(`DROP TABLE customers`)).rejects.toMatchObject({ code: "42501" });
        await expect(c.query(`CREATE TABLE evil (id int)`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await c.end();
      }
    });
  });

  // ---------------------------------------------------------------------------------- backup + restore
  describe("backup (2 recipients) → local restore → identical data", () => {
    it("backs up as opsiq_backup with the REAL script; the QBO gate ALLOWs; the object has 2 recipient stanzas", () => {
      const r = sh(BACKUP, {
        DATABASE_URL: urlFor(SRC_DB, ROLE, ROLE_PW),
        AGE_RECIPIENT: primary.recipient,
        AGE_ESCROW_RECIPIENT: escrow.recipient,
        MANIFEST_SIGNING_KEY: MANIFEST_KEY,
        BACKUP_LOCAL_ONLY_DIR: outDir,
        TMPDIR: work,
      });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/QBO_BACKUP_GATE=ALLOW/);
      expect(r.stdout).toMatch(/ESCROW_RECIPIENTS_VERIFIED=2/);
      const names = readdirSync(outDir);
      objectName = names.find((n) => n.endsWith(".sql.gz.age"))!;
      expect(objectName).toBeTruthy();
      manifestTs = JSON.parse(readFileSync(join(outDir, names.find((n) => n.endsWith(".manifest.json"))!), "utf8")).timestamp_utc;
      // No plaintext anywhere in what was stored.
      for (const n of names) expect(readFileSync(join(outDir, n)).toString("latin1")).not.toContain("Customer 7");
    });

    for (const which of ["primary", "escrow"] as const) {
      it(`restores into a second disposable database using the ${which} identity ALONE; data is identical`, async () => {
        const id = which === "primary" ? primary.identity : escrow.identity;
        const idFile = join(work, `${which}.key`);
        writeFileSync(idFile, id, { mode: 0o600 });
        await admin(DST_DB, async (c) => {
          await c.query(`DROP SCHEMA public CASCADE`);
          await c.query(`CREATE SCHEMA public`);
        });
        const r = sh(RESTORE, { OPSIQ_DB_TARGET: "local", DATABASE_URL: urlFor(DST_DB), AGE_IDENTITY_FILE: idFile, RESTORE_SOURCE_DIR: outDir, TMPDIR: work }, [objectName]);
        expect(r.status, r.stdout + r.stderr).toBe(0);
        expect(r.stdout).toMatch(/RESTORE_SERVICEABLE=NO_UNTIL_ERASURE_RECONCILED/);
        const [src, dst] = [await digest(SRC_DB), await digest(DST_DB)];
        expect(dst).toEqual(src);
        expect(src.customers.rows).toBe(40);
        expect(src.invoices.rows).toBe(40);
      }, 120_000);
    }

    it("a WRONG identity, a tampered ciphertext and a production target all fail closed", async () => {
      const stranger = keypair();
      const strangerFile = join(work, "stranger.key");
      writeFileSync(strangerFile, stranger.identity, { mode: 0o600 });
      const env = { OPSIQ_DB_TARGET: "local", DATABASE_URL: urlFor(DST_DB), RESTORE_SOURCE_DIR: outDir, TMPDIR: work };
      expect(sh(RESTORE, { ...env, AGE_IDENTITY_FILE: strangerFile }, [objectName]).status).not.toBe(0);

      const tamperedDir = join(work, "tampered");
      mkdirSync(tamperedDir);
      const bytes = readFileSync(join(outDir, objectName));
      bytes[bytes.length - 3] ^= 0xff;
      writeFileSync(join(tamperedDir, objectName), bytes);
      writeFileSync(join(tamperedDir, `${objectName}.sha256`), readFileSync(join(outDir, `${objectName}.sha256`)));
      const idFile = join(work, "primary.key");
      const t = sh(RESTORE, { ...env, AGE_IDENTITY_FILE: idFile, RESTORE_SOURCE_DIR: tamperedDir }, [objectName]);
      expect(t.status).not.toBe(0);
      expect(t.stderr).toMatch(/checksum mismatch/);

      const prod = sh(RESTORE, { ...env, OPSIQ_DB_TARGET: "production", AGE_IDENTITY_FILE: idFile }, [objectName]);
      expect(prod.status).not.toBe(0);
    }, 120_000);
  });

  // ---------------------------------------------------------------------------------- reconciliation
  describe("post-erasure reconciliation gate (a restored backup is never serviceable until reconciled)", () => {
    function ledgerDir(records: ErasureLedgerRecord[]) {
      const d = mkdtempSync(join(work, "ledger-"));
      records.forEach((r, i) => writeFileSync(join(d, `${String(i).padStart(6, "0")}.json`), JSON.stringify(r)));
      return d;
    }
    const verify = (dir: string, extra: string[] = [], env: Record<string, string> = {}) =>
      spawnSync("npx", ["tsx", VERIFY_LEDGER, "--ledger-dir", dir, ...extra], {
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ERASURE_LEDGER_SIGNING_KEY: SIGNING_KEY, ...env },
        encoding: "utf8",
        timeout: 120_000,
      });
    const rec = (tail: ErasureLedgerRecord | null, completedAt: string, eventId: string, erasureRequestId = randomUUID()) =>
      buildNextLedgerRecord({
        tail,
        erasureRequestId,
        erasureType: "GENERAL",
        scope: { workspaceId: randomUUID(), businessId: randomUUID() },
        completedAt,
        signingKey: SIGNING_KEY,
        eventId,
      });

    it("an erasure completed AFTER the backup is PENDING: the restore is BLOCKED, then PROMOTABLE only once the operator reports it re-applied", () => {
      const after = new Date(new Date(manifestTs).getTime() + 3_600_000).toISOString();
      const r0 = rec(null, after, erasedId);
      const dir = ledgerDir([r0]);
      const blocked = verify(dir, ["--backup-timestamp", manifestTs]);
      expect(blocked.status).toBe(1);
      expect(blocked.stdout).toMatch(/RESTORE_PROMOTION=BLOCKED/);
      expect(blocked.stdout).toMatch(new RegExp(`PENDING_ERASURE eventId=${erasedId}`));
      const ok = verify(dir, ["--backup-timestamp", manifestTs, "--reconciled-event-ids", erasedId]);
      expect(ok.status, ok.stdout + ok.stderr).toBe(0);
      expect(ok.stdout).toMatch(/RESTORE_PROMOTION=PROMOTABLE/);
    }, 150_000);

    it("a tampered ledger is INVALID and blocks; an unreadable ledger is UNAVAILABLE and blocks (uncertain = block)", () => {
      const after = new Date(new Date(manifestTs).getTime() + 3_600_000).toISOString();
      const r0 = rec(null, after, randomUUID());
      const forged = { ...r0, completedAt: new Date(new Date(manifestTs).getTime() - 3_600_000).toISOString() }; // hide it as pre-backup
      const bad = verify(ledgerDir([forged]), ["--backup-timestamp", manifestTs]);
      expect(bad.status).toBe(1);
      expect(bad.stdout).toMatch(/ERASURE_LEDGER_STATUS=INVALID/);
      const missing = verify(join(work, "does-not-exist"), ["--backup-timestamp", manifestTs]);
      expect(missing.status).toBe(1);
      expect(missing.stdout).toMatch(/ERASURE_LEDGER_STATUS=UNAVAILABLE/);
    }, 150_000);

    it("cross-checks the restored copy: a ledger claiming an erasure happened AFTER the backup, while the restored database already holds its EXECUTED tombstone, is BLOCKED", async () => {
      const reqId = randomUUID();
      await admin(DST_DB, (c) => c.query(`INSERT INTO privacy_erasure_requests VALUES ($1, 'EXECUTED')`, [reqId]));
      const after = new Date(new Date(manifestTs).getTime() + 3_600_000).toISOString();
      const eventId = randomUUID();
      const dir = ledgerDir([rec(null, after, eventId, reqId)]);
      const r = verify(dir, ["--backup-timestamp", manifestTs], { RESTORED_DATABASE_URL: urlFor(DST_DB) });
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/RESTORE_PROMOTION=BLOCKED/);
      expect(r.stdout).toMatch(/already contains the tombstone/);
    }, 150_000);

    it("refuses a non-loopback RESTORED_DATABASE_URL (a restored copy is only ever inspected locally)", () => {
      const dir = ledgerDir([rec(null, new Date().toISOString(), randomUUID())]);
      const r = verify(dir, ["--backup-timestamp", manifestTs], { RESTORED_DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db" });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/must be a loopback database/);
    }, 150_000);
  });
});
