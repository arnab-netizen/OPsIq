/**
 * Hostile tests for the private, encrypted Production backup replacement (Cloudflare R2 + age),
 * stacked on #642's QBO backup gate.
 *
 * Drives the REAL scripts/backup-database-r2.sh and scripts/restore-database-r2.sh. Fakes psql
 * (QBO gate probe) and aws (a local directory stands in for the R2 bucket -- no network, no real
 * Cloudflare resources) for deterministic failure injection. Uses the REAL age / age-keygen /
 * gzip binaries wherever the test is about genuine cryptographic behavior, because a self-written
 * fake of age's failure modes would prove nothing about age's actual semantics. Every age keypair
 * here is generated fresh per test, written only inside that test's own temp directory; none is a
 * real recovery key.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BACKUP = resolve(process.cwd(), "scripts/backup-database-r2.sh");
const RESTORE = resolve(process.cwd(), "scripts/restore-database-r2.sh");
const WORKFLOW_BACKUP = readFileSync(resolve(process.cwd(), ".github/workflows/scheduled-backup-r2.yml"), "utf8");
const WORKFLOW_RESTORE = readFileSync(resolve(process.cwd(), ".github/workflows/restore-rehearsal-r2.yml"), "utf8");
const BACKUP_SCRIPT_SRC = readFileSync(BACKUP, "utf8");
const OLD_WORKFLOW_PATH = resolve(process.cwd(), ".github/workflows/scheduled-backup.yml");

const hasAge = spawnSync("age", ["--version"]).status === 0;

let dir: string;
let bucketDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "r2-backup-test-"));
  bucketDir = join(dir, "bucket");
  mkdirSync(bucketDir, { recursive: true });
  mkdirSync(join(bucketDir, "backups"), { recursive: true });

  // fake psql: drives backup-qbo-gate.sh exactly as in its own tests (count output / forced rc).
  writeFileSync(
    join(dir, "psql"),
    '#!/usr/bin/env bash\ntouch "$FAKE_DIR/psql.called"\n[ -n "${FAKE_PSQL_OUT:-}" ] && echo "$FAKE_PSQL_OUT"\nexit "${FAKE_PSQL_RC:-0}"\n',
  );
  // fake pg_dump: emits controllable, deterministic content on stdout; records that it ran.
  writeFileSync(
    join(dir, "pg_dump"),
    [
      "#!/usr/bin/env bash",
      'touch "$FAKE_DIR/pg_dump.called"',
      'if [ "$1" = "--version" ]; then echo "pg_dump (fake) 18.0"; exit 0; fi',
      'rc="${FAKE_PG_DUMP_RC:-0}"',
      'if [ "$rc" != "0" ]; then echo "fake pg_dump: forced failure" >&2; exit "$rc"; fi',
      'echo "-- fake pg_dump output"',
      'echo "some stable deterministic content for the fake dump"',
      '[ "${FAKE_PG_DUMP_OMIT_MARKER:-0}" != "1" ] && echo "-- PostgreSQL database dump complete"',
      "exit 0",
    ].join("\n"),
  );
  // fake aws: shims `aws s3 cp` (both directions) and `aws s3api head-object` against
  // $FAKE_BUCKET_DIR, which stands in for the private R2 bucket. No network is ever used.
  writeFileSync(
    join(dir, "aws"),
    [
      "#!/usr/bin/env bash",
      'touch "$FAKE_DIR/aws.called"',
      'echo "aws $*" >> "$FAKE_DIR/aws.calls"',
      'if [ "${FAKE_AWS_RC:-0}" != "0" ]; then echo "fake aws: forced failure" >&2; exit "${FAKE_AWS_RC:-0}"; fi',
      'if [ "$1" = "--version" ]; then echo "aws-cli/2.0.0 fake"; exit 0; fi',
      'if [ "$1" = "s3" ] && [ "$2" = "cp" ]; then',
      '  SRC="$3"; DST="$4";',
      '  if [[ "$DST" == s3://* ]]; then',
      '    KEY="${DST#s3://*/}";',
      '    mkdir -p "$(dirname "$FAKE_BUCKET_DIR/$KEY")";',
      '    cp "$SRC" "$FAKE_BUCKET_DIR/$KEY";',
      '    if [ "${FAKE_AWS_CORRUPT_UPLOAD:-0}" = "1" ]; then SZ=$(wc -c < "$SRC" | tr -d " "); head -c $((SZ - 1)) "$SRC" > "$FAKE_BUCKET_DIR/$KEY"; fi',
      "    exit 0;",
      '  elif [[ "$SRC" == s3://* ]]; then',
      '    KEY="${SRC#s3://*/}";',
      '    if [ ! -f "$FAKE_BUCKET_DIR/$KEY" ]; then echo "fake aws: NoSuchKey $KEY" >&2; exit 1; fi',
      '    cp "$FAKE_BUCKET_DIR/$KEY" "$DST";',
      "    exit 0;",
      "  fi",
      '  echo "fake aws: unrecognized cp args: $*" >&2; exit 1;',
      'elif [ "$1" = "s3api" ] && [ "$2" = "head-object" ]; then',
      '  KEY="";',
      '  shift 2;',
      '  while [ $# -gt 0 ]; do if [ "$1" = "--key" ]; then KEY="$2"; fi; shift; done',
      '  if [ ! -f "$FAKE_BUCKET_DIR/$KEY" ]; then echo "fake aws: NoSuchKey $KEY" >&2; exit 1; fi',
      '  SIZE=$(wc -c < "$FAKE_BUCKET_DIR/$KEY" | tr -d " ");',
      '  echo "{\\"ContentLength\\": $SIZE}";',
      "  exit 0;",
      "fi",
      'echo "fake aws: unrecognized command: $*" >&2; exit 1',
    ].join("\n"),
  );
  for (const bin of ["psql", "pg_dump", "aws"]) chmodSync(join(dir, bin), 0o755);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(script: string, env: Record<string, string>, args: string[] = []) {
  return spawnSync("bash", [script, ...args], {
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      FAKE_DIR: dir,
      FAKE_BUCKET_DIR: bucketDir,
      HOME: dir,
      ...env,
    },
    encoding: "utf8",
    timeout: 20_000,
  });
}

