/**
 * No-database tests for scripts/inspect-acceptance-fixture-operator-target.ts: the pure helpers, and the
 * fail-closed gates that must refuse BEFORE any database connection is opened.
 *
 * The subprocess runs with VITEST and NODE_ENV removed so it behaves like the production workflow run: in
 * particular the provisioner's test-only single-label host allowance is unreachable.
 *
 * DB-backed behaviour (user/workspace/role resolution, read-only proof) lives in
 * inspect-acceptance-fixture-operator-target.db.test.ts.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import path from "path";
import {
  parseInspectorArgs,
  sanitizeUserId,
  redact,
  renderInspection,
  InspectionError,
  type TargetInspection,
} from "../../../scripts/inspect-acceptance-fixture-operator-target";

const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/inspect-acceptance-fixture-operator-target.ts");
const SECRET_PASSWORD = "s3cr3t-pw-do-not-print";
const SECRET_EMAIL = "acceptance-secret-account@example.com";
const UNROUTABLE_HOST = "db.production-gate-test.invalid";
const UNROUTABLE_URL = `postgresql://app_user:${SECRET_PASSWORD}@${UNROUTABLE_HOST}:5432/neondb?sslmode=require`;

function productionLikeEnv(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of ["VITEST", "VITEST_WORKER_ID", "VITEST_POOL_ID", "NODE_ENV", "TEST_DATABASE_URL", "DATABASE_URL", "PRODUCTION_ACCEPTANCE_EMAIL", "PGOPTIONS"]) {
    delete env[key];
  }
  for (const [key, value] of Object.entries(extra)) if (value !== undefined) env[key] = value;
  return env;
}

function runInspector(args: string[], extra: Record<string, string | undefined>): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("npx", ["tsx", SCRIPT_PATH, ...args], { encoding: "utf8", env: productionLikeEnv(extra), timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (error: unknown) {
    const e = error as { status?: unknown; stdout?: unknown; stderr?: unknown };
    return { status: typeof e.status === "number" ? e.status : 1, stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? "") };
  }
}

const baseInspection: TargetInspection = {
  userIdSanitized: "3f2a9c1b…77de",
  primaryWorkspaceId: "11111111-2222-4333-8444-555555555555",
  activeRoles: ["owner_scoped"],
  systemAdmin: false,
  acceptanceFixtureOperator: false,
  acceptanceFixtureOperatorInResolvedWorkspace: false,
  acceptanceFixtureOperatorRevokedRow: false,
  roleAssignmentRows: 1,
  acceptanceRoleAssignmentRows: 0,
  roleAssignmentAuditEvents: 0,
};

describe("inspector helpers", () => {
  it("sanitizes a user id to a recognisable stub, never the full id", () => {
    const id = "3f2a9c1b-0d4e-4f6a-8b7c-1234567877de";
    const out = sanitizeUserId(id);
    expect(out).toBe("3f2a9c1b…77de");
    expect(out).not.toContain(id.slice(9, 23));
    expect(sanitizeUserId("short")).toBe("…");
  });

  it("redacts any URL from a message, including driver errors that quote a connection string", () => {
    const out = redact(`connect failed for postgresql://user:${SECRET_PASSWORD}@host.example.com:5432/db (retry) and https://x.example/y?z=1`);
    expect(out).not.toContain(SECRET_PASSWORD);
    expect(out).not.toContain("host.example.com");
    expect(out).toContain("<redacted-url>");
  });

  it("accepts only --expected-database-host and --require-read-only", () => {
    expect(parseInspectorArgs(["--expected-database-host", "ep-a.us-east-2.aws.neon.tech", "--require-read-only"])).toEqual({
      expectedDatabaseHost: "ep-a.us-east-2.aws.neon.tech",
      requireReadOnly: true,
    });
    expect(parseInspectorArgs([])).toEqual({ requireReadOnly: false });
  });

  it.each([["--email", "x@example.com"], ["--role", "system_admin"], ["--workspace-id", "w"], ["--apply"], ["--user", "u"]])(
    "rejects %s: the target cannot be selected by argument",
    (...argv) => {
      expect(() => parseInspectorArgs(argv)).toThrow(InspectionError);
    }
  );

  it("renders deterministic KEY=VALUE lines ending in a fingerprint, and never an email", () => {
    const a = renderInspection(baseInspection);
    const b = renderInspection({ ...baseInspection });
    expect(a).toEqual(b);
    expect(a[a.length - 1]).toMatch(/^STATE_FINGERPRINT=[0-9a-f]{16}$/);
    expect(a).toContain("SYSTEM_ADMIN=NO");
    expect(a).toContain("ACCEPTANCE_FIXTURE_OPERATOR=NO");
    expect(a.join("\n")).not.toMatch(/@/);
  });

  it("the fingerprint changes when any observable state changes", () => {
    const fingerprint = (i: TargetInspection) => renderInspection(i).at(-1);
    const base = fingerprint(baseInspection);
    expect(fingerprint({ ...baseInspection, systemAdmin: true })).not.toBe(base);
    expect(fingerprint({ ...baseInspection, acceptanceFixtureOperator: true })).not.toBe(base);
    expect(fingerprint({ ...baseInspection, acceptanceFixtureOperatorRevokedRow: true })).not.toBe(base);
    expect(fingerprint({ ...baseInspection, roleAssignmentRows: 2 })).not.toBe(base);
    expect(fingerprint({ ...baseInspection, acceptanceRoleAssignmentRows: 1 })).not.toBe(base);
    expect(fingerprint({ ...baseInspection, roleAssignmentAuditEvents: 1 })).not.toBe(base);
    expect(fingerprint({ ...baseInspection, activeRoles: ["owner_scoped", "beta_request_operator"] })).not.toBe(base);
  });
});

describe("inspector fail-closed gates (subprocess, production-like environment)", () => {
  const env = { DATABASE_URL: UNROUTABLE_URL, PRODUCTION_ACCEPTANCE_EMAIL: SECRET_EMAIL };
  const everything = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;
  const neverLeaks = (r: { stdout: string; stderr: string }) => {
    expect(everything(r)).not.toContain(SECRET_PASSWORD);
    expect(everything(r)).not.toContain(SECRET_EMAIL);
    expect(everything(r)).not.toContain("app_user");
    expect(everything(r)).not.toMatch(/postgres(ql)?:\/\//);
  };
  // reaching the database would have printed this line first
  const neverReachedDatabase = (r: { stdout: string }) => expect(r.stdout).not.toContain("DB_SESSION_READ_ONLY");

  it("a MISSING expected host fails before any database access", () => {
    const r = runInspector([], env);
    expect(r.status).toBe(1);
    expect(everything(r)).toContain("--expected-database-host");
    neverReachedDatabase(r);
    neverLeaks(r);
  });

  it("a MALFORMED expected host (a URL with credentials) fails before any database access and is not echoed", () => {
    const r = runInspector(["--expected-database-host", `postgresql://u:${SECRET_PASSWORD}@${UNROUTABLE_HOST}/db`], env);
    expect(r.status).toBe(1);
    neverReachedDatabase(r);
    neverLeaks(r);
  });

  it.each(["", "bad host", "ep-a.neon.tech/extra", "ep-a.neon.tech?x=1", "ep-a.neon.tech#frag", "user@ep-a.neon.tech", "ep-a.neon.tech;rm -rf"])(
    "a malformed expected host %j fails closed",
    (host) => {
      const r = runInspector(["--expected-database-host", host], env);
      expect(r.status).toBe(1);
      neverReachedDatabase(r);
      neverLeaks(r);
    }
  );

  it("a bare single-label host such as localhost is rejected in a production-like run (the test allowance is unreachable)", () => {
    const r = runInspector(["--expected-database-host", "localhost"], { ...env, DATABASE_URL: "postgresql://u:p@localhost:5432/db" });
    expect(r.status).toBe(1);
    neverReachedDatabase(r);
  });

  it("a WRONG host fails before any database access and prints only the two bare hostnames", () => {
    const r = runInspector(["--expected-database-host", "some-other-project.us-east-2.aws.neon.tech"], env);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("MATCH=NO");
    expect(r.stdout).toContain(`Actual database host: ${UNROUTABLE_HOST}`);
    expect(everything(r)).toContain("Refusing before any database connection");
    neverReachedDatabase(r);
    neverLeaks(r);
  });

  it("an unparseable DATABASE_URL fails closed", () => {
    const r = runInspector(["--expected-database-host", "ep-a.us-east-2.aws.neon.tech"], { ...env, DATABASE_URL: "not a url" });
    expect(r.status).toBe(1);
    neverReachedDatabase(r);
  });

  it("a missing PRODUCTION_ACCEPTANCE_EMAIL fails closed before any database access (the target is fixed by the secret)", () => {
    const r = runInspector(["--expected-database-host", UNROUTABLE_HOST], { DATABASE_URL: UNROUTABLE_URL });
    expect(r.status).toBe(1);
    expect(everything(r)).toContain("PRODUCTION_ACCEPTANCE_EMAIL");
    neverReachedDatabase(r);
    neverLeaks(r);
  });

  it("an --email argument is rejected: an account cannot be selected on the command line", () => {
    const r = runInspector(["--expected-database-host", UNROUTABLE_HOST, "--email", "someone-else@example.com"], env);
    expect(r.status).toBe(1);
    expect(everything(r)).toContain("Unknown argument");
    neverReachedDatabase(r);
  });
});
