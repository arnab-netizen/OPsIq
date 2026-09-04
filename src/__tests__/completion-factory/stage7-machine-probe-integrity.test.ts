/**
 * Stage 7 — machine-probe result integrity (S7-I1 / S7-I2 / S7-I12).
 *
 * Companion to stage7-owner-lane-probe-repair.test.ts, which repaired the
 * owner-lane probes. This file closes the same defect class in the remaining
 * governed machine probes, before any of them is captured for D17.
 *
 * The shared root cause is a result recorder whose verdict DEFAULTS to success:
 *
 *   function record(label, value, pass = true)
 *
 * Under that signature an omitted third argument silently files a passing check.
 * It is what let S7-I5 report "11 PASS, 0 FAIL" having scanned nothing, and it
 * was still present in s7-i1, s7-i2 and s7-i12.
 *
 * S7-I12 additionally had three FALSE-pass paths, not merely vacuous ones:
 *
 *   record("recovery_time_under_5min", recoveryTimeMs < 300000, true)
 *       — the verdict is the literal `true`; the comparison is decoration.
 *   record("startup_state_module", "not found — ...")
 *       — a MISSING module filed as a pass via the default.
 *   record(`recovery_tool_${label}`, ..., exists || label === "migration_runbook")
 *       — a missing migration runbook filed as a pass by name.
 *
 * and it never staged a failure or performed a recovery at all: every "Stage" was
 * a readFileSync plus a regex over source and markdown, with `recovery_time_ms: 1`
 * — the elapsed time of those file reads — published as a recovery time against a
 * clause that explicitly requires one.
 */
import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const REPO_ROOT = process.cwd();
const PROBE_DIR = join(REPO_ROOT, "scripts/stage7-probes");
const I1_PROBE = join(PROBE_DIR, "s7-i1-health-probe.mjs");
const I2_PROBE = join(PROBE_DIR, "s7-i2-migration-check.mjs");
const I12_PROBE = join(PROBE_DIR, "s7-i12-runbook-recovery.mjs");

interface ProbeResult {
  exitCode: number;
  out: string;
  result: "PASS" | "FAIL" | "NONE";
}

function runProbe(probePath: string, env: Record<string, string> = {}): ProbeResult {
  const r = spawnSync("node", [probePath], {
    encoding: "utf-8",
    timeout: 90000,
    env: { PATH: process.env.PATH ?? "", ...env },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const result = /^RESULT: PASS$/m.test(out)
    ? "PASS"
    : /^RESULT: FAIL$/m.test(out)
      ? "FAIL"
      : "NONE";
  return { exitCode: r.status ?? -1, out, result };
}

// ─── No governed probe may reintroduce a default-success recorder ───────────

/**
 * Strip ONLY comments. Use this for content assertions ("the probe must/must not
 * reference X"): the thing being asserted about is usually a string literal —
 * a URL, a command, a file path — so stripping strings would hide exactly the
 * regression these tests exist to catch.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let mode: "code" | "line" | "block" | '"' | "'" | "`" = "code";
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && n === "*") { mode = "block"; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { mode = c; }
      out += c; i++; continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += "\n"; } i++; continue; }
    if (mode === "block") { if (c === "*" && n === "/") { mode = "code"; i += 2; } else i++; continue; }
    out += c;
    if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
    if (c === mode) { mode = "code"; }
    i++;
  }
  return out;
}

/**
 * Strip comments AND string literals. Use this only for CODE-SHAPE assertions —
 * counting record() arguments, spotting a hardcoded verdict — where a documented
 * example of the old defect in a header comment must not false-positive.
 */
function stripNonCode(src: string): string {
  let out = "";
  let i = 0;
  let mode: "code" | "line" | "block" | '"' | "'" | "`" = "code";
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && n === "*") { mode = "block"; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { mode = c; out += " "; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += "\n"; } i++; continue; }
    if (mode === "block") { if (c === "*" && n === "/") { mode = "code"; i += 2; } else i++; continue; }
    // inside a string literal
    if (c === "\\") { i += 2; continue; }
    if (c === mode) { mode = "code"; }
    i++;
  }
  return out;
}