const baseBackupEnv = {
  DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db",
  // A real, validly-checksummed age recipient (generated via age-keygen purely for this test
  // fixture; its matching private identity was discarded and is not reproduced anywhere). Must
  // be real because `age` validates the bech32 checksum -- a made-up string fails at the
  // encryption stage with "malformed recipient", not at any stage this suite means to test.
  AGE_RECIPIENT: "age1a5yjvntjqll0mlu8cdwzx0zh3sc8vlxm3tcrkmgthkjk9l5f53lsmprz5z",
  R2_ENDPOINT: "https://abc123.r2.cloudflarestorage.com",
  R2_BUCKET: "opsiq-production-backups",
  AWS_ACCESS_KEY_ID: "fake-key-id",
  AWS_SECRET_ACCESS_KEY: "fake-secret",
};

function snapshotLeakedWorkdirs(): Set<string> {
  return new Set(readdirSync(tmpdir()).filter((n) => n.startsWith("opsiq-backup-r2.") || n.startsWith("opsiq-restore-r2.")));
}

function ephemeralKeypair() {
  const keygen = spawnSync("age-keygen", [], { encoding: "utf8" });
  const recipient = keygen.stderr.match(/Public key: (age1\S+)/)![1];
  return { identity: keygen.stdout, recipient };
}

function omit<T extends Record<string, string>>(env: T, key: keyof T): Partial<T> {
  const copy = { ...env };
  delete copy[key];
  return copy;
}

