/**
 * Governance: CI/test workflows cannot reach the PRODUCTION database through a remote TEST database secret.
 *
 * The code guard (src/infra/test-database-guard.ts + production-db-identity.ts) protects the vitest harness. Workflows
 * that run Prisma mutations (`migrate deploy`, `db push --force-reset`) or tests against a SECRET-supplied database do
 * not pass through the harness, so each must run the identity preflight (scripts/assert-non-production-database.ts)
 * BEFORE its first database-touching step. These source-contract tests fail if a workflow drops the preflight,
 * moves it after a database step, or a new secret-database mutating workflow appears without a deliberate decision.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");
const PREFLIGHT = "assert-non-production-database";

interface Step {
  name?: string;
  id?: string;
  run?: string;
  env?: Record<string, unknown>;
}
interface Job {
  name?: string;
  env?: Record<string, unknown>;
  steps?: Step[];
}

const files = readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));
const text = (f: string) => readFileSync(join(WORKFLOWS_DIR, f), "utf8");
const jobsOf = (f: string): Record<string, Job> => ((yaml.load(text(f)) as { jobs?: Record<string, Job> })?.jobs ?? {}) as Record<string, Job>;

/** A step that touches a database: Prisma status/deploy/push/execute/seed, a DB test run, or the migration replay script. */
const DB_STEP = /prisma\s+(migrate\s+(deploy|status|reset|resolve)|db\s+(push|execute|seed))|--force-reset|\bnpm\s+(run\s+)?test|\bvitest\b|test-migration-replay/;
const DB_SECRET = /secrets\.[A-Z0-9_]*(DATABASE|NEON|POSTGRES)[A-Z0-9_]*/;

function firstDbStepIndex(steps: Step[]): number {
  return steps.findIndex((s) => typeof s.run === "string" && DB_STEP.test(s.run));
}
function preflightIndex(steps: Step[]): number {
  return steps.findIndex((s) => typeof s.run === "string" && s.run.includes(PREFLIGHT));
}

describe("the remote-test opt-in is always paired with the identity preflight", () => {
  const optInJobs: Array<[string, string, Job]> = [];
  for (const f of files) {
    for (const [jobId, job] of Object.entries(jobsOf(f))) {
      if (JSON.stringify(job).includes("OPSIQ_ALLOW_REMOTE_TEST_DB")) optInJobs.push([f, jobId, job]);
    }
  }

  it("finds the known opt-in workflows (the audit's inventory)", () => {
    expect(optInJobs.map(([f]) => f).sort()).toEqual(["db-verification.yml", "manual-runtime-validation.yml", "phase-1-db-tests.yml"]);
  });

  it.each(optInJobs.map(([f, j, job]) => [`${f}#${j}`, job] as const))("%s runs the preflight before its first database step", (_label, job) => {
    const steps = job.steps ?? [];
    const pre = preflightIndex(steps);
    const db = firstDbStepIndex(steps);
    expect(pre, "identity preflight step present").toBeGreaterThan(-1);
    expect(db, "job has a database step").toBeGreaterThan(-1);
    expect(pre).toBeLessThan(db);
  });

  it("no opt-in workflow also sets a production authorization flag", () => {
    for (const [f] of optInJobs) {
      expect(text(f), f).not.toMatch(/OPSIQ_DB_TARGET|OPSIQ_ALLOW_PRODUCTION_DB_COMMAND|OPSIQ_PRODUCTION_OPERATION/);
    }
  });
});

