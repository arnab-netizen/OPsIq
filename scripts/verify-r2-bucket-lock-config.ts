/**
 * OFFLINE owner tool — checks the live Cloudflare R2 Bucket Lock configuration against the
 * as-code definition in scripts/r2-bucket-lock-config.json (Section 16, drift detection).
 *
 *   CLOUDFLARE_API_TOKEN=<owner's own token, bucket-configuration-read permission> \
 *   CLOUDFLARE_ACCOUNT_ID=<account id> R2_BUCKET=<bucket name> \
 *     npx tsx scripts/verify-r2-bucket-lock-config.ts
 *
 * NEVER run this from a GitHub Actions workflow and NEVER store CLOUDFLARE_API_TOKEN as a
 * repository or environment secret: it requires bucket-configuration-read permission, which
 * backup-write and backup-recovery must never hold (see WRITER_CAN_EDIT_BUCKET_LOCK=NO in
 * docs/opsiq/product/R2_BACKUP_AVAILABILITY_ERASURE_CLOSURE.md). This is intended to be run
 * manually, by the owner, from their own machine, at provisioning time and periodically after.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectBucketLockDrift, parseR2BucketLockConfigFile, type LiveR2LockRule } from "../src/infra/r2-bucket-lock-drift";

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  if (!token || !accountId || !bucket) {
    throw new Error("CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and R2_BUCKET are all required");
  }

  const configPath = resolve(__dirname, "r2-bucket-lock-config.json");
  const expected = parseR2BucketLockConfigFile(readFileSync(configPath, "utf8"));

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/lock`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Cloudflare API GET lock config -> ${res.status}`);
  }
  const body = (await res.json()) as { result?: { rules?: LiveR2LockRule[] } };
  const liveRules = body.result?.rules ?? [];

  const report = detectBucketLockDrift(expected, liveRules);
  console.log(`BUCKET_LOCK_DRIFT_DETECTION=${report.drift ? "DRIFT_DETECTED" : "NONE"}`);
  for (const d of report.differences) console.log(`DIFFERENCE: ${d}`);
  if (report.drift) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
