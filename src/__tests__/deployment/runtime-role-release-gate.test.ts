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
import {
  MIGRATOR_CREDENTIAL_VARIABLES,
  RUNTIME_DENIED_TABLES,
  WRITE_CAPABILITY_TARGET_TABLE,
  SCHEMA_SAFETY_SQL,
  READ_ONLY_SQL_TRANSACTION_SQLSTATE,
  INSUFFICIENT_PRIVILEGE_SQLSTATE,
  evaluateRuntimeRole,
  evaluateWriteCapability,
  proveWriteCapabilityOnClient,
  runGate,
} from "../../../scripts/release/production-migration-gate.mjs";
import { RUNTIME_DENIED_TABLES as TS_DENIED } from "@/services/privacy-erasure/role-topology";
import {
  WRITE_CAPABILITY_TARGET_TABLE as TS_WRITE_CAPABILITY_TARGET_TABLE,
  SCHEMA_SAFETY_SQL as TS_SCHEMA_SAFETY_SQL,
  WRITE_CAPABILITY_PROBE_NAME as TS_WRITE_CAPABILITY_PROBE_NAME,
  checkWriteProbeSchemaSafety,
  probeRuntimeRole,
} from "@/services/privacy-erasure/runtime-role-probe";

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
const goodCapability = { ok: true, code: "PASS", sqlState: null as string | null };

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
  it("PASSES when DATABASE_URL authenticates as the runtime role with every table granted and write capability proven", async () => {
    const r = await runGate({ env, cwd: repo(), readRows: async () => rows, readIdentity: async () => good, readWriteCapability: async () => goodCapability });
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain('runtime role "opsiq_app" verified');
    expect(r.output).toContain('runtime role "opsiq_app" verified read-write capable (no-op transaction rolled back)');
  });
  it("BLOCKS when DATABASE_URL is the owner (still neondb_owner), and never even attempts the write-capability probe", async () => {
    let capabilityCalled = false;
    const r = await runGate({
      env,
      cwd: repo(),
      readRows: async () => rows,
      readIdentity: async () => ({ ...good, currentUser: "neondb_owner" }),
      readWriteCapability: async () => { capabilityCalled = true; return goodCapability; },
    });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("other than the required runtime role");
    expect(capabilityCalled).toBe(false);
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
  it("a migration problem still blocks even when the role and write capability are fine", async () => {
    const r = await runGate({ env, cwd: repo(), readRows: async () => [], readIdentity: async () => good, readWriteCapability: async () => goodCapability });
    expect(r.exitCode).toBe(1);
  });
});

