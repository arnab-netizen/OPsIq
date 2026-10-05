/**
 * A3 — Prisma destructive-command protection: mutation safety is POSITIVE, not label-based.
 *
 * Threat model: ACCIDENTAL / OPERATOR ERROR (a production URL left in DATABASE_URL, a stale shell, a copied
 * .env.local, an arbitrary remote URL labelled "local", a missing target, a CLI datasource override, the wrong
 * operation). It does not defend against a developer who deliberately edits the guard.
 *
 * Every URL here is SYNTHETIC. No real credential, host or database name appears in this file.
 */
import { describe, it, expect } from "vitest";
import {
  PRISMA_AUTHORIZATION_ENV_KEYS,
  PrismaDatasourceError,
  loadDotenvWithoutAuthorization,
  parsePrismaInvocation,
  resolvePrismaDatasource,
} from "@/infra/prisma-datasource";

const PROD_LIKE = "postgresql://prod-user:prod-secret@ep-synthetic-prod-1.invalid:5432/prod_db_name";
const REMOTE = "postgresql://rem-user:rem-secret@db.synthetic-remote.invalid:5432/remote_db_name";
const LOOPBACK = "postgresql://loc-user:loc-secret@127.0.0.1:5432/local_db_name";
const LOCALHOST = "postgresql://loc-user:loc-secret@localhost:5432/local_db_name";
const IPV6 = "postgresql://loc-user:loc-secret@[::1]:5432/local_db_name";
const SECRET_PARTS = [
  "prod-user", "prod-secret", "ep-synthetic-prod-1", "prod_db_name",
  "rem-user", "rem-secret", "synthetic-remote", "remote_db_name",
  "loc-user", "loc-secret", "local_db_name",
];

const argv = (...a: string[]) => ["node", "prisma", ...a];
const RESET = argv("migrate", "reset", "--force");
const DEPLOY = argv("migrate", "deploy");
const PUSH = argv("db", "push");
const run = (env: Record<string, string | undefined>, a = RESET) => resolvePrismaDatasource({ env, argv: a });
const message = (fn: () => unknown): string => {
  try { fn(); } catch (e) { const x = e as PrismaDatasourceError; return `${x.message} ${(x.notices ?? []).join(" ")}`; }
  return "";
};

