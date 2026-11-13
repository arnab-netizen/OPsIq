/**
 * Operator tool — verifies the post-backup erasure ledger's integrity, and optionally decides
 * whether a specific restored backup may be promoted/serviced (Sections 9/10/11 of the R2 backup
 * activation-blocker closure). Read-only against R2; never writes.
 *
 *   R2_ENDPOINT=... R2_BUCKET=... \
 *   AWS_ACCESS_KEY_ID=<a READ-ONLY credential> AWS_SECRET_ACCESS_KEY=<...> \
 *   ERASURE_LEDGER_SIGNING_KEY=<the same key append-erasure-ledger.ts signs with> \
 *     npx tsx scripts/privacy/verify-erasure-ledger.ts [--backup-timestamp <ISO-8601>] [--expect-erasure-request <uuid>]
 *
 * Prints `ERASURE_LEDGER_STATUS=VALID|INVALID|UNAVAILABLE` (suitable for
 * --erasure-ledger-status on scripts/privacy/qbo-erasure.ts, gating GLOBAL_SECURE_DELETE), and,
 * if --backup-timestamp is given, additionally prints `RESTORE_PROMOTION=PROMOTABLE|BLOCKED`
 * with the reason and every pending/unreconciled erasure. Exits non-zero on anything but
 * VALID (and, when a backup timestamp was supplied, PROMOTABLE too).
 *
 * RESTORE RECONCILIATION (F-ERASURE-RECONCILIATION). After a local restore (scripts/restore-database-r2.sh prints
 * RESTORE_SERVICEABLE=NO_UNTIL_ERASURE_RECONCILED) this tool is the single gate that can lift the quarantine:
 *   --ledger-dir <dir>            read the ledger records (*.json, sorted by name) from a local directory instead of
 *                                  R2 (an operator's offline copy of erasure-ledger/); needs only ERASURE_LEDGER_SIGNING_KEY
 *   --reconciled-event-ids a,b,c  erasures the operator has ALREADY re-applied to the restored copy (qbo-erasure.ts
 *                                  execute against it) -- they stop counting as pending
 *   RESTORED_DATABASE_URL (env)   a LOOPBACK URL of the restored copy; its privacy_erasure_requests tombstones are
 *                                  cross-checked against the ledger (a backup timestamp that contradicts the restored
 *                                  data is BLOCKED, never silently accepted). Never passed on the command line.
 * Exit 0 only when the chain is VALID and RESTORE_PROMOTION=PROMOTABLE.
 *
 * --expect-erasure-request <uuid>: closes a gap a hostile review found -- a chain can be
 * perfectly VALID (untampered) while still being INCOMPLETE, if an operator simply forgot to run
 * append-erasure-ledger.ts after a real erasure. Pass the erasure's own request id (already
 * printed by qbo-erasure.ts execute) to additionally require that SPECIFIC erasure be present in
 * the chain, not just that the chain as a whole validates. Without this flag, ERASURE_LEDGER_STATUS
 * only proves the existing chain is untampered -- it does NOT prove any particular erasure was
 * recorded in it. The runbook's provisioning procedure should always pass this flag for a
 * just-completed erasure before trusting --erasure-ledger-status VALID for it.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chainRecordsErasure, reconcileRestoredBackup, validateLedgerChain, type ErasureLedgerRecord } from "../../src/services/privacy-erasure/erasure-ledger";

const PREFIX = "erasure-ledger/";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function aws(args: string[]): string {
  const r = spawnSync("aws", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`aws ${args.slice(0, 2).join(" ")} failed: ${r.stderr || r.stdout || `exit ${r.status}`}`);
  return r.stdout;
}

function parseArgs(argv: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
  }
  return o;
}

function loadRecordsFromDir(dir: string): ErasureLedgerRecord[] {
  const names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
  return names.map((n) => JSON.parse(readFileSync(join(dir, n), "utf8")) as ErasureLedgerRecord);
}

function assertLoopbackUrl(url: string): void {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("RESTORED_DATABASE_URL is not a valid URL");
  }
  if (!(host === "localhost" || host === "::1" || host === "[::1]" || /^127(\.\d+){3}$/.test(host))) {
    throw new Error("RESTORED_DATABASE_URL must be a loopback database (a restored copy is only ever inspected locally)");
  }
}

/** Erasure event ids whose request id the restored copy already shows as a completed tombstone. */
async function restoredTombstoneEventIds(records: readonly ErasureLedgerRecord[]): Promise<Set<string>> {
  const url = process.env.RESTORED_DATABASE_URL;
  const out = new Set<string>();
  if (!url) return out;
  assertLoopbackUrl(url);
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const res = await client.query<{ id: string }>("SELECT id::text AS id FROM privacy_erasure_requests WHERE status = 'EXECUTED'");
    const present = new Set(res.rows.map((r) => r.id));
    for (const r of records) if (present.has(r.erasureRequestId)) out.add(r.eventId);
  } finally {
    await client.end();
  }
  return out;
}

