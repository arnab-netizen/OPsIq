/**
 * Production isolation for the remote TEST database path.
 *
 * Invariant: no test suite can run DB-mutating tests against the production database, even when
 * TEST_DATABASE_URL, DATABASE_URL_TEST or DATABASE_URL is accidentally configured with production credentials AND
 * OPSIQ_ALLOW_REMOTE_TEST_DB=true is set. "Remote opt-in" means "a remote NON-PRODUCTION database".
 *
 * Every URL here is SYNTHETIC (fake credentials). The production-shaped URLs carry the real production endpoint id
 * only so the identity comparison is exercised; nothing in this file ever connects to anything — runtime identity is
 * read through an injected fake reader.
 */
import { describe, it, expect, vi } from "vitest";
import {
  NO_DB_TEST_DATABASE_URL,
  REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION,
  REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE,
  TestDatabaseGuardError,
  remoteDatabaseVariables,
  resolveTestDatabase,
  verifyRemoteTestDatabaseIdentity,
  type DatabaseIdentityReader,
} from "@/infra/test-database-guard";
import {
  PRODUCTION_DB_ENDPOINT_IDS,
  PRODUCTION_NEON_BRANCH_IDS,
  classifyDatabaseIdentity,
  classifyRemoteDatabaseUrl,
  effectiveDatabaseHostname,
  APPROVED_TEST_NEON_BRANCH_IDS,
} from "@/infra/production-db-identity";

const PROD_ENDPOINT = PRODUCTION_DB_ENDPOINT_IDS[0];
const PROD_BRANCH = PRODUCTION_NEON_BRANCH_IDS[0];
const REGION = "c-5.us-east-2.aws.neon.tech";

/** Synthetic production-shaped URLs: fake credentials, production endpoint id, every hostname variant. */
const PROD_URL = `postgresql://synthuser:synthpass@${PROD_ENDPOINT}.${REGION}/neondb?sslmode=require`;
const PROD_POOLER_URL = `postgresql://synthuser:synthpass@${PROD_ENDPOINT}-pooler.${REGION}/neondb?sslmode=require`;
const PROD_COMPUTE_URL = `postgresql://synthuser:synthpass@${PROD_ENDPOINT}-wb0.${REGION}/neondb`;
const PROD_COMPUTE_POOLER_URL = `postgresql://synthuser:synthpass@${PROD_ENDPOINT}-wb0-pooler.${REGION}/neondb`;
const PROD_UPPER_URL = `postgresql://synthuser:synthpass@${PROD_ENDPOINT.toUpperCase()}.${REGION.toUpperCase()}/neondb`;
const PROD_TRAILING_DOT_URL = `postgresql://synthuser:synthpass@${PROD_ENDPOINT}.${REGION}./neondb`;
const PROD_ENCODED_URL = `postgresql://synthuser:synthpass@${PROD_ENDPOINT.replace(/-/g, "%2D")}.${REGION}/neondb`;
const PROD_REPLICA_URL = `postgresql://synthuser:synthpass@${PRODUCTION_DB_ENDPOINT_IDS[1]}.${REGION}/neondb`;

/** A legitimate remote TEST database (synthetic, non-production endpoint). */
const TEST_URL = "postgresql://testuser:testpass@ep-test-sandbox-aa11bb22.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require";
const LOCAL = "postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public";

const REMOTE_OPT_IN = { TEST_WITH_DB: "true", OPSIQ_ALLOW_REMOTE_TEST_DB: "true" } as const;

function refusal(env: Record<string, string>): TestDatabaseGuardError {
  try {
    resolveTestDatabase(env);
  } catch (e) {
    expect(e).toBeInstanceOf(TestDatabaseGuardError);
    return e as TestDatabaseGuardError;
  }
  throw new Error("expected the guard to refuse");
}

/** Substrings that must never appear in any refusal message (URL, host, user, password, database name). */
const SECRET_FRAGMENTS = ["synthuser", "synthpass", "testuser", "testpass", "neon.tech", "neondb", PROD_ENDPOINT, "ep-test-sandbox", "postgresql://"];

