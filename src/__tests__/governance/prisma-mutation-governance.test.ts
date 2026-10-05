/**
 * A3 governance — every repository-owned way of running a mutation-capable Prisma command is wired to the
 * fail-closed guard (src/infra/prisma-datasource.ts): an explicit OPSIQ_DB_TARGET, a datasource that matches
 * it, no --url / --config override, and exactly ONE production schema-mutation path.
 *
 * Threat model: accidental / operator error. `npx prisma --config <other-file>` bypasses prisma.config.ts
 * entirely, so no repository code can intercept it; this test is the control that keeps every package script,
 * workflow and script OpsIQ owns from using it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
const parse = (text: string) => yaml.load(text);

const ROOT = process.cwd();
const WF_DIR = join(ROOT, ".github", "workflows");
const MUTATING = /(^|[\s(;&|`])(npx\s+)?prisma\s+(migrate\s+(dev|deploy|reset|resolve)|db\s+(push|execute|seed)|studio)\b/;
const OVERRIDE_FLAGS = /(^|\s)--(url|config|shadow-database-url|from-url|to-url)(=|\s|$)/;
const LOOPBACK = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//;

type Env = Record<string, unknown>;
interface Step { name?: string; run?: string; env?: Env }
interface Job { env?: Env; steps?: Step[]; services?: unknown }
interface Workflow { env?: Env; jobs?: Record<string, Job> }

/** Command lines that actually invoke a mutating Prisma command (comments and echo/printf text excluded). */
function mutatingLines(run: string | undefined): string[] {
  return (run ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !/^(echo|printf)\b/.test(l) && MUTATING.test(l));
}
const opOf = (line: string) => {
  const m = line.match(/prisma\s+(migrate\s+\w+|db\s+\w+|studio)/);
  return m ? m[1].replace(/\s+/g, " ") : "";
};

interface Found { file: string; job: string; step: string; line: string; op: string; workflowEnv: Env; jobEnv: Env; stepEnv: Env; effective: Env }
const workflows = readdirSync(WF_DIR).filter((f) => f.endsWith(".yml")).sort();
const found: Found[] = [];
for (const file of workflows) {
  const wf = parse(readFileSync(join(WF_DIR, file), "utf8")) as Workflow;
  for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      for (const line of mutatingLines(step.run)) {
        const workflowEnv = wf.env ?? {};
        const jobEnv = job.env ?? {};
        const stepEnv = step.env ?? {};
        found.push({ file, job: jobName, step: step.name ?? "", line, op: opOf(line), workflowEnv, jobEnv, stepEnv, effective: { ...workflowEnv, ...jobEnv, ...stepEnv } });
      }
    }
  }
}

/**
 * Resolve a variable through GitHub's scope chain (step → job → workflow). `${{ env.X }}` in a scope reads X
 * from the scopes OUTSIDE it when X has the same name (a step re-exporting the job's DATABASE_URL), else from
 * the full chain. Bounded.
 */
function resolveVar(f: Found, name: string): string {
  const scopes: Env[] = [f.stepEnv, f.jobEnv, f.workflowEnv];
  let n = name;
  let level = scopes.findIndex((s) => n in s);
  for (let hops = 0; hops < 6 && level !== -1; hops++) {
    const v = String(scopes[level][n]);
    const m = v.match(/^\$\{\{\s*env\.(\w+)\s*\}\}$/);
    if (!m) return v;
    const next = m[1];
    const from = next === n ? level + 1 : 0;
    const found = scopes.findIndex((s, i) => i >= from && next in s);
    n = next;
    level = found;
  }
  return "";
}
const target = (f: Found) => String(f.effective.OPSIQ_DB_TARGET ?? "");