/** Count record(...) call sites that pass fewer than three top-level arguments. */
function omittedVerdictSites(src: string): number {
  const code = stripNonCode(src);
  let count = 0;
  const re = /\brecord\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (/function\s+$/.test(code.slice(Math.max(0, m.index - 12), m.index))) continue;
    let i = m.index + m[0].length;
    let depth = 1;
    let args = 1;
    while (i < code.length && depth > 0) {
      const c = code[i];
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) { depth--; if (depth === 0) break; }
      else if (c === "," && depth === 1) args++;
      i++;
    }
    if (args < 3) count++;
  }
  return count;
}

const PROBE_FILES = readdirSync(PROBE_DIR).filter((f) => f.endsWith(".mjs")).sort();

describe("no governed Stage 7 probe has a default-success result recorder", () => {
  it("finds every probe file", () => {
    // If a probe is added and this list is not updated, the per-file cases below
    // still cover it — this only guards against the directory going empty.
    expect(PROBE_FILES.length).toBeGreaterThanOrEqual(6);
  });

  it.each(PROBE_FILES)("%s declares record() with a required verdict", (file) => {
    const src = readFileSync(join(PROBE_DIR, file), "utf-8");
    // The root cause, in its exact shape.
    expect(src).not.toMatch(/function record\([^)]*pass\s*=\s*true/);
    expect(src).not.toMatch(/function record\([^)]*pass\s*=/);
    // And the guard that makes omission impossible rather than merely unusual.
    expect(src).toContain("requires an explicit boolean verdict");
  });

  it.each(PROBE_FILES)("%s supplies an explicit verdict at every call site", (file) => {
    const src = readFileSync(join(PROBE_DIR, file), "utf-8");
    expect(omittedVerdictSites(src)).toBe(0);
  });

  it.each(PROBE_FILES)("%s never hardcodes a literal true as a computed verdict", (file) => {
    const src = readFileSync(join(PROBE_DIR, file), "utf-8");
    // record("x", someComparison, true) — the S7-I12 recovery_time_under_5min shape.
    expect(stripNonCode(src)).not.toMatch(
      /record\(\s*[^,()]+,\s*[^,()]*[<>=!]=?[^,()]*,\s*true\s*\)/,
    );
  });
});


const SUBJECT_SHA = "c".repeat(40);

/**
 * One loopback server standing in for BOTH the deployment (build-info + health)
 * and the deployment dashboard (the control-plane API).
 *
 * It runs OUT OF PROCESS. The probe is driven with spawnSync, which blocks this
 * process's event loop, so an in-process server would never accept the
 * connection and every case would "fail" on the probe's own timeout regardless
 * of what it does. `aliasHost` null means the control plane lists the
 * deployment's real host, which is the correct case.
 */
function startControlPlane(opts: {
  commit: string;
  readyState: string;
  aliasHost: string | null;
}): Promise<{ deploymentUrl: string; apiBase: string; close: () => void }> {
  const script = `
import { createServer } from "node:http";
const opts = JSON.parse(process.env.STUB_OPTS);
const SUBJECT_SHA = ${JSON.stringify(SUBJECT_SHA)};
const server = createServer((req, res) => {
  const host = req.headers.host ?? "";
  const url = new URL(req.url ?? "/", "http://x");
  const json = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/api/internal/build-info")
    return json(200, { commit: SUBJECT_SHA, environment: "production" });
  if (url.pathname === "/api/health")
    return json(200, {
      status: "healthy",
      timestamp: new Date().toISOString(),
      checks: { database: { status: "healthy" } },
    });
  if (url.pathname.startsWith("/v13/deployments/"))
    return json(200, {
      readyState: opts.readyState,
      meta: { githubCommitSha: opts.commit },
      alias: [opts.aliasHost ?? host],
    });
  return json(404, {});
});
server.listen(0, "127.0.0.1", () => console.log("PORT=" + server.address().port));
`;
  // Config travels by env, not argv: with `node -e`, extra arguments land at
  // process.argv[1], so argv[2] is undefined.
  const proc = spawn("node", ["--input-type=module", "-e", script], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, STUB_OPTS: JSON.stringify(opts) },
  });
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error("control-plane stub did not start")), 20000);
    proc.stdout?.on("data", (chunk: Buffer) => {
      const m = /PORT=(\d+)/.exec(chunk.toString());
      if (m) {
        clearTimeout(timer);
        const base = `http://127.0.0.1:${m[1]}`;
        resolvePromise({ deploymentUrl: base, apiBase: base, close: () => proc.kill() });
      }
    });
  });
}