describe("release gate — runtime WRITE CAPABILITY (closes the read-only-transaction assurance gap)", () => {
  const env = { ...base, OPSIQ_REQUIRE_RUNTIME_ROLE: "opsiq_app" };
  const run = (capability: unknown) => runGate({ env, cwd: repo(), readRows: async () => rows, readIdentity: async () => good, readWriteCapability: async () => capability });

  it("1. a genuinely read-write runtime session PASSES, with the exact required success message", async () => {
    const r = await run(goodCapability);
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain('PASS: runtime role "opsiq_app" verified read-write capable (no-op transaction rolled back)');
  });

  it("2. transaction_read_only=on BLOCKS the build", async () => {
    const r = await run({ ok: false, code: "TRANSACTION_READ_ONLY", sqlState: null });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("transaction_read_only");
    expect(r.output.toLowerCase()).toContain("read-write transaction");
  });

  it("3. default_transaction_read_only=on BLOCKS the build", async () => {
    const r = await run({ ok: false, code: "DEFAULT_TRANSACTION_READ_ONLY", sqlState: null });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("default_transaction_read_only");
  });

  it(`4. the no-op UPDATE throwing ${READ_ONLY_SQL_TRANSACTION_SQLSTATE} (read_only_sql_transaction) BLOCKS, by exact SQLSTATE`, async () => {
    const r = await run({ ok: false, code: "READ_ONLY_SQL_TRANSACTION", sqlState: READ_ONLY_SQL_TRANSACTION_SQLSTATE });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain(`SQLSTATE ${READ_ONLY_SQL_TRANSACTION_SQLSTATE}`);
    expect(r.output).toContain("rejected as a read-only transaction");
  });

  it(`5. the no-op UPDATE throwing ${INSUFFICIENT_PRIVILEGE_SQLSTATE} (insufficient privilege) BLOCKS, by exact SQLSTATE`, async () => {
    const r = await run({ ok: false, code: "INSUFFICIENT_PRIVILEGE", sqlState: INSUFFICIENT_PRIVILEGE_SQLSTATE });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain(`SQLSTATE ${INSUFFICIENT_PRIVILEGE_SQLSTATE}`);
    expect(r.output).toContain("lacks UPDATE privilege");
  });

  it("6. identity wrong: the existing identity failure remains unchanged and write capability is never probed", async () => {
    let capabilityCalled = false;
    const r = await runGate({
      env,
      cwd: repo(),
      readRows: async () => rows,
      readIdentity: async () => ({ ...good, currentUser: "neondb_owner" }),
      readWriteCapability: async () => { capabilityCalled = true; return goodCapability; },
    });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("other than the required runtime role");
    expect(r.output).not.toContain("write-capability");
    expect(capabilityCalled).toBe(false);
  });

  it("7. the real write-capability check ALWAYS rolls back, whether the no-op UPDATE succeeds or fails", async () => {
    const calls: string[] = [];
    const passClient = fakeWriteCapabilityClient(calls, { outcome: "pass" });
    await proveWriteCapabilityOnClient(passClient, "opsiq_app");
    expect(calls).toContain("ROLLBACK");

    const calls2: string[] = [];
    const failClient = fakeWriteCapabilityClient(calls2, { outcome: "readOnly" });
    await proveWriteCapabilityOnClient(failClient, "opsiq_app");
    expect(calls2).toContain("ROLLBACK");

    const calls3: string[] = [];
    const privClient = fakeWriteCapabilityClient(calls3, { outcome: "insufficientPrivilege" });
    await proveWriteCapabilityOnClient(privClient, "opsiq_app");
    expect(calls3).toContain("ROLLBACK");
  });

  it("8. no secret, URL, or host ever appears in a write-capability BLOCKED report", async () => {
    for (const capability of [
      { ok: false, code: "TRANSACTION_READ_ONLY", sqlState: null },
      { ok: false, code: "DEFAULT_TRANSACTION_READ_ONLY", sqlState: null },
      { ok: false, code: "READ_ONLY_SQL_TRANSACTION", sqlState: READ_ONLY_SQL_TRANSACTION_SQLSTATE },
      { ok: false, code: "INSUFFICIENT_PRIVILEGE", sqlState: INSUFFICIENT_PRIVILEGE_SQLSTATE },
      { ok: false, code: "CONNECTION_FAILURE", sqlState: null },
      { ok: false, code: "UNEXPECTED_SQLSTATE", sqlState: "58030" },
      { ok: false, code: "ROLLBACK_FAILURE", sqlState: "55006" },
      { ok: false, code: "READ_ONLY_SQL_TRANSACTION", sqlState: READ_ONLY_SQL_TRANSACTION_SQLSTATE, rollbackFailed: true },
    ]) {
      const r = await run(capability);
      expect(r.exitCode).toBe(1);
      expect(r.output).not.toContain("db.invalid");
      expect(r.output).not.toMatch(/postgres(?:ql)?:\/\//i);
      expect(r.output).not.toMatch(/password/i);
    }
  });
});

describe("evaluateWriteCapability — pure decision, never contains connection details", () => {
  it("PASSes through a successful capability with no lines", () => {
    expect(evaluateWriteCapability({ ok: true, code: "PASS", sqlState: null }, "opsiq_app")).toEqual({ ok: true, lines: [] });
  });
  it("produces a bounded, sanitized BLOCKED line for every known failure code", () => {
    for (const capability of [
      { ok: false, code: "IDENTITY_MISMATCH", sqlState: null },
      { ok: false, code: "TRANSACTION_READ_ONLY", sqlState: null },
      { ok: false, code: "DEFAULT_TRANSACTION_READ_ONLY", sqlState: null },
      { ok: false, code: "READ_ONLY_SQL_TRANSACTION", sqlState: READ_ONLY_SQL_TRANSACTION_SQLSTATE },
      { ok: false, code: "INSUFFICIENT_PRIVILEGE", sqlState: INSUFFICIENT_PRIVILEGE_SQLSTATE },
      { ok: false, code: "CONNECTION_FAILURE", sqlState: null },
      { ok: false, code: "CONNECTION_OR_QUERY_FAILURE", sqlState: null },
      { ok: false, code: "UNEXPECTED_SQLSTATE", sqlState: "58030" },
      { ok: false, code: "ROLLBACK_FAILURE", sqlState: "55006" },
    ]) {
      const r = evaluateWriteCapability(capability, "opsiq_app");
      expect(r.ok).toBe(false);
      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]).toMatch(/^\[release-gate\] BLOCKED:/);
    }
  });
  it("fails closed with an UNVERIFIED message when capability is null/missing entirely", () => {
    const r = evaluateWriteCapability(null, "opsiq_app");
    expect(r.ok).toBe(false);
    expect(r.lines[0]).toContain("could not be verified");
  });
  it("an unrecognized sqlState (not 5 chars) is never echoed into the message", () => {
    const r = evaluateWriteCapability({ ok: false, code: "UNEXPECTED_SQLSTATE", sqlState: "not-a-sqlstate" }, "opsiq_app");
    expect(r.lines[0]).not.toContain("not-a-sqlstate");
  });
});

