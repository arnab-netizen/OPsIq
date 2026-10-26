/**
 * Governance validator for .github/workflows/provision-acceptance-fixture-operator.yml and the read-only
 * inspector it runs (scripts/inspect-acceptance-fixture-operator-target.ts).
 *
 * Modeled on provision-administration-operator-workflow-safety.test.ts. All checks are static-source against
 * the parsed workflow and the two scripts; nothing here executes the workflow or touches a database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

const ROOT = process.cwd();
const WORKFLOW_PATH = join(ROOT, ".github/workflows/provision-acceptance-fixture-operator.yml");
const INSPECTOR_PATH = join(ROOT, "scripts/inspect-acceptance-fixture-operator-target.ts");
const PROVISIONER_PATH = join(ROOT, "scripts/provision-acceptance-fixture-operator.ts");

const src = readFileSync(WORKFLOW_PATH, "utf-8");
const inspectorSrc = readFileSync(INSPECTOR_PATH, "utf-8");
const provisionerSrc = readFileSync(PROVISIONER_PATH, "utf-8");
// Functional YAML only: the leading doc comment legitimately names things the workflow does NOT do.
const functionalSrc = src.slice(src.indexOf("\non:\n") + 1);

interface Step {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}
interface Doc {
  on?: Record<string, { inputs?: Record<string, { type?: string; options?: string[]; required?: boolean; default?: unknown }> } | null>;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  jobs: Record<string, { environment?: string; "timeout-minutes"?: number; permissions?: Record<string, string>; steps: Step[] }>;
}

const doc = yaml.load(src) as Doc;
const job = doc.jobs.provision;
const steps = job.steps;
const inputs = doc.on!.workflow_dispatch!.inputs!;
const idx = (prefix: string) => {
  const i = steps.findIndex((s) => (s.name ?? "").startsWith(prefix));
  if (i < 0) throw new Error(`step not found: ${prefix}`);
  return i;
};
const stepText = (s: Step) => `${s.run ?? ""}\n${JSON.stringify(s.env ?? {})}\n${s.if ?? ""}`;
const READ_ONLY = "-c default_transaction_read_only=on";

describe("provision-acceptance-fixture-operator.yml — trigger, environment, permissions", () => {
  it("1. manual trigger only (workflow_dispatch); no push/PR/schedule/workflow_run/repository_dispatch", () => {
    expect(Object.keys(doc.on!)).toEqual(["workflow_dispatch"]);
    expect(functionalSrc).not.toMatch(/^\s*(push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch|workflow_call):/m);
  });

  it("2. a single job that runs under the production GitHub Environment", () => {
    expect(Object.keys(doc.jobs)).toEqual(["provision"]);
    expect(job.environment).toBe("production");
  });

  it("29. contents permission is read-only, set at the workflow level and never widened by the job", () => {
    expect(doc.permissions).toEqual({ contents: "read" });
    expect(job.permissions).toBeUndefined();
  });

  it("28. concurrency uses a dedicated group and never cancels an in-flight run", () => {
    expect(doc.concurrency?.group).toBe("provision-acceptance-fixture-operator");
    expect(doc.concurrency?.["cancel-in-progress"]).toBe(false);
  });

  it("the job has a bounded timeout and pinned action majors", () => {
    expect(job["timeout-minutes"]).toBeGreaterThan(0);
    expect(job["timeout-minutes"]).toBeLessThanOrEqual(30);
    for (const s of steps.filter((x) => x.uses)) expect(s.uses, s.name).toMatch(/^actions\/(checkout|setup-node)@v\d+$/);
  });
});

describe("provision-acceptance-fixture-operator.yml — inputs: modes, no arbitrary email or role", () => {
  it("3. exactly the three modes DISCOVER / DRY_RUN / APPLY", () => {
    expect(inputs.mode.type).toBe("choice");
    expect(inputs.mode.options).toEqual(["DISCOVER", "DRY_RUN", "APPLY"]);
    expect(inputs.mode.default).toBe("DISCOVER");
  });

  it("4. the mode is checked against an explicit allow-list by the very first step", () => {
    expect(steps[0].name).toBe("Validate mode input");
    expect(steps[0].run).toMatch(/DISCOVER\|DRY_RUN\|APPLY\)/);
    expect(steps[0].run).toContain("exit 1");
  });

  it("8. there is no target email input and no input that could select an account or a role", () => {
    expect(Object.keys(inputs).sort()).toEqual(["confirm", "expected_database_host", "expected_main_sha", "mode", "workspace_id"]);
    for (const key of Object.keys(inputs)) expect(key).not.toMatch(/email|role|target|user|account|capab/i);
    expect(src).not.toMatch(/inputs\.(target_email|email|role|user|account)/);
  });

  it("9. the account is fixed by the PRODUCTION_ACCEPTANCE_EMAIL secret, wired only into env", () => {
    const withEmail = steps.filter((s) => JSON.stringify(s.env ?? {}).includes("secrets.PRODUCTION_ACCEPTANCE_EMAIL"));
    expect(withEmail.length).toBeGreaterThanOrEqual(4);
    for (const s of withEmail) {
      const uses = Object.entries(s.env ?? {}).filter(([, v]) => String(v).includes("secrets.PRODUCTION_ACCEPTANCE_EMAIL")).map(([k]) => k);
      expect(uses.every((k) => k === "PRODUCTION_ACCEPTANCE_EMAIL" || k === "TARGET_EMAIL"), s.name).toBe(true);
    }
    // never interpolated into script text
    for (const s of steps) expect(s.run ?? "", s.name).not.toMatch(/\$\{\{\s*secrets\./);
  });

  it("22/23. the role is not an input and no generic role CLI exists: the workflow has no --role and names no other role", () => {
    expect(functionalSrc).not.toMatch(/--role\b/);
    expect(functionalSrc).not.toMatch(/beta_request_operator|administration_operator|ADMINISTRATION OPERATOR|BETA REQUEST OPERATOR/);
    // the only provisioner it can ever run is the acceptance fixture one
    const provisionerRefs = functionalSrc.match(/scripts\/provision-[a-z-]+\.ts/g) ?? [];
    expect(new Set(provisionerRefs)).toEqual(new Set(["scripts/provision-acceptance-fixture-operator.ts"]));
  });

  it("22. the provisioner pins the role as a constant, not a CLI argument", () => {
    expect(provisionerSrc).toMatch(/const ROLE = ROLES\.ACCEPTANCE_FIXTURE_OPERATOR;/);
    expect(provisionerSrc).not.toMatch(/"--role"/);
  });

  it("25/26. no SYSTEM_ADMIN selector and no beta/administration operator script is reachable", () => {
    for (const s of steps) {
      expect(s.run ?? "", s.name).not.toMatch(/--(role|capability)\b/);
      expect(s.run ?? "", s.name).not.toMatch(/provision-(beta-request|administration)-operator/);
    }
    // system_admin appears only as a detection (grep of the inspector's output), never as an argument
    const mentions = steps.filter((s) => /system_admin|SYSTEM_ADMIN/.test(stepText(s)));
    for (const s of mentions) expect(s.run ?? "", s.name).toMatch(/grep -q '\^SYSTEM_ADMIN=(YES|NO)\$'/);
  });
});

describe("provision-acceptance-fixture-operator.yml — input validation order and exact-main-SHA pinning", () => {
  it("5. expected_main_sha must be exactly 40 lowercase hex characters", () => {
    const s = steps[idx("Validate expected_main_sha format")];
    expect(s.run).toMatch(/\^\[0-9a-f\]\{40\}\$/);
    expect(s.run).toContain("exit 1");
    expect(inputs.expected_main_sha.required).toBe(true);
  });

  it("10. workspace_id is a UUID in DRY_RUN/APPLY and empty in DISCOVER", () => {
    const s = steps[idx("Validate workspace_id")];
    expect(s.run).toMatch(/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/i);
    expect(s.run).toContain('"$MODE" = "DISCOVER"');
    expect(s.run).toContain("exit 1");
  });

  it("12. APPLY requires the exact confirmation phrase; the other modes require none", () => {
    const s = steps[idx("Confirm explicit intent")];
    expect(s.run).toContain('!= "GRANT ACCEPTANCE FIXTURE OPERATOR"');
    expect(s.run).toContain('"$MODE" = "APPLY"');
    expect(s.run).toContain("exit 1");
  });

  it("7. checks out main only; the ref is never taken from an input", () => {
    const checkouts = steps.filter((s) => (s.uses ?? "").startsWith("actions/checkout"));
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0].with?.ref).toBe("main");
  });

  it("6. HEAD must exactly equal expected_main_sha (equality, never ancestry)", () => {
    const s = steps[idx("Verify checked-out SHA exactly equals expected_main_sha")];
    expect(s.run).toContain("git rev-parse HEAD");
    expect(s.run).toMatch(/"\$CURRENT_SHA" != "\$EXPECTED_MAIN_SHA"/);
    expect(s.run).toContain("exit 1");
    expect(src).not.toMatch(/merge-base|--is-ancestor/);
  });

  it("31. every repository-dependent step comes after Checkout main AND the exact-SHA verification", () => {
    const checkout = idx("Checkout main");
    const verify = idx("Verify checked-out SHA exactly equals expected_main_sha");
    expect(verify).toBe(checkout + 1);
    const repoDependent = /scripts\/|\bnpm\b|\bnpx\b|\bnode\b/;
    steps.forEach((s, i) => {
      if (repoDependent.test(s.run ?? "")) expect(i, s.name).toBeGreaterThan(verify);
      if (i < checkout) expect(s.run ?? "", `${s.name} runs before checkout`).not.toMatch(repoDependent);
    });
  });

  it("11. expected_database_host is validated by the shared validator, not a second implementation", () => {
    const s = steps[idx("Validate expected_database_host format")];
    expect(s.run).toContain("scripts/validate-expected-db-host.mjs");
    expect(s.run).toContain("isValidExpectedHost");
    expect(src).not.toMatch(/HOSTNAME_PATTERN|\[a-zA-Z0-9\]\(\[a-zA-Z0-9-\]/);
    expect(inputs.expected_database_host.required).toBe(true);
  });
});

describe("provision-acceptance-fixture-operator.yml — secrets and the wrong-database gate", () => {
  it("13. the only secrets referenced are PRODUCTION_DATABASE_URL and PRODUCTION_ACCEPTANCE_EMAIL", () => {
    const refs = new Set((src.match(/secrets\.[A-Za-z0-9_]+/g) ?? []).map((r) => r.replace("secrets.", "")));
    expect(refs).toEqual(new Set(["PRODUCTION_DATABASE_URL", "PRODUCTION_ACCEPTANCE_EMAIL"]));
    expect(src).not.toMatch(/postgres(?:ql)?:\/\/[^$\s]/);
  });

  it("14. no secret or connection string is ever logged", () => {
    expect(functionalSrc).not.toMatch(/echo\s+"?\$\{?(DATABASE_URL|PRODUCTION_DATABASE_URL|TARGET_EMAIL|PRODUCTION_ACCEPTANCE_EMAIL)\}?"?/);
    expect(functionalSrc).not.toMatch(/\bprintenv\b|\benv\s*$|\bset -x\b|\bcat\s+\.env|\bdeclare -p\b/m);
    expect(functionalSrc).not.toMatch(/console\.log\([^)]*DATABASE_URL[^)]*\)/);
  });

  it("30. the run summary exposes no secret: no secrets.*, no email, no connection string", () => {
    const s = steps[idx("Run summary")];
    // no secret in its env, and its script never expands an email / connection-string variable
    expect(JSON.stringify(s.env ?? {})).not.toMatch(/secrets\.|TARGET_EMAIL|PRODUCTION_ACCEPTANCE_EMAIL|DATABASE_URL/);
    expect(s.run ?? "").not.toMatch(/\$\{?(TARGET_EMAIL|PRODUCTION_ACCEPTANCE_EMAIL|DATABASE_URL|PRODUCTION_DATABASE_URL)\b/);
    expect(s.run ?? "").not.toMatch(/secrets\./);
    expect(s.if).toBe("always()");
    expect(s.run).toContain("never printed");
  });

  it("15. local .env files are removed before any database step", () => {
    const rm = idx("Remove local environment files");
    expect(steps[rm].run).toContain("rm -f .env .env.local");
    const firstDb = steps.findIndex((s) => /DATABASE_URL/.test(JSON.stringify(s.env ?? {})) && /tsx|validate-expected-db-host/.test(s.run ?? ""));
    expect(rm).toBeLessThan(firstDb);
  });

  it("16/35. the workflow-level host gate precedes every step that opens a database connection", () => {
    const gate = idx("Verify exact production database host matches");
    expect(steps[gate].run).toContain("node scripts/validate-expected-db-host.mjs");
    expect(steps[gate].env?.DATABASE_URL).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(steps[gate].env?.EXPECTED_DATABASE_HOST).toContain("inputs.expected_database_host");
    steps.forEach((s, i) => {
      if (/\btsx\b/.test(s.run ?? "")) expect(i, s.name).toBeGreaterThan(gate);
    });
  });

  it("32. the host gate also exists inside both scripts, before any database access", () => {
    for (const [label, source] of [["inspector", inspectorSrc], ["provisioner", provisionerSrc]] as const) {
      const gate = source.indexOf("verifyExpectedDatabaseHost(args.");
      const connect = source.indexOf("await getDbInstance()");
      expect(gate, `${label} gate`).toBeGreaterThan(-1);
      expect(connect, `${label} connect`).toBeGreaterThan(-1);
      expect(gate, `${label} gate precedes connect`).toBeLessThan(connect);
    }
    // every script invocation in the workflow passes the expected host
    for (const s of steps.filter((x) => /\btsx\b/.test(x.run ?? ""))) {
      expect(s.run, s.name).toContain('--expected-database-host "$EXPECTED_DATABASE_HOST"');
    }
  });

  it("the test-environment host allowance is unreachable: the workflow never sets NODE_ENV or VITEST", () => {
    expect(functionalSrc).not.toMatch(/NODE_ENV|VITEST/);
  });
});

describe("provision-acceptance-fixture-operator.yml — read-only DISCOVER and DRY_RUN, mutating APPLY", () => {
  const dbSteps = () => steps.filter((s) => /\btsx\b/.test(s.run ?? ""));

  it("17. DISCOVER runs the inspector in a read-only Postgres session and requires it", () => {
    const s = steps[idx("DISCOVER -")];
    expect(s.env?.PGOPTIONS).toBe(READ_ONLY);
    expect(s.run).toContain("inspect-acceptance-fixture-operator-target.ts");
    expect(s.run).toContain("--require-read-only");
  });

  it("18. every DRY_RUN database step (pre-check, provisioner, re-inspect) is read-only", () => {
    for (const prefix of ["Pre-check -", "DRY_RUN - run the provisioner", "DRY_RUN - re-inspect"]) {
      const s = steps[idx(prefix)];
      expect(s.env?.PGOPTIONS, s.name).toBe(READ_ONLY);
    }
  });

  it("19. the DRY_RUN provisioner invocation has no --apply, --confirm or --revoke", () => {
    const s = steps[idx("DRY_RUN - run the provisioner")];
    expect(s.run).toContain("scripts/provision-acceptance-fixture-operator.ts");
    expect(s.run).not.toMatch(/--apply|--confirm|--revoke|--granted-by/);
  });

  it("DRY_RUN pins the workspace by re-resolving it and requiring exact equality", () => {
    const s = steps[idx("Pre-check -")];
    expect(s.run).toContain("PRIMARY_WORKSPACE_ID=");
    expect(s.run).toMatch(/"\$RESOLVED" != "\$WORKSPACE_ID"/);
    expect(s.run).toContain("exit 1");
  });

  it("DRY_RUN re-inspects after the preview and requires an identical state fingerprint (zero writes)", () => {
    const pre = idx("Pre-check -");
    const dry = idx("DRY_RUN - run the provisioner");
    const post = idx("DRY_RUN - re-inspect");
    expect(pre).toBeLessThan(dry);
    expect(dry).toBeLessThan(post);
    expect(steps[post].run).toMatch(/"\$BEFORE" != "\$AFTER"/);
    expect(steps[post].run).toContain("STATE_FINGERPRINT=");
    expect(steps[post].run).toContain("DRY_RUN_WRITES=0");
  });

  it("20. APPLY runs the provisioner with --apply and the exact phrase, and is NOT read-only", () => {
    const s = steps[idx("APPLY - run the provisioner")];
    expect(s.run).toContain("scripts/provision-acceptance-fixture-operator.ts");
    expect(s.run).toContain("--apply");
    expect(s.run).toContain('--confirm "GRANT ACCEPTANCE FIXTURE OPERATOR"');
    expect(s.env?.PGOPTIONS).toBeUndefined();
    expect(s.run).not.toContain("--revoke");
  });

  it("21. the modes are mutually exclusive: each mode-specific step is gated on exactly one mode", () => {
    const only = (prefix: string, mode: string) => expect(steps[idx(prefix)].if, prefix).toBe(`inputs.mode == '${mode}'`);
    only("DISCOVER -", "DISCOVER");
    only("DRY_RUN - run the provisioner", "DRY_RUN");
    only("DRY_RUN - re-inspect", "DRY_RUN");
    only("APPLY - run the provisioner", "APPLY");
    only("APPLY - verify", "APPLY");
    expect(steps[idx("Pre-check -")].if).toBe("inputs.mode == 'DRY_RUN' || inputs.mode == 'APPLY'");
    // the only step that can mutate is the one gated on APPLY alone
    for (const s of steps.filter((x) => /--apply/.test(x.run ?? ""))) expect(s.if).toBe("inputs.mode == 'APPLY'");
  });

  it("every database step other than the APPLY provisioner runs read-only", () => {
    for (const s of dbSteps()) {
      if (s.name?.startsWith("APPLY - run the provisioner")) continue;
      expect(s.env?.PGOPTIONS, s.name).toBe(READ_ONLY);
    }
  });

  it("APPLY refuses a pre-existing system_admin and verifies system_admin stays absent afterwards", () => {
    expect(steps[idx("Pre-check -")].run).toContain("SYSTEM_ADMIN=YES");
    expect(steps[idx("APPLY - verify")].run).toContain("SYSTEM_ADMIN=NO");
    expect(steps[idx("APPLY - verify")].run).toContain("ACCEPTANCE_FIXTURE_OPERATOR_IN_RESOLVED_WORKSPACE=YES");
  });

  it("24. no raw SQL, psql or Prisma command is embedded in the workflow", () => {
    expect(functionalSrc).not.toMatch(/\bpsql\b|\bprisma\b|\$executeRaw|\$queryRaw/);
    expect(functionalSrc).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT)\b\s+(\*|INTO|FROM|TABLE|[a-z_]+\s+SET)/);
  });
});

describe("scripts/inspect-acceptance-fixture-operator-target.ts — strictly read-only", () => {
  it("27. performs no mutation and emits no audit event", () => {
    expect(inspectorSrc).not.toMatch(/\b(db|tx|prisma)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
    expect(inspectorSrc).not.toMatch(/\$executeRaw|\$transaction|\$executeRawUnsafe|\$queryRawUnsafe/);
    expect(inspectorSrc).not.toMatch(/emitAuditEvent|auditEvent\.create/);
    const used = new Set(Array.from(inspectorSrc.matchAll(/\bdb\.([A-Za-z$]+)\.([A-Za-z]+)\(/g)).map((m) => `${m[1]}.${m[2]}`));
    expect([...used].sort()).toEqual(["auditEvent.count", "user.findUnique", "userRoleAssignment.findMany"]);
  });

  it("selects the target only from PRODUCTION_ACCEPTANCE_EMAIL; there is no --email argument", () => {
    expect(inspectorSrc).toContain('TARGET_EMAIL_ENV = "PRODUCTION_ACCEPTANCE_EMAIL"');
    expect(inspectorSrc).not.toMatch(/"--email"/);
    expect(inspectorSrc).not.toMatch(/--role|--user|--workspace-id/);
  });

  it("reuses the provisioner's host gate and workspace resolution rather than reimplementing them", () => {
    expect(inspectorSrc).toMatch(/import \{ verifyExpectedDatabaseHost, resolvePrimaryWorkspaceId \} from "\.\/provision-acceptance-fixture-operator"/);
    expect(inspectorSrc).not.toMatch(/workspaceMembership\./);
    expect(inspectorSrc).not.toMatch(/HOSTNAME_PATTERN|isValidExpectedHost/);
  });

  it("never prints the email, a connection string or credentials", () => {
    const logging = inspectorSrc.split("\n").filter((l) => /console\.(log|error)/.test(l)).join("\n");
    expect(logging).not.toMatch(/\bemail\b|DATABASE_URL|process\.env\b/);
    expect(inspectorSrc).toContain("redact(");
  });
});
