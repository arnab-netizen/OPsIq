/**
 * A3 — scripts/restore-database.sh target policy: LOCAL (loopback) and APPROVED STAGING only; production, missing, ci,
 * test and unknown targets are refused BEFORE the script prints, decompresses or writes anything.
 *
 * All URLs are synthetic. The subprocess tests put a fake `psql` first on PATH that records any invocation, so a
 * refusal is proven to happen before any database client could run.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync, chmodSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { assessRestoreTarget, isLoopbackPostgresUrl } from "../../../scripts/lib/restore-target.mjs";
import { isLoopbackDatabaseUrl } from "@/infra/test-database-guard";

const ROOT = process.cwd();
const REMOTE = "postgresql://rst-user:rst-secret@db.synthetic-restore.invalid:5432/rst_db_name";
const PROD = "postgresql://prd-user:prd-secret@ep-synthetic-prd-7.region.invalid:5432/prd_db_name";
const STG = "postgresql://stg-user:stg-secret@ep-synthetic-stg-7.region.invalid:5432/stg_db_name";
const LEAK = ["rst-user", "rst-secret", "synthetic-restore", "rst_db_name", "prd-user", "prd-secret", "ep-synthetic-prd-7", "prd_db_name", "stg-user", "stg-secret", "ep-synthetic-stg-7", "stg_db_name", "region.invalid"];

let dir: string;
let backup: string;
let bin: string;
let marker: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "restore-target-"));
  backup = join(dir, "opsiq_backup_synthetic.sql.gz");
  writeFileSync(backup, gzipSync("-- PostgreSQL database dump\nSELECT 1;\n-- PostgreSQL database dump complete\n"));
  bin = join(dir, "bin");
  mkdirSync(bin);
  marker = join(dir, "psql-was-run");
  writeFileSync(join(bin, "psql"), `#!/bin/sh\ncat >/dev/null\necho run >> "${marker}"\nexit 0\n`);
  chmodSync(join(bin, "psql"), 0o755);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function restore(env: Record<string, string>) {
  rmSync(marker, { force: true });
  const r = spawnSync("bash", [join(ROOT, "scripts", "restore-database.sh"), backup], {
    cwd: ROOT,
    env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: process.env.HOME ?? "/tmp", ...env },
    encoding: "utf8",
    timeout: 120_000,
  });
  return { status: r.status, output: `${r.stdout ?? ""}\n${r.stderr ?? ""}`, psqlRan: existsSync(marker) };
}
const noLeak = (o: string) => { for (const p of LEAK) expect(o, `leaked ${p}`).not.toContain(p); };

describe("policy (pure)", () => {
  it("A/B. a missing target is refused whatever DATABASE_URL holds", () => {
    for (const url of ["postgresql://u:p@127.0.0.1:5432/d", REMOTE, PROD]) {
      const v = assessRestoreTarget({ DATABASE_URL: url });
      expect(v.ok).toBe(false);
      expect(v.code).toBe("RESTORE_TARGET_REQUIRED");
    }
  });
  it("C/D/E. local + localhost / 127.0.0.1 / ::1 passes", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const v = assessRestoreTarget({ OPSIQ_DB_TARGET: "local", DATABASE_URL: `postgresql://u:p@${host}:5432/d` });
      expect(v, host).toMatchObject({ ok: true, target: "local" });
    }
  });
  it("F/G. local + arbitrary remote or a production endpoint is refused", () => {
    for (const url of [REMOTE, PROD]) {
      expect(assessRestoreTarget({ OPSIQ_DB_TARGET: "local", DATABASE_URL: url }).code).toBe("RESTORE_LOCAL_REQUIRES_LOOPBACK");
    }
    // host/hostaddr smuggling is not loopback
    expect(assessRestoreTarget({ OPSIQ_DB_TARGET: "local", DATABASE_URL: "postgresql://u:p@localhost:5432/d?host=db.synthetic-restore.invalid" }).ok).toBe(false);
  });
  it("local never honours the named-host exception that general local Prisma mutation allows", () => {
    const v = assessRestoreTarget({ OPSIQ_DB_TARGET: "local", OPSIQ_LOCAL_DB_EXTRA_HOSTS: "postgres", DATABASE_URL: "postgresql://u:p@postgres:5432/d" });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("RESTORE_LOCAL_REQUIRES_LOOPBACK");
  });
  it("M/N. production is refused ALWAYS and before the URL is even read — production migration variables cannot bypass it", () => {
    for (const env of [
      { OPSIQ_DB_TARGET: "production", DATABASE_URL: PROD },
      { OPSIQ_DB_TARGET: "production", DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/d" },
      { OPSIQ_DB_TARGET: "production" },
      { OPSIQ_DB_TARGET: "PRODUCTION", DATABASE_URL: PROD, OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true", OPSIQ_PRODUCTION_OPERATION: "migrate deploy", MIGRATION_DATABASE_URL: PROD },
      { OPSIQ_DB_TARGET: "production", DATABASE_URL: PROD, OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true", OPSIQ_PRODUCTION_OPERATION: "restore", RESTORE_CONFIRM: "RESTORE_PRODUCTION" },
    ]) {
      const v = assessRestoreTarget(env);
      expect(v.ok).toBe(false);
      expect(v.code).toBe("PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW");
    }
  });
  it("ci, test and unknown targets are refused", () => {
    for (const t of ["ci", "test", "dev", "prod", "local ", "local;production", "staging-ish"]) {
      const v = assessRestoreTarget({ OPSIQ_DB_TARGET: t, DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/d" });
      if (t === "local ") continue; // whitespace is trimmed: the same as "local"
      expect(v.ok, t).toBe(false);
      expect(v.code, t).toBe("RESTORE_TARGET_UNSUPPORTED");
    }
  });
  it("staging is delegated to the canonical validator (no URL parsing in the policy module)", () => {
    const v = assessRestoreTarget({ OPSIQ_DB_TARGET: "staging", DATABASE_URL: STG });
    expect(v).toMatchObject({ ok: true, target: "staging", needsStagingValidator: true });
    expect(assessRestoreTarget({ OPSIQ_DB_TARGET: "staging" }).code).toBe("RESTORE_DATABASE_URL_UNSET");
  });
  it("O. refusals leak no URL, host, user, password or database name", () => {
    for (const env of [
      { DATABASE_URL: REMOTE },
      { OPSIQ_DB_TARGET: "local", DATABASE_URL: REMOTE },
      { OPSIQ_DB_TARGET: "local", DATABASE_URL: PROD },
      { OPSIQ_DB_TARGET: "production", DATABASE_URL: PROD },
      { OPSIQ_DB_TARGET: "ci", DATABASE_URL: REMOTE },
    ]) noLeak(JSON.stringify(assessRestoreTarget(env)));
  });
  it("the dependency-free loopback test agrees with the canonical TypeScript one", () => {
    for (const url of [
      "postgresql://u:p@localhost:5432/d", "postgres://u:p@127.0.0.1/d", "postgresql://u:p@[::1]:5432/d", "postgresql://u:p@LOCALHOST/d",
      "postgresql://u:p@localhost.evil.invalid/d", "postgresql://u:p@127.0.0.2/d", "postgresql://u:p@0.0.0.0/d", REMOTE, PROD,
      "postgresql://u:p@localhost/d?host=x", "postgresql://u:p@localhost/d?hostaddr=1.2.3.4", "mysql://u:p@localhost/d", "not a url", "",
    ]) expect(isLoopbackPostgresUrl(url), url).toBe(isLoopbackDatabaseUrl(url));
  });
});

describe("restore-database.sh (real script, fake psql)", () => {
  it("A/B. missing target → refused before any database client runs, sanitized", () => {
    for (const url of ["postgresql://u:p@127.0.0.1:5432/d", REMOTE]) {
      const r = restore({ DATABASE_URL: url });
      expect(r.status).toBe(1);
      expect(r.psqlRan).toBe(false);
      expect(r.output).toMatch(/RESTORE_REFUSED RESTORE_TARGET_REQUIRED/);
      expect(r.output).not.toMatch(/Starting database restore|Restoring database/);
      noLeak(r.output);
    }
  });
  it("C/D. local + localhost / 127.0.0.1 passes the preflight and reaches the restore (P: the rehearsal shape)", () => {
    for (const url of ["postgresql://postgres:postgres@localhost:5432/rehearsal_target", "postgresql://postgres:postgres@127.0.0.1:5432/rehearsal_target"]) {
      const r = restore({ OPSIQ_DB_TARGET: "local", DATABASE_URL: url });
      expect(r.output).toMatch(/RESTORE_TARGET=local/);
      expect(r.psqlRan).toBe(true);
      expect(r.status).toBe(0);
      expect(r.output).not.toContain("postgres:postgres");
    }
  });
  it("F/G. local + remote or production endpoint → refused before any database client runs", () => {
    for (const url of [REMOTE, PROD]) {
      const r = restore({ OPSIQ_DB_TARGET: "local", DATABASE_URL: url });
      expect(r.status).toBe(1);
      expect(r.psqlRan).toBe(false);
      expect(r.output).toMatch(/RESTORE_LOCAL_REQUIRES_LOOPBACK/);
      noLeak(r.output);
    }
  });
  it("M/N. production → refused immediately, with or without the Prisma production authorization variables", () => {
    for (const extra of [{}, { OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true", OPSIQ_PRODUCTION_OPERATION: "migrate deploy", MIGRATION_DATABASE_URL: PROD }]) {
      const r = restore({ OPSIQ_DB_TARGET: "production", DATABASE_URL: PROD, ...extra });
      expect(r.status).toBe(1);
      expect(r.psqlRan).toBe(false);
      expect(r.output).toMatch(/PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW/);
      noLeak(r.output);
    }
  });
  it("H–L. staging goes through the canonical validator: approved passes; arbitrary remote, production, pooler and an empty list are refused", () => {
    const pass = restore({ OPSIQ_DB_TARGET: "staging", DATABASE_URL: STG, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "ep-synthetic-stg-7" });
    expect(pass.output).toMatch(/RESTORE_TARGET=staging/);
    expect(pass.psqlRan).toBe(true);
    const refusals: Array<Record<string, string>> = [
      { DATABASE_URL: REMOTE, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "ep-synthetic-stg-7" },
      { DATABASE_URL: PROD, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "ep-synthetic-prd-7", OPSIQ_PRODUCTION_DB_IDENTITIES: "ep-synthetic-prd-7" },
      { DATABASE_URL: STG.replace("ep-synthetic-stg-7", "ep-synthetic-stg-7-pooler"), OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "ep-synthetic-stg-7-pooler" },
      { DATABASE_URL: STG, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "" },
      { DATABASE_URL: STG },
    ];
    for (const env of refusals) {
      const r = restore({ OPSIQ_DB_TARGET: "staging", ...env });
      expect(r.status, JSON.stringify(Object.keys(env))).toBe(1);
      expect(r.psqlRan).toBe(false);
      expect(r.output).toMatch(/STAGING_TARGET_REFUSED_|RESTORE_REFUSED/);
      noLeak(r.output);
    }
  });
  it("ci / test / unknown targets are refused", () => {
    for (const t of ["ci", "test", "bogus"]) {
      const r = restore({ OPSIQ_DB_TARGET: t, DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/d" });
      expect(r.status, t).toBe(1);
      expect(r.psqlRan).toBe(false);
    }
  });
  it("the verification gates are untouched: a corrupt or truncated backup is still refused after a valid target", () => {
    const bad = join(dir, "truncated.sql.gz");
    writeFileSync(bad, gzipSync("-- PostgreSQL database dump\nSELECT 1;\n")); // no completion marker
    const r = spawnSync("bash", [join(ROOT, "scripts", "restore-database.sh"), bad], {
      cwd: ROOT,
      env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: process.env.HOME ?? "/tmp", OPSIQ_DB_TARGET: "local", DATABASE_URL: "postgresql://u:p@localhost:5432/d" },
      encoding: "utf8",
    });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toMatch(/completion marker not found/);
  });
});


describe("restore-database.sh: production is refused on the target alone, and the target precedes DATABASE_URL validation (real script)", () => {
  const POLICY = /PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW/;
  const prodAuth = { OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true", OPSIQ_PRODUCTION_OPERATION: "migrate deploy", MIGRATION_DATABASE_URL: PROD };

  it("A. production + no DATABASE_URL → policy refusal (not 'DATABASE_URL not set'), psql never invoked", () => {
    const r = restore({ OPSIQ_DB_TARGET: "production" });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(POLICY);
    expect(r.output).not.toMatch(/DATABASE_URL environment variable not set|placeholder/);
    expect(r.psqlRan).toBe(false);
    noLeak(r.output);
  });
  it("B. production + a synthetic DATABASE_URL → the same refusal", () => {
    const r = restore({ OPSIQ_DB_TARGET: "production", DATABASE_URL: PROD });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(POLICY);
    expect(r.psqlRan).toBe(false);
    noLeak(r.output);
  });
  it("C. production + a placeholder or malformed DATABASE_URL → the production-policy refusal, not the placeholder message", () => {
    for (const url of ["postgresql://u:REPLACE_ME@db.example.com/x", "PLACEHOLDER", "your_neon_url", "not a url at all"]) {
      const r = restore({ OPSIQ_DB_TARGET: "production", DATABASE_URL: url });
      expect(r.status, url).toBe(1);
      expect(r.output, url).toMatch(POLICY);
      expect(r.output, url).not.toMatch(/placeholder value/);
      expect(r.psqlRan).toBe(false);
    }
  });
  it("D. production + the Prisma production authorization variables → the same refusal", () => {
    for (const url of [undefined, PROD]) {
      const r = restore({ OPSIQ_DB_TARGET: "production", ...(url ? { DATABASE_URL: url } : {}), ...prodAuth });
      expect(r.status).toBe(1);
      expect(r.output).toMatch(POLICY);
      expect(r.psqlRan).toBe(false);
      noLeak(r.output);
    }
  });
  it("E. missing OPSIQ_DB_TARGET + missing DATABASE_URL → RESTORE_TARGET_REQUIRED (the URL's absence decides nothing)", () => {
    const r = restore({});
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/RESTORE_REFUSED RESTORE_TARGET_REQUIRED/);
    expect(r.output).not.toMatch(/DATABASE_URL environment variable not set/);
    expect(r.psqlRan).toBe(false);
  });
  it("F. local + missing DATABASE_URL → a sanitized URL-unset refusal", () => {
    const r = restore({ OPSIQ_DB_TARGET: "local" });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/RESTORE_REFUSED RESTORE_DATABASE_URL_UNSET/);
    expect(r.psqlRan).toBe(false);
    noLeak(r.output);
  });
  it("G. staging + missing DATABASE_URL → a sanitized URL-unset refusal", () => {
    const r = restore({ OPSIQ_DB_TARGET: "staging", OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "ep-synthetic-stg-7" });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/RESTORE_REFUSED RESTORE_DATABASE_URL_UNSET/);
    expect(r.psqlRan).toBe(false);
    noLeak(r.output);
  });
  it("the placeholder check still runs — but only AFTER a local target is authorized", () => {
    const r = restore({ OPSIQ_DB_TARGET: "local", DATABASE_URL: "postgresql://postgres:REPLACE_ME@localhost:5432/d" });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/placeholder value/);
    expect(r.psqlRan).toBe(false);
  });
});

describe("restore rehearsal workflow", () => {
  it("P. the rehearsal invocation selects local explicitly and still targets the disposable loopback container", () => {
    const wf = yaml.load(readFileSync(join(ROOT, ".github/workflows/restore-rehearsal.yml"), "utf8")) as { jobs: Record<string, { steps: Array<{ name?: string; run?: string; env?: Record<string, string> }> }> };
    const step = wf.jobs.rehearse.steps.find((s) => /restore-database\.sh/.test(s.run ?? ""))!;
    expect(step.env?.OPSIQ_DB_TARGET).toBe("local");
    expect(assessRestoreTarget(step.env as Record<string, string>)).toMatchObject({ ok: true, target: "local" });
    expect(JSON.stringify(wf)).not.toMatch(/PRODUCTION_DATABASE_URL|STAGING_DATABASE_URL|OPSIQ_DB_TARGET: production/);
  });
});