describe("A–F. local mutation requires an explicit target and a positively local datasource", () => {
  it("A. no target + synthetic production-like DATABASE_URL + migrate reset → REFUSE", () => {
    expect(() => run({ DATABASE_URL: PROD_LIKE })).toThrow(/explicit OPSIQ_DB_TARGET/);
  });
  it("B. no target + arbitrary remote URL + migrate reset → REFUSE", () => {
    expect(() => run({ DATABASE_URL: REMOTE })).toThrow(/explicit OPSIQ_DB_TARGET/);
  });
  it("C. no target + LOCAL URL + migrate reset → REFUSE (target not explicit), with or without CI", () => {
    expect(() => run({ DATABASE_URL: LOOPBACK })).toThrow(/explicit OPSIQ_DB_TARGET/);
    expect(() => run({ DATABASE_URL: LOOPBACK, CI: "true" })).toThrow(/explicit OPSIQ_DB_TARGET/);
    expect(() => run({ DATABASE_URL: LOOPBACK, CI: "1" })).toThrow(/explicit OPSIQ_DB_TARGET/);
  });
  it("D. OPSIQ_DB_TARGET=local + loopback URL + migrate reset → ALLOW", () => {
    for (const url of [LOOPBACK, LOCALHOST, IPV6]) {
      const r = run({ OPSIQ_DB_TARGET: "local", DATABASE_URL: url });
      expect(r.target).toBe("local");
      expect(r.url).toBe(url);
      expect(r.mutating).toBe(true);
    }
  });
  it("E. OPSIQ_DB_TARGET=local + arbitrary remote URL + migrate reset → REFUSE", () => {
    expect(() => run({ OPSIQ_DB_TARGET: "local", DATABASE_URL: REMOTE })).toThrow(/requires a local datasource/);
  });
  it("F. OPSIQ_DB_TARGET=local + known production endpoint URL → REFUSE", () => {
    const env = { OPSIQ_DB_TARGET: "local", DATABASE_URL: PROD_LIKE, OPSIQ_PRODUCTION_DB_IDENTITIES: "ep-synthetic-prod-1" };
    expect(() => run(env)).toThrow(/requires a local datasource/);
  });
  it("a loopback URL that smuggles a different host via query parameters is not local", () => {
    expect(() => run({ OPSIQ_DB_TARGET: "local", DATABASE_URL: `${LOOPBACK}?host=db.synthetic-remote.invalid` })).toThrow(/requires a local datasource/);
    expect(() => run({ OPSIQ_DB_TARGET: "local", DATABASE_URL: `${LOCALHOST}?hostaddr=203.0.113.9` })).toThrow(/requires a local datasource/);
  });
  it("a dotted or numeric host is never accepted as a compose service name", () => {
    const env = { OPSIQ_DB_TARGET: "local", OPSIQ_LOCAL_DB_EXTRA_HOSTS: "db.synthetic-remote.invalid,203.0.113.9,postgres" };
    expect(() => run({ ...env, DATABASE_URL: REMOTE })).toThrow(/requires a local datasource/);
    expect(() => run({ ...env, DATABASE_URL: "postgresql://u:p@203.0.113.9:5432/d" })).toThrow(/requires a local datasource/);
    // A single-label compose service the operator explicitly listed IS local.
    expect(run({ ...env, DATABASE_URL: "postgresql://u:p@postgres:5432/d" }).target).toBe("local");
    // ...but only when listed.
    expect(() => run({ OPSIQ_DB_TARGET: "local", DATABASE_URL: "postgresql://u:p@postgres:5432/d" })).toThrow(/requires a local datasource/);
  });
});

describe("G–H. CI and remote test mutation", () => {
  it("G. OPSIQ_DB_TARGET=ci + the real CI-local shape → ALLOW; CI=true alone grants nothing", () => {
    const r = run({ OPSIQ_DB_TARGET: "ci", CI: "true", DATABASE_URL: LOCALHOST }, DEPLOY);
    expect(r.target).toBe("ci");
    expect(() => run({ OPSIQ_DB_TARGET: "ci", CI: "true", DATABASE_URL: REMOTE }, DEPLOY)).toThrow(/requires a local datasource/);
    expect(() => run({ CI: "true", DATABASE_URL: LOCALHOST }, DEPLOY)).toThrow(/explicit OPSIQ_DB_TARGET/);
  });

  it("H. remote TEST mutation is only possible after the approved-test-identity check, and only for permitted operations", () => {
    const env = { OPSIQ_DB_TARGET: "test", TEST_DATABASE_URL: REMOTE };
    const r = run(env, DEPLOY);
    expect(r.target).toBe("test");
    expect(r.requiresApprovedTestIdentity).toBe(true); // prisma.config.ts must verify identity before Prisma runs
    // Loopback test databases need no remote identity check.
    expect(run({ OPSIQ_DB_TARGET: "test", TEST_DATABASE_URL: LOOPBACK }, DEPLOY).requiresApprovedTestIdentity).toBe(false);
    // Interactive / dropping operations are never run against a remote test database.
    for (const a of [argv("migrate", "reset"), argv("migrate", "dev"), argv("studio"), argv("db", "seed")]) {
      expect(() => run(env, a)).toThrow(/not permitted against a remote test datasource/);
    }
    // A known production endpoint labelled test is refused before any connection.
    expect(() => run({ ...env, TEST_DATABASE_URL: PROD_LIKE, OPSIQ_PRODUCTION_DB_IDENTITIES: "ep-synthetic-prod-1" }, DEPLOY)).toThrow(/known production endpoint/);
    // Not a well-formed postgres URL → refused.
    expect(() => run({ ...env, TEST_DATABASE_URL: "mysql://x@y/z" }, DEPLOY)).toThrow(/not a well-formed postgres URL/);
  });
});

