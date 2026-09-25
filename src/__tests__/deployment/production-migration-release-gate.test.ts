/**
 * Release-migration gate — regression coverage for the 58f1d87e incident:
 * Vercel promoted application code whose Prisma migration had not been applied
 * to production (the approved migration workflow ran afterwards).
 *
 * Fixtures only: migration directories in a temp dir, injected migration-history
 * rows, fake `.invalid` hosts. Nothing here connects to any database.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
// @ts-expect-error -- plain ESM script without type declarations
import { evaluateMigrationGate, runGate } from "../../../scripts/release/production-migration-gate.mjs";
// @ts-expect-error -- plain ESM script without type declarations
import { classifyMigrateStatus } from "../../../scripts/classify-migrate-status.mjs";

const ROOT = resolve(__dirname, "../../..");
const INCIDENT = "20260925120000_add_verification_baseline_provenance";
const PRIOR = "20260924100000_add_beta_request_acquisition_attribution";
const SQL: Record<string, string> = {
  [PRIOR]: 'ALTER TABLE "beta_requests" ADD COLUMN "source" TEXT;\n',
  [INCIDENT]: 'ALTER TABLE "owner_sales_verifications" ADD COLUMN "baseline_source" TEXT;\n',
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function fixtureRepo(names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "release-gate-"));
  for (const n of names) {
    mkdirSync(join(dir, "prisma", "migrations", n), { recursive: true });
    writeFileSync(join(dir, "prisma", "migrations", n, "migration.sql"), SQL[n]);
  }
  writeFileSync(join(dir, "prisma", "migrations", "migration_lock.toml"), 'provider = "postgresql"\n');
  return dir;
}
const applied = (n: string, checksum = sha(SQL[n])) => ({
  migration_name: n,
  checksum,
  finished_at: new Date("2026-09-25T15:01:09Z"),
  rolled_back_at: null,
});
const PROD_ENV = { VERCEL_ENV: "production", DATABASE_URL: "postgresql://app:s3cret@prod-db.example.invalid/neondb" };

describe("production migration release gate (runs in `npm run build` on Vercel production)", () => {
  it("Case A — the incident: committed migration pending in production → build refused with an actionable message", async () => {
    const cwd = fixtureRepo([PRIOR, INCIDENT]);
    const out = await runGate({ env: PROD_ENV, cwd, readRows: async () => [applied(PRIOR)] });
    expect(out.exitCode).toBe(1);
    expect(out.result.verdict).toBe("PRODUCTION_MIGRATION_REQUIRED");
    expect(out.result.pending).toEqual([INCIDENT]);
    expect(out.output).toContain("PRODUCTION MIGRATION REQUIRED");
    expect(out.output).toContain(INCIDENT);
    expect(out.output).toContain("Migrate Production Database");
    expect(out.output).toContain("docs/deployment/PRODUCTION_RELEASE_PROCEDURE.md");
    expect(out.output).not.toMatch(/prod-db|s3cret|app:/);
  });

  it("Case B — migration applied → gate passes", async () => {
    const cwd = fixtureRepo([PRIOR, INCIDENT]);
    const out = await runGate({ env: PROD_ENV, cwd, readRows: async () => [applied(PRIOR), applied(INCIDENT)] });
    expect(out.exitCode).toBe(0);
    expect(out.output).toContain("PASS: MIGRATIONS_CURRENT");
  });

  it("Case C — release with no new migration: production build passes; preview/CI/local builds are not gated at all", async () => {
    const cwd = fixtureRepo([PRIOR]);
    const prod = await runGate({ env: PROD_ENV, cwd, readRows: async () => [applied(PRIOR)] });
    expect(prod.exitCode).toBe(0);
    for (const env of [{}, { VERCEL_ENV: "preview", DATABASE_URL: PROD_ENV.DATABASE_URL }, { CI: "true" }]) {
      const readRows = async () => {
        throw new Error("must not read the database outside a production build");
      };
      const out = await runGate({ env, cwd, readRows });
      expect(out.exitCode).toBe(0);
      expect(out.output).toContain("SKIPPED");
    }
  });

  it("on Vercel without VERCEL_ENV (system env vars not exposed) → fail closed, never a silent skip", async () => {
    const cwd = fixtureRepo([PRIOR]);
    const out = await runGate({ env: { VERCEL: "1", DATABASE_URL: PROD_ENV.DATABASE_URL }, cwd, readRows: async () => [] });
    expect(out.exitCode).toBe(1);
    expect(out.output).toContain("fail closed");
  });

  it("Case E — several migrations pending unexpectedly → fail closed (gate) and the approved workflow refuses (exactly-one-pending)", () => {
    const r = evaluateMigrationGate({
      committed: [PRIOR, INCIDENT].map((name) => ({ name, checksum: sha(SQL[name]) })),
      rows: [],
    });
    expect(r.ok).toBe(false);
    expect(r.pending).toEqual([PRIOR, INCIDENT]);
    const status = classifyMigrateStatus({
      exitCode: 1,
      output: `Following migrations have not yet been applied:\n${PRIOR}\n${INCIDENT}\n`,
      expectedMigrationName: INCIDENT,
    });
    expect(status.ok).toBe(false);
    expect(status.classification).toBe("MULTIPLE_PENDING");
  });

  it("Case F — failed / in-progress / rolled-back migration row → fail closed, even when nothing is pending", () => {
    const committed = [{ name: PRIOR, checksum: sha(SQL[PRIOR]) }];
    for (const bad of [
      { ...applied(PRIOR), finished_at: null },
      { ...applied(PRIOR), rolled_back_at: new Date() },
    ]) {
      const r = evaluateMigrationGate({ committed, rows: [applied(PRIOR), bad] });
      expect(r.ok).toBe(false);
      expect(r.verdict).toBe("FAILED_MIGRATION_PRESENT");
    }
  });

  it("an applied migration whose committed file changed afterwards → refused (migrations are immutable)", () => {
    const r = evaluateMigrationGate({
      committed: [{ name: PRIOR, checksum: sha(SQL[PRIOR] + "-- edited\n") }],
      rows: [applied(PRIOR)],
    });
    expect(r.ok).toBe(false);
    expect(r.verdict).toBe("APPLIED_MIGRATION_MODIFIED");
  });

  it("redeploying OLDER code after the schema advanced (rollback shape) is not blocked, only reported", () => {
    const r = evaluateMigrationGate({
      committed: [{ name: PRIOR, checksum: sha(SQL[PRIOR]) }],
      rows: [applied(PRIOR), applied(INCIDENT)],
    });
    expect(r.ok).toBe(true);
    expect(r.dbAhead).toEqual([INCIDENT]);
  });

  it("fails closed without leaking connection details: missing DATABASE_URL, unreadable migrations dir, unreachable DB", async () => {
    const cwd = fixtureRepo([PRIOR]);
    const noUrl = await runGate({ env: { VERCEL_ENV: "production" }, cwd, readRows: async () => [] });
    expect(noUrl.exitCode).toBe(1);
    const noDir = await runGate({ env: PROD_ENV, cwd: mkdtempSync(join(tmpdir(), "empty-")), readRows: async () => [] });
    expect(noDir.exitCode).toBe(1);
    // The real reader: an unresolvable `.invalid` host (RFC 2606) — no real database is contacted.
    const down = await runGate({ env: PROD_ENV, cwd });
    expect(down.exitCode).toBe(1);
    expect(down.output).toContain("could not read production migration history");
    expect(down.output).not.toMatch(/prod-db|s3cret|example\.invalid/);
  }, 60_000);

  it("the gate only reads: one SELECT inside a READ ONLY transaction, no DDL/DML, no migrate command", () => {
    const src = readFileSync(join(ROOT, "scripts/release/production-migration-gate.mjs"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).toContain('client.query("BEGIN READ ONLY")');
    expect(code).toMatch(/SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"/);
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/);
    expect(code).not.toMatch(/migrate (deploy|resolve|reset)|execSync|spawn/);
  });

  it("the production build runs the gate BEFORE next build, so a refused gate means no deployable build", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.build).toBe("node scripts/release/production-migration-gate.mjs && next build");
  });
});

describe("approved production migration workflow (migrate-production.yml)", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/migrate-production.yml"), "utf8");

  it("Case D — wrong expected database host: the validator refuses (exit 1) and names both hosts", () => {
    let status = 0;
    let output = "";
    try {
      execFileSync("node", [join(ROOT, "scripts/validate-expected-db-host.mjs")], {
        env: {
          PATH: process.env.PATH,
          DATABASE_URL: "postgresql://u:p@ep-wrong-branch.example.invalid/neondb",
          EXPECTED_DATABASE_HOST: "ep-right-branch.example.invalid",
        },
        stdio: "pipe",
        encoding: "utf8",
      });
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      status = err.status;
      output = err.stdout + err.stderr;
    }
    expect(status).toBe(1);
    expect(output).toContain("MATCH=NO");
    expect(output).toContain("Aborting before any migration deploy");
  });

  it("Case D — the host check runs before the pending check and before `prisma migrate deploy`", () => {
    const host = wf.indexOf("name: Verify exact production database host matches owner-pinned expectation");
    const pending = wf.indexOf("name: Check pending migrations (pre-deploy)");
    const deploy = wf.indexOf("name: Deploy migrations");
    expect(host).toBeGreaterThan(-1);
    expect(host).toBeLessThan(pending);
    expect(pending).toBeLessThan(deploy);
  });

  it("redeploys main only after a successful, post-verified MAIN-mode migration, and never echoes the hook URL", () => {
    const step = wf.slice(wf.indexOf("name: Trigger production redeploy of main"), wf.indexOf("name: Migration summary"));
    expect(wf.indexOf("name: Verify migration status (post-deploy)")).toBeLessThan(wf.indexOf("name: Trigger production redeploy of main"));
    expect(step).toContain("if: success() && inputs.mode == 'MAIN' && env.POST_VERIFY_SUCCEEDED == 'true'");
    expect(step).toContain("secrets.VERCEL_PRODUCTION_DEPLOY_HOOK_URL");
    expect(step).not.toMatch(/echo[^\n]*\$DEPLOY_HOOK_URL/);
    expect(step).not.toMatch(/set -x/);
  });
});