// ─── S7-I1: the deployment dashboard is now a required second authority ─────

describe("S7-I1 — control-plane verification is required, not optional", () => {
  it("fails when no deployment-dashboard credential is supplied", () => {
    const r = runProbe(I1_PROBE, {
      CLOSURE_SUBJECT_SHA: "c".repeat(40),
      PROBE_BASE_URL: "https://example.invalid",
      DEPLOYMENT_ID: "dpl_fixture",
    });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("vercel_control_plane_credential");
    // The old behaviour: a missing token recorded as a passing "NOT_REQUESTED".
    expect(r.out).not.toMatch(/\[PASS\][^\n]*NOT_REQUESTED/);
  });

  it("no longer records NOT_REQUESTED as an observation at all", () => {
    const src = readFileSync(I1_PROBE, "utf-8");
    expect(stripComments(src)).not.toContain("NOT_REQUESTED");
  });

  it("binds the recorded deployment id to the probed host", () => {
    const src = readFileSync(I1_PROBE, "utf-8");
    expect(src).toContain("vercel_deployment_alias_covers_probe_target");
    expect(src).toContain("deployment_id_not_bound_to_probe_target");
  });

  it("still fails closed on a missing authorized subject", () => {
    const r = runProbe(I1_PROBE, {
      PROBE_BASE_URL: "https://example.invalid",
      DEPLOYMENT_ID: "dpl_fixture",
      VERCEL_TOKEN: "sentinel-not-used",
    });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("CLOSURE_SUBJECT_SHA");
  });

  it("never prints the dashboard credential", () => {
    const sentinel = "SENTINEL_VERCEL_TOKEN_do_not_print";
    const r = runProbe(I1_PROBE, {
      CLOSURE_SUBJECT_SHA: "c".repeat(40),
      PROBE_BASE_URL: "https://example.invalid",
      DEPLOYMENT_ID: "dpl_fixture",
      VERCEL_TOKEN: sentinel,
    });
    expect(r.out).not.toContain(sentinel);
  });

  it("is declared as a required capture input", () => {
    const wf = readFileSync(join(REPO_ROOT, ".github/workflows/stage7-capture.yml"), "utf-8");
    const block = wf.slice(wf.indexOf("S7-I1)"), wf.indexOf("S7-I1)") + 1400);
    expect(block).toContain("VERCEL_TOKEN");
  });

  it("never lets a capture redirect the control plane", () => {
    // VERCEL_API_BASE exists so the control-plane branch is testable. A capture
    // must never supply it, or the "second authority" would be whatever the
    // caller pointed at. The probe also records the base it used, so any
    // deviation is visible in the signed observation.
    const wf = readFileSync(join(REPO_ROOT, ".github/workflows/stage7-capture.yml"), "utf-8");
    expect(wf).not.toContain("VERCEL_API_BASE");
    expect(readFileSync(I1_PROBE, "utf-8")).toContain('record("vercel_api_base"');
  });

  it("passes end to end when the dashboard corroborates identity and the alias", async () => {
    const dep = await startControlPlane({
      commit: SUBJECT_SHA,
      readyState: "READY",
      aliasHost: null, // filled in once the deployment stub has a port
    });
    try {
      const r = runProbe(I1_PROBE, {
        CLOSURE_SUBJECT_SHA: SUBJECT_SHA,
        PROBE_BASE_URL: dep.deploymentUrl,
        DEPLOYMENT_ID: "dpl_fixture",
        VERCEL_TOKEN: "stub-token",
        VERCEL_API_BASE: dep.apiBase,
      });
      expect(r.result).toBe("PASS");
      expect(r.exitCode).toBe(0);
      expect(r.out).toMatch(/\[PASS\] sha_matches_closure_subject/);
      expect(r.out).toMatch(/\[PASS\] vercel_sha_matches_closure_subject/);
      expect(r.out).toMatch(/\[PASS\] vercel_deployment_alias_covers_probe_target/);
      expect(r.out).toMatch(/\[PASS\] http_status: 200/);
    } finally {
      dep.close();
    }
  }, 30000);

  it("fails when the dashboard reports a different SHA than the deployment", async () => {
    const dep = await startControlPlane({
      commit: "d".repeat(40),
      readyState: "READY",
      aliasHost: null,
    });
    try {
      const r = runProbe(I1_PROBE, {
        CLOSURE_SUBJECT_SHA: SUBJECT_SHA,
        PROBE_BASE_URL: dep.deploymentUrl,
        DEPLOYMENT_ID: "dpl_fixture",
        VERCEL_TOKEN: "stub-token",
        VERCEL_API_BASE: dep.apiBase,
      });
      expect(r.result).toBe("FAIL");
      expect(r.out).toContain("vercel_sha_mismatch_detail");
    } finally {
      dep.close();
    }
  }, 30000);

  it("fails when the recorded deployment does not serve the probed host", async () => {
    const dep = await startControlPlane({
      commit: SUBJECT_SHA,
      readyState: "READY",
      aliasHost: "some-other-deployment.example.invalid",
    });
    try {
      const r = runProbe(I1_PROBE, {
        CLOSURE_SUBJECT_SHA: SUBJECT_SHA,
        PROBE_BASE_URL: dep.deploymentUrl,
        DEPLOYMENT_ID: "dpl_fixture",
        VERCEL_TOKEN: "stub-token",
        VERCEL_API_BASE: dep.apiBase,
      });
      expect(r.result).toBe("FAIL");
      expect(r.out).toContain("deployment_id_not_bound_to_probe_target");
    } finally {
      dep.close();
    }
  }, 30000);

  it("fails when the dashboard reports the deployment is not ready", async () => {
    const dep = await startControlPlane({
      commit: SUBJECT_SHA,
      readyState: "ERROR",
      aliasHost: null,
    });
    try {
      const r = runProbe(I1_PROBE, {
        CLOSURE_SUBJECT_SHA: SUBJECT_SHA,
        PROBE_BASE_URL: dep.deploymentUrl,
        DEPLOYMENT_ID: "dpl_fixture",
        VERCEL_TOKEN: "stub-token",
        VERCEL_API_BASE: dep.apiBase,
      });
      expect(r.result).toBe("FAIL");
      expect(r.out).toContain("deployment_not_ready");
    } finally {
      dep.close();
    }
  }, 30000);
});

