/**
 * PRODUCTION SECRET ISOLATION (F-PRODUCTION-SECRET-ISOLATION).
 *
 * Root cause: the seven Production-grade Actions jobs ran in the `production` GitHub environment, which is ALSO the
 * environment name Vercel records its Production deployments under (names are case-insensitive), has no deployment-
 * branch rule and no reviewer, and which cannot safely get reviewers while Vercel shares it. Their `ref: main`
 * checkout only chose repository CONTENT: the steps -- and the secrets they reference -- came from the workflow file
 * of whichever ref was dispatched. Several Production-grade secrets also exist as repo-level duplicates that no
 * environment protection applies to.
 *
 * These tests read the REAL workflow files (nothing mocked) and pin: the seven jobs run in the protected
 * `production-operator` environment behind a fail-closed workflow-origin guard that is the FIRST step; no job anywhere
 * may use Production-grade secrets without a protected environment (transitional consumers are an exact, shrinking
 * allowlist); nothing may use the Vercel-shared `production` environment; module migrations can never resolve to it;
 * and no age private identity is ever referenced. Mutation tests prove each rule actually fails on a violation.
 *
 * Staged secret migration: docs/opsiq/ci/PRODUCTION_SECRET_ISOLATION.md
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import YAML from "js-yaml";

const WF_DIR = join(__dirname, "..", "..", "..", ".github", "workflows");

type Step = { name?: string; run?: string; uses?: string; env?: Record<string, string> };
type Job = { environment?: string | { name?: string }; steps?: Step[]; if?: string };
type Wf = { name?: string; on?: unknown; true?: unknown; jobs?: Record<string, Job> };
type Workflows = Record<string, Wf>;

function loadAll(): Workflows {
  const out: Workflows = {};
  for (const f of readdirSync(WF_DIR).filter((n) => n.endsWith(".yml"))) out[f.replace(/\.yml$/, "")] = YAML.load(readFileSync(join(WF_DIR, f), "utf8")) as Wf;
  return out;
}
const rawText = (name: string) => readFileSync(join(WF_DIR, `${name}.yml`), "utf8");

const envOf = (j: Job): string | undefined => (typeof j.environment === "string" ? j.environment : j.environment?.name);
const secretsIn = (v: unknown): Set<string> => new Set([...JSON.stringify(v).matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]).filter((s) => s !== "GITHUB_TOKEN"));

/** The seven sensitive Actions jobs moved off the Vercel-shared `production` environment. */
const SEVEN: Array<[string, string]> = [
  ["migrate-production", "migrate"],
  ["production-db-status", "status"],
  ["production-owner-acceptance", "acceptance"],
  ["production-root-probe", "probe"],
  ["provision-acceptance-fixture-operator", "provision"],
  ["provision-administration-operator", "provision"],
  ["scheduled-backup", "backup"], // legacy plaintext backup: disabled_manually; kept consistent so a re-enable can never use the shared environment
];

/** Environments that carry a deployment-branch rule and/or reviewer (configured by the owner; see the staged-migration doc). */
const PROTECTED_ENVS = new Set(["production-operator", "production-smoke", "backup-write", "backup-recovery", "stage7-evidence-signing"]);

/** Production-grade secrets that must NEVER be referenced outside a protected environment (zero exemptions). */
const STRICT: Record<string, Set<string>> = {
  // The old repo-level snapshot names: the seven operator jobs no longer reference them (fallback hazard); only Stage 7 does.
  PRODUCTION_DATABASE_URL: new Set(["stage7-evidence-signing"]),
  PRODUCTION_ACCEPTANCE_EMAIL: new Set(["stage7-evidence-signing"]),
  PRODUCTION_ACCEPTANCE_PASSWORD: new Set(["stage7-evidence-signing"]),
  // Unique, environment-only names: no repo-level secret of these names may be relied on (no fallback target exists).
  OPERATOR_DATABASE_URL: new Set(["production-operator"]),
  OPERATOR_ACCEPTANCE_EMAIL: new Set(["production-operator"]),
  OPERATOR_ACCEPTANCE_PASSWORD: new Set(["production-operator"]),
  SMOKE_DIAGNOSTIC_KEY: new Set(["production-smoke"]),
  VERCEL_PRODUCTION_DEPLOY_HOOK_URL: new Set(["production-operator"]),
  VERCEL_TOKEN: new Set(["stage7-evidence-signing"]),
  EVIDENCE_SIGNING_KEY: new Set(["stage7-evidence-signing"]),
  BACKUP_DATABASE_URL: new Set(["backup-write"]),
  MANIFEST_SIGNING_KEY: new Set(["backup-write"]),
  R2_ACCESS_KEY_ID: new Set(["backup-write"]),
  R2_SECRET_ACCESS_KEY: new Set(["backup-write"]),
  R2_READONLY_ACCESS_KEY_ID: new Set(["backup-recovery"]),
  R2_READONLY_SECRET_ACCESS_KEY: new Set(["backup-recovery"]),
};

