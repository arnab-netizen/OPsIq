/**
 * PORTABILITY + SAFETY of scripts/restore-database.sh on stock macOS and Linux (F-RESTORE-SCRIPT-MACOS-PORTABILITY).
 *
 * Root cause: restore-database.sh used GNU-only constructs -- `sha256sum` (absent on stock macOS) and `grep -oP`
 * (BSD grep has no -P) in three places (restored-DB name, URL query suffix, total row count). On macOS the script
 * failed closed or silently degraded: no checksum tool -> "Checksum mismatch"; no -P -> empty query suffix and a
 * TOTAL_ROWS of 0 even for a populated restore.
 *
 * WHAT THIS FILE PROVES, AND WHAT IT DOES NOT (read before trusting it):
 *  - It runs the REAL script end to end with a fake `psql` (no database), so it is NOT proof against PostgreSQL.
 *    Real-PostgreSQL proof lives in restore-database-portability.db.test.ts (real pg_dump | gzip | restore).
 *  - "Stock-macOS simulation" tests run the script with a restricted PATH that has NO sha256sum, a BSD-style
 *    grep that REJECTS -P (exit 2, like macOS), and `shasum -a 256` only. That reproduces the missing-tool
 *    behaviour on Linux; it is a SIMULATION, not a native macOS run. The "native tool environment" tests run
 *    the same assertions with the host's real tools: on a Mac they ARE native macOS proof (run this file there:
 *    `npx vitest run src/__tests__/scripts/restore-database-portability.test.ts`); on Linux they are Linux proof.
 *  - Mutation tests copy the script, re-introduce each GNU-ism / remove each safety check, and assert the
 *    corresponding scenario then FAILS -- proving the scenarios would catch a regression.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { gzipSync } from "node:zlib";

import { toolDir, type EnvKind } from "@/__tests__/test-helpers/restore-script-harness";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "restore-database.sh");
const RESTORE_TARGET_LIB = join(ROOT, "scripts", "lib", "restore-target.mjs");
const ASSERT_TARGET = join(ROOT, "scripts", "assert-restore-target.mjs");

let WORK: string;
beforeAll(() => {
  WORK = mkdtempSync(join(tmpdir(), "restore-portability-"));
});
afterAll(() => {
  rmSync(WORK, { recursive: true, force: true });
});

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

type Dump = { file: string; hash: string };

function makeDump(name: string, opts: { complete?: boolean; db?: string; sidecar?: "ok" | "empty" | "wrong" | "none" } = {}): Dump {
  const dir = mkdtempSync(join(WORK, "dump-"));
  const file = join(dir, `${name}.sql.gz`);
  const db = opts.db ?? "opsiq_restored_proof";
  const body = [
    "-- PostgreSQL database dump",
    "SET statement_timeout = 0;",
    `DROP DATABASE IF EXISTS ${db};`,
    `CREATE DATABASE ${db};`,
    `\\connect ${db}`,
    "CREATE TABLE public.t (id int);",
    "COPY public.t (id) FROM stdin;",
    "1",
    "\\\\connect decoy_in_data_row", // an escaped backslash line inside COPY data must never be picked as the database name
    "\\.",
    opts.complete === false ? "" : "-- PostgreSQL database dump complete",
    "",
  ].join("\n");
  const gz = gzipSync(Buffer.from(body));
  writeFileSync(file, gz);
  const hash = sha256(gz);
  const side = opts.sidecar ?? "ok";
  if (side === "ok") writeFileSync(`${file}.sha256`, `${hash}\n`);
  if (side === "empty") writeFileSync(`${file}.sha256`, "");
  if (side === "wrong") writeFileSync(`${file}.sha256`, `${"0".repeat(64)}\n`);
  return { file, hash };
}

type Run = { status: number | null; out: string; psqlUrls: string[] };

function run(scriptPath: string, dump: Dump, kind: EnvKind, extraEnv: Record<string, string> = {}, args: string[] = ["verify"]): Run {
  const log = join(mkdtempSync(join(WORK, "log-")), "psql.log");
  const bin = toolDir(WORK, kind, "fake");
  const r = spawnSync("/bin/bash", [scriptPath, dump.file, ...args], {
    env: {
      PATH: kind === "native" ? `${bin}${delimiter}${process.env.PATH ?? ""}` : bin,
      HOME: WORK,
      OPSIQ_DB_TARGET: "local",
      DATABASE_URL: "postgresql://u:p@localhost:5432/restore_target?sslmode=disable&application_name=proof",
      PSQL_LOG: log,
      ...extraEnv,
    },
    encoding: "utf8",
    cwd: ROOT,
    timeout: 60_000,
  });
  return {
    status: r.status,
    out: `${r.stdout ?? ""}${r.stderr ?? ""}`,
    psqlUrls: existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [],
  };
}

const kinds: Array<[string, EnvKind]> = [
  ["native tool environment (real host tools; native macOS proof when run on a Mac)", "native"],
  ["simulated stock macOS (no sha256sum; BSD-style grep rejects -P; shasum only)", "no-sha256sum"],
];

describe("harness self-check: the simulated stock-macOS environment really lacks sha256sum and grep -P", () => {
  it("sha256sum is absent, shasum is present, grep -P is rejected with exit 2", () => {
    const dir = toolDir(WORK, "no-sha256sum", "none");
    const sh = (cmd: string) => spawnSync("/bin/sh", ["-c", cmd], { env: { PATH: dir }, encoding: "utf8" });
    expect(sh("command -v sha256sum").status).not.toBe(0);
    expect(sh("command -v shasum").status).toBe(0);
    const p = sh("echo abc | grep -oP 'a(?=b)'");
    expect(p.status).toBe(2);
    expect(`${p.stderr}`).toContain("invalid option");
  });
});

for (const [label, kind] of kinds) {
  describe(`restore-database.sh — ${label}`, () => {
    it("verifies the checksum, extracts the restored DB name, keeps the full query suffix, and parses the row count", () => {
      const d = makeDump("ok");
      const r = run(SCRIPT, d, kind);
      expect(r.status, r.out).toBe(0);
      expect(r.out).toContain(`Checksum verified: ${d.hash}`);
      expect(r.out).toContain("Restored database name (from dump): opsiq_restored_proof");
      expect(r.out).toContain("Tables in restored database: 7");
      expect(r.out).toContain("Total rows across all public-schema tables: 42");
      expect(r.out).toContain("Database restore verified: 7 tables, 42 total rows");
      // psql calls: 1 restore (server URL) + 2 verification queries against the RESTORED database with the query preserved.
      expect(r.psqlUrls[0]).toBe("postgresql://u:p@localhost:5432/restore_target?sslmode=disable&application_name=proof");
      expect(r.psqlUrls[1]).toBe("postgresql://u:p@localhost:5432/opsiq_restored_proof?sslmode=disable&application_name=proof");
      expect(r.psqlUrls[2]).toBe(r.psqlUrls[1]);
    });

    it("a URL with no query string yields no suffix (no stray '?')", () => {
      const r = run(SCRIPT, makeDump("noquery"), kind, { DATABASE_URL: "postgresql://u:p@localhost:5432/restore_target" });
      expect(r.status, r.out).toBe(0);
      expect(r.psqlUrls[1]).toBe("postgresql://u:p@localhost:5432/opsiq_restored_proof");
    });

    it("an escaped-backslash line inside COPY data is never mistaken for the database name", () => {
      const r = run(SCRIPT, makeDump("decoy"), kind);
      expect(r.out).not.toContain("decoy_in_data_row");
    });

    it("parses large row counts exactly and an unparseable count fails safe to 0 (warning path), never to blank", () => {
      const big = run(SCRIPT, makeDump("big"), kind, { FAKE_TOTAL_LINE: "psql:<stdin>:6: NOTICE:  TOTAL_ROWS=123456789012" });
      expect(big.status, big.out).toBe(0);
      expect(big.out).toContain("Total rows across all public-schema tables: 123456789012");
      const junk = run(SCRIPT, makeDump("junk"), kind, { FAKE_TOTAL_LINE: "ERROR: something unrelated" });
      expect(junk.status, junk.out).toBe(0);
      expect(junk.out).toContain("Total rows across all public-schema tables: 0");
      expect(junk.out).toContain("RESTORE VERIFICATION WARNING: schema restored but zero rows found");
    });
  });
}

describe("checksum safety (negative tests) — fails closed before any database client runs", () => {
  for (const [label, kind] of kinds) {
    it(`[${label.split(" (")[0]}] a tampered backup is refused and psql is never invoked`, () => {
      const d = makeDump("tamper");
      writeFileSync(d.file, Buffer.concat([readFileSync(d.file), Buffer.from("x")]));
      const r = run(SCRIPT, d, kind);
      expect(r.status).toBe(1);
      expect(r.out).toContain("Checksum mismatch!");
      expect(r.psqlUrls).toEqual([]);
    });
  }

  it("a wrong sidecar value is refused", () => {
    const r = run(SCRIPT, makeDump("wrong", { sidecar: "wrong" }), "no-sha256sum");
    expect(r.status).toBe(1);
    expect(r.out).toContain("Checksum mismatch!");
    expect(r.psqlUrls).toEqual([]);
  });

  it("an EMPTY sidecar is refused (never equal to a computed digest)", () => {
    const r = run(SCRIPT, makeDump("emptyside", { sidecar: "empty" }), "no-sha256sum");
    expect(r.status).toBe(1);
    expect(r.out).toContain("Checksum mismatch!");
    expect(r.psqlUrls).toEqual([]);
  });

  it("`verify` with no sidecar is refused", () => {
    const r = run(SCRIPT, makeDump("noside", { sidecar: "none" }), "no-sha256sum");
    expect(r.status).toBe(1);
    expect(r.out).toContain("no .sha256 file found");
    expect(r.psqlUrls).toEqual([]);
  });

  it("with NO SHA-256 tool at all the restore fails closed — even with an empty sidecar (no vacuous '' == '' pass)", () => {
    const r = run(SCRIPT, makeDump("notool", { sidecar: "empty" }), "no-sha-tool");
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/neither sha256sum nor shasum is available|checksum verification could not be performed/);
    expect(r.out).not.toContain("Checksum verified");
    expect(r.psqlUrls).toEqual([]);
  });

  it("a truncated dump (no completion marker) is refused before any database client runs", () => {
    const r = run(SCRIPT, makeDump("trunc", { complete: false }), "no-sha256sum");
    expect(r.status).toBe(1);
    expect(r.out).toContain("dump is truncated/incomplete");
    expect(r.psqlUrls).toEqual([]);
  });
});

describe("restore-target protections are unchanged", () => {
  it("production is refused on the target alone; non-loopback 'local' is refused; neither reaches psql or the checksum", () => {
    const prod = run(SCRIPT, makeDump("prod"), "native", { OPSIQ_DB_TARGET: "production" });
    expect(prod.status).toBe(1);
    expect(prod.out).toContain("PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW");
    expect(prod.out).not.toContain("Checksum verified");
    expect(prod.psqlUrls).toEqual([]);
    const remote = run(SCRIPT, makeDump("remote"), "native", { DATABASE_URL: "postgresql://u:p@db.example-host.net:5432/x" });
    expect(remote.status).toBe(1);
    expect(remote.out).toContain("RESTORE_LOCAL_REQUIRES_LOOPBACK");
    expect(remote.out).not.toContain("Checksum verified");
    expect(remote.psqlUrls).toEqual([]);
  });
});

describe("static: no GNU-only construct remains in executable lines of restore-database.sh", () => {
  const code = readFileSync(SCRIPT, "utf8").split("\n").filter((l) => !l.trim().startsWith("#"));
  it("no grep -P / grep -oP / zgrep -P", () => {
    for (const l of code) expect(l, l).not.toMatch(/\b(z?grep)\s+(-[A-Za-z]*P|[^|\n]*\s-[A-Za-z]*P)/);
  });
  it("sha256sum appears only inside the sha256_of helper, which is defined after target authorization", () => {
    const body = code.join("\n");
    const helperStart = body.indexOf("sha256_of() {");
    const helperEnd = body.indexOf("\n}\n", helperStart);
    expect(helperStart).toBeGreaterThan(body.indexOf("assert-restore-target.mjs"));
    const outside = body.slice(0, helperStart) + body.slice(helperEnd);
    expect(outside).not.toContain("sha256sum");
    expect(body).toMatch(/sha256_of "\$BACKUP_FILE"/);
  });
});

// ── Mutation tests: re-introduce each defect into a COPY of the script; the matching scenario must then FAIL ─────────
describe("mutation tests — each regression is detected by the scenarios above", () => {
  let treeScript: string;
  const mutate = (name: string, edit: (src: string) => string): string => {
    const dir = mkdtempSync(join(WORK, `mut-${name}-`));
    mkdirSync(join(dir, "scripts", "lib"), { recursive: true });
    copyFileSync(ASSERT_TARGET, join(dir, "scripts", "assert-restore-target.mjs"));
    copyFileSync(RESTORE_TARGET_LIB, join(dir, "scripts", "lib", "restore-target.mjs"));
    const src = readFileSync(SCRIPT, "utf8");
    const out = edit(src);
    expect(out, `mutation ${name} did not change the script`).not.toBe(src);
    const p = join(dir, "scripts", "restore-database.sh");
    writeFileSync(p, out);
    chmodSync(p, 0o755);
    return p;
  };
  beforeAll(() => {
    treeScript = SCRIPT;
  });

  it("baseline: the unmutated script passes the simulated-macOS happy path (so the mutants below differ for the right reason)", () => {
    expect(run(treeScript, makeDump("base"), "no-sha256sum").status).toBe(0);
  });

  it("M1: bare `sha256sum` instead of the portable helper -> fails on the simulated macOS", () => {
    const p = mutate("m1", (s) => s.replace('COMPUTED_CHECKSUM=$(sha256_of "$BACKUP_FILE")', () => `COMPUTED_CHECKSUM=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')`));
    const r = run(p, makeDump("m1"), "no-sha256sum");
    expect(r.status).not.toBe(0);
  });

  it("M2: `grep -oP` query-suffix extraction -> the restored-database URI loses its query string on the simulated macOS", () => {
    const p = mutate("m2", (s) =>
      s.replace(/  case "\$DATABASE_URL" in\n    \*\\\?\*\) QUERY_SUFFIX="\?\$\{DATABASE_URL#\*\\\?\}" ;;\n    \*\) QUERY_SUFFIX="" ;;\n  esac\n/, () => `  QUERY_SUFFIX=$(echo "$DATABASE_URL" | grep -oP '\\?.*$' || true)\n`),
    );
    const r = run(p, makeDump("m2"), "no-sha256sum");
    expect(r.psqlUrls[1]).toBe("postgresql://u:p@localhost:5432/opsiq_restored_proof"); // suffix silently lost -> the scenario's assertion would fail
    expect(r.psqlUrls[1]).not.toContain("sslmode");
  });

  it("M3: `grep -oP` row-count parse with `|| echo 0` -> reports 0 rows for a populated restore on the simulated macOS", () => {
    const p = mutate("m3", (s) =>
      s.replace(/\| sed -n 's\/\.\*TOTAL_ROWS=\\\(\[0-9\]\[0-9\]\*\\\)\.\*\/\\1\/p' \| head -n 1 \|\| true\)/, () => `| grep -oP '(?<=TOTAL_ROWS=)[0-9]+' || echo "0")`),
    );
    const r = run(p, makeDump("m3"), "no-sha256sum");
    expect(r.out).toContain("Total rows across all public-schema tables: 0");
    expect(r.out).not.toContain("Total rows across all public-schema tables: 42");
  });

  it("M4: neutralised checksum comparison -> a TAMPERED backup would restore (the negative tamper test would catch this)", () => {
    const p = mutate("m4", (s) => s.replace('if [ "$STORED_CHECKSUM" = "$COMPUTED_CHECKSUM" ]; then', "if true; then"));
    const d = makeDump("m4");
    writeFileSync(d.file, Buffer.concat([readFileSync(d.file), Buffer.from("x")]));
    const r = run(p, d, "no-sha256sum");
    expect(r.out).toContain("Checksum verified"); // mutant wrongly accepts: original exits 1 on the same input (tamper test above)
  });

  it("M5: no 64-hex validation + no SHA tool + empty sidecar -> the mutant would pass vacuously (negative test above prevents this)", () => {
    const p = mutate("m5", (s) =>
      s
        .replace(/  case "\$_sha_out" in\n    \*\[!0-9a-f\]\*\|"".*\n  esac\n  if \[ "\$\{#_sha_out\}" -ne 64 \]; then\n[\s\S]*?\n  fi\n/, "")
        .replace('echo "ERROR: neither sha256sum nor shasum is available; cannot verify the backup checksum" >&2\n    return 1', "_sha_out=''"),
    );
    const r = run(p, makeDump("m5", { sidecar: "empty" }), "no-sha-tool");
    expect(r.out).toContain("Checksum verified"); // '' == '' -> vacuous pass, exactly what the hardened script refuses
  });
});
