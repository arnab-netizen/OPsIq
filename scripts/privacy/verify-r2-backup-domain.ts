/**
 * Operator tool — R2_BACKUPS deletion-domain verifier. Read-only: lists objects under the
 * private encrypted-backup bucket's backups/ prefix and verifies every backup+checksum+manifest
 * triplet's internal consistency and manifest signature, WITHOUT ever decrypting a backup,
 * touching Production, or holding the AGE private identity.
 *
 *   R2_ENDPOINT=<https://account.r2.cloudflarestorage.com> R2_BUCKET=<bucket> \
 *   AWS_ACCESS_KEY_ID=<R2 READ-ONLY credential> AWS_SECRET_ACCESS_KEY=<...> \
 *   MANIFEST_SIGNING_KEY=<the same key backup-database-r2.sh signs with> \
 *     npx tsx scripts/privacy/verify-r2-backup-domain.ts
 *
 * Prints one line, `R2_BACKUPS=CLEAN|NOT_APPLICABLE|PENDING|FAIL`, suitable for
 * --r2-backups-status on scripts/privacy/qbo-erasure.ts's verify/execute commands, plus one
 * diagnostic line per triplet/unexpected key. Exits non-zero unless the result is CLEAN or
 * NOT_APPLICABLE -- uncertain = block, matching every other domain verifier in this repo.
 *
 * Intended to be run by the OWNER, offline or from a narrowly-scoped read-only environment --
 * never from the backup-write job that holds the writer credential (see
 * docs/opsiq/product/R2_BACKUP_RUNBOOK.md, "R2 domain verifier / drift detection").
 */
import { spawnSync } from "node:child_process";
import { evaluateR2BackupDomain, type R2BackupManifest, type R2ObjectRef } from "../../src/services/privacy-erasure/r2-backup-domain";

const PREFIX = "backups/";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function aws(args: string[]): string {
  const r = spawnSync("aws", args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`aws ${args.slice(0, 2).join(" ")} failed: ${r.stderr || r.stdout || `exit ${r.status}`}`);
  }
  return r.stdout;
}

/** Lists every object under backups/ via the S3-compatible API only -- no bucket-configuration
 * call is ever made, matching WRITER_CAN_EDIT_BUCKET_LOCK=NO's reasoning in reverse: this
 * verifier never needs, and is never given, a bucket-admin-capable credential either. */
function listR2Objects(endpoint: string, bucket: string): R2ObjectRef[] {
  const out = aws(["s3api", "list-objects-v2", "--endpoint-url", endpoint, "--bucket", bucket, "--prefix", PREFIX]);
  const parsed = out.trim() ? (JSON.parse(out) as { Contents?: { Key: string; Size: number }[] }) : {};
  return (parsed.Contents ?? []).map((c) => ({ key: c.Key, sizeBytes: c.Size }));
}

function getObjectText(endpoint: string, bucket: string, key: string): string {
  const out = spawnSync("aws", ["s3", "cp", `s3://${bucket}/${key}`, "-", "--endpoint-url", endpoint], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (out.status !== 0) throw new Error(`failed to fetch s3://${bucket}/${key}: ${out.stderr || `exit ${out.status}`}`);
  return out.stdout;
}

async function main() {
  const endpoint = requireEnv("R2_ENDPOINT").replace(/\/$/, "");
  const bucket = requireEnv("R2_BUCKET");
  const signingKey = requireEnv("MANIFEST_SIGNING_KEY");
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (a read-only R2 credential) are required");
  }
  process.env.AWS_DEFAULT_REGION = process.env.AWS_DEFAULT_REGION || "auto";

  const objects = listR2Objects(endpoint, bucket);

  const manifestKeys = objects.filter((o) => o.key.endsWith(".manifest.json"));
  const checksumKeys = objects.filter((o) => o.key.endsWith(".sql.gz.age.sha256"));

  const manifests: Record<string, R2BackupManifest | null> = {};
  for (const m of manifestKeys) {
    const baseName = m.key.slice(PREFIX.length, -".manifest.json".length);
    try {
      manifests[baseName] = JSON.parse(getObjectText(endpoint, bucket, m.key)) as R2BackupManifest;
    } catch {
      manifests[baseName] = null;
    }
  }

  const checksumContents: Record<string, string> = {};
  for (const c of checksumKeys) {
    const baseName = c.key.slice(PREFIX.length, -".sql.gz.age.sha256".length);
    checksumContents[baseName] = getObjectText(endpoint, bucket, c.key).trim();
  }

  const report = evaluateR2BackupDomain({ objects, manifests, checksumContents, manifestSigningKey: signingKey });

  console.log(`R2_BACKUPS=${report.status}`);
  for (const t of report.triplets) console.log(`TRIPLET ${t.baseName}: ${t.code} (${t.reason})`);
  for (const k of report.unexpectedKeys) console.log(`UNEXPECTED_KEY ${k}`);

  if (report.status !== "CLEAN" && report.status !== "NOT_APPLICABLE") {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
