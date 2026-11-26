/**
 * Operator tool — the SINGLE governed command for the OpsIQ least-privilege runtime role (opsiq_app) and, optionally, the erasure
 * operator logins. NOT an HTTP endpoint; no import from application runtime code. Passwords are never read, accepted or printed:
 * new roles have NO password and cannot authenticate until an administrator sets one out of band (`\password opsiq_app` in psql).
 *
 *   OWNER_DATABASE_URL=<schema owner / migrator login>  npx tsx scripts/db/opsiq-role-cutover.ts <command> --target <t> [options]
 *
 *   plan     print the exact SQL, no connection                                                      ROLE_TOPOLOGY_PLAN=READY
 *   apply    run it in ONE transaction, verify INSIDE it, commit only on PASS (--dry-run rolls back)  ROLE_TOPOLOGY_APPLY=PASS|FAIL
 *   verify   read-only catalog checks (--phase pre|post)                                             ROLE_TOPOLOGY_VERIFY=PASS|FAIL
 *   probe    connect AS the runtime login (OPSIQ_RUNTIME_PROBE_DATABASE_URL), run allowed + denied statements, always rolled back
 *                                                                                                     ROLE_TOPOLOGY_PROBE=PASS|FAIL
 *
 * Options: --target local|ci|test|staging|production (required, proven against the URL and the database's own identity)
 *          --runtime-role <name>      default opsiq_app
 *          --eraser-login <name>      optional, repeatable; omit it: the cutover does not create operator logins
 *          --expected-host <host>     production only: the bare direct hostname, compared exactly
 *          --confirm "<phrase>"       production apply only
 *          --dry-run                  apply: do everything, verify, roll back
 *          --only-if-present          apply: RECONCILE ONLY. If the runtime role does not exist the command creates nothing and reports
 *                                     ROLE_TOPOLOGY_APPLY=SKIPPED_ROLE_ABSENT (exit 0); the owner-authorized cutover is the only thing that creates it
 *          --phase pre|post           verify: `pre` accepts an absent runtime role (before the cutover), `post` requires it
 *
 * It never rotates a password, never edits Vercel, never reads DATABASE_URL (the runtime URL) or MIGRATION_DATABASE_URL.
 * The last output line is machine-readable (`TOKEN=PASS|FAIL`); the whole summary is also printed as one JSON line. Exit code 1 on FAIL/refusal.
 */
import { Client } from "pg";
import { DATABASE_IDENTITY_SQL, databaseIdentityFromRow } from "../../src/infra/production-db-identity";
import {
  RoleCutoverRefusal,
  assertRoleCutoverConnectedIdentity,
  assertRoleCutoverStaticTarget,
  type RoleCutoverCommand,
} from "../../src/infra/role-cutover-target";
import { applyAndVerifyRoleTopology, readModeledTables, roleTopologyStatements, verifyRoleTopology } from "../../src/services/privacy-erasure/role-topology";
import { probeRuntimeRole } from "../../src/services/privacy-erasure/runtime-role-probe";

interface Args { cmd: string; target?: string; runtimeRole: string; eraserLogins: string[]; expectedHost?: string; confirm?: string; dryRun: boolean; phase: "pre" | "post"; onlyIfPresent: boolean }

function parse(argv: string[]): Args {
  const [cmd = "", ...rest] = argv;
  const a: Args = { cmd, runtimeRole: "opsiq_app", eraserLogins: [], dryRun: false, phase: "post", onlyIfPresent: false };
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (k === "--target") a.target = rest[++i];
    else if (k === "--runtime-role") a.runtimeRole = rest[++i] ?? "";
    else if (k === "--eraser-login") a.eraserLogins.push(rest[++i] ?? "");
    else if (k === "--expected-host") a.expectedHost = rest[++i];
    else if (k === "--confirm") a.confirm = rest[++i];
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--only-if-present") a.onlyIfPresent = true;
    else if (k === "--phase") { const p = rest[++i]; if (p !== "pre" && p !== "post") throw new Error("--phase must be pre or post"); a.phase = p; }
    else throw new Error(`unexpected argument: ${k}`);
  }
  return a;
}

const print = (token: string, value: string, summary: Record<string, unknown>) => {
  console.log(JSON.stringify({ [token]: value, ...summary }));
  console.log(`${token}=${value}`);
};

async function connect(url: string): Promise<Client> {
  const c = new Client({ connectionString: url, ssl: /sslmode=require/i.test(url) ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 60_000 });
  await c.connect();
  return c;
}

