/**
 * scripts/assert-non-production-database.ts — the CI/operator preflight. Synthetic URLs only; the identity reader is
 * a fake, so nothing here connects anywhere. The production-rejection path must never open a connection.
 */
import { describe, it, expect, vi } from "vitest";
import { assertNonProductionDatabases } from "../../../scripts/assert-non-production-database";
import { PRODUCTION_DB_ENDPOINT_IDS } from "@/infra/production-db-identity";

const PROD = `postgresql://synthuser:synthpass@${PRODUCTION_DB_ENDPOINT_IDS[0]}-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require`;
const TEST = "postgresql://testuser:testpass@ep-test-sandbox-aa11bb22.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require";
const LOCAL = "postgresql://postgres:postgres@localhost:5432/opsiq_test";
const nonProd = vi.fn(async () => ({ endpoint_id: "ep-test-sandbox-aa11bb22", project_id: "p", branch_id: "br-t" }));

const LEAK = ["synthuser", "synthpass", "testuser", "testpass", "neon.tech", "neondb", "ep-test-sandbox", "ep-empty-sky", "postgresql://"];
const noLeak = (lines: string[]) => {
  for (const f of LEAK) expect(lines.join("\n"), f).not.toContain(f);
};

describe("assertNonProductionDatabases", () => {
  it("passes loopback databases without opening any connection", async () => {
    const reader = vi.fn();
    const r = await assertNonProductionDatabases(["DATABASE_URL"], { DATABASE_URL: LOCAL }, reader);
    expect(r.ok).toBe(true);
    expect(reader).not.toHaveBeenCalled();
  });

  it("passes a remote database whose own identity is non-production", async () => {
    const r = await assertNonProductionDatabases(["TEST_DATABASE_URL"], { TEST_DATABASE_URL: TEST }, nonProd);
    expect(r.ok).toBe(true);
    expect(nonProd).toHaveBeenCalledTimes(1);
    noLeak(r.lines);
  });

  it("14. fails closed on a production URL — and never opens a connection to it", async () => {
    const reader = vi.fn();
    const r = await assertNonProductionDatabases(["DATABASE_URL", "TEST_DATABASE_URL"], { DATABASE_URL: LOCAL, TEST_DATABASE_URL: PROD }, reader);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toContain("REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION");
    expect(reader).not.toHaveBeenCalled();
    noLeak(r.lines);
  });

  it("a production URL in one variable blocks the identity probe of the others (nothing is opened once refused)", async () => {
    const reader = vi.fn(nonProd);
    reader.mockClear();
    const r = await assertNonProductionDatabases(["TEST_DATABASE_URL", "DATABASE_URL_TEST"], { TEST_DATABASE_URL: TEST, DATABASE_URL_TEST: PROD }, reader);
    expect(r.ok).toBe(false);
    expect(reader).not.toHaveBeenCalled();
  });

  it("rejects when the database itself reports the production identity (hostname looked fine)", async () => {
    const reader = vi.fn(async () => ({ endpoint_id: PRODUCTION_DB_ENDPOINT_IDS[0], project_id: "p", branch_id: "b" }));
    const r = await assertNonProductionDatabases(["TEST_DATABASE_URL"], { TEST_DATABASE_URL: TEST }, reader);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toContain("REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION");
    noLeak(r.lines);
  });

  it("an unreadable identity and a reader failure both fail closed", async () => {
    expect((await assertNonProductionDatabases(["TEST_DATABASE_URL"], { TEST_DATABASE_URL: TEST }, async () => undefined)).ok).toBe(false);
    const r = await assertNonProductionDatabases(["TEST_DATABASE_URL"], { TEST_DATABASE_URL: TEST }, async () => {
      throw new Error("connect ECONNREFUSED ep-empty-sky");
    });
    expect(r.ok).toBe(false);
    noLeak(r.lines);
    expect(r.lines.join("\n")).not.toContain("ECONNREFUSED");
  });

  it("a required variable that is unset fails; an optional one (trailing ?) is skipped", async () => {
    const required = await assertNonProductionDatabases(["DATABASE_URL", "DATABASE_URL_TEST"], { DATABASE_URL: LOCAL }, nonProd);
    expect(required.ok).toBe(false);
    expect(required.lines.join("\n")).toContain("REMOTE_TEST_DB_VARIABLE_UNSET");
    const optional = await assertNonProductionDatabases(["DATABASE_URL", "DATABASE_URL_TEST?"], { DATABASE_URL: LOCAL }, nonProd);
    expect(optional.ok).toBe(true);
  });

  it("a malformed URL fails without echoing it", async () => {
    const r = await assertNonProductionDatabases(["DATABASE_URL"], { DATABASE_URL: "synthpass not a url" }, nonProd);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).not.toContain("synthpass");
  });

  it("honors OPSIQ_PRODUCTION_DB_IDENTITIES from the environment", async () => {
    const r = await assertNonProductionDatabases(
      ["TEST_DATABASE_URL"],
      { TEST_DATABASE_URL: TEST, OPSIQ_PRODUCTION_DB_IDENTITIES: "ep-test-sandbox-aa11bb22" },
      nonProd
    );
    expect(r.ok).toBe(false);
  });
});
