/**
 * Release gate — credential separation for the least-privilege runtime role.
 * Fixtures only: injected identity, fake `.invalid` hosts, a temp migrations directory. Nothing connects to a database.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
// @ts-expect-error -- plain ESM script without type declarations
import { MIGRATOR_CREDENTIAL_VARIABLES, RUNTIME_DENIED_TABLES, evaluateRuntimeRole, runGate } from "../../../scripts/release/production-migration-gate.mjs";
import { RUNTIME_DENIED_TABLES as TS_DENIED } from "@/services/privacy-erasure/role-topology";

const ROOT = resolve(__dirname, "../../..");
const NAME = "20260101000000_one";
const SQL = "SELECT 1;\n";

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "role-gate-"));
  mkdirSync(join(dir, "prisma", "migrations", NAME), { recursive: true });
  writeFileSync(join(dir, "prisma", "migrations", NAME, "migration.sql"), SQL);
  return dir;
}
const rows = [{ migration_name: NAME, checksum: createHash("sha256").update(SQL).digest("hex"), finished_at: new Date(), rolled_back_at: null }];
const base = { OPSIQ_RELEASE_GATE_FORCE: "1", DATABASE_URL: "postgresql://opsiq_app:x@db.invalid/neondb" };
const good = { currentUser: "opsiq_app", dangerous: false, ungranted: [] as string[] };

describe("release gate — migrator credential never reaches the production runtime", () => {
  it("lists every migrator credential variable the repository uses", () => {
    expect(MIGRATOR_CREDENTIAL_VARIABLES).toEqual(expect.arrayContaining(["MIGRATION_DATABASE_URL", "OWNER_DATABASE_URL", "PRODUCTION_DATABASE_URL"]));
  });

  for (const v of ["MIGRATION_DATABASE_URL", "OWNER_DATABASE_URL", "PRODUCTION_DATABASE_URL", "OPSIQ_RUNTIME_PROBE_DATABASE_URL"]) {
    it(`BLOCKS a production build whose environment carries ${v} (names the variable, never a value)`, async () => {
      const secret = "postgresql://neondb_owner:SUPERSECRET@ep-x.invalid/neondb";
      const r = await runGate({ env: { ...base, [v]: secret }, cwd: repo(), readRows: async () => rows });
      expect(r.exitCode).toBe(1);
      expect(r.output).toContain(v);
      expect(r.output).not.toContain("SUPERSECRET");
      expect(r.output).not.toContain("ep-x.invalid");
    });
  }

  it("an empty/whitespace migrator variable is not a credential", async () => {
    const r = await runGate({ env: { ...base, MIGRATION_DATABASE_URL: "  " }, cwd: repo(), readRows: async () => rows });
    expect(r.exitCode).toBe(0);
  });

  it("without OPSIQ_REQUIRE_RUNTIME_ROLE the identity is never queried (pre-cutover builds keep working)", async () => {
    let called = false;
    const r = await runGate({ env: base, cwd: repo(), readRows: async () => rows, readIdentity: async () => { called = true; return good; } });
    expect(r.exitCode).toBe(0);
    expect(called).toBe(false);
  });
});

describe("release gate — required runtime role", () => {
  const env = { ...base, OPSIQ_REQUIRE_RUNTIME_ROLE: "opsiq_app" };
  it("PASSES when DATABASE_URL authenticates as the runtime role with every table granted", async () => {
    const r = await runGate({ env, cwd: repo(), readRows: async () => rows, readIdentity: async () => good });
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain('runtime role "opsiq_app" verified');
  });
  it("BLOCKS when DATABASE_URL is the owner (still neondb_owner)", async () => {
    const r = await runGate({ env, cwd: repo(), readRows: async () => rows, readIdentity: async () => ({ ...good, currentUser: "neondb_owner" }) });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("other than the required runtime role");
  });
  it("BLOCKS when the login holds a dangerous attribute", async () => {
    const r = await runGate({ env, cwd: repo(), readRows: async () => rows, readIdentity: async () => ({ ...good, dangerous: true }) });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("dangerous attribute");
  });
  it("BLOCKS a release whose migration added a table the runtime role cannot read, and names the fix", async () => {
    const r = await runGate({ env, cwd: repo(), readRows: async () => rows, readIdentity: async () => ({ ...good, ungranted: ["brand_new_table"] }) });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("brand_new_table");
    expect(r.output).toContain("role reconcile");
  });
  it("fails closed when the identity cannot be read", async () => {
    const r = await runGate({ env, cwd: repo(), readRows: async () => rows, readIdentity: async () => { throw new Error("could not verify the runtime database role (error code ECONNRESET)"); } });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("ECONNRESET");
  });
  it("an invalid role name is refused without querying", () => {
    expect(evaluateRuntimeRole({ env: { OPSIQ_REQUIRE_RUNTIME_ROLE: "x; DROP" }, identity: good }).ok).toBe(false);
  });
  it("a migration problem still blocks even when the role is fine", async () => {
    const r = await runGate({ env, cwd: repo(), readRows: async () => [], readIdentity: async () => good });
    expect(r.exitCode).toBe(1);
  });
});

describe("release gate — drift guards", () => {
  it("the gate's denied-table list equals the topology's (one source of truth)", () => {
    expect([...RUNTIME_DENIED_TABLES].sort()).toEqual([...TS_DENIED].sort());
  });
  it("the runtime URL is the only database variable the gate reads", () => {
    const src = readFileSync(join(ROOT, "scripts/release/production-migration-gate.mjs"), "utf8");
    expect(src).not.toMatch(/env\.(MIGRATION|OWNER|PRODUCTION)_DATABASE_URL/);
  });
});