describe("A3 governance: workflows", () => {
  it("scans the real workflow set and finds the known mutation steps", () => {
    expect(workflows.length).toBeGreaterThan(80);
    expect(found.length).toBeGreaterThan(60);
    expect(found.some((f) => f.file === "migrate-production.yml" && f.op === "migrate deploy")).toBe(true);
    expect(found.some((f) => f.file === "phase-1-db-tests.yml" && f.op === "db push")).toBe(true);
  });

  it("every mutating Prisma step names an explicit, literal OPSIQ_DB_TARGET (never implied by DATABASE_URL or CI)", () => {
    const offenders = found.filter((f) => !["ci", "test", "staging", "production"].includes(target(f))).map((f) => `${f.file}#${f.job}: ${f.line}`);
    expect(offenders).toEqual([]);
  });

  it("no mutating Prisma step passes --url / --config (or related datasource-override flags)", () => {
    expect(found.filter((f) => OVERRIDE_FLAGS.test(f.line)).map((f) => `${f.file}#${f.job}: ${f.line}`)).toEqual([]);
  });

  it("ci-target steps receive a loopback DATABASE_URL (the runner's own throwaway Postgres)", () => {
    const offenders = found
      .filter((f) => target(f) === "ci")
      .filter((f) => !LOOPBACK.test(resolveVar(f, "DATABASE_URL")))
      .map((f) => `${f.file}#${f.job}`);
    expect(offenders).toEqual([]);
  });

  it("test-target steps receive a test datasource variable and only run operations permitted against a remote test database", () => {
    const allowed = new Set(["migrate deploy", "migrate resolve", "db push", "db execute"]);
    for (const f of found.filter((x) => target(x) === "test")) {
      expect(Boolean(f.effective.TEST_DATABASE_URL || f.effective.DATABASE_URL_TEST), `${f.file}#${f.job}`).toBe(true);
      expect(allowed.has(f.op), `${f.file}: ${f.op}`).toBe(true);
    }
  });

  it("staging-target steps deploy only, with an approved-endpoint list and a staging secret", () => {
    for (const f of found.filter((x) => target(x) === "staging")) {
      expect(f.op, f.file).toBe("migrate deploy");
      expect(String(f.effective.OPSIQ_APPROVED_STAGING_ENDPOINT_IDS ?? ""), f.file).toMatch(/OPSIQ_APPROVED_STAGING_ENDPOINT_IDS/);
      expect(String(f.effective.DATABASE_URL ?? ""), f.file).toMatch(/secrets\.(STAGING_DATABASE_URL|MIGRATION_DATABASE_URL)/);
    }
  });

  it("exactly ONE workflow can mutate production, and only with `migrate deploy`", () => {
    const prod = found.filter((f) => target(f) === "production");
    expect(prod.length).toBeGreaterThan(0);
    expect([...new Set(prod.map((f) => f.file))]).toEqual(["migrate-production.yml"]);
    expect(prod.every((f) => f.op === "migrate deploy")).toBe(true);
    // Legacy per-module migration workflows must not offer a production option.
    for (const file of workflows.filter((w) => /^module-\d+-.*-migrate\.yml$/.test(w))) {
      const wf = parse(readFileSync(join(WF_DIR, file), "utf8")) as { on: { workflow_dispatch: { inputs: { target: { options: string[] } } } } };
      expect(wf.on.workflow_dispatch.inputs.target.options, file).not.toContain("production");
    }
  });

  it("the production deploy step carries the full authorization context itself — and no wider scope does", () => {
    const deploy = found.filter((f) => f.file === "migrate-production.yml" && f.op === "migrate deploy");
    expect(deploy).toHaveLength(1);
    const d = deploy[0];
    expect(d.stepEnv.OPSIQ_DB_TARGET).toBe("production");
    expect(String(d.stepEnv.OPSIQ_ALLOW_PRODUCTION_DB_COMMAND)).toBe("true");
    expect(d.stepEnv.OPSIQ_PRODUCTION_OPERATION).toBe("migrate deploy");
    expect(String(d.stepEnv.MIGRATION_DATABASE_URL)).toMatch(/secrets\.PRODUCTION_DATABASE_URL/);
    expect(d.stepEnv.DATABASE_URL, "no ambient DATABASE_URL fallback on the deploy step").toBeUndefined();
    // Least privilege: the production authorization is never set at workflow or job scope, in any workflow.
    for (const file of workflows) {
      const wf = parse(readFileSync(join(WF_DIR, file), "utf8")) as Workflow;
      const scopes: Env[] = [wf.env ?? {}, ...Object.values(wf.jobs ?? {}).map((j) => j.env ?? {})];
      for (const env of scopes) {
        expect(env.OPSIQ_ALLOW_PRODUCTION_DB_COMMAND, `${file} wide-scope production flag`).toBeUndefined();
        expect(env.OPSIQ_PRODUCTION_OPERATION, `${file} wide-scope production operation`).toBeUndefined();
        expect(String(env.OPSIQ_DB_TARGET ?? ""), `${file} wide-scope production target`).not.toBe("production");
      }
    }
  });

  it("production authorization appears only in the governed migration workflow and the read-only status workflow", () => {
    const offenders = workflows.filter((file) => {
      if (file === "migrate-production.yml" || file === "production-db-status.yml") return false;
      return /OPSIQ_ALLOW_PRODUCTION_DB_COMMAND|OPSIQ_PRODUCTION_OPERATION|OPSIQ_DB_TARGET:\s*['"]?production/.test(readFileSync(join(WF_DIR, file), "utf8"));
    });
    expect(offenders).toEqual([]);
  });

  it("production status steps are read-only (migrate status) and never mutate", () => {
    const wf = parse(readFileSync(join(WF_DIR, "production-db-status.yml"), "utf8")) as Workflow;
    for (const job of Object.values(wf.jobs ?? {})) {
      for (const step of job.steps ?? []) expect(mutatingLines(step.run), step.name).toEqual([]);
    }
  });

  it("no workflow runs db push / migrate reset / migrate dev / studio / db seed against a production or staging target", () => {
    const bad = found.filter((f) => ["production", "staging"].includes(target(f)) && ["db push", "migrate reset", "migrate dev", "studio", "db seed", "db execute"].includes(f.op));
    expect(bad.map((f) => `${f.file}: ${f.op}`)).toEqual([]);
  });

  it("schema-only generate / validate are not treated as mutations", () => {
    expect(MUTATING.test("npx prisma generate")).toBe(false);
    expect(MUTATING.test("npx prisma validate")).toBe(false);
    expect(MUTATING.test("npx prisma migrate status")).toBe(false);
    expect(MUTATING.test("npx prisma migrate diff --exit-code")).toBe(false);
  });
});

describe("A3 governance: package scripts, shell scripts and runbooks", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };

  it("every package script that mutates through Prisma pins OPSIQ_DB_TARGET=local and uses no override flag", () => {
    const mutating = Object.entries(pkg.scripts).filter(([, cmd]) => MUTATING.test(cmd));
    expect(mutating.map(([name]) => name).sort()).toEqual(["db:migrate:deploy", "db:migrate:dev", "db:push", "db:reset", "db:studio"]);
    for (const [name, cmd] of mutating) {
      expect(cmd, name).toMatch(/^OPSIQ_DB_TARGET=local\s/);
      expect(OVERRIDE_FLAGS.test(cmd), name).toBe(false);
    }
  });

  it("every shell script that mutates through Prisma names its target on the command line", () => {
    const dir = join(ROOT, "scripts");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sh"))) {
      const text = readFileSync(join(dir, file), "utf8");
      for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || /^(echo|printf)\b/.test(line) || !MUTATING.test(line)) continue;
        const named = /OPSIQ_DB_TARGET=(local|ci|test)\b/.test(line) || (/\$PRISMA_LOCAL_ENV\b/.test(line) && /PRISMA_LOCAL_ENV="[^"]*OPSIQ_DB_TARGET=local/.test(text));
        expect(named, `${file}: ${line}`).toBe(true);
        expect(OVERRIDE_FLAGS.test(line), `${file}: ${line}`).toBe(false);
      }
    }
  });

  it("no TypeScript/JavaScript script shells out to a mutating Prisma command", () => {
    const dir = join(ROOT, "scripts");
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => /\.(ts|mjs|js)$/.test(f))) {
      for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || !/(execSync|spawnSync|spawn|exec)\(/.test(t)) continue;
        if (MUTATING.test(t)) offenders.push(`${file}: ${t}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no runbook or document instructs a mutating Prisma command with --url or --config", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); }
        else if (e.name.endsWith(".md")) {
          for (const line of readFileSync(p, "utf8").split("\n")) {
            if (MUTATING.test(line) && OVERRIDE_FLAGS.test(line)) offenders.push(`${p.slice(ROOT.length + 1)}: ${line.trim().slice(0, 120)}`);
          }
        }
      }
    };
    walk(join(ROOT, "docs"));
    expect(offenders).toEqual([]);
  });
});

describe("A3 governance: the scanner itself detects the violations it exists to catch", () => {
  it("recognises mutating invocations in the shapes workflows and scripts use", () => {
    for (const line of [
      "npx prisma migrate reset --force",
      "run: npx prisma db push --force-reset --accept-data-loss",
      "STATUS=$(npx prisma migrate deploy 2>&1)",
      "cd x && npx prisma db execute --stdin",
      "prisma studio",
    ]) expect(MUTATING.test(line), line).toBe(true);
    expect(mutatingLines("echo 'npx prisma migrate reset'\n# npx prisma db push\nnpx prisma validate")).toEqual([]);
  });
  it("flags --url and --config overrides in both spellings", () => {
    for (const line of [
      "npx prisma db push --url postgresql://x",
      "npx prisma db push --url=postgresql://x",
      "npx prisma migrate deploy --config other.config.ts",
      "npx prisma migrate deploy --config=other.config.ts",
    ]) expect(OVERRIDE_FLAGS.test(line), line).toBe(true);
    expect(OVERRIDE_FLAGS.test("npx prisma migrate deploy --schema prisma/schema.prisma")).toBe(false);
  });
  it("accepts only loopback URLs as a throwaway CI database", () => {
    expect(LOOPBACK.test("postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public")).toBe(true);
    expect(LOOPBACK.test("postgresql://u:p@127.0.0.1:5432/db")).toBe(true);
    expect(LOOPBACK.test("postgresql://u:p@db.synthetic-remote.invalid:5432/db")).toBe(false);
    expect(LOOPBACK.test("postgresql://u:p@localhost.attacker.invalid:5432/db")).toBe(false);
    expect(LOOPBACK.test("")).toBe(false);
  });
});

// ─── A3 amendment: raw (non-Prisma) destructive database operations ───────────────────────────────────────────────
// `psql` / the Prisma client never load prisma.config.ts, so the CLI datasource guard cannot protect them. Every
// repository-owned destructive operation against a REMOTE database must prove its target positively BEFORE the first
// destructive statement, through the one shared validator.
const RAW_TOOL = /(^|[\s(;&|`])(psql|dropdb|createdb|pg_restore)\b/;
const DESTRUCTIVE_SQL = /\b(DROP\s+(SCHEMA|DATABASE|TABLE)|TRUNCATE|DELETE\s+FROM|CREATE\s+SCHEMA)\b/;
const STAGING_PREFLIGHT = /assert-approved-staging-database\.ts\s+([A-Z][A-Z0-9_]*)/;