/**
 * TRANSITIONAL: a repo-level duplicate exists and these exact consumers still read it without a protected environment.
 * A NEW consumer fails the test; an entry whose consumer no longer exists must be REMOVED (staleness check), so the
 * list can only shrink as the staged migration (docs/opsiq/ci/PRODUCTION_SECRET_ISOLATION.md) proceeds.
 */
const TRANSITIONAL: Record<string, Array<[string, string, string]>> = {
  MIGRATION_DATABASE_URL: [
    ["db-verification", "lane-a-neon-verify", "no environment; reads the repo-level copy (stage 3: move to `test`)"],
    ["migrate-neon-test", "migrate-neon-test", "no environment; reads the repo-level copy (stage 3: move to `test`)"],
    ["resolve-failed-migration", "resolve-failed-migration", "no environment; reads the repo-level copy (stage 3: move to `test`)"],
    ...["module-1-owner-recovery", "module-2-finance", "module-3-sales", "module-4-operations", "module-5-cashflow", "module-6-marketing", "module-7-sop", "module-8-strategy", "module-10-data-intake"].map(
      (m) => [`${m}-migrate`, "migrate", "environment from input `target` (staging only); falls back to the repo-level copy unless `staging` defines its own (stage 2)"] as [string, string, string],
    ),
  ],
};

/** Secrets that no workflow may reference at all (the legacy repo-level diagnostic key was replaced by SMOKE_DIAGNOSTIC_KEY). */
const FORBIDDEN_SECRETS = new Set(["OPSIQ_DIAGNOSTIC_KEY"]);

/** Environments whose jobs may reference ONLY their own uniquely named secrets (so a missing env secret can never fall back to a repo-level one). */
const UNIQUE_PREFIX: Record<string, RegExp> = { "production-operator": /^OPERATOR_/, "production-smoke": /^SMOKE_/ };
/** The one optional, intentionally-absent deploy-hook secret (not invented; see the doc). */
const UNIQUE_EXCEPTIONS = new Set(["VERCEL_PRODUCTION_DEPLOY_HOOK_URL"]);

/** The three diagnostic-key smoke workflows: [workflow, job]. */
const SMOKE: Array<[string, string]> = [
  ["smoke-production-dashboard", "smoke"],
  ["smoke-production-diagnosis-dashboard", "smoke-test"],
  ["smoke-production-signup-dashboard", "smoke-test"],
];
const APPROVED_SMOKE_ORIGINS = ["https://o-ps-iq.vercel.app", "https://opsiq.solutions", "https://www.opsiq.solutions"];

/** A fail-closed preflight: a step that references the secret, tests emptiness and exits 1. */
function hasFailClosedPreflight(job: Job, secret: string): boolean {
  return (job.steps ?? []).some((st) => JSON.stringify(st.env ?? {}).includes(`secrets.${secret}`) || (st.run ?? "").includes(`secrets.${secret}`)
    ? /exit 1/.test(st.run ?? "") && /(-z|-n)\b/.test(st.run ?? "")
    : false);
}

/** Canonical fail-closed workflow-origin guard: EXACT text, FIRST step of each of the seven jobs. */
const GUARD_NAME = "Assert workflow origin is main (fail-closed)";
const GUARD_RUN = `set -euo pipefail
case "\${GITHUB_EVENT_NAME}" in
  workflow_dispatch|schedule) ;;
  *) echo "::error::refusing to run: unexpected trigger '\${GITHUB_EVENT_NAME}'"; exit 1 ;;
esac
if [ "\${GITHUB_REF}" != "refs/heads/main" ]; then
  echo "::error::refusing to run: ref is '\${GITHUB_REF}', must be refs/heads/main"
  exit 1
fi
case "\${GITHUB_WORKFLOW_REF}" in
  *"@refs/heads/main") ;;
  *) echo "::error::refusing to run: the workflow definition is not from refs/heads/main"; exit 1 ;;
esac
echo "Workflow origin verified: \${GITHUB_WORKFLOW_REF}"
`;

