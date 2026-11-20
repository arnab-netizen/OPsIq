/**
 * MAIN_BATCH against REAL PostgreSQL databases (disposable, created and dropped by this test on the guarded loopback
 * test server; the shared test database itself is never modified).
 *
 * Each case reproduces production's shape: a database migrated with exactly the migrations that precede the batch
 * (190 on the day this batch was written, with the production-verified ledger anchor), then the real gate scripts
 * (scripts/release/migration-batch.mjs) and the real `prisma migrate deploy` run against it.
 *
 *   A. fresh batch: every gate, the real deploy, the post-batch verification, then NOTHING_TO_APPLY on replay;
 *      plus the hostile pre-mutation refusals (writable session, extra pending, tampered file, ghost object,
 *      ledger drift) and a post-verification that detects a missing object.
 *   B. failure injection: the batch's 2nd migration fails at runtime (it passes the static scan, as a real defect
 *      would): the 1st stays applied; Prisma does NOT wrap a migration in a transaction, so the failed migration's
 *      earlier statement REMAINS applied (measured here) -- the gate blocks on the failed ledger row, then on the
 *      leftover object (pre-existence check), and only after the documented explicit resolve plus the manifest's
 *      rollback of the leftover does it accept a RESUME that completes the batch.
 *   C. interrupted batch: only a prefix was applied (cleanly); RESUME is accepted, a tampered prefix checksum is not.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { spawnSync } from "child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
// @ts-expect-error -- plain ESM script without type declarations
import * as batch from "../../../scripts/release/migration-batch.mjs";
// @ts-expect-error -- plain ESM script without type declarations
import { scanAdditiveOnly } from "../../../scripts/release/migration-additive-scan.mjs";

const ROOT = join(__dirname, "../../..");
const BATCH_ID = "2026-11-20-quota-reservations-and-stripe-ordering";
const baseUrl = process.env.DATABASE_URL ?? "";
const PRISMA_TARGET = process.env.OPSIQ_DB_TARGET === "ci" ? "ci" : "local";
const REAL = batch.readManifest(ROOT, BATCH_ID).manifest as Manifest;

type Mig = { name: string; sha256: string; creates: Record<string, unknown[]>; rollbackSql: string };
type Manifest = { schemaVersion: number; batchId: string; description: string; ledgerAnchor: { count: number; sha256: string }; migrations: Mig[] };

const allNames = readdirSync(join(ROOT, "prisma/migrations"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const PRE = allNames.slice(0, allNames.indexOf(REAL.migrations[0].name));

const created: string[] = [];
const workdirs: string[] = [];
let admin: Client;

const dbUrl = (db: string, schemaParam = false) => {
  const u = new URL(baseUrl);
  u.pathname = `/${db}`;
  u.search = schemaParam ? "?schema=public" : "";
  return u.toString();
};

async function newDb(label: string): Promise<string> {
  const name = `batchrec_${label}_${process.pid}_${Date.now() % 1e9}`;
  await admin.query(`CREATE DATABASE ${name}`);
  created.push(name);
  return name;
}

/** A disposable "repo": schema + prisma config + the given migration folders (copied from main or synthesized). */
function workdir(migrations: Record<string, string | null>, manifest?: Manifest): string {
  const w = mkdtempSync(join(tmpdir(), "batchrec-"));
  workdirs.push(w);
  mkdirSync(join(w, "prisma/migrations"), { recursive: true });
  cpSync(join(ROOT, "prisma/schema.prisma"), join(w, "prisma/schema.prisma"));
  cpSync(join(ROOT, "prisma/migrations/migration_lock.toml"), join(w, "prisma/migrations/migration_lock.toml"));
  for (const f of ["prisma.config.ts", "package.json", "tsconfig.json"]) cpSync(join(ROOT, f), join(w, f));
  cpSync(join(ROOT, "src/infra"), join(w, "src/infra"), { recursive: true });
  symlinkSync(join(ROOT, "node_modules"), join(w, "node_modules"));
  for (const [name, sql] of Object.entries(migrations)) addMigration(w, name, sql);
  if (manifest) writeManifest(w, manifest);
  return w;
}
function addMigration(w: string, name: string, sql: string | null) {
  if (sql === null) cpSync(join(ROOT, "prisma/migrations", name), join(w, "prisma/migrations", name), { recursive: true });
  else {
    mkdirSync(join(w, "prisma/migrations", name), { recursive: true });
    writeFileSync(join(w, "prisma/migrations", name, "migration.sql"), sql);
  }
}
function writeManifest(w: string, m: Manifest) {
  mkdirSync(join(w, ".claude/production-migration-batches"), { recursive: true });
  writeFileSync(join(w, ".claude/production-migration-batches", `${m.batchId}.json`), JSON.stringify(m, null, 2));
}

