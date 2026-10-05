/**
 * A3 — the guard exercised through the REAL Prisma CLI in subprocesses.
 *
 * Every refusal case uses an unreachable synthetic endpoint (`*.invalid`, or loopback port 1) and a minimal
 * environment, so even a guard failure could not touch a real database. The process environment of the test
 * runner (which may hold real database variables) is never forwarded.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const PRISMA = join(ROOT, "node_modules", ".bin", "prisma");

const REMOTE = "postgresql://sub-user:sub-secret@db.synthetic-subprocess.invalid:5432/sub_db_name";
const LOOPBACK_DEAD = "postgresql://sub-user:sub-secret@127.0.0.1:1/sub_db_name";
const SECRET_PARTS = ["sub-user", "sub-secret", "synthetic-subprocess", "sub_db_name"];

function prisma(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(PRISMA, args, {
    cwd: ROOT,
    // Minimal environment on purpose: no inherited DATABASE_URL / OPSIQ_* / CI.
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/tmp", NO_COLOR: "1", ...env },
    encoding: "utf8",
    timeout: 120_000,
  });
  const output = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  return { status: r.status, output };
}
const refused = (o: string) => /\[prisma-datasource\] REFUSED:/.test(o);
const noLeak = (o: string) => { for (const p of SECRET_PARTS) expect(o, `leaked ${p}`).not.toContain(p); };

describe("A3 subprocess: the real Prisma CLI refuses before any mutation can occur", () => {
  it("1. unlabelled remote DATABASE_URL + migrate reset → refused, sanitized", () => {
    const r = prisma(["migrate", "reset", "--force"], { DATABASE_URL: REMOTE });
    expect(r.status).not.toBe(0);
    expect(refused(r.output)).toBe(true);
    expect(r.output).toMatch(/explicit OPSIQ_DB_TARGET/);
    expect(r.output).not.toMatch(/Datasource "db"/); // Prisma never got as far as connecting
    noLeak(r.output);
  });

  it("2. an explicit local target + remote DATABASE_URL + db push → refused, sanitized", () => {
    const r = prisma(["db", "push"], { OPSIQ_DB_TARGET: "local", DATABASE_URL: REMOTE });
    expect(r.status).not.toBe(0);
    expect(refused(r.output)).toBe(true);
    expect(r.output).toMatch(/requires a local datasource/);
    noLeak(r.output);
  });

  it("3. a mutating command with --url (both spellings) → refused, value never echoed", () => {
    for (const urlArgs of [["--url", REMOTE], [`--url=${REMOTE}`]]) {
      const r = prisma(["db", "push", ...urlArgs], { OPSIQ_DB_TARGET: "local", DATABASE_URL: LOOPBACK_DEAD });
      expect(r.status).not.toBe(0);
      expect(refused(r.output)).toBe(true);
      expect(r.output).toMatch(/datasource-URL flag/);
      noLeak(r.output);
    }
  });

  it("flags before the operation cannot confuse classification", () => {
    const r = prisma(["--schema", "prisma/schema.prisma", "migrate", "reset", "--force"], { DATABASE_URL: REMOTE });
    expect(r.status).not.toBe(0);
    expect(refused(r.output)).toBe(true);
    expect(r.output).toMatch(/explicit OPSIQ_DB_TARGET/);
    noLeak(r.output);
  });

  it("production: migrate reset and db push are refused at every authorization level", () => {
    for (const args of [["migrate", "reset", "--force"], ["db", "push"], ["db", "execute", "--stdin"], ["studio"], ["migrate", "dev"]]) {
      const r = prisma(args, {
        OPSIQ_DB_TARGET: "production",
        OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true",
        OPSIQ_PRODUCTION_OPERATION: "migrate deploy",
        MIGRATION_DATABASE_URL: REMOTE,
      });
      expect(r.status, args.join(" ")).not.toBe(0);
      expect(refused(r.output)).toBe(true);
      expect(r.output).toMatch(/never permitted against production/);
      noLeak(r.output);
    }
  });

  it("a remote test database is refused when its identity cannot be positively verified", () => {
    const r = prisma(["migrate", "deploy"], { OPSIQ_DB_TARGET: "test", TEST_DATABASE_URL: REMOTE });
    expect(r.status).not.toBe(0);
    expect(refused(r.output)).toBe(true);
    expect(r.output).toMatch(/REMOTE_TEST_DB_IDENTITY_UNVERIFIABLE|REMOTE_TEST_DB_IDENTITY_NOT_AUTHORIZED/);
    noLeak(r.output);
  });

  it("4. an explicitly local, loopback command passes the guard (Prisma itself then fails to connect to the dead port)", () => {
    const r = prisma(["migrate", "deploy"], { OPSIQ_DB_TARGET: "local", DATABASE_URL: LOOPBACK_DEAD });
    expect(refused(r.output)).toBe(false);
    expect(r.output).toMatch(/PRISMA_TARGET=local \(mutation-capable\)/);
    expect(r.status).not.toBe(0); // nothing is listening on loopback port 1
    expect(r.output).toMatch(/P1001|Can't reach database server/);
  });

  it("5. schema-only validate and generate still run with nothing configured", () => {
    const v = prisma(["validate"]);
    expect(v.status).toBe(0);
    expect(refused(v.output)).toBe(false);
    const g = prisma(["generate"]);
    expect(g.status).toBe(0);
    expect(refused(g.output)).toBe(false);
  });
});