function loadWorkflow(file: string): Workflow {
  return parse(readFileSync(join(WF_DIR, file), "utf8")) as Workflow;
}
const executableLines = (run: string | undefined) =>
  (run ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !/^(echo|printf)\b/.test(l));

interface RawDestructive { file: string; job: string; index: number; step: Step; job_: Job; wf: Workflow }
const rawDestructive: RawDestructive[] = [];
for (const file of workflows) {
  const wf = loadWorkflow(file);
  for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
    (job.steps ?? []).forEach((step, index) => {
      const lines = executableLines(step.run);
      if (lines.some((l) => RAW_TOOL.test(l)) && DESTRUCTIVE_SQL.test(step.run ?? "")) {
        rawDestructive.push({ file, job: jobName, index, step, job_: job, wf });
      }
    });
  }
}
const effectiveEnv = (r: RawDestructive): Env => ({ ...(r.wf.env ?? {}), ...(r.job_.env ?? {}), ...(r.step.env ?? {}) });
const indexOfStep = (job: Job, pred: (s: Step) => boolean) => (job.steps ?? []).findIndex(pred);

describe("A3 governance: raw destructive database operations are target-verified first", () => {
  it("inventory: the only executable raw destructive workflow step is the staging schema reset", () => {
    expect(rawDestructive.map((r) => `${r.file}#${r.step.name}`)).toEqual(["reset-staging-db.yml#Drop and recreate public schema"]);
  });

  it("every raw destructive step against a secret-backed (remote) database is preceded by a staging-target preflight on the SAME variable", () => {
    for (const r of rawDestructive) {
      const env = effectiveEnv(r);
      const remote = Object.values(env).some((v) => /secrets\./.test(String(v)));
      if (!remote) continue; // runner-local service databases need no remote proof
      const urlVar = (r.step.run ?? "").match(/psql\s+"\$([A-Z][A-Z0-9_]*)"/)?.[1];
      expect(urlVar, `${r.file}: psql must take its URL from an env variable`).toBeTruthy();
      const preIdx = indexOfStep(r.job_, (s) => (s.run ?? "").match(STAGING_PREFLIGHT)?.[1] === urlVar);
      expect(preIdx, `${r.file}: staging preflight on ${urlVar}`).toBeGreaterThan(-1);
      expect(preIdx, `${r.file}: preflight must precede the destructive statement`).toBeLessThan(r.index);
    }
  });

  describe("reset-staging-db.yml", () => {
    const wf = loadWorkflow("reset-staging-db.yml");
    const job = Object.values(wf.jobs ?? {})[0];
    const steps = job.steps ?? [];
    const dropIdx = steps.findIndex((s) => /DROP SCHEMA/.test(s.run ?? ""));
    const preIdx = steps.findIndex((s) => STAGING_PREFLIGHT.test(s.run ?? ""));
    const secretCheckIdx = steps.findIndex((s) => /STAGING_DATABASE_URL secret is missing/.test(s.run ?? ""));
    const installIdx = steps.findIndex((s) => /npm ci/.test(s.run ?? ""));
    const checkoutIdx = steps.findIndex((s) => /actions\/checkout/.test(JSON.stringify(s)));

    it("I. the staging preflight index is before DROP SCHEMA — and before every other write", () => {
      expect(preIdx).toBeGreaterThan(-1);
      expect(dropIdx).toBeGreaterThan(-1);
      expect(preIdx).toBeLessThan(dropIdx);
      const firstWrite = steps.findIndex((s) => /DROP SCHEMA|CREATE SCHEMA|prisma\s+(migrate|db)\s/.test((s.run ?? "").split("\n").filter((l) => !/^\s*(#|echo)/.test(l)).join("\n")));
      expect(preIdx).toBeLessThan(firstWrite);
      // After checkout, dependency installation and the secret-presence check.
      expect(checkoutIdx).toBeGreaterThan(-1);
      expect(checkoutIdx).toBeLessThan(preIdx);
      expect(installIdx).toBeLessThan(preIdx);
      expect(secretCheckIdx).toBeLessThan(preIdx);
    });

    it("J. the preflight validates the SAME secret expression the destructive step and the migration step use", () => {
      const pre = steps[preIdx];
      const varName = (pre.run ?? "").match(STAGING_PREFLIGHT)![1];
      const expected = "${{ secrets.STAGING_DATABASE_URL }}";
      expect(pre.env?.[varName]).toBe(expected);
      const drop = steps[dropIdx];
      expect(drop.env?.[varName]).toBe(expected);
      expect((drop.run ?? "").match(/psql\s+"\$([A-Z_]+)"/g)?.every((m) => m.includes(`$${varName}`))).toBe(true);
      const deploy = steps.find((s) => /prisma migrate deploy/.test(s.run ?? ""))!;
      expect(deploy.env?.DATABASE_URL).toBe(expected);
      // No URL reconstruction between validation and use.
      for (const s of [pre, drop]) expect(JSON.stringify(s)).not.toMatch(/sed |cut |awk |tr -d|\$\{DATABASE_URL[#%/]/);
    });

    it("the approved-endpoint allowlist is mandatory input: the preflight wires the staging environment variable, never a fallback", () => {
      const pre = steps[preIdx];
      expect(String(pre.env?.OPSIQ_APPROVED_STAGING_ENDPOINT_IDS)).toBe("${{ vars.OPSIQ_APPROVED_STAGING_ENDPOINT_IDS }}");
      expect(JSON.stringify(pre)).not.toMatch(/\|\||:-|default/);
      expect(job.env?.OPSIQ_APPROVED_STAGING_ENDPOINT_IDS).toBe("${{ vars.OPSIQ_APPROVED_STAGING_ENDPOINT_IDS }}");
      expect((job as { environment?: string }).environment).toBe("staging");
    });

    it("K. the confirmation phrase remains mandatory and runs first", () => {
      const first = steps[0];
      expect(first.run).toMatch(/RESET_STAGING_DATABASE/);
      expect(first.run).toMatch(/exit 1/);
      expect(0).toBeLessThan(preIdx);
    });

    it("L. the Prisma deploy step still runs under the staging target rules (job-level staging target + allowlist)", () => {
      expect(job.env?.OPSIQ_DB_TARGET).toBe("staging");
      expect(indexOfStep(job, (s) => /prisma migrate deploy/.test(s.run ?? ""))).toBeGreaterThan(dropIdx);
    });
  });

  it("seed-staging.yml proves its target before the seed writes, with the same secret", () => {
    const wf = loadWorkflow("seed-staging.yml");
    const steps = Object.values(wf.jobs ?? {})[0].steps ?? [];
    const pre = steps.findIndex((s) => STAGING_PREFLIGHT.test(s.run ?? ""));
    const seed = steps.findIndex((s) => /src\/infra\/seed\.ts/.test(s.run ?? ""));
    expect(pre).toBeGreaterThan(-1);
    expect(pre).toBeLessThan(seed);
    expect(steps[pre].env?.DATABASE_URL).toBe(steps[seed].env?.DATABASE_URL);
    expect(steps[pre].env?.DATABASE_URL).toBe("${{ secrets.STAGING_DATABASE_URL }}");
  });

  it("scripts/reset-staging.ts and scripts/test-migration-replay.sh verify their target before the first destructive statement", () => {
    const ts = readFileSync(join(ROOT, "scripts", "reset-staging.ts"), "utf8");
    expect(ts.indexOf("assertLocalOrApprovedStagingTarget(")).toBeGreaterThan(-1);
    expect(ts.indexOf("assertLocalOrApprovedStagingTarget(")).toBeLessThan(ts.indexOf("$executeRaw"));
    expect(ts.indexOf("assertLocalOrApprovedStagingTarget(")).toBeLessThan(ts.indexOf("new PrismaClient"));
    const sh = readFileSync(join(ROOT, "scripts", "test-migration-replay.sh"), "utf8");
    const pre = sh.indexOf("assert-non-production-database.ts");
    expect(pre).toBeGreaterThan(-1);
    expect(pre).toBeLessThan(sh.indexOf('DROP SCHEMA public CASCADE'));
    // Nothing else in the repository's workflows runs the table-clearing script.
    for (const file of workflows) expect(readFileSync(join(WF_DIR, file), "utf8"), file).not.toMatch(/reset-staging\.ts/);
  });

  it("the shared validator is the single implementation: the Prisma path imports it instead of re-deriving the rules", () => {
    const prismaSrc = readFileSync(join(ROOT, "src", "infra", "prisma-datasource.ts"), "utf8");
    expect(prismaSrc).toMatch(/assertApprovedStagingDatabaseUrl/);
    expect(prismaSrc).not.toMatch(/OPSIQ_APPROVED_STAGING_ENDPOINT_IDS"\s*\)|csv\(env\.OPSIQ_APPROVED/);
    expect(prismaSrc).not.toMatch(/endsWith\("-pooler"\)/);
  });
});