function findViolations(wfs: Workflows): string[] {
  const v: string[] = [];
  const allow = new Set(Object.entries(TRANSITIONAL).flatMap(([s, rows]) => rows.map(([w, j]) => `${s}|${w}|${j}`)));
  for (const [wn, wf] of Object.entries(wfs)) {
    for (const [jn, job] of Object.entries(wf.jobs ?? {})) {
      const env = envOf(job);
      const id = `${wn}:${jn}`;
      if (env && /^production$/i.test(env.trim())) v.push(`${id}: uses the Vercel-shared \`production\` environment (reserved for Vercel; use production-operator)`);
      if (env && env.includes("${{")) {
        const on = (wf.on ?? wf.true) as { workflow_dispatch?: { inputs?: Record<string, { options?: string[] }> } } | undefined;
        const opts = on?.workflow_dispatch?.inputs?.target?.options ?? [];
        if (opts.length === 0 || opts.some((o) => /^production$/i.test(String(o)) || String(o).toLowerCase().includes("prod"))) v.push(`${id}: environment is an expression whose \`target\` options are missing or include production`);
      }
      for (const s of secretsIn(job)) {
        if (FORBIDDEN_SECRETS.has(s)) v.push(`${id}: references forbidden secret ${s} (use the environment-scoped replacement)`);
        const uniq = env ? UNIQUE_PREFIX[env] : undefined;
        if (uniq && !uniq.test(s) && !UNIQUE_EXCEPTIONS.has(s)) v.push(`${id}: '${env}' job references non-unique secret ${s} (repo-level fallback hazard; only ${uniq} names allowed)`);
        if (uniq && uniq.test(s) && !hasFailClosedPreflight(job, s)) v.push(`${id}: no fail-closed preflight (empty check + exit 1) for ${s}`);
        if (STRICT[s]) {
          if (!env || !STRICT[s].has(env)) v.push(`${id}: Production-grade secret ${s} used in environment '${env ?? "(none)"}' (allowed: ${[...STRICT[s]].join(", ")})`);
        } else if (TRANSITIONAL[s] && !(env && PROTECTED_ENVS.has(env)) && !allow.has(`${s}|${wn}|${jn}`)) {
          v.push(`${id}: NEW unprotected consumer of ${s} (only the exact transitional allowlist may; use a protected environment)`);
        }
      }
    }
  }
  for (const [s, rows] of Object.entries(TRANSITIONAL)) {
    for (const [w, j] of rows) {
      const job = wfs[w]?.jobs?.[j];
      const protectedNow = job ? PROTECTED_ENVS.has(envOf(job) ?? "") : false;
      if (!job || !secretsIn(job).has(s) || protectedNow) v.push(`${w}:${j}: STALE transitional allowlist entry for ${s} (consumer migrated or removed) -- delete it from TRANSITIONAL`);
    }
  }
  for (const [wn, j] of SEVEN) {
    const job = wfs[wn]?.jobs?.[j];
    if (!job) { v.push(`${wn}:${j}: missing`); continue; }
    if (envOf(job) !== "production-operator") v.push(`${wn}:${j}: must run in production-operator (got '${envOf(job) ?? "(none)"}')`);
    const first = job.steps?.[0];
    if (first?.name !== GUARD_NAME || (first.run ?? "") !== GUARD_RUN) v.push(`${wn}:${j}: the FIRST step must be the canonical workflow-origin guard, verbatim`);
    if (JSON.stringify(first ?? {}).includes("secrets.")) v.push(`${wn}:${j}: the origin guard must not reference any secret`);
  }
  for (const [wn, j] of SMOKE) {
    const wf = wfs[wn];
    const job = wf?.jobs?.[j];
    if (!job) { v.push(`${wn}:${j}: missing`); continue; }
    if (envOf(job) !== "production-smoke") v.push(`${wn}:${j}: must run in production-smoke (got '${envOf(job) ?? "(none)"}')`);
    const on = (wf.on ?? wf.true) as { workflow_dispatch?: { inputs?: Record<string, { type?: string; options?: string[] }> } } | undefined;
    const input = on?.workflow_dispatch?.inputs?.base_url;
    if (input?.type !== "choice" || !Array.isArray(input.options) || input.options.length === 0 || input.options.some((o) => !APPROVED_SMOKE_ORIGINS.includes(o))) v.push(`${wn}:${j}: base_url must be a \`choice\` input restricted to the approved origins (free-text base_url allows key exfiltration)`);
    const steps = job.steps ?? [];
    if (steps[0]?.name !== GUARD_NAME || !(steps[0].run ?? "").includes("GITHUB_WORKFLOW_REF")) v.push(`${wn}:${j}: the FIRST step must be the workflow-origin guard`);
    const validate = steps.findIndex((st) => /approved origins/i.test(st.name ?? "") && /Destination approved/.test(st.run ?? "") && APPROVED_SMOKE_ORIGINS.every((o) => (st.run ?? "").includes(o)));
    const firstSecret = steps.findIndex((st) => JSON.stringify(st).includes("secrets."));
    if (validate < 0) v.push(`${wn}:${j}: missing the approved-origin validation step`);
    else if (firstSecret >= 0 && validate > firstSecret) v.push(`${wn}:${j}: the approved-origin validation must run BEFORE any step that references a secret`);
    steps.forEach((st) => {
      if (/\$\{\{\s*(github\.event\.inputs|inputs)\./.test(st.run ?? "")) v.push(`${wn}:${j}: step '${st.name}' interpolates a dispatch input directly into a shell script (use env)`);
      if (/curl\b/.test(st.run ?? "") && !/--max-redirs 0/.test(st.run ?? "")) v.push(`${wn}:${j}: step '${st.name}' uses curl without --max-redirs 0`);
    });
  }
  return v;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe("production secret isolation — the real workflows", () => {
  const wfs = loadAll();

  it("no violation exists in the repository workflows", () => {
    expect(findViolations(wfs)).toEqual([]);
  });

  it("the seven sensitive jobs run in production-operator behind the verbatim fail-closed origin guard as their FIRST step", () => {
    for (const [w, j] of SEVEN) {
      const job = wfs[w].jobs![j];
      expect(envOf(job), `${w}:${j}`).toBe("production-operator");
      expect(job.steps![0].name).toBe(GUARD_NAME);
      expect(job.steps![0].run).toBe(GUARD_RUN);
      expect(job.steps![0].env, "the guard takes no environment/secret inputs").toBeUndefined();
    }
  });

  it("the guard checks trigger, ref AND workflow definition, and `ref: main` alone is not relied on", () => {
    expect(GUARD_RUN).toContain("GITHUB_EVENT_NAME");
    expect(GUARD_RUN).toContain('"${GITHUB_REF}" != "refs/heads/main"');
    expect(GUARD_RUN).toContain("GITHUB_WORKFLOW_REF");
    expect(GUARD_RUN).toContain('*"@refs/heads/main")');
  });

  it("no job anywhere uses the Vercel-shared `production` environment", () => {
    for (const [wn, wf] of Object.entries(wfs)) for (const [jn, job] of Object.entries(wf.jobs ?? {})) expect(/^production$/i.test((envOf(job) ?? "").trim()), `${wn}:${jn}`).toBe(false);
  });

  it("module-migration dispatches can only resolve to staging (never Production)", () => {
    const mods = Object.keys(wfs).filter((n) => /^module-\d+-.*-migrate$/.test(n));
    expect(mods.length).toBeGreaterThanOrEqual(9);
    for (const m of mods) {
      const on = (wfs[m].on ?? wfs[m].true) as { workflow_dispatch: { inputs: { target: { options: string[] } } } };
      expect(on.workflow_dispatch.inputs.target.options, m).toEqual(["staging"]);
    }
  });

  it("no workflow references an age private identity (primary or escrow) in any form", () => {
    for (const n of Object.keys(wfs)) expect(rawText(n), n).not.toMatch(/AGE_PRIVATE_IDENTITY|AGE-SECRET-KEY|AGE_IDENTITY|age_identity/i);
  });

  it("backup workflows use only their own environment's secrets (writer secrets never in recovery, and vice versa)", () => {
    const rec = secretsIn(wfs["restore-rehearsal-r2"]);
    const wr = secretsIn(wfs["scheduled-backup-r2"]);
    for (const s of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "MANIFEST_SIGNING_KEY", "BACKUP_DATABASE_URL"]) expect(rec.has(s), `recovery uses ${s}`).toBe(false);
    for (const s of ["R2_READONLY_ACCESS_KEY_ID", "R2_READONLY_SECRET_ACCESS_KEY"]) expect(wr.has(s), `writer uses ${s}`).toBe(false);
  });

  it("reusable workflows (workflow_call) reference no Production-grade secret directly", () => {
    for (const [n, wf] of Object.entries(wfs)) {
      const on = (wf.on ?? wf.true) as Record<string, unknown> | string[] | string | undefined;
      const callable = typeof on === "object" && on !== null && !Array.isArray(on) && "workflow_call" in on;
      if (!callable) continue;
      for (const s of secretsIn(wf)) expect(STRICT[s] || TRANSITIONAL[s], `${n} (reusable) references ${s}`).toBeUndefined();
    }
  });
});

describe("mutation tests — each rule fails on the violation it exists to prevent", () => {
  const base = loadAll();
  const mut = (edit: (w: Workflows) => void): string[] => {
    const w = clone(base);
    edit(w);
    return findViolations(w);
  };

  it("baseline is clean (so each mutant below fails for the right reason)", () => {
    expect(findViolations(base)).toEqual([]);
  });

  it("M1: putting a sensitive job back on the shared `production` environment is rejected", () => {
    expect(mut((w) => { w["migrate-production"].jobs!.migrate.environment = "production"; }).join("\n")).toMatch(/Vercel-shared `production`/);
  });

  it("M2: a job with PRODUCTION_DATABASE_URL and NO environment is rejected", () => {
    expect(mut((w) => { delete w["provision-administration-operator"].jobs!.provision.environment; }).join("\n")).toMatch(/OPERATOR_DATABASE_URL used in environment '\(none\)'/);
  });

  it("M3: moving the origin guard from first position is rejected", () => {
    const v = mut((w) => { const s = w["production-db-status"].jobs!.status.steps!; [s[0], s[1]] = [s[1], s[0]]; });
    expect(v.join("\n")).toMatch(/FIRST step must be the canonical workflow-origin guard/);
  });

  it("M4: weakening the guard (dropping the workflow-definition check) is rejected", () => {
    const v = mut((w) => { const g = w["production-root-probe"].jobs!.probe.steps![0]; g.run = (g.run ?? "").replace(/case "\$\{GITHUB_WORKFLOW_REF\}"[\s\S]*?esac\n/, ""); });
    expect(v.join("\n")).toMatch(/FIRST step must be the canonical workflow-origin guard/);
  });

  it("M5: a NEW unprotected consumer of MIGRATION_DATABASE_URL is rejected", () => {
    const v = mut((w) => { w["ci"].jobs!["rogue-job"] = { steps: [{ run: "echo ${{ secrets.MIGRATION_DATABASE_URL }}" }] }; });
    expect(v.join("\n")).toMatch(/NEW unprotected consumer of MIGRATION_DATABASE_URL/);
  });

  it("M6: adding `production` to a module migration's target options is rejected", () => {
    const v = mut((w) => { const on = (w["module-2-finance-migrate"].on ?? w["module-2-finance-migrate"].true) as { workflow_dispatch: { inputs: { target: { options: string[] } } } }; on.workflow_dispatch.inputs.target.options.push("production"); });
    expect(v.join("\n")).toMatch(/target` options are missing or include production/);
  });

  it("M7: a stale transitional allowlist entry (consumer migrated) is rejected so the list can only shrink", () => {
    const v = mut((w) => { const j = w["migrate-neon-test"].jobs!["migrate-neon-test"]; j.environment = "production-operator"; });
    expect(v.join("\n")).toMatch(/STALE transitional allowlist entry for MIGRATION_DATABASE_URL/);
  });

  it("M8: the origin guard referencing a secret is rejected", () => {
    const v = mut((w) => { const g = w["production-owner-acceptance"].jobs!.acceptance.steps![0]; g.env = { X: "${{ secrets.OPERATOR_ACCEPTANCE_PASSWORD }}" }; });
    expect(v.join("\n")).toMatch(/origin guard must not reference any secret|FIRST step must be/);
  });

  it("M9: an R2 writer secret in the recovery environment is rejected", () => {
    const v = mut((w) => { w["restore-rehearsal-r2"].jobs!.verify.steps!.push({ run: "echo ${{ secrets.R2_SECRET_ACCESS_KEY }}" }); });
    expect(v.join("\n")).toMatch(/R2_SECRET_ACCESS_KEY used in environment 'backup-recovery'/);
  });

  it("M10 (no repo-secret fallback): a production-operator job referencing the OLD repo-level PRODUCTION_DATABASE_URL is rejected", () => {
    const v = mut((w) => { w["production-db-status"].jobs!.status.steps!.push({ name: "x", run: "echo ${{ secrets.PRODUCTION_DATABASE_URL }}" }); });
    expect(v.join("\n")).toMatch(/non-unique secret PRODUCTION_DATABASE_URL/);
  });

  it("M11 (no repo-secret fallback): a production-operator job referencing the repo-level MIGRATION_DATABASE_URL or OPSIQ_DIAGNOSTIC_KEY is rejected", () => {
    const v = mut((w) => { w["migrate-production"].jobs!.migrate.steps!.push({ name: "x", env: { A: "${{ secrets.MIGRATION_DATABASE_URL }}", B: "${{ secrets.OPSIQ_DIAGNOSTIC_KEY }}" } }); }).join("\n");
    expect(v).toMatch(/non-unique secret MIGRATION_DATABASE_URL/);
    expect(v).toMatch(/forbidden secret OPSIQ_DIAGNOSTIC_KEY/);
  });

  it("M12: OPERATOR_* secrets outside production-operator are rejected", () => {
    const v = mut((w) => { w["ci"].jobs!["rogue"] = { environment: "backup-write", steps: [{ run: "echo ${{ secrets.OPERATOR_DATABASE_URL }}" }] }; });
    expect(v.join("\n")).toMatch(/OPERATOR_DATABASE_URL used in environment 'backup-write'/);
  });

  it("M13: removing the fail-closed preflight for an OPERATOR secret is rejected", () => {
    const v = mut((w) => { const s = w["production-owner-acceptance"].jobs!.acceptance.steps!; for (const st of s) if (/exit 1/.test(st.run ?? "") && JSON.stringify(st).includes("secrets.OPERATOR_ACCEPTANCE_EMAIL") && !JSON.stringify(st.env ?? {}).includes("PASSWORD_ONLY")) st.run = (st.run ?? "").replace(/exit 1/g, "true"); });
    expect(v.join("\n")).toMatch(/no fail-closed preflight/);
  });

  it("M14 (diagnostic key): a free-text base_url input on a smoke workflow is rejected", () => {
    const v = mut((w) => { const on = (w["smoke-production-signup-dashboard"].on ?? w["smoke-production-signup-dashboard"].true) as { workflow_dispatch: { inputs: { base_url: { type?: string } } } }; delete on.workflow_dispatch.inputs.base_url.type; });
    expect(v.join("\n")).toMatch(/base_url must be a `choice` input/);
  });

  it("M15 (diagnostic key): an attacker origin added to the choice options is rejected", () => {
    const v = mut((w) => { const on = (w["smoke-production-dashboard"].on ?? w["smoke-production-dashboard"].true) as { workflow_dispatch: { inputs: { base_url: { options: string[] } } } }; on.workflow_dispatch.inputs.base_url.options.push("https://evil.example"); });
    expect(v.join("\n")).toMatch(/base_url must be a `choice` input/);
  });

  it("M16 (diagnostic key): moving the destination validation after the secret-bearing step is rejected", () => {
    const v = mut((w) => { const s = w["smoke-production-diagnosis-dashboard"].jobs!["smoke-test"].steps!; const i = s.findIndex((x) => /approved origins/i.test(x.name ?? "")); const [val] = s.splice(i, 1); s.push(val); });
    expect(v.join("\n")).toMatch(/validation must run BEFORE any step that references a secret/);
  });

  it("M17 (diagnostic key): the smoke key referenced outside production-smoke, or the legacy repo-level name, is rejected", () => {
    const a = mut((w) => { delete w["smoke-production-dashboard"].jobs!.smoke.environment; }).join("\n");
    expect(a).toMatch(/must run in production-smoke/);
    expect(a).toMatch(/SMOKE_DIAGNOSTIC_KEY used in environment '\(none\)'/);
    const b = mut((w) => { const st = w["smoke-production-dashboard"].jobs!.smoke.steps!.find((x) => x.env?.OPSIQ_DIAGNOSTIC_KEY)!; st.env!.OPSIQ_DIAGNOSTIC_KEY = "${{ secrets.OPSIQ_DIAGNOSTIC_KEY }}"; }).join("\n");
    expect(b).toMatch(/forbidden secret OPSIQ_DIAGNOSTIC_KEY/);
  });

  it("M18 (diagnostic key): interpolating a dispatch input into a smoke shell script, or curl without --max-redirs 0, is rejected", () => {
    const a = mut((w) => { w["smoke-production-dashboard"].jobs!.smoke.steps!.push({ name: "leak", run: "curl https://x/${{ inputs.base_url }}" }); }).join("\n");
    expect(a).toMatch(/interpolates a dispatch input/);
    expect(a).toMatch(/curl without --max-redirs 0/);
  });
});