describe("each secret-database workflow preflights exactly the variables its database steps receive", () => {
  const expectations: Array<[string, string, string[]]> = [
    // LANE_A: migrate status gets MIGRATION_DATABASE_URL; the DB tests get TEST_DATABASE_URL as DATABASE_URL + TEST_DATABASE_URL.
    ["db-verification.yml", "lane-a-neon-verify", ["DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL"]],
    // `prisma db push --force-reset --accept-data-loss` against DATABASE_URL_TEST.
    ["phase-1-db-tests.yml", "db-tests", ["DATABASE_URL", "DATABASE_URL_TEST"]],
    // `prisma migrate deploy` against the generically named DATABASE_URL secret.
    ["manual-runtime-validation.yml", "runtime-validation", ["DATABASE_URL"]],
    // The "confirm_test_db_only" input is a human attestation; the preflight makes it code-enforced.
    ["migrate-neon-test.yml", "migrate-neon-test", ["MIGRATION_DATABASE_URL"]],
  ];

  it.each(expectations)("%s#%s", (file, jobId, vars) => {
    const steps = jobsOf(file)[jobId]?.steps ?? [];
    const idx = preflightIndex(steps);
    expect(idx).toBeGreaterThan(-1);
    const run = steps[idx].run as string;
    for (const v of vars) expect(run, v).toContain(v);
    // Before the first DB-touching step, and — for the destructive/mutating ones — before every Prisma mutation.
    const firstDb = firstDbStepIndex(steps);
    expect(idx).toBeLessThan(firstDb);
  });

  it("LANE_A preflight receives the same secrets the test suite and migrate status receive (no variable substitution)", () => {
    const steps = jobsOf("db-verification.yml")["lane-a-neon-verify"].steps ?? [];
    const env = (steps[preflightIndex(steps)].env ?? {}) as Record<string, string>;
    expect(env.DATABASE_URL).toContain("secrets.TEST_DATABASE_URL");
    expect(env.TEST_DATABASE_URL).toContain("secrets.TEST_DATABASE_URL");
    expect(env.MIGRATION_DATABASE_URL).toContain("secrets.MIGRATION_DATABASE_URL");
    const tests = steps.find((s) => (s.run ?? "").includes("'.db.test.ts'"));
    const testEnv = (tests?.env ?? {}) as Record<string, string>;
    expect(testEnv.DATABASE_URL).toBe(env.DATABASE_URL);
    expect(testEnv.TEST_DATABASE_URL).toBe(env.TEST_DATABASE_URL);
  });
});

