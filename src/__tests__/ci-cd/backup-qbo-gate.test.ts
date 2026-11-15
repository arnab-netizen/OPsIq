/**
 * Option B (owner decision D2): no whole-database GitHub backup may contain QuickBooks/Intuit User Data.
 * These tests drive the REAL gate and the REAL backup script with a fake psql / pg_dump on PATH.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const GATE = resolve(process.cwd(), "scripts/backup-qbo-gate.sh");
const BACKUP = resolve(process.cwd(), "scripts/backup-database.sh");
const WORKFLOW = readFileSync(resolve(process.cwd(), ".github/workflows/scheduled-backup.yml"), "utf8");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "qbo-gate-"));
  // fake psql: prints $FAKE_PSQL_OUT, exits $FAKE_PSQL_RC, and records that it ran.
  writeFileSync(join(dir, "psql"), '#!/usr/bin/env bash\ntouch "$FAKE_DIR/psql.called"\n[ -n "${FAKE_PSQL_OUT:-}" ] && echo "$FAKE_PSQL_OUT"\nexit "${FAKE_PSQL_RC:-0}"\n');
  // fake pg_dump: records that it ran and emits a marker.
  writeFileSync(join(dir, "pg_dump"), '#!/usr/bin/env bash\ntouch "$FAKE_DIR/pg_dump.called"\necho "-- fake dump"\n');
  chmodSync(join(dir, "psql"), 0o755);
  chmodSync(join(dir, "pg_dump"), 0o755);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(script: string, env: Record<string, string>, args: string[] = []) {
  return spawnSync("bash", [script, ...args], {
    env: { PATH: `${dir}:${process.env.PATH}`, FAKE_DIR: dir, HOME: dir, ...env },
    encoding: "utf8",
  });
}
const base = { DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db" };

describe("QBO backup gate (scripts/backup-qbo-gate.sh)", () => {
  it("allows when the flag is unset and no qbo_* rows exist", () => {
    const r = run(GATE, { ...base, FAKE_PSQL_OUT: "0" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("QBO_BACKUP_GATE=ALLOW");
  });
  it("allows when the flag is exactly false", () => {
    expect(run(GATE, { ...base, PRODUCTION_QBO_ENABLED: "false", FAKE_PSQL_OUT: "0" }).status).toBe(0);
  });
  it.each(["true", "TRUE", "1", "yes", "enabled", "flase"])("blocks on flag '%s' WITHOUT touching the database", (v) => {
    const r = run(GATE, { ...base, PRODUCTION_QBO_ENABLED: v, FAKE_PSQL_OUT: "0" });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("QBO_BACKUP_GATE=BLOCK");
    expect(existsSync(join(dir, "psql.called"))).toBe(false);
  });
  it("blocks on qbo_* rows even when the flag says false (nobody has to remember the flag)", () => {
    const r = run(GATE, { ...base, PRODUCTION_QBO_ENABLED: "false", FAKE_PSQL_OUT: "7" });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("7 rows");
  });
  it("fails closed when the probe fails", () => {
    expect(run(GATE, { ...base, FAKE_PSQL_RC: "2" }).status).toBe(1);
  });
  it("fails closed on a non-numeric or empty probe result", () => {
    expect(run(GATE, { ...base, FAKE_PSQL_OUT: "ERROR: boom" }).status).toBe(1);
    expect(run(GATE, { ...base, FAKE_PSQL_OUT: "" }).status).toBe(1);
  });
  it("fails closed without DATABASE_URL", () => {
    expect(run(GATE, { FAKE_PSQL_OUT: "0" }).status).toBe(1);
  });
});

describe("backup script refuses to dump when the gate blocks", () => {
  it("runs pg_dump when allowed", () => {
    const r = run(BACKUP, { ...base, FAKE_PSQL_OUT: "0" }, [dir]);
    expect(existsSync(join(dir, "pg_dump.called"))).toBe(true);
    expect(r.stdout).toContain("QBO_BACKUP_GATE=ALLOW");
  });
  it.each([
    ["flag true", { PRODUCTION_QBO_ENABLED: "true", FAKE_PSQL_OUT: "0" }],
    ["qbo rows present", { FAKE_PSQL_OUT: "3" }],
    ["probe error", { FAKE_PSQL_RC: "1" }],
  ])("never invokes pg_dump (%s)", (_n, env) => {
    const r = run(BACKUP, { ...base, ...env }, [dir]);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, "pg_dump.called"))).toBe(false);
  });

  // ROOT-CAUSE REGRESSION (observation-window audit, 2026-10-28): `GATE_OUT=$(cmd); GATE_RC=$?`
  // is a plain assignment. Under `set -e`, a failing command substitution aborts the script AT
  // THAT LINE -- before `GATE_RC=$?`, the `echo "$GATE_OUT"`, and the explicit "ERROR: backup
  // refused..." exit below ever run. pg_dump still never ran (covered above), so this was never
  // fail-open, but it silently discarded the gate's reason and never wrote $LOG_FILE, leaving no
  // audit trail for why a run failed. These assertions pin the fix: the reason must reach both
  // stdout and the on-disk log for every blocked case, not just a bare non-zero exit status.
  it.each([
    ["flag true", { PRODUCTION_QBO_ENABLED: "true", FAKE_PSQL_OUT: "0" }],
    ["qbo rows present", { FAKE_PSQL_OUT: "3" }],
    ["probe error", { FAKE_PSQL_RC: "1" }],
  ])("logs the gate's block reason instead of dying silently (%s)", (_n, env) => {
    const r = run(BACKUP, { ...base, ...env }, [dir]);
    expect(r.stdout).toContain("QBO_BACKUP_GATE=BLOCK");
    expect(r.stdout).toContain("ERROR: backup refused by the QBO backup gate");
    const logFiles = readdirSync(dir).filter((f: string) => f.endsWith(".log"));
    expect(logFiles.length).toBeGreaterThan(0);
    const logContent = readFileSync(join(dir, logFiles[0]), "utf8");
    expect(logContent).toContain("QBO_BACKUP_GATE=BLOCK");
  });
});

describe("scheduled workflow wiring", () => {
  it("passes the governed flag into the backup step and has no bypass", () => {
    expect(WORKFLOW).toContain("PRODUCTION_QBO_ENABLED: ${{ vars.PRODUCTION_QBO_ENABLED }}");
    expect(WORKFLOW).not.toMatch(/continue-on-error:\s*true/);
  });
  it("uploads the artifact only on success (a blocked run uploads nothing)", () => {
    const upload = WORKFLOW.indexOf("name: Upload backup artifact");
    expect(upload).toBeGreaterThan(0);
    expect(WORKFLOW.slice(upload, upload + 120)).toContain("if: success()");
  });
});