describe("proveWriteCapabilityOnClient — identity requires BOTH current_user AND session_user", () => {
  it("1. current_user=opsiq_app, session_user=opsiq_app → eligible to continue (proceeds to PASS)", async () => {
    const calls: string[] = [];
    const client = fakeWriteCapabilityClient(calls, { outcome: "pass", currentUser: "opsiq_app", sessionUser: "opsiq_app" });
    const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
    expect(r).toEqual({ ok: true, code: "PASS", sqlState: null });
  });

  it("2. current_user=neondb_owner, session_user=neondb_owner → BLOCK", async () => {
    const calls: string[] = [];
    const client = fakeWriteCapabilityClient(calls, { outcome: "pass", currentUser: "neondb_owner", sessionUser: "neondb_owner" });
    const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
    expect(r).toEqual({ ok: false, code: "IDENTITY_MISMATCH", sqlState: null });
  });

  it("3. current_user=opsiq_app, session_user=neondb_owner (SET ROLE from a stronger login) → BLOCK", async () => {
    const calls: string[] = [];
    const client = fakeWriteCapabilityClient(calls, { outcome: "pass", currentUser: "opsiq_app", sessionUser: "neondb_owner" });
    const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
    expect(r).toEqual({ ok: false, code: "IDENTITY_MISMATCH", sqlState: null });
  });

  it("4. the identity check runs, and fails closed, BEFORE any BEGIN is ever issued", async () => {
    const calls: string[] = [];
    const client = fakeWriteCapabilityClient(calls, { outcome: "pass", currentUser: "opsiq_app", sessionUser: "neondb_owner" });
    await proveWriteCapabilityOnClient(client, "opsiq_app");
    expect(calls).not.toContain("BEGIN");
    expect(calls.some((c) => /UPDATE/.test(c))).toBe(false);
  });

  it("5. a session_user mismatch is never reported as success, under any current_user/session_user combination", async () => {
    for (const [currentUser, sessionUser] of [
      ["neondb_owner", "opsiq_app"],
      ["opsiq_app", "neondb_owner"],
      ["neondb_owner", "neondb_owner"],
      ["some_other_role", "some_other_role"],
    ] as const) {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "pass", currentUser, sessionUser });
      const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(r.ok, `${currentUser}/${sessionUser}`).toBe(false);
      expect(r.code, `${currentUser}/${sessionUser}`).toBe("IDENTITY_MISMATCH");
    }
  });
});