async function decideAndReport(records: ErasureLedgerRecord[], signingKey: string, opts: Record<string, string>): Promise<void> {
  const validation = validateLedgerChain(records, signingKey);
  const status = validation.valid ? "VALID" : "INVALID";
  console.log(`ERASURE_LEDGER_STATUS=${status}`);
  console.log(`ERASURE_LEDGER_FORGERY_DETECTED=${validation.issues.some((i) => i.code === "SIGNATURE_INVALID") ? "YES" : "NO"}`);
  for (const issue of validation.issues) console.log(`ISSUE: ${issue.code} at index ${issue.index}: ${issue.detail}`);
  if (!validation.valid) {
    process.exitCode = 1;
    return;
  }

  if (opts["expect-erasure-request"]) {
    const present = chainRecordsErasure(records, opts["expect-erasure-request"]);
    console.log(`EXPECTED_ERASURE_PRESENT=${present ? "YES" : "NO"}`);
    if (!present) {
      console.error(`erasure request ${opts["expect-erasure-request"]} was not found in the ledger -- the chain is untampered but INCOMPLETE for this specific erasure; append it with scripts/privacy/append-erasure-ledger.ts`);
      process.exitCode = 1;
      return;
    }
  }

  if (opts["backup-timestamp"]) {
    const reconciledEventIds = new Set((opts["reconciled-event-ids"] ?? "").split(",").map((x) => x.trim()).filter(Boolean));
    const restoredDbTombstoneEventIds = process.env.RESTORED_DATABASE_URL ? await restoredTombstoneEventIds(records) : undefined;
    const result = reconcileRestoredBackup({
      backupTimestamp: opts["backup-timestamp"],
      ledgerAvailable: true,
      ledgerValidation: validation,
      records,
      reconciledEventIds,
      restoredDbTombstoneEventIds,
    });
    console.log(`RESTORE_PROMOTION=${result.status}`);
    console.log(`REASON: ${result.reason}`);
    for (const p of result.pendingErasures) console.log(`PENDING_ERASURE eventId=${p.eventId} completedAt=${p.completedAt} type=${p.erasureType}`);
    if (result.status !== "PROMOTABLE") process.exitCode = 1;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const signingKey = requireEnv("ERASURE_LEDGER_SIGNING_KEY");

  if (opts["ledger-dir"]) {
    // Offline source: an operator's local copy of erasure-ledger/. No R2 credential involved.
    let records: ErasureLedgerRecord[];
    try {
      records = loadRecordsFromDir(opts["ledger-dir"]);
    } catch {
      console.log("ERASURE_LEDGER_STATUS=UNAVAILABLE");
      console.error("could not read or parse the ledger directory");
      process.exitCode = 1;
      return;
    }
    await decideAndReport(records, signingKey, opts);
    return;
  }

  const endpoint = requireEnv("R2_ENDPOINT").replace(/\/$/, "");
  const bucket = requireEnv("R2_BUCKET");
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (a read-only R2 credential) are required");
  }
  process.env.AWS_DEFAULT_REGION = process.env.AWS_DEFAULT_REGION || "auto";

  let listOut: string;
  try {
    listOut = aws(["s3api", "list-objects-v2", "--endpoint-url", endpoint, "--bucket", bucket, "--prefix", PREFIX]);
  } catch (e) {
    console.log("ERASURE_LEDGER_STATUS=UNAVAILABLE");
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
    return;
  }
  const listed = (listOut.trim() ? (JSON.parse(listOut) as { Contents?: { Key: string }[] }) : {}).Contents ?? [];
  const keys = listed.map((c) => c.Key).sort();

  const workdir = mkdtempSync(join(tmpdir(), "verify-erasure-ledger-"));
  try {
    const records: ErasureLedgerRecord[] = [];
    for (const key of keys) {
      const localFile = join(workdir, "dl.json");
      try {
        aws(["s3", "cp", `s3://${bucket}/${key}`, localFile, "--endpoint-url", endpoint, "--only-show-errors"]);
        records.push(JSON.parse(readFileSync(localFile, "utf8")) as ErasureLedgerRecord);
      } catch {
        console.log("ERASURE_LEDGER_STATUS=UNAVAILABLE");
        console.error(`could not fetch or parse ${key}`);
        process.exitCode = 1;
        return;
      }
    }
    await decideAndReport(records, signingKey, opts);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