const baseEnv = () => ({ PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? tmpdir(), NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=8192" });

function prisma(w: string, db: string, args: string[]) {
  return spawnSync(join(ROOT, "node_modules/.bin/prisma"), args, {
    cwd: w,
    encoding: "utf8",
    env: { ...baseEnv(), OPSIQ_DB_TARGET: PRISMA_TARGET, DATABASE_URL: dbUrl(db, true) },
    timeout: 240_000,
  });
}

function gate(w: string, db: string, cmd: string, extra: Record<string, string> = {}, id = BATCH_ID) {
  const out = join(w, "batch-out");
  const r = spawnSync("node", [join(ROOT, "scripts/release/migration-batch.mjs"), cmd], {
    cwd: w,
    encoding: "utf8",
    env: { ...baseEnv(), DATABASE_URL: dbUrl(db), BATCH_ID: id, OUTPUT_DIR: out, PGOPTIONS: "-c default_transaction_read_only=on", ...extra },
    timeout: 120_000,
  });
  const code = /^BATCH_GATE_CODE=(.*)$/m.exec(r.stdout)?.[1];
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, code, out };
}

async function q<T = Record<string, unknown>>(db: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: dbUrl(db) });
  await c.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    await c.end();
  }
}
const ledger = (db: string) => q<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>(db, 'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name COLLATE "C"');
const colExists = async (db: string, table: string, col: string) => (await q(db, "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2", [table, col])).length === 1;
const tableExists = async (db: string, t: string) => (await q(db, "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1", [t])).length === 1;

const preMigrations = (): Record<string, null> => Object.fromEntries(PRE.map((n) => [n, null]));
const batchMigrations = (): Record<string, null> => Object.fromEntries(REAL.migrations.map((m) => [m.name, null]));

beforeAll(async () => {
  expect(baseUrl, "a DATABASE_URL for the guarded loopback test server is required").not.toBe("");
  expect(["localhost", "127.0.0.1", "[::1]", "::1"], "this test only runs against a loopback server").toContain(new URL(baseUrl).hostname);
  admin = new Client({ connectionString: baseUrl });
  await admin.connect();
}, 60_000);

afterAll(async () => {
  for (const db of created) await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => {});
  await admin?.end().catch(() => {});
  for (const w of workdirs) rmSync(w, { recursive: true, force: true });
}, 60_000);

