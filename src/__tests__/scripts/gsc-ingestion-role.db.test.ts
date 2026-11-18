/**
 * Least-privilege GSC INGESTION role (opsiq_gsc_ingestion) — hostile proof on a DISPOSABLE
 * PostgreSQL database (name must match /opsiq_gsc_role_test/). Sibling to
 * src/__tests__/privacy-erasure/runtime-role.db.test.ts (opsiq_app) and
 * scripts/backup-credential-check.sh (opsiq_backup) — same discipline, applied to the role PR #678
 * deliberately left out of scope: scripts/gsc/opsiq-gsc-ingestion-role.sql.
 *
 * Two logins, same as the opsiq_app suite:
 *   GSC_ROLE_TEST_OWNER_DATABASE_URL   the non-superuser schema owner that applied every Prisma
 *                                      migration (the governed migrator) — used to apply the role
 *                                      SQL script itself and to run admin-side catalog assertions.
 *   (derived)                          opsiq_gsc_ingestion's own login, built by swapping the
 *                                      owner URL's username/password — every assertion about what
 *                                      the role can/cannot do is made AS that role, over a real
 *                                      PostgreSQL connection, never mocked.
 *
 * Nothing here touches Production: the suite refuses to run unless both URLs point at a database
 * whose name contains "opsiq_gsc_role_test", and it never creates the role anywhere else. See
 * scripts/gsc/opsiq-gsc-ingestion-role.sql's own header for the OWNER-ACTION apply procedure this
 * suite is rehearsing against a throwaway database.
 *
 * Run (after `OPSIQ_DB_TARGET=local DATABASE_URL=... npx prisma migrate deploy` against a fresh
 * opsiq_gsc_role_test* database owned by the schema-owner login below):
 *   OPSIQ_DB_TARGET=local TEST_WITH_DB=true \
 *   GSC_ROLE_TEST_OWNER_DATABASE_URL=postgresql://opsiq_schema_owner:pw@127.0.0.1:5432/opsiq_gsc_role_test \
 *     npx vitest run src/__tests__/scripts/gsc-ingestion-role.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const OWNER_URL = process.env.GSC_ROLE_TEST_OWNER_DATABASE_URL ?? "";
const ON_DEDICATED_DB = /opsiq_gsc_role_test/.test(OWNER_URL);
const ROLE = "opsiq_gsc_ingestion";
const TARGET_TABLE = "search_console_metrics";
const ROLE_SQL_PATH = path.resolve(process.cwd(), "scripts/gsc/opsiq-gsc-ingestion-role.sql");
const CREDENTIAL_CHECK_PATH = path.resolve(process.cwd(), "scripts/gsc-credential-check.sh");

const urlFor = (user: string, password = "pw") => {
  const u = new URL(OWNER_URL);
  u.username = user;
  u.password = password;
  return u.toString();
};

let admin: Client;
beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB) return;
  admin = new Client({ connectionString: OWNER_URL });
  await admin.connect();
  // Apply the EXACT shipped SQL file (not a reimplementation) — proves the file itself works, and
  // that it is idempotent (the role script is designed to be re-run; see its own header).
  const sql = readFileSync(ROLE_SQL_PATH, "utf8");
  await admin.query(sql);
  await admin.query(sql); // re-apply: must not error
  await admin.query(`ALTER ROLE ${ROLE} PASSWORD 'pw'`);
});
afterAll(async () => {
  await admin?.end();
});

const asRole = async () => {
  const c = new Client({ connectionString: urlFor(ROLE) });
  await c.connect();
  return c;
};

/** Runs one statement inside BEGIN/ROLLBACK so a probed write never persists. Returns "OK" or the
 * driver's error message (which, for a privilege failure, is PostgreSQL's own "permission denied"
 * text — not a guess). */
async function attempt(c: Client, sql: string): Promise<string> {
  await c.query("BEGIN");
  try {
    return await c.query(sql).then(
      () => "OK",
      (e) => String((e as Error).message),
    );
  } finally {
    await c.query("ROLLBACK").catch(() => {});
  }
}

/** has_table_privilege(ROLE, table, priv), asked from the admin connection — no need to open a new
 * session per check. */
const roleCan = async (table: string, priv: string): Promise<boolean> =>
  (await admin.query(`SELECT has_table_privilege('${ROLE}', $1, $2) AS v`, [table, priv])).rows[0].v;

