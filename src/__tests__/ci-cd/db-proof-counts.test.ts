/**
 * Fail-closed count gate for the standalone real-database proofs db-verify runs (GSC ingestion-role proof, PgBouncer transaction-pooling
 * proof), plus the PgBouncer harness's backend-authentication entry. Non-DB lane: pure functions, no database or pgbouncer needed.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// @ts-expect-error -- plain ESM script without type declarations
import { DB_PROOFS, evaluateDbProof } from "../../../scripts/ci/check-db-proof-counts.mjs";
import { buildDatabaseEntry, quotePgbouncerValue } from "@/__tests__/test-helpers/pgbouncer-harness";

const ROOT = resolve(__dirname, "../../..");
const GSC = "src/__tests__/scripts/gsc-ingestion-role.db.test.ts";
const PGB = "src/__tests__/lib/pgbouncer-transaction-safety-hostile.db.test.ts";
const report = (file: string, statuses: string[], extra: object = {}) => ({
  testResults: [{ name: `/repo/${file}`, status: "passed", assertionResults: statuses.map((status, i) => ({ title: `t${i}`, status })), ...extra }],
});
const n = (count: number, status = "passed") => Array.from({ length: count }, () => status);

describe("DB proof table", () => {
  it("pins the exact files and counts the workflow steps rely on", () => {
    expect(DB_PROOFS).toEqual({
      "gsc-role": { file: GSC, expectedTests: 16 },
      pgbouncer: { file: PGB, expectedTests: 8 },
    });
  });
});

describe("evaluateDbProof (fail-closed)", () => {
  it("passes only when exactly the expected number of tests ran and all passed", () => {
    expect(evaluateDbProof("gsc-role", report(GSC, n(16)))).toEqual({ problems: [], total: 16, passed: 16 });
    expect(evaluateDbProof("pgbouncer", report(PGB, n(8)))).toEqual({ problems: [], total: 8, passed: 8 });
  });

  it("fails when every test is skipped (the original silent-skip defect)", () => {
    expect(evaluateDbProof("gsc-role", report(GSC, n(16, "skipped"))).problems.join()).toMatch(/0 passed, expected 16/);
    expect(evaluateDbProof("pgbouncer", report(PGB, n(8, "skipped"))).problems.join()).toMatch(/not passed \(skipped\)/);
  });

  it("fails on a single skipped, pending, todo or failed test even when the count matches", () => {
    for (const status of ["skipped", "pending", "todo", "failed"]) {
      const r = evaluateDbProof("gsc-role", report(GSC, [...n(15), status]));
      expect(r.problems.length, status).toBeGreaterThan(0);
      expect(r.problems.join(), status).toMatch(new RegExp(`not passed \\(${status}\\)`));
    }
  });

  it("fails on too few or too many tests (deleted or added test without updating the gate)", () => {
    expect(evaluateDbProof("gsc-role", report(GSC, n(15))).problems.join()).toMatch(/ran 15 tests, expected exactly 16/);
    expect(evaluateDbProof("gsc-role", report(GSC, n(17))).problems.join()).toMatch(/ran 17 tests, expected exactly 16/);
    expect(evaluateDbProof("pgbouncer", report(PGB, n(7))).problems.join()).toMatch(/ran 7 tests, expected exactly 8/);
    expect(evaluateDbProof("pgbouncer", report(PGB, n(9))).problems.join()).toMatch(/ran 9 tests, expected exactly 8/);
  });

  it("fails when the proof file was not collected, was collected twice, or the suite failed to import", () => {
    expect(evaluateDbProof("gsc-role", report(PGB, n(16))).problems.join()).toMatch(/exactly one result entry in the report, found 0/);
    const dup = { testResults: [...report(GSC, n(16)).testResults, ...report(GSC, n(16)).testResults] };
    expect(evaluateDbProof("gsc-role", dup).problems.join()).toMatch(/found 2/);
    expect(evaluateDbProof("gsc-role", report(GSC, [], { status: "failed", message: "boom" })).problems.join()).toMatch(/suite failed to run \(boom\)/);
  });

  it("fails on a malformed report and on an unknown proof id", () => {
    expect(evaluateDbProof("gsc-role", null).problems.join()).toMatch(/missing or malformed/);
    expect(evaluateDbProof("gsc-role", {}).problems.join()).toMatch(/missing or malformed/);
    expect(evaluateDbProof("nope", report(GSC, n(16))).problems.join()).toMatch(/unknown proof id/);
    expect(evaluateDbProof("__proto__", report(GSC, n(16))).problems.join()).toMatch(/unknown proof id/);
  });
});

describe("check-db-proof-counts CLI exit codes", () => {
  const run = (args: string[]) => spawnSync(process.execPath, [join(ROOT, "scripts/ci/check-db-proof-counts.mjs"), ...args], { cwd: ROOT, encoding: "utf8" });
  it("exits 0 on a full pass, 1 on a skip, 1 on an unreadable report, 2 on bad usage", () => {
    const dir = mkdtempSync(join(tmpdir(), "dbproof-"));
    try {
      const ok = join(dir, "ok.json");
      const skipped = join(dir, "skipped.json");
      writeFileSync(ok, JSON.stringify(report(GSC, n(16))));
      writeFileSync(skipped, JSON.stringify(report(GSC, n(16, "skipped"))));
      expect(run(["gsc-role", ok]).status).toBe(0);
      expect(run(["gsc-role", skipped]).status).toBe(1);
      expect(run(["gsc-role", join(dir, "missing.json")]).status).toBe(1);
      expect(run(["gsc-role"]).status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("pgbouncer harness backend authentication entry", () => {
  const base = { databaseName: "opsiq_test", host: "localhost", port: "5432", user: "postgres" };
  it("emits the backend password (quoted) when one is known, so pgbouncer can log in to a password-authenticated Postgres", () => {
    expect(buildDatabaseEntry({ ...base, password: "postgres" })).toBe("opsiq_test = host=localhost port=5432 dbname=opsiq_test user=postgres password='postgres'");
  });
  it("keeps the previous passwordless entry for a local trust/peer setup", () => {
    expect(buildDatabaseEntry({ ...base, password: "" })).toBe("opsiq_test = host=localhost port=5432 dbname=opsiq_test user=postgres");
  });
  it("doubles embedded single quotes so a password cannot break out of the connection string", () => {
    expect(quotePgbouncerValue("a'b c")).toBe("'a''b c'");
  });
});
