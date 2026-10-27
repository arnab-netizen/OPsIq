/**
 * Operator tool — database role topology for governed QuickBooks erasure. NOT an HTTP endpoint; no import from application code.
 *
 *   OWNER_DATABASE_URL=<schema owner / migrator login>  npx tsx scripts/db/qbo-role-topology.ts <command> --runtime-role <name> --eraser-login <name> --eraser-login <name2>
 *
 *   plan     print the exact SQL (no connection is made)                               [safe anywhere]
 *   apply    run that SQL in ONE transaction as the schema owner                        [changes roles + grants; owner-run, never by CI automatically]
 *   verify   read-only catalog checks; prints RUNTIME_ROLE_LEAST_PRIVILEGE=PASS|FAIL    [safe against Production]
 *
 * Passwords are never handled here. New roles have NO password and cannot authenticate until an administrator sets one out of band.
 * DATABASE_URL (the runtime URL) is never read.
 */
import { Client } from "pg";
import { applyRoleTopology, roleTopologyStatements, verifyRoleTopology } from "../../src/services/privacy-erasure/role-topology";

function parse(argv: string[]) {
  const [cmd = "", ...rest] = argv;
  let runtimeRole = ""; const eraserLogins: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--runtime-role") runtimeRole = rest[++i] ?? "";
    else if (a === "--eraser-login") eraserLogins.push(rest[++i] ?? "");
    else throw new Error(`unexpected argument: ${a}`);
  }
  return { cmd, names: { runtimeRole, eraserLogins } };
}

async function main() {
  const { cmd, names } = parse(process.argv.slice(2));
  if (cmd === "plan") { for (const s of roleTopologyStatements(names, "<database>")) console.log(`${s};`); return; }
  const url = process.env.OWNER_DATABASE_URL;
  if (!url) throw new Error("OWNER_DATABASE_URL (the schema owner login) is required; DATABASE_URL is never used");
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    if (cmd === "apply") { const done = await applyRoleTopology(c, names); console.log(JSON.stringify({ applied: done.length })); return; }
    if (cmd === "verify") {
      const r = await verifyRoleTopology(c, names);
      for (const x of r.checks) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}`);
      console.log(`RUNTIME_ROLE_LEAST_PRIVILEGE=${r.result}`);
      if (r.result !== "PASS") process.exitCode = 1;
      return;
    }
    throw new Error("commands: plan | apply | verify");
  } finally { await c.end(); }
}
main().catch((e) => { console.error(JSON.stringify({ error: e instanceof Error ? e.message : "failed" })); process.exit(1); });