async function main() {
  const args = parse(process.argv.slice(2));
  const cmd = args.cmd as RoleCutoverCommand;
  if (!["plan", "apply", "verify", "probe"].includes(cmd)) throw new Error("commands: plan | apply | verify | probe");
  const names = { runtimeRole: args.runtimeRole, eraserLogins: args.eraserLogins };
  const env = process.env;

  if (cmd === "plan") {
    const statements = roleTopologyStatements(names, "<database>", { modeledTables: readModeledTables() });
    for (const s of statements) console.log(`${s};`);
    print("ROLE_TOPOLOGY_PLAN", "READY", { statements: statements.length, runtimeRole: names.runtimeRole, eraserLogins: names.eraserLogins.length });
    return;
  }

  const urlVar = cmd === "probe" ? "OPSIQ_RUNTIME_PROBE_DATABASE_URL" : "OWNER_DATABASE_URL";
  const url = env[urlVar];
  const target = assertRoleCutoverStaticTarget({ command: cmd, target: args.target, url, env, expectedHost: args.expectedHost, confirm: args.confirm, dryRun: args.dryRun });
  const c = await connect(url as string);
  try {
    await c.query("BEGIN READ ONLY");
    const identity = databaseIdentityFromRow((await c.query(DATABASE_IDENTITY_SQL)).rows[0]);
    await c.query("ROLLBACK");
    assertRoleCutoverConnectedIdentity(target, identity, env);

    if (cmd === "apply") {
      if (args.onlyIfPresent) {
        const present = (await c.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [names.runtimeRole])).rowCount === 1;
        if (!present) {
          print("ROLE_TOPOLOGY_APPLY", "SKIPPED_ROLE_ABSENT", { target, dryRun: args.dryRun, committed: false, runtimeRoleState: "ABSENT" });
          return;
        }
      }
      const r = await applyAndVerifyRoleTopology(c, names, { dryRun: args.dryRun });
      const failed = r.report.checks.filter((x) => !x.ok).map((x) => x.name);
      for (const x of r.report.checks) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}`);
      const ok = r.report.result === "PASS";
      print("ROLE_TOPOLOGY_APPLY", ok ? "PASS" : "FAIL", { target, dryRun: args.dryRun, committed: r.committed, statements: r.statements.length, failedChecks: failed, facts: r.report.facts });
      if (!ok) process.exitCode = 1;
      return;
    }
    if (cmd === "verify") {
      const r = await verifyRoleTopology(c, names);
      const absentOk = args.phase === "pre" && r.facts.runtime_role_exists === false;
      const checks = absentOk ? r.checks.filter((x) => x.name !== "runtime role exists") : r.checks;
      const failed = checks.filter((x) => !x.ok).map((x) => x.name);
      for (const x of r.checks) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}`);
      const ok = failed.length === 0;
      const state = r.facts.runtime_role_exists === false ? "ABSENT" : ok ? "CONFORMING" : "NONCONFORMING";
      print("ROLE_TOPOLOGY_VERIFY", ok ? "PASS" : "FAIL", { target, phase: args.phase, runtimeRoleState: state, failedChecks: failed, facts: r.facts });
      if (target === "production") print("PRODUCTION_RUNTIME_ROLE_VERIFY", ok ? "PASS" : "FAIL", { phase: args.phase, runtimeRoleState: state });
      if (!ok) process.exitCode = 1;
      return;
    }
    // probe: connected AS the runtime login
    const ownerRole = (env.OPSIQ_SCHEMA_OWNER_ROLE ?? "neondb_owner").trim();
    const p = await probeRuntimeRole(c, ownerRole);
    for (const x of p.probes) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name} [${x.detail}]`);
    print("ROLE_TOPOLOGY_PROBE", p.result, { target, probes: p.probes.length, failed: p.probes.filter((x) => !x.ok).map((x) => x.name) });
    if (p.result !== "PASS") process.exitCode = 1;
  } finally { await c.end(); }
}

main().catch((e) => {
  // Sanitized. A refusal prints its own (URL-free) message. A server-side SQL error prints its SQLSTATE and message (statement text only, never
  // a connection string); any other failure (connection, TLS, DNS) prints nothing because those messages can carry a host or user name.
  const sqlState = (e as { code?: unknown }).code;
  const server = typeof sqlState === "string" && /^[0-9A-Z]{5}$/.test(sqlState) && typeof (e as { severity?: unknown }).severity === "string";
  const code = e instanceof RoleCutoverRefusal ? e.code : server ? `SQLSTATE_${sqlState}` : "ERROR";
  const message = e instanceof RoleCutoverRefusal ? e.message : server ? String((e as Error).message) : "failed (details withheld: may contain connection data)";
  console.error(JSON.stringify({ error: code, message }));
  console.log("ROLE_TOPOLOGY_RESULT=FAIL");
  process.exit(1);
});