describe("1–3. baseline modes are unchanged", () => {
  it("non-DB mode ignores every inherited database URL (even production-shaped ones with the opt-in set)", () => {
    const r = resolveTestDatabase({
      OPSIQ_ALLOW_REMOTE_TEST_DB: "true",
      DATABASE_URL: PROD_URL,
      TEST_DATABASE_URL: PROD_URL,
      DATABASE_URL_TEST: PROD_URL,
    });
    expect(r).toEqual({ mode: "no-db", databaseUrl: NO_DB_TEST_DATABASE_URL, target: "no-db-placeholder" });
  });

  it("a loopback throwaway database is accepted", () => {
    expect(resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: LOCAL }).target).toBe("loopback");
  });

  it("a remote database is refused without the remote opt-in", () => {
    expect(() => resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: TEST_URL })).toThrow(/non-loopback/);
  });
});

describe("4. a legitimate remote TEST database still works", () => {
  it("is accepted statically with the opt-in", () => {
    expect(resolveTestDatabase({ ...REMOTE_OPT_IN, DATABASE_URL: TEST_URL, TEST_DATABASE_URL: TEST_URL }).target).toBe("remote-test-opt-in");
  });

  it("passes the runtime identity layer when the database reports the approved TEST branch", async () => {
    const reader: DatabaseIdentityReader = async () => ({ endpoint_id: "ep-test-sandbox-aa11bb22", project_id: "proj-test", branch_id: APPROVED_TEST_NEON_BRANCH_IDS[0] });
    await expect(
      verifyRemoteTestDatabaseIdentity(remoteDatabaseVariables({ DATABASE_URL: TEST_URL }), {}, reader)
    ).resolves.toBeUndefined();
  });

  it("a different branch of the production project is not production but is NOT authorized either", () => {
    expect(classifyDatabaseIdentity({ endpointId: "ep-test-branch-cc33dd44", projectId: "any-project", branchId: "br-disposable-xyz" })).toBe("not-authorized");
  });
});