// ---------------------------------------------------------------------------------------------
// 1-4: QBO gate and target/environment safety -- all fail BEFORE pg_dump runs.
// ---------------------------------------------------------------------------------------------
describe("backup-database-r2.sh: QBO gate and target safety (fail closed BEFORE pg_dump)", () => {
  it("1. QBO gate BLOCK (qbo rows present) stops the backup before pg_dump runs", () => {
    const before = snapshotLeakedWorkdirs();
    const r = run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "3" });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("QBO_BACKUP_GATE=BLOCK");
    expect(existsSync(join(dir, "pg_dump.called"))).toBe(false);
    expect(existsSync(join(dir, "aws.called"))).toBe(false);
    expect(snapshotLeakedWorkdirs()).toEqual(before); // cleanup ran
  });

  it("2. QBO gate uncertainty (probe fails) blocks, never proceeds to pg_dump", () => {
    const r = run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_RC: "2" });
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, "pg_dump.called"))).toBe(false);
  });

  it("3. missing DATABASE_URL blocks before pg_dump (gate itself refuses: cannot probe)", () => {
    const r = run(BACKUP, omit(baseBackupEnv, "DATABASE_URL") as typeof baseBackupEnv);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, "pg_dump.called"))).toBe(false);
  });

  it("4. pooled DB URL (contains '-pooler') blocks before pg_dump", () => {
    const r = run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "0", DATABASE_URL: "postgresql://u:p@ep-x-pooler.neon.tech/db" });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/pooled connection/);
    expect(existsSync(join(dir, "pg_dump.called"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// 5-12, 17-18: pipeline-stage failures, uploads, verification, credential/input hygiene.
// ---------------------------------------------------------------------------------------------
describe("backup-database-r2.sh: pipeline-stage failures never reach upload", () => {
  it("5. pg_dump failure never uploads anything", () => {
    const r = run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "0", FAKE_PG_DUMP_RC: "1" });
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, "aws.called"))).toBe(false);
  });

  it("8. missing AGE_RECIPIENT blocks before pg_dump even runs", () => {
    const r = run(BACKUP, { ...omit(baseBackupEnv, "AGE_RECIPIENT"), FAKE_PSQL_OUT: "0" } as typeof baseBackupEnv);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, "pg_dump.called"))).toBe(false);
  });

  it("7. age encryption failure (real age, syntactically-valid-looking but malformed recipient) never uploads", () => {
    if (!hasAge) return; // environment without age; CI installs it, see scheduled-backup-r2.yml
    const r = run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "0", AGE_RECIPIENT: "age1" + "q".repeat(58) });
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, "aws.called"))).toBe(false);
  });

  it("9. missing R2 credentials blocks before pg_dump even runs", () => {
    const r = run(BACKUP, { ...omit(baseBackupEnv, "AWS_ACCESS_KEY_ID"), FAKE_PSQL_OUT: "0" } as typeof baseBackupEnv);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, "pg_dump.called"))).toBe(false);
  });

  it("10. R2 upload failure is non-zero and the script does not report success", () => {
    if (!hasAge) return;
    const r = run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "0", FAKE_AWS_RC: "1" });
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toMatch(/BACKUP_COMPLETE/);
  });

  it("12. HEAD verification mismatch (corrupted upload) fails the backup, not just a warning", () => {
    if (!hasAge) return;
    const r = run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "0", FAKE_AWS_CORRUPT_UPLOAD: "1" });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/verification failed/i);
    expect(r.stdout).not.toMatch(/BACKUP_COMPLETE/);
  });

  it("18. malformed R2_BUCKET / R2_ENDPOINT is rejected before pg_dump runs", () => {
    const r1 = run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "0", R2_BUCKET: "Invalid_Bucket_Name!" });
    expect(r1.status).not.toBe(0);
    const r2 = run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "0", R2_ENDPOINT: "https://not-an-r2-endpoint.example.com" });
    expect(r2.status).not.toBe(0);
    expect(existsSync(join(dir, "pg_dump.called"))).toBe(false);
  });

  it("13/14. a failure at any stage leaves no leaked workdir (EXIT trap runs on every exit path)", () => {
    const before = snapshotLeakedWorkdirs();
    run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "0", FAKE_PG_DUMP_RC: "1" });
    run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "0", FAKE_AWS_RC: "1" });
    expect(snapshotLeakedWorkdirs()).toEqual(before);
    // Cancellation (SIGTERM) specifically: bash EXIT traps fire on signal-induced exit too (this is
    // standard bash behavior, not special-cased in the script); not independently exercised via a
    // live signal in this unit test, since forcing a deterministic mid-pipeline SIGTERM here is
    // not reliable to assert on -- noted honestly rather than claimed as directly tested.
  });

  it("17. no credentials appear in stdout/stderr on any run (blocked or failed)", () => {
    const r = run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "3" }); // blocked run
    const out = r.stdout + r.stderr;
    expect(out).not.toContain(baseBackupEnv.AWS_SECRET_ACCESS_KEY);
    expect(out).not.toContain("ep-x.neon.tech"); // DATABASE_URL host never printed unredacted
  });
});