describe("proveWriteCapabilityOnClient — pure logic over a fake client (no database)", () => {
  it("identity mismatch fails closed before any transaction is opened", async () => {
    const calls: string[] = [];
    const client = fakeWriteCapabilityClient(calls, { outcome: "pass", currentUser: "neondb_owner" });
    const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
    expect(r).toEqual({ ok: false, code: "IDENTITY_MISMATCH", sqlState: null });
    expect(calls).not.toContain("BEGIN");
  });

  it("transaction_read_only=on fails closed before BEGIN", async () => {
    const calls: string[] = [];
    const client = fakeWriteCapabilityClient(calls, { outcome: "pass", txn: "on" });
    const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
    expect(r).toEqual({ ok: false, code: "TRANSACTION_READ_ONLY", sqlState: null });
    expect(calls).not.toContain("BEGIN");
  });

  it("default_transaction_read_only=on fails closed before BEGIN", async () => {
    const calls: string[] = [];
    const client = fakeWriteCapabilityClient(calls, { outcome: "pass", dflt: "on" });
    const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
    expect(r).toEqual({ ok: false, code: "DEFAULT_TRANSACTION_READ_ONLY", sqlState: null });
    expect(calls).not.toContain("BEGIN");
  });

  it("a successful no-op UPDATE PASSES, using BEGIN (not BEGIN READ ONLY) and the exact zero-row WHERE false statement, then rolls back", async () => {
    const calls: string[] = [];
    const client = fakeWriteCapabilityClient(calls, { outcome: "pass" });
    const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
    expect(r).toEqual({ ok: true, code: "PASS", sqlState: null });
    expect(calls).toContain("BEGIN");
    expect(calls.some((c) => c === "BEGIN READ ONLY")).toBe(false);
    expect(calls.some((c) => c.includes(WRITE_CAPABILITY_TARGET_TABLE) && /WHERE false/.test(c))).toBe(true);
    expect(calls[calls.length - 1]).toBe("ROLLBACK");
  });

  it(`a ${READ_ONLY_SQL_TRANSACTION_SQLSTATE} on the UPDATE fails closed and still rolls back`, async () => {
    const calls: string[] = [];
    const client = fakeWriteCapabilityClient(calls, { outcome: "readOnly" });
    const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
    expect(r).toEqual({ ok: false, code: "READ_ONLY_SQL_TRANSACTION", sqlState: READ_ONLY_SQL_TRANSACTION_SQLSTATE });
    expect(calls[calls.length - 1]).toBe("ROLLBACK");
  });

  it(`a ${INSUFFICIENT_PRIVILEGE_SQLSTATE} on the UPDATE fails closed and still rolls back`, async () => {
    const calls: string[] = [];
    const client = fakeWriteCapabilityClient(calls, { outcome: "insufficientPrivilege" });
    const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
    expect(r).toEqual({ ok: false, code: "INSUFFICIENT_PRIVILEGE", sqlState: INSUFFICIENT_PRIVILEGE_SQLSTATE });
    expect(calls[calls.length - 1]).toBe("ROLLBACK");
  });

  it("an unrecognized SQLSTATE on the UPDATE fails closed (never silently PASSes) and still rolls back", async () => {
    const calls: string[] = [];
    const client = fakeWriteCapabilityClient(calls, { outcome: "other" });
    const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("UNEXPECTED_SQLSTATE");
    expect(calls[calls.length - 1]).toBe("ROLLBACK");
  });

  describe("ROLLBACK must be CONFIRMED, not merely attempted — a rollback failure never produces a false PASS", () => {
    it("UPDATE success + ROLLBACK success → PASS", async () => {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "pass" });
      const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(r).toEqual({ ok: true, code: "PASS", sqlState: null });
      expect(calls[calls.length - 1]).toBe("ROLLBACK");
    });

    it("UPDATE success + ROLLBACK failure → BLOCK (ROLLBACK_FAILURE), never PASS", async () => {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "pass", rollbackThrows: true });
      const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(r.ok).toBe(false);
      expect(r.code).toBe("ROLLBACK_FAILURE");
    });

    it(`UPDATE ${READ_ONLY_SQL_TRANSACTION_SQLSTATE} + ROLLBACK success → read-only failure`, async () => {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "readOnly" });
      const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(r).toEqual({ ok: false, code: "READ_ONLY_SQL_TRANSACTION", sqlState: READ_ONLY_SQL_TRANSACTION_SQLSTATE });
    });

    it(`UPDATE ${INSUFFICIENT_PRIVILEGE_SQLSTATE} + ROLLBACK success → insufficient privilege failure`, async () => {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "insufficientPrivilege" });
      const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(r).toEqual({ ok: false, code: "INSUFFICIENT_PRIVILEGE", sqlState: INSUFFICIENT_PRIVILEGE_SQLSTATE });
    });

    it("UPDATE failure + ROLLBACK failure → FAIL CLOSED; the original substantive failure is preserved, never PASS, with a rollbackFailed marker", async () => {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "readOnly", rollbackThrows: true });
      const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(r.ok).toBe(false);
      expect(r.code).toBe("READ_ONLY_SQL_TRANSACTION");
      expect(r.sqlState).toBe(READ_ONLY_SQL_TRANSACTION_SQLSTATE);
      expect(r.rollbackFailed).toBe(true);

      const calls2: string[] = [];
      const client2 = fakeWriteCapabilityClient(calls2, { outcome: "insufficientPrivilege", rollbackThrows: true });
      const r2 = await proveWriteCapabilityOnClient(client2, "opsiq_app");
      expect(r2.ok).toBe(false);
      expect(r2.code).toBe("INSUFFICIENT_PRIVILEGE");
      expect(r2.rollbackFailed).toBe(true);
    });

    it("the sanitized BLOCKED report for a ROLLBACK_FAILURE contains no URL, host, password, or raw DB message", () => {
      const r = evaluateWriteCapability({ ok: false, code: "ROLLBACK_FAILURE", sqlState: "55006" }, "opsiq_app");
      expect(r.ok).toBe(false);
      expect(r.lines[0]).toMatch(/^\[release-gate\] BLOCKED:/);
      expect(r.lines[0]).not.toMatch(/postgres(?:ql)?:\/\//i);
      expect(r.lines[0]).not.toMatch(/password/i);
      expect(r.lines[0]).toContain("SQLSTATE 55006");
    });
  });

  describe("schema safety: WHERE false alone is not sufficient — a statement-level UPDATE trigger or UPDATE rewrite rule must also be ruled out BEFORE any write", () => {
    it("1. no statement-level trigger or rule → capability may continue (proceeds to PASS)", async () => {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "pass", unsafeTriggers: 0, unsafeRules: 0 });
      const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(r).toEqual({ ok: true, code: "PASS", sqlState: null });
    });

    it("3. an enabled statement-level UPDATE trigger → BLOCK (UNSAFE_WRITE_PROBE_SCHEMA)", async () => {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "pass", unsafeTriggers: 1 });
      const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(r).toEqual({ ok: false, code: "UNSAFE_WRITE_PROBE_SCHEMA", sqlState: null });
    });

    it("5. an UPDATE rewrite rule → BLOCK (UNSAFE_WRITE_PROBE_SCHEMA)", async () => {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "pass", unsafeRules: 1 });
      const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(r).toEqual({ ok: false, code: "UNSAFE_WRITE_PROBE_SCHEMA", sqlState: null });
    });

    it("6. a schema-safety inspection failure (catalog query throws) → BLOCK, never silently treated as safe", async () => {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "pass", schemaSafetyThrows: true });
      const r = await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(r.ok).toBe(false);
      expect(r.code).toBe("CONNECTION_OR_QUERY_FAILURE");
    });

    it("7. an unsafe schema BLOCKS before any BEGIN is ever issued", async () => {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "pass", unsafeTriggers: 1 });
      await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(calls).not.toContain("BEGIN");
    });

    it("8. an unsafe schema BLOCKS before the write-class UPDATE (or any DML) is ever issued", async () => {
      const calls: string[] = [];
      const client = fakeWriteCapabilityClient(calls, { outcome: "pass", unsafeRules: 1 });
      await proveWriteCapabilityOnClient(client, "opsiq_app");
      expect(calls.some((c) => /^UPDATE/.test(c))).toBe(false);
      expect(calls).not.toContain("ROLLBACK");
    });

    it("9. the sanitized BLOCKED report for an unsafe schema contains no trigger/rule name, definition, URL, host, or password", () => {
      const r = evaluateWriteCapability({ ok: false, code: "UNSAFE_WRITE_PROBE_SCHEMA", sqlState: null }, "opsiq_app");
      expect(r.ok).toBe(false);
      expect(r.lines[0]).toMatch(/^\[release-gate\] BLOCKED:/);
      expect(r.lines[0]).not.toMatch(/postgres(?:ql)?:\/\//i);
      expect(r.lines[0]).not.toMatch(/password/i);
      // only the fixed, already-public target table name may appear — never an arbitrary trigger/rule identifier
      expect(r.lines[0]).not.toMatch(/zz_|trigger_name|rule_name/i);
    });

    it("the real query is parameterized ($1::regclass) — it never interpolates the target table into catalog SQL", () => {
      expect(SCHEMA_SAFETY_SQL).toContain("$1::regclass");
      expect(SCHEMA_SAFETY_SQL).not.toContain("${");
      expect(SCHEMA_SAFETY_SQL).not.toMatch(/startup_status/);
    });
  });
});