// ─── S7-I2: every unusable observation is a FAIL ────────────────────────────

/**
 * S7-I2 shells out to `npx prisma migrate status`. These cases drive it with a
 * stub `npx` on PATH so migration outcomes are exact and no database is opened.
 */
function withStubNpx(stdout: string, exitCode: number): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "s7-i2-npx-"));
  const script = `#!/usr/bin/env bash\ncat <<'MIGOUT'\n${stdout}\nMIGOUT\nexit ${exitCode}\n`;
  writeFileSync(join(dir, "npx"), script, { mode: 0o755 });
  return { dir, path: `${dir}:${process.env.PATH ?? ""}` };
}

describe("S7-I2 — migration integrity fails closed", () => {
  it("refuses when no database credential is supplied", () => {
    const r = runProbe(I2_PROBE, {});
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("database_credentials");
    expect(r.out).toContain("REFUSED");
  });

  it("passes on a clean, up-to-date migration status", () => {
    const stub = withStubNpx("Database schema is up to date!", 0);
    try {
      const r = runProbe(I2_PROBE, {
        PATH: stub.path,
        DATABASE_DIRECT_URL: "postgresql://stub/db",
      });
      expect(r.result).toBe("PASS");
      expect(r.out).toContain("zero_pending_migrations");
    } finally {
      rmSync(stub.dir, { recursive: true, force: true });
    }
  });

  it("fails when the prisma command itself fails", () => {
    const stub = withStubNpx("Error: P1001 Can't reach database server", 1);
    try {
      const r = runProbe(I2_PROBE, {
        PATH: stub.path,
        DATABASE_DIRECT_URL: "postgresql://stub/db",
      });
      expect(r.result).toBe("FAIL");
      expect(r.out).toContain("migrate_status_exit_code");
    } finally {
      rmSync(stub.dir, { recursive: true, force: true });
    }
  });

  it("fails on a pending migration", () => {
    const stub = withStubNpx(
      "Following migration have not yet been applied:\n20260101000000_add_thing",
      1,
    );
    try {
      const r = runProbe(I2_PROBE, {
        PATH: stub.path,
        DATABASE_DIRECT_URL: "postgresql://stub/db",
      });
      expect(r.result).toBe("FAIL");
      expect(r.out).toContain("pending_migrations_detected");
    } finally {
      rmSync(stub.dir, { recursive: true, force: true });
    }
  });

  it("fails on drift instead of recording a passing warning", () => {
    const stub = withStubNpx(
      "Database schema is up to date!\nDrift detected: your database schema is not in sync",
      0,
    );
    try {
      const r = runProbe(I2_PROBE, {
        PATH: stub.path,
        DATABASE_DIRECT_URL: "postgresql://stub/db",
      });
      expect(r.result).toBe("FAIL");
      expect(r.out).toContain("schema_drift_detected");
      // The pre-repair shape: drift filed as a passing observation.
      expect(r.out).not.toMatch(/\[PASS\][^\n]*schema_drift/);
    } finally {
      rmSync(stub.dir, { recursive: true, force: true });
    }
  });

  it("fails when the status output is unparseable", () => {
    const stub = withStubNpx("something entirely unexpected", 0);
    try {
      const r = runProbe(I2_PROBE, {
        PATH: stub.path,
        DATABASE_DIRECT_URL: "postgresql://stub/db",
      });
      expect(r.result).toBe("FAIL");
      expect(r.out).toContain("migration_status_indeterminate");
    } finally {
      rmSync(stub.dir, { recursive: true, force: true });
    }
  });

  it("fails when the status output is empty", () => {
    const stub = withStubNpx("", 0);
    try {
      const r = runProbe(I2_PROBE, {
        PATH: stub.path,
        DATABASE_DIRECT_URL: "postgresql://stub/db",
      });
      expect(r.result).toBe("FAIL");
      expect(r.out).toContain("migrate_status_output_empty");
    } finally {
      rmSync(stub.dir, { recursive: true, force: true });
    }
  });

  it("flags a pooled connection rather than accepting it silently", () => {
    const stub = withStubNpx("Database schema is up to date!", 0);
    try {
      const r = runProbe(I2_PROBE, {
        PATH: stub.path,
        DATABASE_URL: "postgresql://stub-pooler/db",
      });
      expect(r.out).toContain("db_url_is_direct_endpoint");
      expect(r.result).toBe("FAIL");
    } finally {
      rmSync(stub.dir, { recursive: true, force: true });
    }
  });

  it("contains no migration-application path", () => {
    const code = stripComments(readFileSync(I2_PROBE, "utf-8"));
    // Read-only: status introspection only, never deploy/reset/push. Asserted on
    // comment-stripped source rather than string-stripped: the command itself is
    // a string literal, so stripping strings would hide a real regression.
    expect(code).toContain("migrate status");
    expect(code).not.toMatch(/migrate\s+(deploy|reset|dev)/);
    expect(code).not.toContain("db push");
  });
});