describe("[db] MAIN_BATCH A — fresh batch on a database that is exactly the pre-batch ledger", () => {
  let db = "";
  let w = "";
  const NOW = Date.now();

  beforeAll(async () => {
    db = await newDb("a");
    w = workdir(preMigrations());
    const r = prisma(w, db, ["migrate", "deploy"]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    for (const n of Object.keys(batchMigrations())) addMigration(w, n, null);
    writeManifest(w, REAL);
  }, 240_000);

  it("the migrated database ledger equals the manifest's anchor (count and sha256) — the same fact production's md5 proved", async () => {
    const rows = await ledger(db);
    const anchor = batch.ledgerAnchor(rows.map((r) => ({ name: r.migration_name, checksum: r.checksum })));
    expect(anchor).toEqual(REAL.ledgerAnchor);
    expect(rows).toHaveLength(190);
    expect(rows.every((r) => r.finished_at && !r.rolled_back_at)).toBe(true);
  });

  it("preflight passes FRESH and records the recovery point (UTC time, WAL LSN, database, ledger anchor) without mutating anything", async () => {
    const before = await ledger(db);
    const r = gate(w, db, "preflight");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^BATCH_GATE=PASS$/m);
    expect(r.stdout).toMatch(/^BATCH_MODE=FRESH$/m);
    expect(r.stdout).toMatch(/^BATCH_PENDING=3$/m);
    const rp = JSON.parse(readFileSync(join(r.out, "batch-recovery-point.json"), "utf8"));
    expect(rp.walLsn).toMatch(/^[0-9A-F]+\/[0-9A-F]+$/);
    expect(rp.database).toBe(db);
    expect(rp.ledgerAnchor).toEqual(REAL.ledgerAnchor);
    // review F5: informational cost/lock context, never gating
    expect(Object.keys(rp.activity.estimatedRows).sort()).toEqual(["subscriptions", "usage_events"]);
    expect(Object.values(rp.activity.estimatedRows).every((v) => Number.isInteger(v))).toBe(true);
    expect(Number.isInteger(rp.activity.longOpenTransactions)).toBe(true);
    expect(JSON.stringify(rp.activity)).not.toMatch(/query|usename|client_addr/i);
    expect(Date.parse(rp.capturedAtUtc)).toBeGreaterThan(NOW - 1000);
    expect(Date.parse(rp.capturedAtUtc)).toBeLessThanOrEqual(Date.now() + 1000);
    const pre = JSON.parse(readFileSync(join(r.out, "batch-preflight.json"), "utf8"));
    expect(pre.pending).toEqual(REAL.migrations.map((m) => m.name));
    expect(await ledger(db)).toEqual(before);
    expect(await colExists(db, "subscriptions", "last_event_id")).toBe(false);
  });

  it("prisma migrate status lists exactly the manifest's pending set and the cross-check accepts it (and rejects a different set)", () => {
    expect(gate(w, db, "preflight").status).toBe(0);
    const st = prisma(w, db, ["migrate", "status"]);
    expect(st.status).not.toBe(0);
    const ok = gate(w, db, "status-crosscheck", { STATUS_EXIT: String(st.status), STATUS_OUTPUT: st.stdout + st.stderr });
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toContain("BATCH_STATUS_CROSSCHECK=PASS");
    const wrong = gate(w, db, "status-crosscheck", { STATUS_EXIT: "1", STATUS_OUTPUT: st.stdout.replace(REAL.migrations[2].name, "") });
    expect(wrong.status).toBe(1);
    expect(wrong.code).toBe("PRISMA_STATUS_MISMATCH");
  });

  it("refuses a writable session (the read-only guarantee is verified, not assumed)", () => {
    const r = gate(w, db, "preflight", { PGOPTIONS: "" });
    expect(r.status).toBe(1);
    expect(r.code).toBe("SESSION_NOT_READ_ONLY");
  });

  it("refuses an extra pending migration that the manifest does not list", async () => {
    addMigration(w, "20271231000000_unreviewed_extra", 'ALTER TABLE "subscriptions" ADD COLUMN "unreviewed" TEXT;');
    try {
      const r = gate(w, db, "preflight");
      expect(r.status).toBe(1);
      expect(r.code).toBe("PENDING_SET_MISMATCH");
    } finally {
      rmSync(join(w, "prisma/migrations/20271231000000_unreviewed_extra"), { recursive: true, force: true });
    }
  });

  it("refuses a migration.sql whose content differs from the manifest sha256", () => {
    const p = join(w, "prisma/migrations", REAL.migrations[1].name, "migration.sql");
    const orig = readFileSync(p, "utf8");
    writeFileSync(p, orig + "\n-- tampered\n");
    try {
      const r = gate(w, db, "preflight");
      expect(r.status).toBe(1);
      expect(r.code).toBe("MIGRATION_SHA256_MISMATCH");
    } finally {
      writeFileSync(p, orig);
    }
  });

  it("refuses when an object the batch will create already exists (a ghost object would fail the batch mid-way)", async () => {
    await q(db, 'ALTER TABLE "subscriptions" ADD COLUMN "last_event_id" TEXT');
    try {
      const r = gate(w, db, "preflight");
      expect(r.status).toBe(1);
      expect(r.code).toBe("OBJECT_ALREADY_EXISTS");
    } finally {
      await q(db, 'ALTER TABLE "subscriptions" DROP COLUMN "last_event_id"');
    }
  });

  it("refuses a drifted ledger anchor (an applied migration's recorded checksum no longer matches)", async () => {
    const victim = PRE[10];
    const [orig] = await q<{ checksum: string }>(db, 'SELECT checksum FROM "_prisma_migrations" WHERE migration_name = $1', [victim]);
    await q(db, 'UPDATE "_prisma_migrations" SET checksum = $2 WHERE migration_name = $1', [victim, "d".repeat(64)]);
    try {
      const r = gate(w, db, "preflight");
      expect(r.status).toBe(1);
      expect(r.code).toBe("ANCHOR_MISMATCH");
    } finally {
      await q(db, 'UPDATE "_prisma_migrations" SET checksum = $2 WHERE migration_name = $1', [victim, orig.checksum]);
    }
  });

  it("refuses an unfinished (failed, P3009) ledger row", async () => {
    await q(db, `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES ('batch-failed-row', 'x', $1, now(), 0)`, [REAL.migrations[0].name]);
    try {
      const r = gate(w, db, "preflight");
      expect(r.status).toBe(1);
      expect(r.code).toBe("FAILED_LEDGER_ROW");
    } finally {
      await q(db, `DELETE FROM "_prisma_migrations" WHERE id = 'batch-failed-row'`);
    }
  });

  it("the real prisma migrate deploy applies exactly the batch; post-batch verification passes; replay says NOTHING_TO_APPLY", async () => {
    const pf = gate(w, db, "preflight");
    expect(pf.status, pf.stdout + pf.stderr).toBe(0);
    const d = prisma(w, db, ["migrate", "deploy"]);
    expect(d.status, d.stdout + d.stderr).toBe(0);
    const post = gate(w, db, "postverify");
    expect(post.status, post.stdout + post.stderr).toBe(0);
    expect(post.stdout).toMatch(/^BATCH_POSTVERIFY=PASS$/m);
    const rows = await ledger(db);
    expect(rows).toHaveLength(193);
    expect(rows.slice(190).map((r) => r.migration_name)).toEqual(REAL.migrations.map((m) => m.name));
    expect(rows.slice(190).map((r) => r.checksum)).toEqual(REAL.migrations.map((m) => m.sha256));
    for (const [t, c] of [["usage_events", "reservation_id"], ["usage_events", "reservation_entry"], ["subscriptions", "last_event_id"], ["subscriptions", "stripe_subscription_created_at"]]) expect(await colExists(db, t, c)).toBe(true);
    expect(prisma(w, db, ["migrate", "status"]).stdout).toContain("Database schema is up to date");
    const replay = gate(w, db, "preflight");
    expect(replay.status).toBe(1);
    expect(replay.code).toBe("NOTHING_TO_APPLY");
  }, 240_000);

  it("post-batch verification detects a missing expected object", async () => {
    await q(db, 'DROP INDEX "usage_events_one_release_per_reservation"');
    try {
      const post = gate(w, db, "postverify");
      expect(post.status).toBe(1);
      expect(post.code).toBe("POST_BATCH_VERIFICATION_FAILED");
      expect(post.stderr + post.stdout).toContain("usage_events_one_release_per_reservation");
    } finally {
      await q(db, `CREATE UNIQUE INDEX "usage_events_one_release_per_reservation" ON "usage_events"("reservation_id") WHERE (reservation_entry = 'release'::text)`);
    }
    expect(gate(w, db, "postverify").status).toBe(0);
  });

  it("post-batch verification detects a unique index that was replaced by a non-unique one of the same name (review F4 i)", async () => {
    await q(db, 'DROP INDEX "usage_events_one_release_per_reservation"');
    await q(db, 'CREATE INDEX "usage_events_one_release_per_reservation" ON "usage_events"("reservation_id")');
    try {
      const post = gate(w, db, "postverify");
      expect(post.status).toBe(1);
      expect(post.code).toBe("POST_BATCH_VERIFICATION_FAILED");
      expect(post.stderr + post.stdout).toMatch(/usage_events_one_release_per_reservation.*uniqueness differs/);
    } finally {
      await q(db, 'DROP INDEX "usage_events_one_release_per_reservation"');
      await q(db, `CREATE UNIQUE INDEX "usage_events_one_release_per_reservation" ON "usage_events"("reservation_id") WHERE (reservation_entry = 'release'::text)`);
    }
    expect(gate(w, db, "postverify").status).toBe(0);
  });

  it("post-batch verification detects a duplicated batch ledger row through the exact row count (review F4 ii)", async () => {
    const m = REAL.migrations[0];
    await q(db, `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ('batch-dup', $1, $2, now(), now(), 1)`, [m.sha256, m.name]);
    try {
      const post = gate(w, db, "postverify");
      expect(post.status).toBe(1);
      expect(post.code).toBe("POST_BATCH_VERIFICATION_FAILED");
      expect(post.stderr + post.stdout).toContain("effective rows, expected 193");
    } finally {
      await q(db, `DELETE FROM "_prisma_migrations" WHERE id = 'batch-dup'`);
    }
  });

  it("post-batch verification detects an unexpected extra ledger row", async () => {
    await q(db, `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ('batch-extra', 'x', '20300101000000_unlisted', now(), now(), 1)`);
    try {
      const post = gate(w, db, "postverify");
      expect(post.status).toBe(1);
      expect(post.code).toBe("POST_BATCH_VERIFICATION_FAILED");
    } finally {
      await q(db, `DELETE FROM "_prisma_migrations" WHERE id = 'batch-extra'`);
    }
  });
});