describe("schema-safety drift guards — the release gate and the governed runtime probe must share one policy", () => {
  it("WRITE_CAPABILITY_TARGET_TABLE is byte-identical between the release gate (.mjs) and the governed probe (.ts)", () => {
    expect(WRITE_CAPABILITY_TARGET_TABLE).toBe(TS_WRITE_CAPABILITY_TARGET_TABLE);
  });
  it("SCHEMA_SAFETY_SQL is byte-identical between the release gate (.mjs) and the governed probe (.ts)", () => {
    expect(SCHEMA_SAFETY_SQL).toBe(TS_SCHEMA_SAFETY_SQL);
  });
  it("checkWriteProbeSchemaSafety() (the TS probe's helper) agrees with the release gate's inline check on the same fake catalog result", async () => {
    const fakeSafe = { query: async () => ({ rows: [{ unsafe_triggers: 0, unsafe_rules: 0 }] }) };
    expect((await checkWriteProbeSchemaSafety(fakeSafe as never, "public.startup_status")).safe).toBe(true);
    const fakeUnsafe = { query: async () => ({ rows: [{ unsafe_triggers: 1, unsafe_rules: 0 }] }) };
    expect((await checkWriteProbeSchemaSafety(fakeUnsafe as never, "public.startup_status")).safe).toBe(false);
  });
});