describe("5. production is rejected even with the remote opt-in", () => {
  it.each([
    ["direct", PROD_URL],
    ["pooler", PROD_POOLER_URL],
    ["compute host", PROD_COMPUTE_URL],
    ["compute pooler host", PROD_COMPUTE_POOLER_URL],
    ["upper-case hostname", PROD_UPPER_URL],
    ["trailing-dot FQDN", PROD_TRAILING_DOT_URL],
    ["percent-encoded hostname (pg decodes it)", PROD_ENCODED_URL],
    ["read replica endpoint of the production branch", PROD_REPLICA_URL],
  ])("%s", (_label, url) => {
    const e = refusal({ ...REMOTE_OPT_IN, DATABASE_URL: url });
    expect(e.message).toContain(REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION);
  });

  it("production authorization flags are rejected regardless of the URL", () => {
    expect(() => resolveTestDatabase({ ...REMOTE_OPT_IN, DATABASE_URL: TEST_URL, OPSIQ_DB_TARGET: "production" })).toThrow(/production/);
    expect(() => resolveTestDatabase({ ...REMOTE_OPT_IN, DATABASE_URL: TEST_URL, OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true" })).toThrow(/production/);
  });
});

describe("6–8. production credentials cannot ride through any variable", () => {
  it("DATABASE_URL production + TEST_DATABASE_URL test: refused", () => {
    expect(refusal({ ...REMOTE_OPT_IN, DATABASE_URL: PROD_URL, TEST_DATABASE_URL: TEST_URL }).message).toContain("DATABASE_URL");
  });

  it("DATABASE_URL test + TEST_DATABASE_URL production: refused, naming TEST_DATABASE_URL", () => {
    const e = refusal({ ...REMOTE_OPT_IN, DATABASE_URL: TEST_URL, TEST_DATABASE_URL: PROD_URL });
    expect(e.message).toContain(REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION);
    expect(e.message).toContain("TEST_DATABASE_URL");
  });

  it("DATABASE_URL_TEST production is refused even when DATABASE_URL is a legitimate test database", () => {
    const e = refusal({ ...REMOTE_OPT_IN, DATABASE_URL: TEST_URL, DATABASE_URL_TEST: PROD_POOLER_URL });
    expect(e.message).toContain("DATABASE_URL_TEST");
  });

  it("a loopback DATABASE_URL does not mask a production sibling variable", () => {
    expect(() => resolveTestDatabase({ ...REMOTE_OPT_IN, DATABASE_URL: LOCAL, TEST_DATABASE_URL: PROD_URL })).toThrow(TestDatabaseGuardError);
  });
});

describe("10–11. malformed and override-bearing URLs are refused (fail closed)", () => {
  it.each([
    ["not a url"],
    ["postgresql:///opsiq"], // empty host: pg would fall back to PGHOST / a unix socket
    ["postgresql://u:p@host-a.invalid,host-b.invalid/db"], // multi-host
    ["mysql://u:p@db.invalid/db"],
    ["socket://u:p@db.invalid/tmp/sock?db=x"],
    [`postgresql://u:p@ep-test-sandbox-aa11bb22.c-6.us-east-1.aws.neon.tech/db?host=${PROD_ENDPOINT}.${REGION}`], // host= override to production
    ["postgresql://u:p@db.invalid/db?hostaddr=203.0.113.9"],
    ["postgresql://u:p@db.invalid/db?HOST=/cloudsql/proj:region:instance"],
  ])("%s", (url) => {
    const e = refusal({ ...REMOTE_OPT_IN, DATABASE_URL: url });
    expect(e.message).toMatch(/REMOTE_TEST_DB_IDENTITY_(UNVERIFIABLE|REJECTED_PRODUCTION)/);
  });

  it("effectiveDatabaseHostname returns null for anything pg could connect to elsewhere", () => {
    expect(effectiveDatabaseHostname("postgresql://u:p@db.invalid/db?host=other.invalid")).toBeNull();
    expect(effectiveDatabaseHostname("postgresql://u:p@db.invalid/db?hostaddr=1.2.3.4")).toBeNull();
    expect(effectiveDatabaseHostname("postgresql:///db")).toBeNull();
    expect(effectiveDatabaseHostname("postgresql://u:p@%ZZ.invalid/db")).toBeNull();
    expect(effectiveDatabaseHostname("postgresql://u:p@DB.Invalid./db")).toBe("db.invalid");
  });
});

describe("12. no secret appears in any refusal", () => {
  const cases: Record<string, string>[] = [
    { ...REMOTE_OPT_IN, DATABASE_URL: PROD_URL },
    { ...REMOTE_OPT_IN, DATABASE_URL: PROD_POOLER_URL, TEST_DATABASE_URL: TEST_URL },
    { ...REMOTE_OPT_IN, DATABASE_URL: TEST_URL, DATABASE_URL_TEST: PROD_ENCODED_URL },
    { ...REMOTE_OPT_IN, DATABASE_URL: "postgresql:///neondb" },
    { ...REMOTE_OPT_IN, DATABASE_URL: "postgresql://synthuser:synthpass@db.invalid/neondb?host=elsewhere.invalid" },
  ];
  it.each(cases.map((c, i) => [i, c] as const))("static refusal #%s", (_i, env) => {
    const message = refusal(env as Record<string, string>).message;
    for (const fragment of SECRET_FRAGMENTS) expect(message, fragment).not.toContain(fragment);
  });

  it("runtime refusals (production / unreadable / reader error) carry no URL, host or identity value", async () => {
    const readers: DatabaseIdentityReader[] = [
      async () => ({ endpoint_id: PROD_ENDPOINT, project_id: "p", branch_id: "b" }),
      async () => ({ endpoint_id: null, project_id: null, branch_id: null }),
      async () => {
        throw new Error(`connect ECONNREFUSED ${PROD_ENDPOINT}.${REGION} synthuser`);
      },
    ];
    for (const reader of readers) {
      let message = "";
      try {
        await verifyRemoteTestDatabaseIdentity(remoteDatabaseVariables({ TEST_DATABASE_URL: TEST_URL }), {}, reader);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/REMOTE_TEST_DB_IDENTITY_/);
      for (const fragment of [...SECRET_FRAGMENTS, "ECONNREFUSED", PROD_BRANCH]) expect(message, fragment).not.toContain(fragment);
    }
  });
});

describe("runtime identity layer (hostname-independent)", () => {
  const run = (row: Record<string, unknown> | null | undefined, env: Record<string, string> = {}) =>
    verifyRemoteTestDatabaseIdentity(remoteDatabaseVariables({ TEST_DATABASE_URL: TEST_URL }), env, async () => row);

  it("rejects the production ENDPOINT even when the connecting hostname looked benign", async () => {
    await expect(run({ endpoint_id: PROD_ENDPOINT, project_id: "p", branch_id: "br-other" })).rejects.toThrow(REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION);
  });

  it("rejects the production BRANCH even through a different endpoint (another endpoint on the production branch)", async () => {
    await expect(run({ endpoint_id: "ep-brand-new-endpoint-99887766", project_id: "p", branch_id: PROD_BRANCH })).rejects.toThrow(
      REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION
    );
  });

  it("an unreadable identity is unverifiable and refused (fail closed)", async () => {
    await expect(run(undefined)).rejects.toThrow(REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE);
    await expect(run({ endpoint_id: "", project_id: null, branch_id: "  " })).rejects.toThrow(REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE);
  });

  it("a reader failure is unverifiable and refused", async () => {
    await expect(
      verifyRemoteTestDatabaseIdentity(remoteDatabaseVariables({ TEST_DATABASE_URL: TEST_URL }), {}, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow(REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE);
  });

  it("is case-insensitive about reported identity values", async () => {
    await expect(run({ endpoint_id: PROD_ENDPOINT.toUpperCase(), project_id: null, branch_id: null })).rejects.toThrow(REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION);
  });

  it("checks every distinct remote variable, never a loopback one", async () => {
    const reader = vi.fn(async (url: string) => (url === TEST_URL ? { endpoint_id: "ep-test-sandbox-aa11bb22", project_id: "p", branch_id: APPROVED_TEST_NEON_BRANCH_IDS[0] } : { endpoint_id: PROD_ENDPOINT }));
    const vars = remoteDatabaseVariables({ DATABASE_URL: LOCAL, TEST_DATABASE_URL: TEST_URL, DATABASE_URL_TEST: PROD_URL });
    expect(vars.map((v) => v.name)).toEqual(["TEST_DATABASE_URL", "DATABASE_URL_TEST"]);
    await expect(verifyRemoteTestDatabaseIdentity(vars, {}, reader)).rejects.toThrow(/DATABASE_URL_TEST/);
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it("de-duplicates identical URLs across variables (one probe each)", () => {
    expect(remoteDatabaseVariables({ DATABASE_URL: TEST_URL, TEST_DATABASE_URL: TEST_URL })).toHaveLength(1);
  });
});

describe("operator extension: rotated or additional production identities", () => {
  it("OPSIQ_PRODUCTION_DB_IDENTITIES extends the static endpoint check and the runtime branch check", async () => {
    const env = { OPSIQ_PRODUCTION_DB_IDENTITIES: "ep-future-prod-11112222, br-future-branch" };
    const futureUrl = "postgresql://u:p@ep-future-prod-11112222-pooler.c-9.us-west-2.aws.neon.tech/db";
    expect(classifyRemoteDatabaseUrl(futureUrl)).toBe("ok");
    expect(classifyRemoteDatabaseUrl(futureUrl, env)).toBe("production");
    expect(() => resolveTestDatabase({ ...REMOTE_OPT_IN, ...env, DATABASE_URL: futureUrl })).toThrow(REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION);
    expect(classifyDatabaseIdentity({ endpointId: null, projectId: null, branchId: "br-future-branch" }, env)).toBe("production");
  });

  it("only ep-/br- tokens are honored (a stray token cannot weaken or break the guard)", () => {
    const env = { OPSIQ_PRODUCTION_DB_IDENTITIES: "garbage,,  ,xyz" };
    expect(classifyRemoteDatabaseUrl(PROD_URL, env)).toBe("production");
  });
});

describe("source contract: the guard layers stay wired", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path") as typeof import("path");
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../../..", p), "utf8");

  it("vitest-global-setup verifies the remote identity before ANY database access", () => {
    const src = read("vitest-global-setup.ts");
    const verify = src.indexOf("verifyRemoteTestDatabaseIdentity(");
    expect(verify).toBeGreaterThan(-1);
    for (const dbCall of ["getDbInstance()", "pingDatabase(", "resetStartupStatus()", "new pgLib.Client("]) {
      expect(src.indexOf(dbCall), dbCall).toBeGreaterThan(verify);
    }
  });

  it("vitest-global-setup never prints the database URL, host or name (the Stage 7 observation root cause)", () => {
    const src = read("vitest-global-setup.ts");
    expect(src).not.toMatch(/\.replace\(\/:\[\^@\]\*@\//);
    expect(src).not.toMatch(/console\.log\([^)]*process\.env\.DATABASE_URL[^)]*(replace|\|\|)/);
  });

  it("the identity reader is read-only and never propagates driver error text", () => {
    const src = read("src/infra/pg-database-identity-reader.ts");
    expect(src).toContain("default_transaction_read_only=on");
    expect(src).toMatch(/catch \{\s*throw new Error\("database identity read failed"\)/);
  });

  it("no identity module imports the application database client or Prisma", () => {
    for (const p of ["src/infra/production-db-identity.ts", "src/infra/pg-database-identity-reader.ts"]) {
      expect(read(p), p).not.toMatch(/@\/lib\/db|@\/generated\/prisma|PrismaClient/);
    }
  });
});
