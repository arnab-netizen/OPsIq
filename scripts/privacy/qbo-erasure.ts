/**
 * Operator tool — QuickBooks / Intuit User Data erasure. NOT an HTTP endpoint; there is no route and no import from application code.
 *
 *   ERASURE_DATABASE_URL=<operator login URL>  npx tsx scripts/privacy/qbo-erasure.ts <command> [options]
 *
 * Commands (each prints one JSON object on stdout; never a realm id, company name, token or report value):
 *   request   --workspace <uuid> --business <uuid> --reason USER_DATA_ERASURE_REQUEST|USER_REVOKED_CONSENT --requested-by <operator> [--privacy-request <uuid>]
 *   dry-run   --request <uuid>           read-only against business data; records the manifest hash; prints counts, blockers and the confirmation token
 *   approve   --request <uuid> --approved-by <second operator>
 *   execute   --request <uuid> --confirm <token> [--actor-user-id <uuid>] [--production-authorization <request uuid>]
 *   verify    --request <uuid>           structural post-erasure verification (QBO_ERASURE_VERIFICATION=PASS|FAIL)
 *   status    --request <uuid>
 *
 * The connection must belong to a role that is a member of `opsiq_privacy_eraser`; the database enforces the rest (see the migration).
 * Production runs additionally need --production-authorization=<request id> AND separate explicit owner authorization — never run by default.
 */
import { Client } from "pg";
import { evaluateGlobalSecureDelete, attestationsFromOptions, neonWindowFromOptions } from "../../src/services/privacy-erasure/deletion-domains";
function printGlobal(opts: Record<string, string>, db: string, executedAt: Date): string {
  const g = evaluateGlobalSecureDelete({ databaseVerification: db as "PASS" | "FAIL", executedAt, attestations: attestationsFromOptions(opts), neonHistoryWindowMs: neonWindowFromOptions(opts) });
  console.log(`DATABASE_ERASURE=${g.databaseErasure}`);
  console.log(`GLOBAL_SECURE_DELETE=${g.globalSecureDelete}`);
  console.log(`PENDING_DELETION_DOMAINS=${g.pendingDomains.join(",") || "none"}`);
  for (const x of g.rejectedAttestations) console.log(`REJECTED_ATTESTATION ${x.code}: ${x.reason}`);
  if (g.globalSecureDelete === "INCOMPLETE") console.log("NOTICE: database erasure is NOT total success; recoverable copies outside the live database are still pending.");
  return g.globalSecureDelete;
}

import {
  ERASURE_REASON_CODES,
  ErasureRefusedError,
  approveErasureRequest,
  createErasureRequest,
  executeQboErasure,
  recordDryRun,
  verifyQboErasure,
  type ErasureReasonCode,
  type RevokeHook,
} from "../../src/services/privacy-erasure/qbo-erasure.service";

function parse(argv: string[]): { cmd: string; opts: Record<string, string> } {
  const [cmd = "", ...rest] = argv;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument: ${a}`);
    const eq = a.indexOf("=");
    if (eq > 0) opts[a.slice(2, eq)] = a.slice(eq + 1);
    else { opts[a.slice(2)] = rest[++i] ?? ""; }
  }
  return { cmd, opts };
}
const need = (o: Record<string, string>, k: string) => { if (!o[k]) throw new ErasureRefusedError("MISSING_OPTION", `--${k} is required`); return o[k]; };

async function main() {
  const { cmd, opts } = parse(process.argv.slice(2));
  const url = process.env.ERASURE_DATABASE_URL;
  if (!url) throw new ErasureRefusedError("MISSING_ERASURE_DATABASE_URL", "ERASURE_DATABASE_URL (the eraser-role operator login) is required; DATABASE_URL is never used");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (cmd === "request") {
      const reason = need(opts, "reason") as ErasureReasonCode;
      if (!ERASURE_REASON_CODES.includes(reason)) throw new ErasureRefusedError("INVALID_REASON_CODE");
      const r = await createErasureRequest(client, { scope: { workspaceId: need(opts, "workspace"), businessId: need(opts, "business") }, reasonCode: reason, requestedBy: need(opts, "requested-by"), privacyRequestId: opts["privacy-request"] ?? null });
      return out({ command: cmd, requestId: r.id, status: "REQUESTED" });
    }
    if (cmd === "dry-run") {
      const r = await recordDryRun(client, need(opts, "request"));
      return out({ command: cmd, ...r, note: r.blockers.length ? "BLOCKERS_PRESENT: resolve before approval" : "No blockers. A second operator may approve; execute needs the confirmToken." });
    }
    if (cmd === "approve") {
      await approveErasureRequest(client, need(opts, "request"), need(opts, "approved-by"));
      return out({ command: cmd, requestId: opts.request, status: "APPROVED" });
    }
    if (cmd === "execute") {
      let revoke: RevokeHook | undefined;
      if (opts["actor-user-id"]) {
        // The ordinary disconnect path (revoke at Intuit, drop tokens, stop processing) uses the application's own data client; point it at
        // the operator connection BEFORE it is imported. Production QBO credentials are intentionally absent, so revocation reports SKIPPED.
        process.env.DATABASE_URL = url;
        const actorId = opts["actor-user-id"];
        revoke = async (scope) => {
          const { disconnectQuickBooks } = await import("../../src/services/quickbooks/qbo-lifecycle.service");
          return (await disconnectQuickBooks({ workspaceId: scope.workspaceId, businessId: scope.businessId, actorId }, { env: process.env })).revocation;
        };
      }
      const r = await executeQboErasure(client, { requestId: need(opts, "request"), confirmToken: need(opts, "confirm"), revoke, productionAuthorization: opts["production-authorization"] });
      out({ command: cmd, status: r.status, requestId: r.requestId, revocation: r.revocation, counts: r.counts, verification: r.verification });
      console.log(`QBO_ERASURE_VERIFICATION=${r.verification.result}`);
      printGlobal(opts, r.verification.result, new Date());
      return;
    }
    if (cmd === "verify" || cmd === "status") {
      const q = await client.query(`SELECT id, workspace_id, business_id, status, reason_code, requested_by, approved_by, executed_at, result_code, result_counts FROM privacy_erasure_requests WHERE id = $1`, [need(opts, "request")]);
      const row = q.rows[0];
      if (!row) throw new ErasureRefusedError("REQUEST_NOT_FOUND");
      if (cmd === "status") return out({ command: cmd, ...row });
      const v = await verifyQboErasure(client, { workspaceId: row.workspace_id, businessId: row.business_id });
      out({ command: cmd, requestId: row.id, verification: v });
      console.log(`QBO_ERASURE_VERIFICATION=${v.result}`);
      if (printGlobal(opts, v.result, row.executed_at ? new Date(row.executed_at) : new Date()) === "INCOMPLETE") process.exitCode = 2;
      return;
    }
    throw new ErasureRefusedError("UNKNOWN_COMMAND", "commands: request | dry-run | approve | execute | verify | status");
  } finally {
    await client.end();
  }
}
const out = (o: unknown) => console.log(JSON.stringify(o, null, 2));

main().catch((e) => {
  const code = e instanceof ErasureRefusedError ? e.code : "ERASURE_FAILED";
  // Never echo raw driver errors (they can carry row data); the code and our own message only.
  console.error(JSON.stringify({ error: code, message: e instanceof ErasureRefusedError ? e.message : "see operator logs; the transaction was rolled back" }));
  process.exit(1);
});