describe("probeRuntimeRole() — schema safety is proven BEFORE any BEGIN (fake client, no database)", () => {
  /** Minimal fake client: identity, then the schema-safety catalog query, then (only if safe) BEGIN. */
  function fakeProbeClient(calls: string[], opts: { unsafeTriggers?: number; unsafeRules?: number; schemaThrows?: boolean; currentUser?: string }) {
    const u = opts.currentUser ?? "opsiq_app";
    return {
      query: async (sql: string) => {
        calls.push(sql);
        if (/current_user AS u, session_user AS s/.test(sql)) return { rows: [{ u, s: u }] };
        if (/unsafe_triggers/.test(sql)) {
          if (opts.schemaThrows) throw new Error("simulated schema-safety inspection failure");
          return { rows: [{ unsafe_triggers: opts.unsafeTriggers ?? 0, unsafe_rules: opts.unsafeRules ?? 0 }] };
        }
        // Reached only if BEGIN/ALLOWED/DENIED ran — i.e. ordering regressed back to pre-fix behavior.
        if (sql === "BEGIN") return {};
        throw new Error(`fakeProbeClient: unexpected query (ordering regression?): ${sql}`);
      },
    };
  }

  it("an UNSAFE catalog result → no BEGIN is ever issued, and the write-capability probe is reported FAIL", async () => {
    const calls: string[] = [];
    const client = fakeProbeClient(calls, { unsafeTriggers: 1 });
    const p = await probeRuntimeRole(client as never, "neondb_owner");
    expect(calls).not.toContain("BEGIN");
    expect(p.result).toBe("FAIL");
    const row = p.probes.find((x) => x.name === TS_WRITE_CAPABILITY_PROBE_NAME);
    expect(row).toEqual({ name: TS_WRITE_CAPABILITY_PROBE_NAME, ok: false, detail: "UNSAFE_WRITE_PROBE_SCHEMA" });
  });

  it("a catalog INSPECTION FAILURE → no BEGIN is ever issued, and the write-capability probe is reported FAIL", async () => {
    const calls: string[] = [];
    const client = fakeProbeClient(calls, { schemaThrows: true });
    const p = await probeRuntimeRole(client as never, "neondb_owner");
    expect(calls).not.toContain("BEGIN");
    expect(p.result).toBe("FAIL");
    const row = p.probes.find((x) => x.name === TS_WRITE_CAPABILITY_PROBE_NAME);
    expect(row).toEqual({ name: TS_WRITE_CAPABILITY_PROBE_NAME, ok: false, detail: "SCHEMA_SAFETY_CHECK_FAILED" });
  });

  it("a SAFE catalog result: the schema-safety query is sent, and only THEN does BEGIN occur — in that exact order", async () => {
    const calls: string[] = [];
    const client = fakeProbeClient(calls, {});
    // This fake does not implement the ALLOWED/DENIED statements that follow BEGIN — it is only asked to
    // prove the ORDER of the first three statements, so any later "unexpected query" throw is expected
    // and ignored.
    await probeRuntimeRole(client as never, "neondb_owner").catch(() => {});
    expect(calls[0]).toMatch(/current_user AS u, session_user AS s/);
    expect(calls[1]).toMatch(/unsafe_triggers/);
    expect(calls[2]).toBe("BEGIN");
  });
});

