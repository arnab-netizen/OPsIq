/**
 * Operator tool — appends one new, signed record to the post-backup erasure ledger (Sections 7-9
 * of the R2 backup activation-blocker closure). This is a NEW, separate, narrowly-scoped tool: it
 * does not import from or modify qbo-erasure.service.ts or the privacy_erasure_requests
 * transaction. It is run by an operator AFTER a real erasure has already completed (QBO or
 * general), to record -- outside the database, outside any backup -- that it happened.
 *
 *   R2_ENDPOINT=<https://account.r2.cloudflarestorage.com> R2_BUCKET=<bucket> \
 *   ERASURE_LEDGER_ACCESS_KEY_ID=<a credential DISTINCT from backup-write's R2 token> \
 *   ERASURE_LEDGER_SECRET_ACCESS_KEY=<...> \
 *   ERASURE_LEDGER_SIGNING_KEY=<separate from MANIFEST_SIGNING_KEY; never present in backup-write> \
 *     npx tsx scripts/privacy/append-erasure-ledger.ts \
 *       --erasure-request <uuid> --erasure-type QBO|GENERAL \
 *       --workspace <uuid> --business <uuid> --completed-at <ISO-8601>
 *
 * Stores records under the erasure-ledger/ prefix (never backups/): one object per record,
 * uploaded create-once (the same aws s3api put-object --if-none-match '*' mechanism #647 already
 * uses for backup objects), named by zero-padded sequence number so a plain listing is already in
 * chain order. Refuses to append if the existing chain does not validate (fail closed: an
 * operator must not be able to extend a tampered chain without first knowing it is tampered).
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildNextLedgerRecord, validateLedgerChain, type ErasureLedgerRecord, type ErasureType } from "../../src/services/privacy-erasure/erasure-ledger";

const PREFIX = "erasure-ledger/";

function args(argv: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument: ${a}`);
    o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
  }
  return o;
}
const need = (o: Record<string, string>, k: string): string => {
  if (!o[k]) throw new Error(`--${k} is required`);
  return o[k];
};
// Same UUID format check as qbo-erasure.service.ts's assertUuid -- a security review of this
// closure flagged that --workspace/--business/--erasure-request were accepted as any non-empty
// string, which could write a malformed value into the otherwise-immutable ledger.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const needUuid = (o: Record<string, string>, k: string): string => {
  const v = need(o, k);
  if (!UUID_RE.test(v)) throw new Error(`--${k} must be a UUID`);
  return v;
};

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

function seqKey(sequence: number): string {
  return `${PREFIX}${String(sequence).padStart(10, "0")}.json`;
}

async function main() {
  const o = args(process.argv.slice(2));
  const erasureRequestId = needUuid(o, "erasure-request");
  const erasureType = need(o, "erasure-type") as ErasureType;
  if (erasureType !== "QBO" && erasureType !== "GENERAL") throw new Error("--erasure-type must be QBO or GENERAL");
  const workspaceId = needUuid(o, "workspace");
  const businessId = needUuid(o, "business");
  const completedAt = need(o, "completed-at");
  if (!Number.isFinite(new Date(completedAt).getTime())) throw new Error("--completed-at must be a valid ISO-8601 timestamp");

  const endpoint = requireEnv("R2_ENDPOINT").replace(/\/$/, "");
  const bucket = requireEnv("R2_BUCKET");
  const signingKey = requireEnv("ERASURE_LEDGER_SIGNING_KEY");
  if (signingKey.length < 32) throw new Error("ERASURE_LEDGER_SIGNING_KEY is too short (expected at least 32 characters)");
  if (!process.env.ERASURE_LEDGER_ACCESS_KEY_ID || !process.env.ERASURE_LEDGER_SECRET_ACCESS_KEY) {
    throw new Error("ERASURE_LEDGER_ACCESS_KEY_ID / ERASURE_LEDGER_SECRET_ACCESS_KEY are required");
  }
  process.env.AWS_ACCESS_KEY_ID = process.env.ERASURE_LEDGER_ACCESS_KEY_ID;
  process.env.AWS_SECRET_ACCESS_KEY = process.env.ERASURE_LEDGER_SECRET_ACCESS_KEY;
  process.env.AWS_DEFAULT_REGION = process.env.AWS_DEFAULT_REGION || "auto";

  const listOut = aws(["s3api", "list-objects-v2", "--endpoint-url", endpoint, "--bucket", bucket, "--prefix", PREFIX]);
  const listed = (listOut.trim() ? (JSON.parse(listOut) as { Contents?: { Key: string }[] }) : {}).Contents ?? [];
  const keys = listed.map((c) => c.Key).sort();

  const workdir = mkdtempSync(join(tmpdir(), "erasure-ledger-"));
  try {
    const existing: ErasureLedgerRecord[] = [];
    for (const key of keys) {
      const localFile = join(workdir, "dl.json");
      aws(["s3", "cp", `s3://${bucket}/${key}`, localFile, "--endpoint-url", endpoint, "--only-show-errors"]);
      existing.push(JSON.parse(readFileSync(localFile, "utf8")) as ErasureLedgerRecord);
    }

    if (existing.length > 0) {
      const validation = validateLedgerChain(existing, signingKey);
      if (!validation.valid) {
        console.error("ERASURE_LEDGER_FORGERY_DETECTED=YES");
        for (const issue of validation.issues) console.error(`ISSUE: ${issue.code} at index ${issue.index}: ${issue.detail}`);
        throw new Error("refusing to append: the existing ledger chain does not validate (uncertain = block)");
      }
    }

    const tail = existing.length > 0 ? existing[existing.length - 1] : null;
    const record = buildNextLedgerRecord({
      tail,
      erasureRequestId,
      erasureType,
      scope: { workspaceId, businessId },
      completedAt,
      signingKey,
    });

    const key = seqKey(record.sequence);
    const localFile = join(workdir, "record.json");
    writeFileSync(localFile, JSON.stringify(record, null, 2));

    const stderrFile = join(workdir, "put.stderr");
    const put = spawnSync("aws", ["s3api", "put-object", "--endpoint-url", endpoint, "--bucket", bucket, "--key", key, "--body", localFile, "--if-none-match", "*"], { encoding: "utf8" });
    if (put.status !== 0) {
      writeFileSync(stderrFile, put.stderr ?? "");
      if (/PreconditionFailed/i.test(put.stderr ?? "")) {
        throw new Error(`refusing to append: an object already exists at ${key} -- a concurrent append may have raced this one; re-run to pick up the new tail`);
      }
      throw new Error(`upload failed for ${key}: ${put.stderr}`);
    }

    console.log(`ERASURE_LEDGER_APPEND=PASS sequence=${record.sequence} eventId=${record.eventId} key=${key}`);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