describe("a NEW secret-database workflow that mutates cannot appear without a deliberate decision", () => {
  /** Separately governed: production/staging by design (environment protection, explicit target + confirmation, or an exact-host gate). */
  const GOVERNED = new Set([
    "migrate-production.yml",
    "production-db-status.yml",
    "provision-administration-operator.yml",
    "scheduled-backup.yml",
    "migrate-staging.yml",
    "reset-staging-db.yml",
    "seed-staging.yml",
    "resolve-failed-migration.yml",
    "stage7-capture.yml",
    ...files.filter((f) => /^module-\d+-.*-migrate\.yml$/.test(f)),
  ]);

  it("every other workflow that mutates a secret-supplied database runs the identity preflight", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (GOVERNED.has(f)) continue;
      for (const [jobId, job] of Object.entries(jobsOf(f))) {
        const steps = job.steps ?? [];
        const mutates = steps.some((s) => typeof s.run === "string" && /prisma\s+(migrate\s+(deploy|reset)|db\s+(push|execute|seed))|--force-reset/.test(s.run));
        const usesSecretDb = DB_SECRET.test(JSON.stringify(job));
        if (mutates && usesSecretDb && preflightIndex(steps) === -1) offenders.push(`${f}#${jobId}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the governed allowlist only names workflows that exist", () => {
    for (const f of GOVERNED) expect(files, f).toContain(f);
  });
});

describe("13/15. the default CI database target is a throwaway local Postgres", () => {
  it("ci.yml db-verify uses a literal loopback URL, no database secret and no remote opt-in", () => {
    const job = jobsOf("ci.yml")["db-verify"];
    const dump = JSON.stringify(job);
    expect(dump).not.toMatch(DB_SECRET);
    expect(dump).not.toContain("OPSIQ_ALLOW_REMOTE_TEST_DB");
    const env = (job.env ?? {}) as Record<string, string>;
    for (const v of ["DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL"]) expect(env[v], v).toMatch(/^postgresql:\/\/[^@]+@localhost:\d+\//);
  });

  it("db-verification.yml LANE_B uses a local service container, no database secret and no remote opt-in", () => {
    const job = jobsOf("db-verification.yml")["lane-b-db-verify"];
    const dump = JSON.stringify(job);
    expect(dump).not.toMatch(DB_SECRET);
    expect(dump).not.toContain("OPSIQ_ALLOW_REMOTE_TEST_DB");
    expect(dump).toContain("postgres:16");
    expect(dump).toMatch(/localhost:5432/);
  });

  it("LANE_A performs status-only migration inspection — never `migrate deploy`/reset/push", () => {
    const steps = jobsOf("db-verification.yml")["lane-a-neon-verify"].steps ?? [];
    const runs = steps.map((s) => s.run ?? "").join("\n");
    expect(runs).toContain("prisma migrate status");
    expect(runs).not.toMatch(/prisma\s+(migrate\s+(deploy|reset)|db\s+(push|execute))/);
  });

  it("the production migration workflow stays separately governed (its own exact-host gate)", () => {
    const t = text("migrate-production.yml");
    expect(t).toMatch(/expected_database_host/);
    expect(t).toContain("PRODUCTION_DATABASE_URL");
  });
});

describe("16. Stage 7 capture opens a database only for the invariants whose contract requires one", () => {
  const t = text("stage7-capture.yml");

  it("never sets the DB-test mode or the remote-test opt-in", () => {
    expect(t).not.toMatch(/TEST_WITH_DB|OPSIQ_ALLOW_REMOTE_TEST_DB/);
  });

  it("the production database URL reaches the observation command only for LANE_C", () => {
    const observe = (jobsOf("stage7-capture.yml").capture.steps ?? []).find((s) => s.id === "observe");
    const env = (observe?.env ?? {}) as Record<string, string>;
    for (const v of ["DATABASE_URL", "DATABASE_DIRECT_URL"]) {
      expect(env[v], v).toContain("steps.contract.outputs.lane == 'LANE_C'");
      expect(env[v], v).toContain("secrets.PRODUCTION_DATABASE_URL");
      expect(env[v], v).toMatch(/\|\|\s*''/);
    }
  });

  it("every probe script that reads a database URL is used only by a LANE_C contract entry", () => {
    const probes = readdirSync(join(process.cwd(), "scripts", "stage7-probes")).filter((f) => f.endsWith(".mjs"));
    const dbProbes = probes.filter((p) => /DATABASE_URL|DATABASE_DIRECT_URL/.test(readFileSync(join(process.cwd(), "scripts", "stage7-probes", p), "utf8")));
    expect(dbProbes.length).toBeGreaterThan(0);
    // Split the contract `case` into per-invariant blocks and read each block's lane + command.
    const blocks = t.split(/\n\s{12}(?=S7-[A-Z0-9_-]+\))/).slice(1);
    const laneByProbe = new Map<string, Set<string>>();
    for (const block of blocks) {
      const lane = /lane=(LANE_[A-F])/.exec(block)?.[1];
      const cmd = /command=(.+?)" >> "\$GITHUB_OUTPUT"/.exec(block)?.[1] ?? "";
      for (const p of dbProbes) if (cmd.includes(p)) (laneByProbe.get(p) ?? laneByProbe.set(p, new Set()).get(p)!).add(lane ?? "?");
    }
    for (const p of dbProbes) {
      const lanes = [...(laneByProbe.get(p) ?? [])];
      expect(lanes.length, `${p} is wired into a contract entry`).toBeGreaterThan(0);
      expect(lanes, p).toEqual(["LANE_C"]);
    }
  });

  it("LANE_E commands (vitest simulations, runbook recovery) are never database probes", () => {
    const blocks = t.split(/\n\s{12}(?=S7-[A-Z0-9_-]+\))/).slice(1);
    const laneE = blocks.filter((b) => /lane=LANE_E/.test(b));
    expect(laneE.length).toBeGreaterThanOrEqual(3);
    for (const b of laneE) {
      const cmd = /command=(.+?)" >> "\$GITHUB_OUTPUT"/.exec(b)?.[1] ?? "";
      expect(cmd).toMatch(/^(npx vitest run |node scripts\/stage7-probes\/s7-i12-runbook-recovery\.mjs)/);
    }
  });
});

describe("the preflight itself is wired the way the workflows invoke it", () => {
  it("is run with tsx from scripts/ and its source never prints a URL, host, user or password", () => {
    const src = readFileSync(join(process.cwd(), "scripts", "assert-non-production-database.ts"), "utf8");
    expect(src).toContain("REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION");
    expect(src).not.toMatch(/console\.(log|error)\([^)]*\b(value|url|host|password)\b/);
    for (const f of ["db-verification.yml", "phase-1-db-tests.yml", "manual-runtime-validation.yml", "migrate-neon-test.yml"]) {
      expect(text(f), f).toContain("npx tsx scripts/assert-non-production-database.ts");
    }
  });
});