/**
 * Minimal fake pg client for proveWriteCapabilityOnClient()'s query sequence (identity, read-only
 * settings, schema safety, BEGIN, the no-op UPDATE) plus ROLLBACK. Deliberately far smaller than a full
 * probeRuntimeRole fake (15+ statements) — this function's entire surface is these six queries.
 */
function fakeWriteCapabilityClient(
  calls: string[],
  opts: {
    outcome: "pass" | "readOnly" | "insufficientPrivilege" | "other";
    currentUser?: string;
    sessionUser?: string;
    txn?: string;
    dflt?: string;
    rollbackThrows?: boolean;
    unsafeTriggers?: number;
    unsafeRules?: number;
    schemaSafetyThrows?: boolean;
  },
) {
  return {
    query: async (sql: string) => {
      calls.push(sql);
      if (/current_user AS u, session_user AS s/.test(sql)) {
        const u = opts.currentUser ?? "opsiq_app";
        const s = opts.sessionUser ?? u;
        return { rows: [{ u, s }] };
      }
      if (/current_setting\('transaction_read_only'\)/.test(sql)) {
        return { rows: [{ txn: opts.txn ?? "off", dflt: opts.dflt ?? "off" }] };
      }
      if (/unsafe_triggers/.test(sql)) {
        if (opts.schemaSafetyThrows) throw new Error("simulated schema-safety inspection failure");
        return { rows: [{ unsafe_triggers: opts.unsafeTriggers ?? 0, unsafe_rules: opts.unsafeRules ?? 0 }] };
      }
      if (sql === "BEGIN") return {};
      if (/^UPDATE/.test(sql)) {
        if (opts.outcome === "pass") return { rowCount: 0 };
        const codes = { readOnly: READ_ONLY_SQL_TRANSACTION_SQLSTATE, insufficientPrivilege: INSUFFICIENT_PRIVILEGE_SQLSTATE, other: "58030" };
        const err = new Error("simulated") as Error & { code: string };
        err.code = codes[opts.outcome as "readOnly" | "insufficientPrivilege" | "other"];
        throw err;
      }
      if (sql === "ROLLBACK") {
        if (opts.rollbackThrows) throw new Error("simulated rollback failure");
        return {};
      }
      throw new Error(`fakeWriteCapabilityClient: unexpected query: ${sql}`);
    },
  };
}

describe("release gate — drift guards", () => {
  it("the gate's denied-table list equals the topology's (one source of truth)", () => {
    expect([...RUNTIME_DENIED_TABLES].sort()).toEqual([...TS_DENIED].sort());
  });
  it("the runtime URL is the only database variable the gate reads", () => {
    const src = readFileSync(join(ROOT, "scripts/release/production-migration-gate.mjs"), "utf8");
    expect(src).not.toMatch(/env\.(MIGRATION|OWNER|PRODUCTION)_DATABASE_URL/);
  });
});
