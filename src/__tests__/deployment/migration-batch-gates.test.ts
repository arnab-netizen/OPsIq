/**
 * MAIN_BATCH gates (scripts/release/migration-batch.mjs): manifest integrity against main, strict manifest schema,
 * ledger classification (fresh, resume, and every blocking verdict), post-batch ledger verification, the prisma
 * status cross-check, and proof that the single-migration MAIN gate still refuses multiple pending migrations.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
// @ts-expect-error -- plain ESM script without type declarations
import * as batch from "../../../scripts/release/migration-batch.mjs";
// @ts-expect-error -- plain ESM script without type declarations
import { classifyMigrateStatus } from "../../../scripts/classify-migrate-status.mjs";

const ROOT = join(__dirname, "../../..");
const BATCH_ID = "2026-11-20-quota-reservations-and-stripe-ordering";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

type Row = { name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null };
type Mig = { name: string; sha256: string; creates: Record<string, unknown[]>; rollbackSql: string };
type Manifest = { schemaVersion: number; batchId: string; description: string; ledgerAnchor: { count: number; sha256: string }; migrations: Mig[] };

const loaded = batch.readManifest(ROOT, BATCH_ID);
const real: Manifest = loaded.manifest;
const local: Map<string, { sha256: string | null; sql: string | null }> = batch.readLocalMigrations(ROOT);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe("the committed manifest is exactly consistent with main", () => {
  it("loads and passes the strict schema", () => {
    expect(loaded.ok).toBe(true);
    expect(batch.validateManifestShape(real, BATCH_ID)).toEqual({ ok: true, errors: [] });
  });

  it("every batch migration exists in main, matches its sha256, passes the additive scan and creates exactly what the manifest lists", () => {
    expect(batch.checkBatchFiles(real, local)).toEqual([]);
  });

  it("the batch is a contiguous TAIL of main's migrations and the anchor equals the ledger of everything before it", () => {
    const names = [...local.keys()].sort();
    const first = names.indexOf(real.migrations[0].name);
    expect(first).toBeGreaterThan(0);
    expect(names.slice(first, first + real.migrations.length)).toEqual(real.migrations.map((m) => m.name));
    const pre = names.slice(0, first).map((n) => ({ name: n, checksum: local.get(n)!.sha256! }));
    expect(batch.ledgerAnchor(pre)).toEqual(real.ledgerAnchor);
    expect(real.ledgerAnchor.count).toBe(190);
  });

  it("the anchor formula equals the production-verified md5 formula over the same lines (md5 1c94093789d0735a0c0488e78cd0e418)", () => {
    const names = [...local.keys()].sort();
    const pre = names.slice(0, names.indexOf(real.migrations[0].name));
    const lines = pre.map((n) => `${n}|${local.get(n)!.sha256}`).join("\n");
    expect(createHash("md5").update(lines).digest("hex")).toBe("1c94093789d0735a0c0488e78cd0e418");
  });

  it("each migration carries a non-trivial rollback note, and the notes are documentation (never read by the gate or the workflow)", () => {
    for (const m of real.migrations) expect(m.rollbackSql).toMatch(/DROP/);
    const wf = readFileSync(join(ROOT, ".github/workflows/migrate-production.yml"), "utf8");
    const script = readFileSync(join(ROOT, "scripts/release/migration-batch.mjs"), "utf8");
    expect(wf).not.toMatch(/rollbackSql/);
    expect(script).not.toMatch(/query\([^)]*rollbackSql/);
    expect(script).not.toMatch(/exec(Sync)?\(|spawn(Sync)?\(/);
  });

  it("the batch is the whole pending set: no other committed migration sorts after the anchor's last row except the batch", () => {
    const names = [...local.keys()].sort();
    const tail = names.slice(names.indexOf(real.migrations[0].name));
    expect(tail.slice(0, real.migrations.length)).toEqual(real.migrations.map((m) => m.name));
  });
});

describe("manifest schema is strict (fail closed)", () => {
  const bad = (edit: (m: Manifest) => void): string => {
    const m = clone(real);
    edit(m);
    return batch.validateManifestShape(m, BATCH_ID).errors.join(" | ");
  };
  it("rejects a wrong schemaVersion, unknown fields, a mismatched batchId and a short description", () => {
    expect(bad((m) => { m.schemaVersion = 2; })).toMatch(/schemaVersion/);
    expect(bad((m) => { (m as unknown as Record<string, unknown>).extra = 1; })).toMatch(/unexpected top-level field/);
    expect(bad((m) => { m.batchId = "another-batch"; })).toMatch(/batchId does not equal/);
    expect(bad((m) => { m.description = "x"; })).toMatch(/description/);
  });
  it("rejects a malformed anchor", () => {
    expect(bad((m) => { m.ledgerAnchor.sha256 = "nothex"; })).toMatch(/ledgerAnchor/);
    expect(bad((m) => { m.ledgerAnchor.count = 0; })).toMatch(/ledgerAnchor/);
  });
  it("rejects an empty batch, a duplicate, a disordered batch and a malformed name", () => {
    expect(bad((m) => { m.migrations = []; })).toMatch(/non-empty/);
    expect(bad((m) => { m.migrations[1].name = m.migrations[0].name; })).toMatch(/duplicated/);
    expect(bad((m) => { m.migrations.reverse(); })).toMatch(/ascending/);
    expect(bad((m) => { m.migrations[0].name = "../x"; })).toMatch(/malformed/);
  });
  it("enforces the batch size cap of 10", () => {
    const m = clone(real);
    m.migrations = Array.from({ length: 11 }, (_, i) => ({ ...clone(real.migrations[0]), name: `${String(20990101000000 + i)}_n${i}` }));
    expect(batch.validateManifestShape(m, BATCH_ID).errors.join()).toMatch(/exceeds the cap of 10/);
    expect(batch.BATCH_SIZE_CAP).toBe(10);
  });
  it("requires a rollback note, a sha256 and at least one created object per migration", () => {
    expect(bad((m) => { m.migrations[0].rollbackSql = ""; })).toMatch(/rollbackSql/);
    expect(bad((m) => { m.migrations[0].sha256 = "abc"; })).toMatch(/sha256/);
    expect(bad((m) => { m.migrations[0].creates = {}; })).toMatch(/lists no object/);
  });
  it("rejects injection-shaped identifiers in the expected objects", () => {
    expect(bad((m) => { (m.migrations[1].creates.columns as { column: string }[])[0].column = 'x"; DROP TABLE y; --'; })).toMatch(/malformed column/);
  });
  it("readManifest rejects a traversal-shaped or unknown batch id without touching the filesystem outside the manifest directory", () => {
    expect(batch.readManifest(ROOT, "../../etc/passwd").ok).toBe(false);
    expect(batch.readManifest(ROOT, "no-such-batch").errors.join()).toMatch(/does not exist/);
  });
});

describe("offline file checks detect tampering", () => {
  it("a changed migration file (sha256 mismatch) is refused", () => {
    const l = new Map(local);
    const name = real.migrations[1].name;
    l.set(name, { sha256: sha("tampered"), sql: 'ALTER TABLE "subscriptions" ADD COLUMN "last_event_id" TEXT;' });
    expect(batch.checkBatchFiles(real, l).map((f: { code: string }) => f.code)).toContain("MIGRATION_SHA256_MISMATCH");
  });
  it("a destructive migration that matches its own sha256 is still refused by the additive scan", () => {
    const l = new Map(local);
    const m = clone(real);
    const evil = 'ALTER TABLE "subscriptions" DROP COLUMN "status";';
    l.set(m.migrations[1].name, { sha256: sha(evil), sql: evil });
    m.migrations[1].sha256 = sha(evil);
    expect(batch.checkBatchFiles(m, l).map((f: { code: string }) => f.code)).toContain("NOT_ADDITIVE_ONLY");
  });
  it("a manifest that understates what the SQL creates is refused", () => {
    const m = clone(real);
    (m.migrations[0].creates as Record<string, unknown>).indexes = [];
    expect(batch.checkBatchFiles(m, local).map((f: { code: string }) => f.code)).toContain("MANIFEST_OBJECTS_MISMATCH");
  });
  it("a missing migration folder is refused", () => {
    const l = new Map(local);
    l.delete(real.migrations[2].name);
    expect(batch.checkBatchFiles(real, l).map((f: { code: string }) => f.code)).toContain("MIGRATION_FILE_MISSING");
  });
});

// ─── ledger classification ───────────────────────────────────────────────────

const T = new Date("2026-11-01T00:00:00Z");
const nonBatch = [...local.keys()].sort().filter((n) => !real.migrations.some((m) => m.name === n));
const batchNames = real.migrations.map((m) => m.name);
const beforeNames = [...local.keys()].sort().slice(0, [...local.keys()].sort().indexOf(batchNames[0]));
const rowsBefore = (): Row[] => beforeNames.map((n) => ({ name: n, checksum: local.get(n)!.sha256!, finished_at: T, rolled_back_at: null }));
const applied = (i: number): Row => ({ name: real.migrations[i].name, checksum: real.migrations[i].sha256, finished_at: T, rolled_back_at: null });
// `local` must look like main with ONLY the not-yet-applied folders pending: classification derives pending from local minus ledger.
const classify = (rows: Row[], m: Manifest = real, l = local) => batch.classifyBatchLedger({ manifest: m, rows, local: l });

describe("classifyBatchLedger — live ledger vs manifest", () => {
  it("FRESH: pre-batch ledger equals the anchor and the whole manifest is pending", () => {
    const r = classify(rowsBefore());
    expect(r).toMatchObject({ ok: true, verdict: "FRESH_OK", mode: "FRESH", appliedPrefix: [], pending: batchNames });
  });
  it("RESUME: a finished, checksum-equal prefix with the rest pending is accepted", () => {
    const r = classify([...rowsBefore(), applied(0)]);
    expect(r).toMatchObject({ ok: true, verdict: "RESUME_OK", mode: "RESUME", appliedPrefix: [batchNames[0]], pending: batchNames.slice(1) });
    expect(classify([...rowsBefore(), applied(0), applied(1)])).toMatchObject({ ok: true, mode: "RESUME", pending: [batchNames[2]] });
  });
  it("RESUME after an operator-resolved failed attempt: a rolled-back row of a pending batch member is tolerated", () => {
    const rb: Row = { name: batchNames[1], checksum: "whatever", finished_at: null, rolled_back_at: T };
    const r = classify([...rowsBefore(), applied(0), rb]);
    expect(r).toMatchObject({ ok: true, mode: "RESUME", rolledBackAttempts: [batchNames[1]] });
  });
  it("blocks an UNFINISHED (failed, P3009) row, for a batch member or any other migration", () => {
    const failedBatch: Row = { name: batchNames[1], checksum: "x", finished_at: null, rolled_back_at: null };
    expect(classify([...rowsBefore(), applied(0), failedBatch])).toMatchObject({ ok: false, verdict: "FAILED_LEDGER_ROW" });
    const rows = rowsBefore();
    rows[5] = { ...rows[5], finished_at: null };
    expect(classify(rows)).toMatchObject({ ok: false, verdict: "FAILED_LEDGER_ROW" });
  });
  it("blocks a rolled-back row of a NON-batch migration; a rolled-back attempt of an applied batch member is normal history and is accepted", () => {
    const rows = rowsBefore();
    rows[7] = { ...rows[7], rolled_back_at: T, finished_at: null };
    expect(classify(rows)).toMatchObject({ ok: false, verdict: "ROLLED_BACK_ROW_NOT_RESUMABLE" });
    const rb: Row = { name: batchNames[0], checksum: "x", finished_at: null, rolled_back_at: T };
    expect(classify([...rowsBefore(), applied(0), rb])).toMatchObject({ ok: true, mode: "RESUME", rolledBackAttempts: [batchNames[0]] });
  });
  it("blocks an EXTRA pending migration (main has a migration the manifest does not list)", () => {
    const l = new Map(local);
    l.set("20271231000000_extra_unreviewed", { sha256: sha("x"), sql: "x" });
    expect(classify(rowsBefore(), real, l)).toMatchObject({ ok: false, verdict: "PENDING_SET_MISMATCH" });
  });
  it("blocks a manifest that omits a pending migration (stale manifest after main moved)", () => {
    const m = clone(real);
    m.migrations = m.migrations.slice(0, 2);
    expect(classify(rowsBefore(), m)).toMatchObject({ ok: false, verdict: "PENDING_SET_MISMATCH" });
  });
  it("blocks a gap: a later batch member applied while an earlier one is not", () => {
    expect(classify([...rowsBefore(), applied(1)])).toMatchObject({ ok: false, verdict: "APPLIED_PREFIX_INVALID" });
  });
  it("blocks an applied prefix whose recorded checksum differs from the manifest", () => {
    expect(classify([...rowsBefore(), { ...applied(0), checksum: "f".repeat(64) }])).toMatchObject({ ok: false, verdict: "APPLIED_PREFIX_INVALID" });
  });
  it("blocks when the pre-batch ledger anchor does not match (a row missing, extra or with a drifted checksum)", () => {
    const missing = rowsBefore().slice(1);
    // a missing ledger row would make main's folder pending: either way the batch is refused
    expect(classify(missing)).toMatchObject({ ok: false });
    const drift = rowsBefore();
    drift[3] = { ...drift[3], checksum: "e".repeat(64) };
    expect(classify(drift)).toMatchObject({ ok: false, verdict: "ANCHOR_MISMATCH" });
  });
  it("blocks an applied migration that has no folder in main (ledger ahead of main)", () => {
    const rows = [...rowsBefore(), { name: "20290101000000_unknown_in_main", checksum: "x", finished_at: T, rolled_back_at: null }];
    expect(classify(rows)).toMatchObject({ ok: false, verdict: "LEDGER_NOT_IN_MAIN" });
  });
  it("blocks a duplicated ledger row", () => {
    const rows = rowsBefore();
    expect(classify([...rows, rows[0]])).toMatchObject({ ok: false, verdict: "DUPLICATE_LEDGER_ROW" });
  });
  it("blocks when everything is already applied (nothing to do)", () => {
    expect(classify([...rowsBefore(), applied(0), applied(1), applied(2)])).toMatchObject({ ok: false, verdict: "NOTHING_TO_APPLY" });
  });
  it("sanity: the non-batch set used above is every committed migration except the batch", () => {
    expect(nonBatch.length).toBe(local.size - batchNames.length);
  });
});

describe("classifyPostBatchLedger — blocking post-migration ledger check", () => {
  const all = (): Row[] => [...rowsBefore(), applied(0), applied(1), applied(2)];
  it("accepts exactly pre-batch anchor + the whole batch", () => {
    expect(batch.classifyPostBatchLedger({ manifest: real, rows: all() })).toEqual({ ok: true, failures: [] });
  });
  it("refuses a missing batch row, an unfinished row, a checksum mismatch and an extra row", () => {
    expect(batch.classifyPostBatchLedger({ manifest: real, rows: all().slice(0, -1) }).ok).toBe(false);
    const unfinished = all();
    unfinished[unfinished.length - 1] = { ...unfinished[unfinished.length - 1], finished_at: null };
    expect(batch.classifyPostBatchLedger({ manifest: real, rows: unfinished }).failures.join()).toMatch(/unfinished/);
    const drift = all();
    drift[drift.length - 1] = { ...drift[drift.length - 1], checksum: "a".repeat(64) };
    expect(batch.classifyPostBatchLedger({ manifest: real, rows: drift }).failures.join()).toMatch(/checksum/);
    const extra = [...all(), { name: "20300101000000_unlisted", checksum: "x", finished_at: T, rolled_back_at: null }];
    expect(batch.classifyPostBatchLedger({ manifest: real, rows: extra }).ok).toBe(false);
  });
  it("an operator-resolved rolled-back attempt of a batch member is history, not state", () => {
    const rows = [...all(), { name: batchNames[1], checksum: "x", finished_at: null, rolled_back_at: T } as Row];
    expect(batch.classifyPostBatchLedger({ manifest: real, rows })).toEqual({ ok: true, failures: [] });
  });
});

describe("crossCheckPrismaStatus — prisma's own view must equal the expected pending set", () => {
  const out = (names: string[]) => `193 migrations found in prisma/migrations\nFollowing migrations have not yet been applied:\n${names.join("\n")}\n\nTo apply migrations in production run prisma migrate deploy.`;
  it("accepts exactly the expected names", () => {
    expect(batch.crossCheckPrismaStatus({ exitCode: 1, output: out(batchNames), expectedPending: batchNames }).ok).toBe(true);
  });
  it("rejects fewer, more, up-to-date, failed and connection-error outputs", () => {
    expect(batch.crossCheckPrismaStatus({ exitCode: 1, output: out(batchNames.slice(1)), expectedPending: batchNames }).ok).toBe(false);
    expect(batch.crossCheckPrismaStatus({ exitCode: 1, output: out([...batchNames, "20271231000000_extra"]), expectedPending: batchNames }).ok).toBe(false);
    expect(batch.crossCheckPrismaStatus({ exitCode: 0, output: "Database schema is up to date!", expectedPending: batchNames }).ok).toBe(false);
    expect(batch.crossCheckPrismaStatus({ exitCode: 1, output: `P3009 migrate found failed migrations\n${out(batchNames)}`, expectedPending: batchNames }).ok).toBe(false);
    expect(batch.crossCheckPrismaStatus({ exitCode: 1, output: "P1001 Can't reach database", expectedPending: batchNames }).ok).toBe(false);
    expect(batch.crossCheckPrismaStatus({ exitCode: 1, output: "garbage", expectedPending: batchNames }).ok).toBe(false);
  });
});

describe("the single-migration MAIN gate is untouched and still refuses multiple pending migrations", () => {
  const out = `Following migrations have not yet been applied:\n${batchNames.join("\n")}\n`;
  it("scripts/classify-migrate-status.mjs classifies the real 3-pending state as MULTIPLE_PENDING (not ok)", () => {
    const r = classifyMigrateStatus({ exitCode: 1, output: out, expectedMigrationName: batchNames[0] });
    expect(r).toMatchObject({ ok: false, classification: "MULTIPLE_PENDING" });
  });
  it("and still accepts exactly the one authorized migration", () => {
    const one = `Following migrations have not yet been applied:\n${batchNames[0]}\n`;
    expect(classifyMigrateStatus({ exitCode: 1, output: one, expectedMigrationName: batchNames[0] })).toMatchObject({ ok: true, classification: "PENDING_EXPECTED" });
  });
  it("the classifier script itself was not modified by the batch work (no MAIN_BATCH knowledge leaked into it)", () => {
    expect(readFileSync(join(ROOT, "scripts/classify-migrate-status.mjs"), "utf8")).not.toMatch(/BATCH/i);
  });
});

describe("hygiene", () => {
  it("only one manifest per batch id and every manifest file name equals its batchId", () => {
    const dir = join(ROOT, ".claude/production-migration-batches");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const m = JSON.parse(readFileSync(join(dir, f), "utf8"));
      expect(f).toBe(`${m.batchId}.json`);
      expect(batch.validateManifestShape(m, m.batchId).errors).toEqual([]);
    }
  });
  it("database reads are fixed text: the only SQL built from variables are bound parameters", () => {
    const src = readFileSync(join(ROOT, "scripts/release/migration-batch.mjs"), "utf8");
    expect(src).not.toMatch(/client\.query\(`[^`]*\$\{/);
    expect(src).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)\b[^"\n]*"\s*,\s*\[/);
    expect(src).toContain("BEGIN READ ONLY");
    expect(src).toContain("default_transaction_read_only");
  });
});