describe("[db] MAIN_BATCH B — failure injection: the 2nd migration fails; the 1st stays applied; resume after an explicit resolve", () => {
  const S1 = "20261201000001_rehearsal_add_a";
  const S2 = "20261201000002_rehearsal_fail";
  const S3 = "20261201000003_rehearsal_add_c";
  const sql1 = 'ALTER TABLE "subscriptions" ADD COLUMN "rehearsal_a" TEXT;\n';
  // Passes the static additive scan (as a real defect would) but fails at runtime: its target table does not exist. Prisma does not wrap the
  // migration in a transaction, so the CREATE TABLE before the failing statement stays applied (asserted below, measured not assumed).
  const sql2bad = 'CREATE TABLE "rehearsal_partial" ("id" TEXT NOT NULL, CONSTRAINT "rehearsal_partial_pkey" PRIMARY KEY ("id"));\nALTER TABLE "rehearsal_no_such_table" ADD COLUMN "x" TEXT;\n';
  // The corrected migration re-creates the table the failed attempt left behind, so the leftover must be cleaned up before the resume.
  const sql2good = 'CREATE TABLE "rehearsal_partial" ("id" TEXT NOT NULL, CONSTRAINT "rehearsal_partial_pkey" PRIMARY KEY ("id"));\nALTER TABLE "subscriptions" ADD COLUMN "rehearsal_b" TEXT;\n';
  const sql3 = 'ALTER TABLE "subscriptions" ADD COLUMN "rehearsal_c" TEXT;\n';

  const manifestFor = (sqls: [string, string, string]): Manifest => {
    const names = [S1, S2, S3];
    return {
      schemaVersion: 1,
      batchId: "rehearsal-failure-injection",
      description: "Synthetic batch used only by the failure-injection test.",
      ledgerAnchor: REAL.ledgerAnchor,
      migrations: names.map((name, i) => {
        const scan = scanAdditiveOnly(sqls[i]);
        expect(scan.ok, JSON.stringify(scan.violations)).toBe(true);
        const creates: Record<string, unknown[]> = {};
        for (const k of ["tables", "columns", "indexes", "types", "constraints"]) if (scan.creates[k].length) creates[k] = scan.creates[k];
        return { name, sha256: batch.sha256Hex(Buffer.from(sqls[i])), creates, rollbackSql: "DROP COLUMN IF EXISTS documented-only note for the synthetic migration." };
      }),
    };
  };
  const ID = "rehearsal-failure-injection";

  let db = "";
  let w = "";
  beforeAll(async () => {
    db = await newDb("b");
    w = workdir(preMigrations());
    const r = prisma(w, db, ["migrate", "deploy"]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    addMigration(w, S1, sql1);
    addMigration(w, S2, sql2bad);
    addMigration(w, S3, sql3);
    writeManifest(w, manifestFor([sql1, sql2bad, sql3]));
  }, 240_000);

  it("the synthetic failing migration passes every static gate and the preflight (it fails only at runtime)", () => {
    const r = gate(w, db, "preflight", {}, ID);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^BATCH_MODE=FRESH$/m);
  });

  it("deploy fails on the 2nd migration: the 1st stays applied, the 2nd's earlier statement REMAINS (Prisma runs no per-migration transaction), the 3rd never ran", async () => {
    const d = prisma(w, db, ["migrate", "deploy"]);
    expect(d.status).not.toBe(0);
    const rows = await ledger(db);
    const byName = new Map(rows.map((r) => [r.migration_name, r]));
    expect(byName.get(S1)?.finished_at).toBeTruthy();
    expect(byName.get(S2)?.finished_at).toBeNull();
    expect(byName.get(S2)?.rolled_back_at).toBeNull();
    expect(byName.has(S3)).toBe(false);
    expect(await colExists(db, "subscriptions", "rehearsal_a")).toBe(true);
    expect(await tableExists(db, "rehearsal_partial"), "MEASURED: a failed migration's earlier statements are NOT rolled back").toBe(true);
    expect(await colExists(db, "subscriptions", "rehearsal_c")).toBe(false);
  }, 240_000);

  it("the gate BLOCKS on the failed (P3009) ledger row: no automated resolve, no resume yet", () => {
    const r = gate(w, db, "preflight", {}, ID);
    expect(r.status).toBe(1);
    expect(r.code).toBe("FAILED_LEDGER_ROW");
  });

  it("after the defect is fixed in a re-reviewed manifest and the failed attempt is explicitly resolved, the gate accepts a RESUME that completes the batch", async () => {
    // The corrected migration is a new committed file + a new reviewed manifest (new sha256); the applied prefix is untouched.
    writeFileSync(join(w, "prisma/migrations", S2, "migration.sql"), sql2good);
    writeManifest(w, manifestFor([sql1, sql2good, sql3]));
    // Still blocked while the failed row is unresolved, even with the fixed manifest.
    expect(gate(w, db, "preflight", {}, ID).code).toBe("FAILED_LEDGER_ROW");
    // The documented explicit operator step (never automated by the workflow).
    const res = prisma(w, db, ["migrate", "resolve", "--rolled-back", S2]);
    expect(res.status, res.stdout + res.stderr).toBe(0);

    // The failed attempt's leftover object is detected BEFORE any mutation: the resume is refused until it is removed.
    expect(gate(w, db, "preflight", {}, ID).code).toBe("OBJECT_ALREADY_EXISTS");
    await q(db, 'DROP TABLE "rehearsal_partial"'); // the documented manual rollback of the leftover (manifest rollbackSql), run out of band

    const pf = gate(w, db, "preflight", {}, ID);
    expect(pf.status, pf.stdout + pf.stderr).toBe(0);
    expect(pf.stdout).toMatch(/^BATCH_MODE=RESUME$/m);
    expect(pf.stdout).toMatch(/^BATCH_APPLIED_PREFIX=1$/m);
    expect(pf.stdout).toMatch(/^BATCH_PENDING=2$/m);
    expect(pf.stdout).toMatch(/^BATCH_ROLLED_BACK_ATTEMPTS=1$/m);

    const d = prisma(w, db, ["migrate", "deploy"]);
    expect(d.status, d.stdout + d.stderr).toBe(0);
    const post = gate(w, db, "postverify", {}, ID);
    expect(post.status, post.stdout + post.stderr).toBe(0);
    for (const c of ["rehearsal_a", "rehearsal_b", "rehearsal_c"]) expect(await colExists(db, "subscriptions", c)).toBe(true);
    expect(gate(w, db, "preflight", {}, ID).code).toBe("NOTHING_TO_APPLY");
  }, 240_000);
});