describe.skipIf(!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB)("[db] opsiq_gsc_ingestion — role attributes", () => {
  it("is a LOGIN role with no superuser/createdb/createrole/replication/bypassrls, and a connection limit of 2", async () => {
    const row = (
      await admin.query(
        `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolconnlimit
         FROM pg_roles WHERE rolname = $1`,
        [ROLE],
      )
    ).rows[0];
    expect(row).toEqual({
      rolcanlogin: true,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
      rolconnlimit: 2,
    });
  });

  it("idle-in-transaction timeout is set (defence in depth against an abandoned ingestion run)", async () => {
    const row = (await admin.query(`SELECT rolconfig FROM pg_roles WHERE rolname = $1`, [ROLE])).rows[0];
    expect((row.rolconfig as string[] | null) ?? []).toEqual(
      expect.arrayContaining([expect.stringContaining("idle_in_transaction_session_timeout")]),
    );
  });

  it("re-applying the shipped SQL file is idempotent: the role's exact grant set is unchanged", async () => {
    const before = (
      await admin.query(
        `SELECT grantee::regrole::text AS grantee, privilege_type
         FROM information_schema.role_table_grants WHERE grantee = $1 ORDER BY table_name, privilege_type`,
        [ROLE],
      )
    ).rows;
    await admin.query(readFileSync(ROLE_SQL_PATH, "utf8"));
    const after = (
      await admin.query(
        `SELECT grantee::regrole::text AS grantee, privilege_type
         FROM information_schema.role_table_grants WHERE grantee = $1 ORDER BY table_name, privilege_type`,
        [ROLE],
      )
    ).rows;
    expect(after).toEqual(before);
  });

  it("holds exactly SELECT, INSERT, UPDATE on search_console_metrics — nothing more, nothing less", async () => {
    const privs = (
      await admin.query(
        `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants
         WHERE grantee = $1 AND table_schema = 'public' AND table_name = $2 ORDER BY 1`,
        [ROLE, TARGET_TABLE],
      )
    ).rows.map((r) => r.privilege_type);
    expect(privs).toEqual(["INSERT", "SELECT", "UPDATE"]);
  });

  it("holds NO grant on any table other than search_console_metrics", async () => {
    const rows = (
      await admin.query(`SELECT table_name FROM information_schema.role_table_grants WHERE grantee = $1 AND table_name <> $2`, [
        ROLE,
        TARGET_TABLE,
      ])
    ).rows;
    expect(rows).toEqual([]);
  });

  it("holds NO sequence grant (search_console_metrics has no sequence: id defaults to gen_random_uuid())", async () => {
    const rows = (await admin.query(`SELECT * FROM information_schema.role_usage_grants WHERE grantee = $1 AND object_type = 'SEQUENCE'`, [ROLE]))
      .rows;
    expect(rows).toEqual([]);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB)("[db] opsiq_gsc_ingestion — positive: can read/write its own table", () => {
  it("SELECT, INSERT and UPDATE on search_console_metrics all succeed", async () => {
    const rt = await asRole();
    try {
      expect(await attempt(rt, `SELECT 1 FROM public.${TARGET_TABLE}`)).toBe("OK");
      expect(
        await attempt(
          rt,
          `INSERT INTO public.${TARGET_TABLE} (site_url, date, clicks, impressions, ctr, position, row_key, updated_at)
           VALUES ('sc-domain:test.example', '2026-01-01', 1, 1, 1.0, 1.0, 'zz-role-test-key', now())`,
        ),
      ).toBe("OK");
      expect(await attempt(rt, `UPDATE public.${TARGET_TABLE} SET clicks = clicks + 1 WHERE row_key = 'zz-role-test-key'`)).toBe("OK");
    } finally {
      await rt.end();
    }
  });

  it("cannot DELETE or TRUNCATE search_console_metrics (granted exactly SELECT/INSERT/UPDATE)", async () => {
    const rt = await asRole();
    try {
      expect(await attempt(rt, `DELETE FROM public.${TARGET_TABLE} WHERE row_key = 'zz-role-test-key'`)).toMatch(/permission denied/);
      expect(await attempt(rt, `TRUNCATE public.${TARGET_TABLE}`)).toMatch(/permission denied/);
    } finally {
      await rt.end();
    }
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB)(
  "[db] opsiq_gsc_ingestion — negative: cannot touch users (auth), qbo_connections (financial/QBO), or client_accounts (unrelated business)",
  () => {
    it.each([
      ["public.users", "users (auth)"],
      ["public.qbo_connections", "qbo_connections (QBO/financial)"],
      ["public.client_accounts", "client_accounts (unrelated business table)"],
    ])("%s — SELECT, INSERT, UPDATE and DELETE are all permission denied", async (table) => {
      const rt = await asRole();
      try {
        expect(await attempt(rt, `SELECT 1 FROM ${table}`)).toMatch(/permission denied/);
        expect(await attempt(rt, `DELETE FROM ${table} WHERE false`)).toMatch(/permission denied/);
        // No INSERT/UPDATE probe with real columns here (schemas differ per table and this suite
        // must not depend on their exact shape) — has_table_privilege proves the grant is absent,
        // which is what controls whether PostgreSQL would even reach a column-list/type error.
        expect(await roleCan(table, "SELECT")).toBe(false);
        expect(await roleCan(table, "INSERT")).toBe(false);
        expect(await roleCan(table, "UPDATE")).toBe(false);
        expect(await roleCan(table, "DELETE")).toBe(false);
      } finally {
        await rt.end();
      }
    });
  },
);

describe.skipIf(!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB)("[db] opsiq_gsc_ingestion — blanket sweep + privilege-escalation attempts", () => {
  it("is denied SELECT/INSERT/UPDATE/DELETE on every table in the schema except search_console_metrics", async () => {
    const rows = (
      await admin.query(
        `SELECT c.relname
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%'
           AND c.relkind IN ('r', 'p', 'v', 'm') AND c.relname <> $1
           AND (has_table_privilege($2, c.oid, 'SELECT') OR has_table_privilege($2, c.oid, 'INSERT')
                OR has_table_privilege($2, c.oid, 'UPDATE') OR has_table_privilege($2, c.oid, 'DELETE')
                OR has_table_privilege($2, c.oid, 'TRUNCATE'))`,
        [TARGET_TABLE, ROLE],
      )
    ).rows;
    expect(rows).toEqual([]);
  });

  it("cannot escalate: cannot create a role, grant itself superuser, or SET ROLE to the schema owner", async () => {
    const rt = await asRole();
    try {
      expect(await attempt(rt, `CREATE ROLE zz_gsc_evil`)).toMatch(/permission denied/);
      expect(await attempt(rt, `ALTER ROLE ${ROLE} SUPERUSER`)).toMatch(/permission denied|must be superuser/);
      expect(await attempt(rt, `SET ROLE "${new URL(OWNER_URL).username}"`)).toMatch(/permission denied to set role/);
    } finally {
      await rt.end();
    }
  });

  it("connection limit of 2 is enforced by PostgreSQL itself", async () => {
    // The suite's own global setup (vitest-global-setup.ts) keeps one persistent keepalive
    // connection open AS this role for the whole run (DATABASE_URL points at it) -- so this test
    // asks Postgres how many slots are already used rather than assuming zero, then fills exactly
    // up to the limit before proving the NEXT connection is refused. Every opened client (including
    // one that unexpectedly succeeds where a refusal was expected) is closed in `finally`, so a
    // failure here can never leak a connection that starves a later test in this file.
    const used = Number(
      (await admin.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = $1`, [ROLE])).rows[0].n,
    );
    const slotsLeft = Math.max(0, 2 - used);
    const opened: Client[] = [];
    let overflow: Client | undefined;
    try {
      for (let i = 0; i < slotsLeft; i++) opened.push(await asRole());
      await expect(
        asRole().then((c) => {
          overflow = c;
          return c;
        }),
      ).rejects.toThrow(/too many connections/i);
    } finally {
      await Promise.all([...opened, overflow].filter((c): c is Client => Boolean(c)).map((c) => c.end().catch(() => {})));
    }
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB)("[db] scripts/gsc-credential-check.sh — the shipped shell script against the real role", () => {
  it("reports GSC_INGESTION_CREDENTIAL=OK and least_privilege=OK, printing counts/booleans only", () => {
    const out = execFileSync("bash", [CREDENTIAL_CHECK_PATH], {
      env: { ...process.env, DATABASE_URL: urlFor(ROLE), REQUIRE_LEAST_PRIVILEGE: "1" },
      encoding: "utf8",
    });
    expect(out).toContain("GSC_INGESTION_CREDENTIAL=OK");
    expect(out).toContain("CREDENTIAL_CHECK least_privilege=OK");
    expect(out).toContain("CREDENTIAL_CHECK target_select=true");
    expect(out).toContain("CREDENTIAL_CHECK named_users_select=false");
    expect(out).toContain("CREDENTIAL_CHECK other_tables_readable=0");
    // Never the raw connection string, host, user or password.
    expect(out).not.toContain(new URL(OWNER_URL).hostname);
    expect(out).not.toContain("pw");
  });

  it("FAILS closed when a stray grant widens the role beyond search_console_metrics (not vacuous), and recovers once reverted", async () => {
    const run = (): { status: number; out: string } => {
      try {
        const out = execFileSync("bash", [CREDENTIAL_CHECK_PATH], {
          env: { ...process.env, DATABASE_URL: urlFor(ROLE), REQUIRE_LEAST_PRIVILEGE: "1" },
          encoding: "utf8",
        });
        return { status: 0, out };
      } catch (e) {
        const err = e as { status: number; stdout: string };
        return { status: err.status, out: err.stdout };
      }
    };
    expect(run()).toEqual(expect.objectContaining({ status: 0 }));

    await admin.query(`GRANT SELECT ON TABLE public.users TO ${ROLE}`);
    try {
      const drifted = run();
      expect(drifted.status).not.toBe(0);
      expect(drifted.out).toContain("GSC_INGESTION_CREDENTIAL=FAIL reason=over_privileged_named_users_select");
    } finally {
      await admin.query(`REVOKE SELECT ON TABLE public.users FROM ${ROLE}`);
    }
    expect(run()).toEqual(expect.objectContaining({ status: 0 }));
  });
});