describe("I–Q. production", () => {
  const auth = {
    OPSIQ_DB_TARGET: "production",
    OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true",
    OPSIQ_PRODUCTION_OPERATION: "migrate deploy",
    MIGRATION_DATABASE_URL: PROD_LIKE,
  };
  it("I. production + correct flags + migrate deploy → ALLOW", () => {
    const r = run(auth, DEPLOY);
    expect(r.target).toBe("production-authorized");
    expect(r.url).toBe(PROD_LIKE);
  });
  it("J. production + missing authorization flag → REFUSE", () => {
    const { OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: _omit, ...rest } = auth;
    void _omit;
    expect(() => run(rest, DEPLOY)).toThrow(/requires OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true/);
  });
  it("K. production + missing operation declaration → REFUSE", () => {
    const { OPSIQ_PRODUCTION_OPERATION: _omit, ...rest } = auth;
    void _omit;
    expect(() => run(rest, DEPLOY)).toThrow(/requires OPSIQ_PRODUCTION_OPERATION/);
  });
  it("L. authorization for migrate deploy cannot run another operation", () => {
    expect(() => run(auth, argv("migrate", "reset"))).toThrow(/never permitted against production/);
    expect(() => run(auth, argv("migrate", "unknown-subcommand"))).toThrow(/does not match the operation being run/);
  });
  it.each([
    ["M", ["migrate", "reset", "--force"]],
    ["N", ["migrate", "dev"]],
    ["O", ["db", "push", "--force-reset", "--accept-data-loss"]],
    ["P", ["db", "execute", "--stdin"]],
    ["Q", ["studio"]],
    ["–", ["db", "seed"]],
    ["–", ["migrate", "resolve", "--applied", "x"]],
  ])("%s. production + %j → REFUSE ALWAYS (even declared as itself, even with every flag)", (_n, a) => {
    const op = a.slice(0, a[0] === "studio" ? 1 : 2).join(" ");
    expect(() => run({ ...auth, OPSIQ_PRODUCTION_OPERATION: op }, argv(...a))).toThrow(/never permitted against production/);
    expect(() => run(auth, argv(...a))).toThrow(PrismaDatasourceError);
  });
  it("production read-only status needs only the read authorization pair", () => {
    const r = run({ OPSIQ_DB_TARGET: "production", OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true", MIGRATION_DATABASE_URL: PROD_LIKE }, argv("migrate", "status"));
    expect(r.mutating).toBe(false);
    expect(r.url).toBe(PROD_LIKE);
  });
});

describe("R–S, U. datasource and config overrides on a mutating command", () => {
  const local = { OPSIQ_DB_TARGET: "local", DATABASE_URL: LOOPBACK };
  it("R. `db push --url <remote>` → REFUSE", () => {
    expect(() => run(local, argv("db", "push", "--url", REMOTE))).toThrow(/datasource-URL flag/);
  });
  it("S. `db push --url=<remote>` → REFUSE", () => {
    expect(() => run(local, argv("db", "push", `--url=${REMOTE}`))).toThrow(/datasource-URL flag/);
  });
  it("--url / related flags are refused on every mutating operation and before the command too", () => {
    for (const flag of ["--url", "--shadow-database-url", "--from-url", "--to-url"]) {
      expect(() => run(local, argv("migrate", "deploy", flag, REMOTE))).toThrow(/datasource-URL flag/);
      expect(() => run(local, argv(flag, REMOTE, "migrate", "reset"))).toThrow(/datasource-URL flag/);
      expect(() => run(local, argv("migrate", "reset", `${flag}=${REMOTE}`))).toThrow(/datasource-URL flag/);
    }
  });
  it("--url on a READ-ONLY command is not refused (no mutation)", () => {
    expect(() => run(local, argv("migrate", "diff", "--from-url", REMOTE, "--to-schema-datamodel", "prisma/schema.prisma"))).not.toThrow();
  });
  it("U. an alternate --config on a governed mutating entrypoint → REFUSE; this repository's own config is fine", () => {
    expect(() => run(local, argv("migrate", "deploy", "--config", "other.config.ts"))).toThrow(/--config/);
    expect(() => run(local, argv("migrate", "deploy", "--config=ungoverned/prisma.config.ts"))).toThrow(/--config/);
    expect(run(local, argv("migrate", "deploy", "--config", "prisma.config.ts")).target).toBe("local");
    expect(run(local, argv("migrate", "deploy", "--config=./prisma.config.ts")).target).toBe("local");
  });
  it("refusals about --url never echo its value", () => {
    const m = message(() => run(local, argv("db", "push", "--url", REMOTE)));
    expect(m).toMatch(/datasource-URL flag/);
    for (const part of SECRET_PARTS) expect(m).not.toContain(part);
  });
});

describe("T. parsing: flags before/after the operation, --flag=value and --flag value", () => {
  it.each([
    [["--schema", "prisma/schema.prisma", "migrate", "reset"], "migrate reset", true],
    [["--schema=prisma/schema.prisma", "migrate", "reset"], "migrate reset", true],
    [["migrate", "reset", "--schema", "prisma/schema.prisma", "--force"], "migrate reset", true],
    [["--config", "prisma.config.ts", "db", "push"], "db push", true],
    [["--schema", "a.prisma", "--config", "prisma.config.ts", "migrate", "deploy"], "migrate deploy", true],
    [["db", "--schema", "x.prisma", "push"], "db push", true],
    [["--schema", "x.prisma", "validate"], "validate", false],
    [["generate", "--schema", "x.prisma"], "generate", false],
    [["migrate", "status", "--schema=x.prisma"], "migrate status", false],
    [["--version"], "", false],
    [[], "", false],
  ])("%j → %s (mutating=%s)", (a, op, mutating) => {
    const p = parsePrismaInvocation(argv(...(a as string[])));
    expect(p.operation).toBe(op);
    expect(p.mutating).toBe(mutating);
  });
  it("fails closed: an unknown value-taking flag cannot hide a mutation", () => {
    for (const a of [
      ["--some-new-flag", "value", "migrate", "reset"],
      ["--some-new-flag", "validate", "migrate", "reset"],
      ["--some-new-flag=value", "db", "push"],
    ]) {
      expect(parsePrismaInvocation(argv(...a)).mutating).toBe(true);
    }
  });
  it("fails closed: unknown subcommands and unrecognised commands are mutation-capable", () => {
    for (const a of [["migrate"], ["db"], ["migrate", "squash"], ["db", "drop"], ["dev"], ["frobnicate"]]) {
      expect(parsePrismaInvocation(argv(...a)).mutating, a.join(" ")).toBe(true);
    }
  });
  it("classification: read/schema-only versus mutating", () => {
    for (const a of [["generate"], ["validate"], ["format"], ["migrate", "status"], ["migrate", "diff"], ["db", "pull"]]) {
      expect(parsePrismaInvocation(argv(...a)).mutating, a.join(" ")).toBe(false);
    }
    for (const a of [["migrate", "dev"], ["migrate", "deploy"], ["migrate", "reset"], ["migrate", "resolve"], ["db", "push"], ["db", "execute"], ["db", "seed"], ["studio"]]) {
      expect(parsePrismaInvocation(argv(...a)).mutating, a.join(" ")).toBe(true);
    }
  });
});

describe("V–W. schema-only commands keep working with nothing configured", () => {
  it("validate and generate resolve a safe placeholder datasource", () => {
    for (const a of [argv("validate"), argv("generate"), argv("--schema", "x.prisma", "validate")]) {
      expect(() => run({}, a)).not.toThrow();
      expect(run({ CI: "true" }, a).mutating).toBe(false);
    }
  });
});

describe("X. refusal output contains no URL, host, username, password or database name", () => {
  const cases: Array<[string, Record<string, string>, string[]]> = [
    ["no target, prod-like", { DATABASE_URL: PROD_LIKE }, RESET],
    ["local label, remote", { OPSIQ_DB_TARGET: "local", DATABASE_URL: REMOTE }, RESET],
    ["ci label, remote", { OPSIQ_DB_TARGET: "ci", DATABASE_URL: REMOTE }, DEPLOY],
    ["test label, prod-like", { OPSIQ_DB_TARGET: "test", TEST_DATABASE_URL: PROD_LIKE, OPSIQ_PRODUCTION_DB_IDENTITIES: "ep-synthetic-prod-1" }, DEPLOY],
    ["staging, unapproved", { OPSIQ_DB_TARGET: "staging", DATABASE_URL: REMOTE }, DEPLOY],
    ["production, no flag", { OPSIQ_DB_TARGET: "production", MIGRATION_DATABASE_URL: PROD_LIKE }, DEPLOY],
    ["production, forbidden", { OPSIQ_DB_TARGET: "production", OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true", MIGRATION_DATABASE_URL: PROD_LIKE }, RESET],
    ["production, undeclared", { OPSIQ_DB_TARGET: "production", OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true", MIGRATION_DATABASE_URL: PROD_LIKE }, DEPLOY],
    ["--url", { OPSIQ_DB_TARGET: "local", DATABASE_URL: LOOPBACK }, argv("db", "push", `--url=${REMOTE}`)],
  ];
  it.each(cases)("%s", (_label, env, a) => {
    const m = message(() => run(env, a));
    expect(m).not.toBe("");
    for (const part of SECRET_PARTS) expect(m).not.toContain(part);
  });
});

describe("staging: positive endpoint identity, direct endpoint only, deploy only", () => {
  const stg = "postgresql://s-user:s-pass@ep-synthetic-stg-1.invalid:5432/app";
  const env = { OPSIQ_DB_TARGET: "staging", DATABASE_URL: stg, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "ep-synthetic-stg-1" };
  it("accepts an approved direct endpoint for migrate deploy only", () => {
    expect(run(env, DEPLOY).target).toBe("staging");
    for (const a of [RESET, PUSH, argv("migrate", "resolve"), argv("db", "execute")]) {
      expect(() => run(env, a)).toThrow(/not permitted against a staging datasource/);
    }
  });
  it("refuses an unapproved endpoint, a pooler endpoint and an unset list", () => {
    expect(() => run({ ...env, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "ep-other" }, DEPLOY)).toThrow(/not listed/);
    expect(() => run({ ...env, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: undefined }, DEPLOY)).toThrow(/not listed/);
    const pooled = "postgresql://u:p@ep-synthetic-stg-1-pooler.invalid:5432/app";
    expect(() => run({ ...env, DATABASE_URL: pooled, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "ep-synthetic-stg-1-pooler" }, DEPLOY)).toThrow(/non-pooler/);
  });
});

describe("copied / stale .env.local cannot supply mutation authorization", () => {
  it("authorization variables a dotenv loader introduces are discarded; connection strings are kept", () => {
    const env: Record<string, string | undefined> = {};
    loadDotenvWithoutAuthorization(env, () => {
      env.DATABASE_URL = LOOPBACK;
      for (const k of PRISMA_AUTHORIZATION_ENV_KEYS) env[k] = "production";
    });
    expect(env.DATABASE_URL).toBe(LOOPBACK);
    for (const k of PRISMA_AUTHORIZATION_ENV_KEYS) expect(env[k]).toBeUndefined();
    // So the command still has no explicit target and is refused.
    expect(() => run(env, DEPLOY)).toThrow(/explicit OPSIQ_DB_TARGET/);
  });
  it("authorization the invoking environment already had is preserved and cannot be overridden by the file", () => {
    const env: Record<string, string | undefined> = { OPSIQ_DB_TARGET: "local", DATABASE_URL: LOOPBACK };
    loadDotenvWithoutAuthorization(env, () => {
      env.OPSIQ_DB_TARGET = "production";
      env.OPSIQ_ALLOW_PRODUCTION_DB_COMMAND = "true";
    });
    expect(env.OPSIQ_DB_TARGET).toBe("local");
    expect(env.OPSIQ_ALLOW_PRODUCTION_DB_COMMAND).toBeUndefined();
  });
});