// ─── S7-I12: a real staged recovery, or nothing ─────────────────────────────

describe("S7-I12 — staged failure and documented recovery actually happen", () => {
  it("passes only by driving the full state machine", () => {
    const r = runProbe(I12_PROBE, {});
    expect(r.result).toBe("PASS");
    expect(r.out).toContain("HEALTHY → FAILED → DIAGNOSED → RECOVERY_ACTION_EXECUTED → HEALTHY");
    expect(r.out).toContain("state_1_initial_health");
    expect(r.out).toContain("state_2_failure_induced");
    expect(r.out).toContain("state_2_failure_detected_via_health_endpoint");
    expect(r.out).toContain("state_3_symptom_matches_documented_trigger");
    expect(r.out).toContain("state_5_health_restored");
  });

  it("records a real measured recovery time, not a fabricated one", () => {
    const r = runProbe(I12_PROBE, {});
    const m = /\[PASS\] recovery_time_ms: (\d+)/.exec(r.out);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
    // The invented threshold is gone; the reported objective comes from the runbook.
    expect(r.out).not.toContain("recovery_time_under_5min");
    expect(r.out).toContain("runbook_rto_target_ms");
  });

  it("records decisions and deviations", () => {
    const r = runProbe(I12_PROBE, {});
    expect(r.out).toMatch(/\[PASS\] decisions_recorded: [1-9]/);
    expect(r.out).toContain("[PASS] deviations_recorded: true");
    expect(r.out).toContain("deviations: [");
  });

  it("binds every executed step to a heading parsed from the runbook", () => {
    const r = runProbe(I12_PROBE, {});
    expect(r.out).toContain("[PASS] undocumented_executed_step_count: 0");
    expect(r.out).toContain("[PASS] missing_required_step_count: 0");
    const runbook = readFileSync(join(REPO_ROOT, "docs/ROLLBACK_RUNBOOK.md"), "utf-8");
    // The steps it claims to have executed really are in the shipped document.
    for (const step of [
      "Step 1: Identify Previous Known-Good Commit",
      "Step 2: Revert Deployment",
      "Step 3: Redeploy Application",
      "Step 4: Verify Deployment",
    ]) {
      expect(runbook).toContain(step);
      expect(r.out).toContain(step);
    }
  });

  it("stages a failure that the runbook names as an immediate-rollback trigger", () => {
    const r = runProbe(I12_PROBE, {});
    const runbook = readFileSync(join(REPO_ROOT, "docs/ROLLBACK_RUNBOOK.md"), "utf-8");
    expect(runbook).toContain("Database connection fails");
    expect(r.out).toContain("matched_documented_trigger: Database connection fails");
  });

  it("fails when the runbook is unavailable", () => {
    const r = runProbe(I12_PROBE, { S7_I12_RUNBOOK_PATH: "/nonexistent/ROLLBACK.md" });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("runbook_unavailable");
  });

  it("fails when the runbook exposes no ordered procedure to follow", () => {
    const dir = mkdtempSync(join(tmpdir(), "s7-i12-rb-"));
    try {
      const p = join(dir, "ROLLBACK_RUNBOOK.md");
      writeFileSync(p, "# Rollback\n\nSome prose but no documented procedure.\n");
      const r = runProbe(I12_PROBE, { S7_I12_RUNBOOK_PATH: p });
      expect(r.result).toBe("FAIL");
      expect(r.out).toContain("runbook_procedure_unparseable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["no_failure_induced", "failure_not_induced"],
    ["no_detection", "failure_not_detected"],
    ["skip_recovery", "health_not_restored"],
    ["health_not_restored", "health_not_restored"],
    ["undocumented_step", "undocumented_recovery_step"],
    ["zero_timer", "recovery_time_not_measured"],
    ["no_decisions", "decisions_absent"],
    ["no_deviations", "deviations_absent"],
  ])("fault %s fails with %s", (fault, label) => {
    const r = runProbe(I12_PROBE, { S7_I12_FAULT: fault });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain(label);
  });

  it("cannot be made to pass by any fault value, and marks a faulted run", () => {
    for (const fault of [
      "no_failure_induced", "no_detection", "skip_recovery", "health_not_restored",
      "undocumented_step", "zero_timer", "no_decisions", "no_deviations", "anything-else",
    ]) {
      const r = runProbe(I12_PROBE, { S7_I12_FAULT: fault });
      expect(r.result, `fault ${fault} must not pass`).toBe("FAIL");
      expect(r.out).toContain("fault_injection_active");
    }
  });

  it("no longer proves recovery by reading source files", () => {
    const code = stripComments(readFileSync(I12_PROBE, "utf-8"));
    // The old implementation's mechanism: regexing app source for recovery code.
    // These paths were string literals, so comments-only stripping is required.
    expect(code).not.toContain("src/app/api/health/route.ts");
    expect(code).not.toContain("operator-error-governance.ts");
    expect(code).not.toContain("startup-state.ts");
    expect(code).not.toContain("health_route_has_db_failure_detection");
    // It must actually stand up a service and drive it.
    expect(code).toContain("createServer");
    expect(code).toContain("/api/health");
  });

  it("touches no production infrastructure", () => {
    const r = runProbe(I12_PROBE, {});
    expect(r.out).toContain("environment: isolated_simulation");
    expect(r.out).toContain("production_failure_induced: NO");
    expect(r.out).toContain("production_db_mutations: 0");
    const code = stripComments(readFileSync(I12_PROBE, "utf-8"));
    expect(code).not.toContain("o-ps-iq.vercel.app");
    expect(code).not.toContain("DATABASE_URL");
  });
});