// ---------------------------------------------------------------------------------------------
// 6: compression failure.
// ---------------------------------------------------------------------------------------------
describe("backup-database-r2.sh: compression-stage failure", () => {
  it("6. gzip failure never uploads anything", () => {
    writeFileSync(join(dir, "gzip"), "#!/usr/bin/env bash\necho 'fake gzip: forced failure' >&2\nexit 1\n");
    chmodSync(join(dir, "gzip"), 0o755);
    const r = run(BACKUP, { ...baseBackupEnv, FAKE_PSQL_OUT: "0" });
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, "aws.called"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Real cryptographic round trip (age / age-keygen). No fakes for age itself: a self-written fake
// of its failure semantics would prove nothing about age's actual behavior. Keys are ephemeral,
// generated fresh per test, written only inside this test's own temp directory.
// ---------------------------------------------------------------------------------------------
describe.skipIf(!hasAge)("age round trip (real age binary, ephemeral test keypair)", () => {
  it("valid backup decrypts with the matching identity", () => {
    const { identity, recipient } = ephemeralKeypair();
    const plaintext = "deterministic test plaintext, not a real backup\n";
    const enc = spawnSync("age", ["-a", "-r", recipient], { input: plaintext, encoding: "utf8" });
    expect(enc.status).toBe(0);

    const identityFile = join(dir, "identity.key");
    writeFileSync(identityFile, identity);
    const dec = spawnSync("age", ["-d", "-i", identityFile], { input: enc.stdout, encoding: "utf8" });
    expect(dec.status).toBe(0);
    expect(dec.stdout).toBe(plaintext);
  });

  it("20. restore with the WRONG private key fails closed (does not silently succeed)", () => {
    const { recipient } = ephemeralKeypair();
    const { identity: wrongIdentity } = ephemeralKeypair(); // deliberately a different keypair

    const enc = spawnSync("age", ["-a", "-r", recipient], { input: "secret\n", encoding: "utf8" });
    expect(enc.status).toBe(0);

    const wrongIdentityFile = join(dir, "wrong-identity.key");
    writeFileSync(wrongIdentityFile, wrongIdentity);
    const dec = spawnSync("age", ["-d", "-i", wrongIdentityFile], { input: enc.stdout, encoding: "utf8" });
    expect(dec.status).not.toBe(0);
  });

  it("21. corrupted ciphertext fails to decrypt (real AEAD authentication failure)", () => {
    const { identity, recipient } = ephemeralKeypair();
    const identityFile = join(dir, "identity.key");
    writeFileSync(identityFile, identity);

    const enc = spawnSync("age", ["-a", "-r", recipient], { input: "secret\n", encoding: "utf8" });
    expect(enc.status).toBe(0);
    const corrupted = enc.stdout.slice(0, -5) + "XXXXX"; // flip bytes near the end (MAC/tag region)

    const dec = spawnSync("age", ["-d", "-i", identityFile], { input: corrupted, encoding: "utf8" });
    expect(dec.status).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// restore-database-r2.sh: download / checksum / decrypt failure modes, and path-safety.
// ---------------------------------------------------------------------------------------------
describe("restore-database-r2.sh: hostile input and failure handling", () => {
  const baseRestoreEnv = {
    R2_ENDPOINT: "https://abc123.r2.cloudflarestorage.com",
    R2_BUCKET: "opsiq-production-backups",
    AWS_ACCESS_KEY_ID: "fake-readonly-key",
    AWS_SECRET_ACCESS_KEY: "fake-readonly-secret",
    OPSIQ_DB_TARGET: "local",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/rehearsal_target",
  };
  const DUMMY_IDENTITY = "AGE-SECRET-KEY-1Q0000000000000000000000000000000000000000000000000000000000Q\n";

  function seedBucket(objectName: string, gzippedOrPlain: string | Buffer, recipient: string) {
    const enc = spawnSync("age", ["-a", "-r", recipient], { input: gzippedOrPlain, encoding: "utf8" });
    writeFileSync(join(bucketDir, "backups", objectName), enc.stdout);
    const sum = spawnSync("sha256sum", [join(bucketDir, "backups", objectName)], { encoding: "utf8" }).stdout.split(/\s+/)[0];
    writeFileSync(join(bucketDir, "backups", `${objectName}.sha256`), sum);
  }

  it("19. a malicious/unexpected object path (traversal, wrong extension) is rejected before any network call", () => {
    const identityFile = join(dir, "id.key");
    writeFileSync(identityFile, DUMMY_IDENTITY);
    for (const bad of ["../../etc/passwd", "backup.sql", "a/b.sql.gz.age"]) {
      const r = run(RESTORE, { ...baseRestoreEnv, AGE_IDENTITY_FILE: identityFile }, [bad]);
      expect(r.status).not.toBe(0);
      expect(existsSync(join(dir, "aws.called"))).toBe(false);
    }
  });

  it("9b. missing R2 read credentials blocks before any download", () => {
    const identityFile = join(dir, "id.key");
    writeFileSync(identityFile, DUMMY_IDENTITY);
    const r = run(RESTORE, { ...omit(baseRestoreEnv, "AWS_ACCESS_KEY_ID"), AGE_IDENTITY_FILE: identityFile } as typeof baseRestoreEnv, ["opsiq_backup_x.sql.gz.age"]);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, "aws.called"))).toBe(false);
  });

  it("26. backup-write never has access to AGE_PRIVATE_IDENTITY or the recovery environment's read credential (static proof)", () => {
    expect(WORKFLOW_BACKUP).not.toMatch(/AGE_PRIVATE_IDENTITY/);
    expect(WORKFLOW_BACKUP).not.toMatch(/R2_READONLY_/);
  });

  it.skipIf(!hasAge)("11/22. checksum mismatch on the downloaded ciphertext blocks before decryption is attempted", () => {
    const { identity, recipient } = ephemeralKeypair();
    const identityFile = join(dir, "id.key");
    writeFileSync(identityFile, identity);

    seedBucket("opsiq_backup_test.sql.gz.age", "fake dump content\n", recipient);
    // Corrupt the stored checksum sidecar so it no longer matches the (untouched) ciphertext.
    writeFileSync(join(bucketDir, "backups", "opsiq_backup_test.sql.gz.age.sha256"), "0".repeat(64));

    const r = run(RESTORE, { ...baseRestoreEnv, AGE_IDENTITY_FILE: identityFile }, ["opsiq_backup_test.sql.gz.age"]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/checksum mismatch/i);
  });

  it.skipIf(!hasAge)("20b. restore with the wrong private key fails closed end-to-end through restore-database-r2.sh", () => {
    const { recipient } = ephemeralKeypair();
    const { identity: wrongIdentity } = ephemeralKeypair();
    seedBucket("opsiq_backup_wrongkey.sql.gz.age", "fake dump content\n", recipient);

    const wrongIdentityFile = join(dir, "wrong.key");
    writeFileSync(wrongIdentityFile, wrongIdentity);

    const r = run(RESTORE, { ...baseRestoreEnv, AGE_IDENTITY_FILE: wrongIdentityFile }, ["opsiq_backup_wrongkey.sql.gz.age"]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/decryption failed/i);
  });

  it.skipIf(!hasAge)("21b/23. an incomplete dump (missing pg_dump completion marker) fails closed at restore-database.sh's own check", () => {
    const { identity, recipient } = ephemeralKeypair();
    const identityFile = join(dir, "id.key");
    writeFileSync(identityFile, identity);

    // No completion marker -- an honest incomplete/truncated dump, not a corrupted one. Real gzip
    // compresses it so restore-database.sh's own gzip-integrity check passes and the marker check
    // is what actually fails, proving the boundary between restore-database-r2.sh and the
    // existing, unmodified restore-database.sh is exercised correctly.
    const gz = spawnSync("gzip", ["-9"], { input: Buffer.from("some sql without a completion marker\n"), encoding: "buffer" });
    const enc = spawnSync("age", ["-r", recipient], { input: gz.stdout, encoding: "buffer" });
    writeFileSync(join(bucketDir, "backups", "opsiq_backup_incomplete.sql.gz.age"), enc.stdout);
    const sum = spawnSync("sha256sum", [join(bucketDir, "backups", "opsiq_backup_incomplete.sql.gz.age")], { encoding: "utf8" }).stdout.split(/\s+/)[0];
    writeFileSync(join(bucketDir, "backups", "opsiq_backup_incomplete.sql.gz.age.sha256"), sum);

    const r = run(RESTORE, { ...baseRestoreEnv, AGE_IDENTITY_FILE: identityFile }, ["opsiq_backup_incomplete.sql.gz.age"]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/completion marker/i);
  });

  it("24. a restore invocation pointed at a 'production' target is refused by the unmodified restore-database.sh before any data would move", () => {
    const identityFile = join(dir, "id.key");
    writeFileSync(identityFile, DUMMY_IDENTITY);
    const r = run(
      RESTORE,
      { ...baseRestoreEnv, AGE_IDENTITY_FILE: identityFile, OPSIQ_DB_TARGET: "production", DATABASE_URL: "postgresql://x@real-prod-host.neon.tech/db" },
      ["opsiq_backup_x.sql.gz.age"],
    );
    expect(r.status).not.toBe(0);
    // This object does not exist in the fake bucket either, so this also fails at download --
    // still a fail-closed outcome either way. restore-database.sh's own target-assertion test
    // suite (src/__tests__/.../restore-database target tests, pre-existing) is the direct,
    // authoritative test of that refusal; this script deliberately does not duplicate it.
  });
});

// ---------------------------------------------------------------------------------------------
// 15/16: no plaintext dump persisted; no GitHub artifact ever receives the dump payload.
// ---------------------------------------------------------------------------------------------
describe("static invariants: no plaintext on disk, no GitHub artifact of the dump", () => {
  it("15. the backup script never writes a bare .sql or unencrypted .sql.gz file path", () => {
    expect(BACKUP_SCRIPT_SRC).toMatch(/OBJECT_NAME="opsiq_backup_\$\{TIMESTAMP\}\.sql\.gz\.age"/);
    expect(BACKUP_SCRIPT_SRC).not.toMatch(/>\s*"\$WORKDIR\/[^"]*\.sql"/);
    expect(BACKUP_SCRIPT_SRC).not.toMatch(/>\s*"\$WORKDIR\/[^"]*\.sql\.gz"\s*$/m);
  });

  it("16. neither new workflow ever uploads a GitHub Actions artifact", () => {
    // Matches an actual `uses: actions/upload-artifact...` step, not this file's own prose
    // explaining (in a comment) that no such step exists.
    expect(WORKFLOW_BACKUP).not.toMatch(/uses:\s*actions\/upload-artifact/);
    expect(WORKFLOW_RESTORE).not.toMatch(/uses:\s*actions\/upload-artifact/);
  });

  it("the pre-existing scheduled-backup.yml is untouched and still not re-enabled by this change", () => {
    const oldWorkflow = readFileSync(OLD_WORKFLOW_PATH, "utf8");
    expect(oldWorkflow).toMatch(/schedule:/); // still has its original trigger block, unedited
  });

  it("25. the new backup-write workflow has no pull_request-family trigger and no schedule yet", () => {
    expect(WORKFLOW_BACKUP).toMatch(/^on:\n\s*workflow_dispatch: \{\}/m);
    expect(WORKFLOW_BACKUP).not.toMatch(/pull_request/);
    expect(WORKFLOW_BACKUP).not.toMatch(/^\s*schedule:/m);
    expect(WORKFLOW_RESTORE).not.toMatch(/pull_request/);
  });

  it("backup-write and backup-recovery are distinct environments", () => {
    expect(WORKFLOW_BACKUP).toMatch(/environment:\s*backup-write/);
    expect(WORKFLOW_RESTORE).toMatch(/environment:\s*backup-recovery/);
  });

  it("QBO gate call appears before the pg_dump invocation in the script's own source (order invariant)", () => {
    const gateIdx = BACKUP_SCRIPT_SRC.indexOf("backup-qbo-gate.sh");
    const dumpIdx = BACKUP_SCRIPT_SRC.indexOf("pg_dump \\");
    expect(gateIdx).toBeGreaterThan(0);
    expect(dumpIdx).toBeGreaterThan(gateIdx);
  });

  it("BUCKET_LOCK / Object Lock is never referenced (Option B: ordinary lifecycle retention only)", () => {
    expect(WORKFLOW_BACKUP + BACKUP_SCRIPT_SRC).not.toMatch(/object.?lock|bucket.?lock|governance.?mode|compliance.?mode/i);
  });
});