describe("[db] MAIN_BATCH C — interrupted batch (clean prefix applied): resume is accepted only for an intact prefix", () => {
  let db = "";
  let w = "";
  beforeAll(async () => {
    db = await newDb("c");
    // Production-shaped interruption: the runner stopped after the first batch migration committed.
    w = workdir({ ...preMigrations(), [REAL.migrations[0].name]: null }, REAL);
    const r = prisma(w, db, ["migrate", "deploy"]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    for (const m of REAL.migrations.slice(1)) addMigration(w, m.name, null);
  }, 240_000);

  it("RESUME_OK: finished prefix, matching checksum, the rest pending, anchor equal", () => {
    const r = gate(w, db, "preflight");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^BATCH_MODE=RESUME$/m);
    expect(r.stdout).toMatch(/^BATCH_APPLIED_PREFIX=1$/m);
    expect(r.stdout).toMatch(/^BATCH_PENDING=2$/m);
  });

  it("a tampered applied-prefix checksum blocks the resume", async () => {
    await q(db, 'UPDATE "_prisma_migrations" SET checksum = $2 WHERE migration_name = $1', [REAL.migrations[0].name, "9".repeat(64)]);
    try {
      const r = gate(w, db, "preflight");
      expect(r.status).toBe(1);
      expect(r.code).toBe("APPLIED_PREFIX_INVALID");
    } finally {
      await q(db, 'UPDATE "_prisma_migrations" SET checksum = $2 WHERE migration_name = $1', [REAL.migrations[0].name, REAL.migrations[0].sha256]);
    }
  });

  it("the resumed deploy completes the batch and the post-batch verification passes", async () => {
    const d = prisma(w, db, ["migrate", "deploy"]);
    expect(d.status, d.stdout + d.stderr).toBe(0);
    const post = gate(w, db, "postverify");
    expect(post.status, post.stdout + post.stderr).toBe(0);
    expect(await ledger(db)).toHaveLength(193);
  }, 240_000);

  it("scratch workdirs contain no secret material (sanity: nothing but loopback URLs were used)", () => {
    expect(existsSync(join(w, ".env"))).toBe(false);
  });
});
