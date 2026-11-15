/**
 * Runtime least-privilege role — static governance (no database).
 * Proves, from source alone: the plan is secret-free and fail-closed, every SECURITY DEFINER function is registered and pinned, the
 * runtime code path holds no owner-only SQL, the cutover CLI never touches the runtime / migrator URLs, and the target guard refuses
 * every Production/non-Production confusion.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import {
  RUNTIME_DENIED_TABLES,
  RUNTIME_READONLY_TABLES,
  SECURITY_DEFINER_FUNCTIONS,
  parseModeledTables,
  readModeledTables,
  roleTopologyStatements,
  runtimeWritableTables,
} from "@/services/privacy-erasure/role-topology";
import { PRODUCTION_APPLY_CONFIRMATION, RoleCutoverRefusal, assertRoleCutoverConnectedIdentity, assertRoleCutoverStaticTarget } from "@/infra/role-cutover-target";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const modeled = readModeledTables();
const plan = (logins: string[] = []) => roleTopologyStatements({ runtimeRole: "opsiq_app", eraserLogins: logins }, "neondb", { modeledTables: modeled });
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!["__tests__", "generated", "node_modules"].includes(e)) walk(p, out); } else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
};

describe("role topology plan", () => {
  it("is deterministic, secret-free and creates no login with a password", () => {
    expect(plan()).toEqual(plan());
    const sql = plan().join("\n");
    expect(sql).not.toMatch(/\b(?:ENCRYPTED\s+|UNENCRYPTED\s+)?PASSWORD\s+(?:'|NULL|\$)/i);
    expect(sql).not.toMatch(/postgres(?:ql)?:\/\//i);
  });
  it("needs zero eraser logins (none are created by default)", () => {
    expect(plan()).not.toContain(expect.stringMatching(/GRANT "?opsiq_privacy_eraser"? TO/));
    expect(plan().some((s) => /GRANT "opsiq_privacy_eraser" TO/.test(s))).toBe(false);
  });
  it("hardens the public schema and never grants the runtime CREATE or a default privilege", () => {
    const sql = plan().join("\n");
    expect(sql).toContain("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    expect(sql).toMatch(/REVOKE CREATE ON SCHEMA public FROM "opsiq_app"/);
    expect(sql).toMatch(/REVOKE CREATE ON DATABASE "neondb" FROM "opsiq_app"/);
    expect(sql).not.toMatch(/ALTER DEFAULT PRIVILEGES[^;\n]*GRANT[^;\n]*"opsiq_app"/i);
    expect(sql).not.toMatch(/GRANT[^;\n]*\b(ALL|CREATE|TRUNCATE|TRIGGER|REFERENCES)\b[^;\n]*TO "opsiq_app"/i);
  });
  it("classifies exactly: Prisma-modelled tables writable, the ledger read-only, the erasure ledger denied", () => {
    expect(RUNTIME_DENIED_TABLES).toEqual(["privacy_erasure_requests"]);
    expect(RUNTIME_READONLY_TABLES).toEqual(["_prisma_migrations"]);
    const writable = runtimeWritableTables(modeled);
    expect(writable).not.toContain("privacy_erasure_requests");
    expect(writable).not.toContain("_prisma_migrations");
    expect(writable).toEqual(expect.arrayContaining(["scheduled_tasks", "qbo_connections", "audit_events", "owner_financial_snapshots", "sessions", "users"]));
    expect(modeled.length).toBeGreaterThan(100);
  });
  it("every Prisma model resolves to a table that a committed migration creates (no phantom grant)", () => {
    const sql = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => !d.endsWith(".toml")).map((d) => { try { return read(`prisma/migrations/${d}/migration.sql`); } catch { return ""; } }).join("\n");
    const missing = modeled.filter((t) => !new RegExp(`(?:CREATE TABLE[^;(]*?|RENAME TO\\s+)"?${t}"?(?![\\w])`, "i").test(sql));
    expect(missing).toEqual([]);
  });
  it("refuses malformed role / login names (no SQL injection through names)", () => {
    for (const bad of ['x"; DROP ROLE y; --', "Has Space", "", "a".repeat(64), "pg_monitor_x"]) {
      expect(() => roleTopologyStatements({ runtimeRole: bad, eraserLogins: [] }, "neondb", { modeledTables: modeled }), bad).toThrow();
    }
    expect(() => roleTopologyStatements({ runtimeRole: "opsiq_app", eraserLogins: ['evil"; --'] }, "neondb", { modeledTables: modeled })).toThrow();
  });
  it("parseModeledTables honours @@map and ignores enums / comments", () => {
    const t = parseModeledTables('model A {\n  id String @id\n  @@map("a_tbl")\n}\nmodel B {\n  id String @id\n}\nenum E {\n  X\n}\n// model C {\n');
    expect(t.sort()).toEqual(["B", "a_tbl"]);
  });
});

describe("SECURITY DEFINER hardening (every function, from the migrations themselves)", () => {
  const migDirs = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => !d.endsWith(".toml"));
  const found: Array<{ name: string; ddl: string; migration: string }> = [];
  for (const d of migDirs) {
    let sql = "";
    try { sql = read(`prisma/migrations/${d}/migration.sql`); } catch { continue; }
    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+("?[\w.]+"?)\s*\(([\s\S]*?)\$\$\s*LANGUAGE[^;]*;/gi)) {
      if (/SECURITY\s+DEFINER/i.test(m[0])) found.push({ name: m[1].replace(/"/g, ""), ddl: m[0], migration: d });
    }
  }
  it("the registry equals the set of SECURITY DEFINER functions in the migrations", () => {
    expect(found.map((f) => f.name).sort()).toEqual(SECURITY_DEFINER_FUNCTIONS.map((f) => f.name).sort());
  });
  it("each pins search_path with pg_temp LAST, qualifies catalog and table references, and uses session identity for role checks", () => {
    for (const f of found) {
      const sp = /SET\s+search_path\s*=\s*([^;\n]+)/i.exec(f.ddl);
      expect(sp, f.name).not.toBeNull();
      const parts = sp![1].split(",").map((x) => x.trim().toLowerCase());
      expect(parts[0], f.name).toBe("pg_catalog");
      expect(parts[parts.length - 1], f.name).toBe("pg_temp");
      expect(f.ddl, f.name).not.toMatch(/\bEXECUTE\b/i); // no dynamic SQL
      expect(f.ddl, f.name).not.toMatch(/\bcurrent_user\b|\bcurrent_role\b/i); // a definer's current_user is the OWNER; identity must be session_user
      expect(f.ddl, f.name).toMatch(/\bsession_user\b/i);
      expect(f.ddl, f.name).toMatch(/pg_catalog\.pg_has_role\(/i);
      expect(f.ddl, f.name).not.toMatch(/\bFROM\s+(?!public\.|pg_catalog\.)[a-z_]+\b(?!\s*\()/i.exec(f.ddl)?.[0] ?? "NO-UNQUALIFIED");
    }
  });
  it("the topology grants EXECUTE to the runtime + eraser and revokes it from PUBLIC", () => {
    const sql = plan(["op_a"]).join("\n");
    for (const f of SECURITY_DEFINER_FUNCTIONS) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${f.name}(${f.args}) FROM PUBLIC`);
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f.name}\\(${f.args}\\) TO "opsiq_app"`));
    }
  });
});

describe("no owner-only SQL in the application runtime path", () => {
  const OWNER_SQL = /(?:\$executeRaw(?:Unsafe)?|\$queryRaw(?:Unsafe)?|\.query)\s*(?:<[^>]*>)?\s*\(?\s*`[^`]*\b(?:(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|SCHEMA|ROLE|FUNCTION|EXTENSION|TRIGGER|SEQUENCE|TYPE|VIEW)|TRUNCATE|SET\s+(?:LOCAL\s+)?ROLE|SET\s+session_replication_role|GRANT|REVOKE|VACUUM|REINDEX|LOCK\s+TABLE|COMMENT\s+ON)\b[^`]*`/i;
  const files = walk(join(ROOT, "src")).filter((f) => !/privacy-erasure[\\/](role-topology|runtime-role-probe)|infra[\\/](role-cutover-target|staging-database-target)/.test(f));
  it("scans a real file set", () => expect(files.length).toBeGreaterThan(500));
  it("RUNTIME_OWNER_DEPENDENCIES=0: no runtime SQL literal needs ownership (DDL, TRUNCATE, GRANT, SET ROLE, VACUUM, LOCK TABLE …)", () => {
    const offenders = files.filter((f) => OWNER_SQL.test(readFileSync(f, "utf8"))).map((f) => f.replace(ROOT, ""));
    expect(offenders).toEqual([]);
  });
  it("the runtime never reads a migrator credential variable", () => {
    const offenders = files
      .filter((f) => !/infra[\\/]prisma-datasource\.ts$/.test(f))
      .filter((f) => /\b(MIGRATION_DATABASE_URL|OWNER_DATABASE_URL|PRODUCTION_DATABASE_URL)\b/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(ROOT, ""));
    expect(offenders).toEqual([]);
  });
});

describe("cutover CLI", () => {
  const cli = read("scripts/db/opsiq-role-cutover.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // code only: the header comment states what the tool does NOT do
  it("never reads the runtime URL or the migration-override URL and never handles a password", () => {
    expect(cli).not.toMatch(/process\.env\.(DATABASE_URL|MIGRATION_DATABASE_URL)|env\.(DATABASE_URL|MIGRATION_DATABASE_URL)|\[["'](DATABASE_URL|MIGRATION_DATABASE_URL)["']\]/);
    expect(cli).not.toMatch(/process\.env\.\w*PASSWORD|--password|readline|prompt\(|PASSWORD\s+'/i);
    expect(cli).not.toMatch(/vercel|VERCEL/i);
  });
  it("selects its database only from the explicit variables", () => {
    expect(read("scripts/db/opsiq-role-cutover.ts")).toContain("never edits Vercel");
    expect(cli).toContain("OWNER_DATABASE_URL");
    expect(cli).toContain("OPSIQ_RUNTIME_PROBE_DATABASE_URL");
  });
  it("never logs a connection string", () => {
    expect(cli).not.toMatch(/console\.(log|error)\([^)]*\b(url|connectionString)\b/);
  });
});

describe("target guard", () => {
  const PROD_HOST = "ep-empty-sky-ay1e6c27.c-2.ap-southeast-1.aws.neon.tech";
  const prodUrl = `postgresql://u:p@${PROD_HOST}/neondb?sslmode=require`;
  const prodEnv = { OPSIQ_DB_TARGET: "production", OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true" };
  const run = (o: Record<string, unknown>) => assertRoleCutoverStaticTarget({ command: "apply", target: "production", url: prodUrl, env: prodEnv, expectedHost: PROD_HOST, confirm: PRODUCTION_APPLY_CONFIRMATION, ...o } as never);
  const code = (f: () => unknown) => { try { f(); return "OK"; } catch (e) { return e instanceof RoleCutoverRefusal ? e.code : `OTHER:${(e as Error).message}`; } };

  it("accepts a fully authorized production apply", () => expect(code(() => run({}))).toBe("OK"));
  it("refuses a missing / unknown target (no implicit database)", () => {
    expect(code(() => run({ target: undefined }))).toBe("TARGET_REQUIRED");
    expect(code(() => run({ target: "prod" }))).toBe("TARGET_REQUIRED");
  });
  it("refuses production without BOTH authorization variables", () => {
    expect(code(() => run({ env: {} }))).toBe("PRODUCTION_NOT_AUTHORIZED");
    expect(code(() => run({ env: { OPSIQ_DB_TARGET: "production" } }))).toBe("PRODUCTION_NOT_AUTHORIZED");
  });
  it("refuses a pooled production endpoint, a wrong / missing expected host, and a missing confirmation", () => {
    const pooled = `postgresql://u:p@ep-empty-sky-ay1e6c27-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb`;
    expect(code(() => run({ url: pooled, expectedHost: "ep-empty-sky-ay1e6c27-pooler.c-2.ap-southeast-1.aws.neon.tech" }))).toBe("POOLED_ENDPOINT");
    expect(code(() => run({ expectedHost: "ep-other.c-2.aws.neon.tech" }))).toBe("EXPECTED_HOST_MISMATCH");
    expect(code(() => run({ expectedHost: undefined }))).toBe("EXPECTED_HOST_REQUIRED");
    expect(code(() => run({ confirm: "yes" }))).toBe("CONFIRMATION_REQUIRED");
    expect(code(() => run({ confirm: undefined }))).toBe("CONFIRMATION_REQUIRED");
  });
  it("a production dry-run, verify and probe need no confirmation phrase", () => {
    expect(code(() => run({ dryRun: true, confirm: undefined }))).toBe("OK");
    expect(code(() => run({ command: "verify", confirm: undefined }))).toBe("OK");
  });
  it("refuses --target production for an unknown endpoint, and a production endpoint under any non-production label", () => {
    expect(code(() => run({ url: "postgresql://u:p@ep-unknown-1234.c-2.aws.neon.tech/neondb", expectedHost: "ep-unknown-1234.c-2.aws.neon.tech" }))).toBe("NOT_PRODUCTION_ENDPOINT");
    expect(code(() => run({ target: "test", env: {} }))).toBe("PRODUCTION_ENDPOINT");
    expect(code(() => run({ target: "local", env: {} }))).toBe("NOT_LOCAL");
    expect(code(() => run({ target: "ci", env: {} }))).toBe("NOT_LOCAL");
  });
  it("refuses an unset or unparseable URL", () => {
    expect(code(() => run({ url: undefined }))).toBe("URL_UNSET");
    expect(code(() => run({ url: "not a url" }))).toBe("URL_NOT_PLAIN_POSTGRES");
  });
  it("local accepts only loopback", () => {
    expect(code(() => run({ target: "local", url: "postgresql://u:p@127.0.0.1:5432/x", env: {} }))).toBe("OK");
    expect(code(() => run({ target: "local", url: "postgresql://u:p@db.example.com/x", env: {} }))).toBe("NOT_LOCAL");
  });
  it("the connected database's own identity must agree with the label", () => {
    const prod = { endpointId: "ep-empty-sky-ay1e6c27", branchId: "br-purple-boat-ayjn6zl6" } as never;
    const other = { endpointId: "ep-unknown", branchId: "br-unknown" } as never;
    expect(() => assertRoleCutoverConnectedIdentity("production", prod, {})).not.toThrow();
    expect(() => assertRoleCutoverConnectedIdentity("production", other, {})).toThrow(RoleCutoverRefusal);
    expect(() => assertRoleCutoverConnectedIdentity("test", prod, {})).toThrow(RoleCutoverRefusal);
    expect(() => assertRoleCutoverConnectedIdentity("local", prod, {})).not.toThrow();
  });
  it("error messages never echo the URL, host or credentials", () => {
    try { run({ expectedHost: "ep-other.c-2.aws.neon.tech" }); } catch (e) {
      const m = (e as Error).message;
      expect(m).not.toContain("ep-empty-sky");
      expect(m).not.toContain("u:p");
    }
  });
});
