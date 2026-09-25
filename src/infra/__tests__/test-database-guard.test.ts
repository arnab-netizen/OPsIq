/**
 * Test-harness database guard — the automated test suite must never silently run against a
 * production or ordinary remote application database (beta integrity BIV-18).
 * All URLs here are synthetic; `.invalid` hosts can never resolve.
 */
import { describe, it, expect } from "vitest";
import {
  resolveTestDatabase,
  TestDatabaseGuardError,
  NO_DB_TEST_DATABASE_URL,
} from "@/infra/test-database-guard";

const REMOTE = "postgresql://app:secret@ep-example-pooler.region.remote-db.invalid/neondb?sslmode=require";
const REMOTE_DIRECT = "postgresql://app:secret@ep-example.region.remote-db.invalid/neondb?sslmode=require";
const LOCAL = "postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public";

describe("resolveTestDatabase", () => {
  it("the incident shape (remote DATABASE_URL + TEST_DATABASE_URL, TEST_WITH_DB=true, no opt-in) is refused", () => {
    expect(() =>
      resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: REMOTE, TEST_DATABASE_URL: REMOTE_DIRECT })
    ).toThrow(TestDatabaseGuardError);
  });

  it("refusal messages never contain the URL, host, user, password or database name", () => {
    try {
      resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: REMOTE });
      throw new Error("expected refusal");
    } catch (e) {
      const msg = (e as Error).message;
      for (const secret of ["secret", "app:", "remote-db.invalid", "neondb", "ep-example"]) expect(msg).not.toContain(secret);
    }
  });

  it("non-DB runs ignore every inherited database URL and use the loopback placeholder", () => {
    const r = resolveTestDatabase({ TEST_WITH_DB: "false", DATABASE_URL: REMOTE, TEST_DATABASE_URL: REMOTE });
    expect(r).toEqual({ mode: "no-db", databaseUrl: NO_DB_TEST_DATABASE_URL, target: "no-db-placeholder" });
    expect(resolveTestDatabase({ DATABASE_URL: REMOTE }).mode).toBe("no-db");
  });

  it("DB runs against the runner's loopback throwaway database are allowed", () => {
    expect(resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: LOCAL, DATABASE_URL_TEST: LOCAL })).toEqual({
      mode: "db",
      databaseUrl: LOCAL,
      target: "loopback",
    });
    expect(resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: "postgresql://p@127.0.0.1:5433/x" }).target).toBe("loopback");
  });

  it("a remote URL in a sibling variable is refused even when DATABASE_URL is local", () => {
    expect(() => resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: LOCAL, TEST_DATABASE_URL: REMOTE })).toThrow(
      /TEST_DATABASE_URL points at a non-loopback database/
    );
  });

  it("DB runs require an explicit DATABASE_URL (no fallback)", () => {
    expect(() => resolveTestDatabase({ TEST_WITH_DB: "true" })).toThrow(/explicit DATABASE_URL/);
    expect(() => resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: "  " })).toThrow(/explicit DATABASE_URL/);
  });

  it("a declared remote TEST database is allowed only with the explicit opt-in", () => {
    expect(resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: REMOTE, OPSIQ_ALLOW_REMOTE_TEST_DB: "true" }).target).toBe(
      "remote-test-opt-in"
    );
    expect(() => resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: REMOTE, OPSIQ_ALLOW_REMOTE_TEST_DB: "1" })).toThrow(
      TestDatabaseGuardError
    );
  });

  it("any production authorization flag refuses DB tests, even for a loopback URL or with the remote opt-in", () => {
    expect(() => resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: LOCAL, OPSIQ_DB_TARGET: "production" })).toThrow(
      /production/
    );
    expect(() =>
      resolveTestDatabase({
        TEST_WITH_DB: "true",
        DATABASE_URL: REMOTE,
        OPSIQ_ALLOW_REMOTE_TEST_DB: "true",
        OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true",
      })
    ).toThrow(/production/);
  });

  it("a host/hostaddr query override or unix-socket host is never treated as loopback (pg would connect elsewhere)", () => {
    for (const url of [
      "postgresql://u:p@localhost:5432/db?host=prod.remote-db.invalid",
      "postgresql://u:p@localhost/db?host=/cloudsql/proj:region:instance",
      "postgresql://u:p@localhost/db?hostaddr=203.0.113.9",
    ]) {
      expect(() => resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: url }), url).toThrow(TestDatabaseGuardError);
    }
  });

  it("an unparseable URL is treated as non-loopback (fail closed)", () => {
    expect(() => resolveTestDatabase({ TEST_WITH_DB: "true", DATABASE_URL: "not a url" })).toThrow(TestDatabaseGuardError);
  });
});

describe("vitest-global-setup.ts wiring (source contract)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src: string = require("fs").readFileSync(require("path").resolve(__dirname, "../../../vitest-global-setup.ts"), "utf8");

  it("resolves the guarded test database before any database access", () => {
    const guard = src.indexOf("resolveTestDatabase(process.env)");
    expect(guard).toBeGreaterThan(-1);
    for (const dbCall of ["getDbInstance()", "pingDatabase(", "resetStartupStatus()"]) {
      expect(src.indexOf(dbCall)).toBeGreaterThan(guard);
    }
  });

  it("never loads a pre-existing .env.test (stale files are deleted, not read)", () => {
    expect(src).not.toMatch(/^(?!\s*\/\/).*dotenv\.config\(/m);
    expect(src).toMatch(/unlinkSync\(envTestPath\)/);
  });

  it("decides DB initialisation from the guard result, not from a raw TEST_WITH_DB read", () => {
    expect(src).toMatch(/const testWithDb = resolution\.mode === "db";/);
  });
});
