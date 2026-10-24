/**
 * POSITIVE test-database identity authorization. A remote test / test-migration database is authorized ONLY when its
 * runtime Neon branch id is present and equals the approved OpsIQ TEST branch. Everything else is refused: known
 * production, rotated/unknown production, unrelated Neon databases, project-id-only, endpoint-only, no identity.
 * Synthetic identities only; nothing here connects to any database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVED_TEST_NEON_BRANCH_IDS,
  PRODUCTION_DB_ENDPOINT_IDS,
  PRODUCTION_NEON_BRANCH_IDS,
  classifyDatabaseIdentity,
  classifyRemoteDatabaseUrl,
} from "@/infra/production-db-identity";
import {
  REMOTE_TEST_DB_IDENTITY_NOT_AUTHORIZED,
  REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION,
  REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE,
  remoteDatabaseVariables,
  resolveTestDatabase,
  verifyRemoteTestDatabaseIdentity,
  type DatabaseIdentityReader,
} from "@/infra/test-database-guard";

const URL_REMOTE = "postgresql://synthuser:synthpass@ep-synthetic-host-00000000.example.invalid/db?sslmode=require";
const APPROVED = APPROVED_TEST_NEON_BRANCH_IDS[0];

async function verify(row: Record<string, unknown> | undefined | null, env: Record<string, string | undefined> = {}) {
  const reader: DatabaseIdentityReader = async () => row;
  await verifyRemoteTestDatabaseIdentity(remoteDatabaseVariables({ TEST_DATABASE_URL: URL_REMOTE }), env, reader);
}

describe("positive TEST identity authorization", () => {
  it("1. approved TEST branch → PASS", async () => {
    await expect(verify({ endpoint_id: "ep-any-00000000", project_id: "p", branch_id: APPROVED })).resolves.toBeUndefined();
    await expect(verify({ endpoint_id: "", project_id: "", branch_id: APPROVED.toUpperCase() })).resolves.toBeUndefined();
  });
  it("2. current production branch → REJECT (production)", async () => {
    await expect(verify({ endpoint_id: "ep-x", project_id: "p", branch_id: PRODUCTION_NEON_BRANCH_IDS[0] })).rejects.toThrow(
      REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION,
    );
  });
  it("3. current production endpoint → REJECT (production), even when the branch claims to be approved", async () => {
    await expect(verify({ endpoint_id: PRODUCTION_DB_ENDPOINT_IDS[0], project_id: "p", branch_id: APPROVED })).rejects.toThrow(
      REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION,
    );
  });
  it("4. unrelated Neon branch → REJECT", async () => {
    await expect(verify({ endpoint_id: "ep-unrelated-11111111", project_id: "unrelated-project", branch_id: "br-unrelated-111111" })).rejects.toThrow(
      REMOTE_TEST_DB_IDENTITY_NOT_AUTHORIZED,
    );
  });
  it("5. unknown future endpoint + unknown branch (rotated production) → REJECT", async () => {
    await expect(verify({ endpoint_id: "ep-rotated-prod-22222222", project_id: "p", branch_id: "br-rotated-prod-222222" })).rejects.toThrow(
      REMOTE_TEST_DB_IDENTITY_NOT_AUTHORIZED,
    );
  });
  it("6. projectId-only identity → REJECT", async () => {
    await expect(verify({ endpoint_id: null, project_id: "weathered-scene-43389611", branch_id: null })).rejects.toThrow(
      REMOTE_TEST_DB_IDENTITY_NOT_AUTHORIZED,
    );
  });
  it("7. endpoint-only identity without the approved branch → REJECT", async () => {
    await expect(verify({ endpoint_id: "ep-tiny-breeze-an0qsoje", project_id: null, branch_id: null })).rejects.toThrow(
      REMOTE_TEST_DB_IDENTITY_NOT_AUTHORIZED,
    );
  });
  it("8. no identity (null row, empty values, reader failure) → REJECT", async () => {
    await expect(verify(undefined)).rejects.toThrow(REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE);
    await expect(verify({ endpoint_id: "", project_id: " ", branch_id: null })).rejects.toThrow(REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE);
    const failing: DatabaseIdentityReader = async () => {
      throw new Error("boom");
    };
    await expect(
      verifyRemoteTestDatabaseIdentity(remoteDatabaseVariables({ TEST_DATABASE_URL: URL_REMOTE }), {}, failing),
    ).rejects.toThrow(REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE);
  });
  it("9. the remote opt-in never bypasses positive authorization", async () => {
    const env = { TEST_WITH_DB: "true", DATABASE_URL: URL_REMOTE, TEST_DATABASE_URL: URL_REMOTE, OPSIQ_ALLOW_REMOTE_TEST_DB: "true" };
    // static layer lets an unknown-but-not-known-production host through …
    expect(resolveTestDatabase(env).mode).toBe("db");
    // … and the runtime layer is what decides: an unknown identity is refused despite the opt-in.
    await expect(verify({ endpoint_id: "ep-x", project_id: "p", branch_id: "br-unknown" }, env)).rejects.toThrow(REMOTE_TEST_DB_IDENTITY_NOT_AUTHORIZED);
  });
  it("9b. the environment cannot redefine the approved branch (denylist extension only ever adds refusals)", async () => {
    const env = { OPSIQ_PRODUCTION_DB_IDENTITIES: "br-brand-new", OPSIQ_APPROVED_TEST_BRANCH: "br-brand-new", OPSIQ_APPROVED_TEST_NEON_BRANCH_IDS: "br-brand-new" };
    await expect(verify({ endpoint_id: "ep-x", project_id: "p", branch_id: "br-brand-new" }, env)).rejects.toThrow(REMOTE_TEST_DB_IDENTITY_REJECTED_PRODUCTION);
    expect(classifyDatabaseIdentity({ endpointId: null, projectId: null, branchId: "br-other" }, env)).toBe("not-authorized");
    const src = readFileSync(join(process.cwd(), "src/infra/production-db-identity.ts"), "utf8");
    expect(src).not.toMatch(/env\[[^\]]*APPROVED/);
  });
  it("10. host= / hostaddr= overrides fail the static layer", () => {
    for (const q of ["host=ep-synthetic-safe-00000000.example.invalid", "hostaddr=10.0.0.1", "HOST=x.example.invalid"]) {
      expect(classifyRemoteDatabaseUrl(`postgresql://u:p@ep-synthetic-host-00000000.example.invalid/db?${q}`)).toBe("unverifiable");
    }
  });
  it("11. pooler / direct / compute aliases of production cannot bypass", () => {
    for (const id of PRODUCTION_DB_ENDPOINT_IDS) {
      for (const label of [id, `${id}-pooler`, `${id}-abc`, `${id}-abc-pooler`, id.toUpperCase()]) {
        expect(classifyRemoteDatabaseUrl(`postgresql://u:p@${label}.c-1.aws.neon.tech/db`)).toBe("production");
      }
    }
  });
  it("12. no URL, credential, host or identity value appears in any refusal", async () => {
    const rows = [
      { endpoint_id: PRODUCTION_DB_ENDPOINT_IDS[0], project_id: "p-secret-proj", branch_id: PRODUCTION_NEON_BRANCH_IDS[0] },
      { endpoint_id: "ep-leaky-33333333", project_id: "p-secret-proj", branch_id: "br-leaky-333333" },
      { endpoint_id: "ep-tiny-breeze-an0qsoje", project_id: null, branch_id: null },
      undefined,
    ];
    for (const row of rows) {
      const message = await verify(row).then(
        () => "",
        (e: Error) => e.message,
      );
      expect(message).not.toBe("");
      for (const needle of ["synthuser", "synthpass", "example.invalid", "postgresql://", "ep-", "br-", "p-secret-proj", APPROVED]) {
        expect(message).not.toContain(needle);
      }
    }
  });
});
