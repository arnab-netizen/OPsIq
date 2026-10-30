/**
 * Pure drift-detection logic for the R2 Bucket Lock configuration (Section 16 of the R2 backup
 * availability/erasure closure). Compares the as-code definition in
 * scripts/r2-bucket-lock-config.json against a live configuration snapshot the caller already
 * fetched -- this module makes no network call itself and holds no credential.
 *
 * By design, no credential capable of reading or editing R2 bucket configuration is ever stored
 * in backup-write or backup-recovery (see WRITER_CAN_EDIT_BUCKET_LOCK=NO): the writer only ever
 * holds an S3-compatible object credential, which cannot reach the Cloudflare REST API endpoint
 * this check targets. Consequently this drift check cannot run inside either GitHub Environment
 * without broadening their privileges, which the mission this closes explicitly forbids. It is
 * designed to be run OFFLINE, by the owner, using their own Cloudflare API token -- never wired
 * into any GitHub Actions workflow in this repository.
 */
import { z } from "zod";

const r2BucketLockConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Age"), maxAgeSeconds: z.number().int().positive() }),
  z.object({ type: z.literal("Date"), date: z.string() }),
  z.object({ type: z.literal("Indefinite") }),
]);

const r2BucketLockRuleConfigSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  prefix: z.string(),
  condition: r2BucketLockConditionSchema,
});

/** Runtime schema for scripts/r2-bucket-lock-config.json. Using the project's standard Zod
 * validation layer (not a bare `as` type assertion) means an edit to that file that no longer
 * matches this module's expectations is caught at parse time, with a clear error, rather than
 * silently drifting out of step with the TypeScript types the drift-detector relies on. */
export const r2BucketLockConfigFileSchema = z.object({
  rules: z.array(r2BucketLockRuleConfigSchema),
});

export type R2BucketLockRuleConfig = z.infer<typeof r2BucketLockRuleConfigSchema>;
export type R2BucketLockConfigFile = z.infer<typeof r2BucketLockConfigFileSchema>;

/** Parses and validates the as-code config file's raw text. Throws (with Zod's own descriptive
 * error) on anything that does not match the schema -- the unknown fields this file also carries
 * (e.g. "_comment", "_notes") are ignored by Zod's default non-strict object parsing, not
 * rejected, since those are documentation, not configuration. */
export function parseR2BucketLockConfigFile(raw: string): R2BucketLockConfigFile {
  return r2BucketLockConfigFileSchema.parse(JSON.parse(raw));
}

/** Shape of one rule as Cloudflare's R2 bucket-lock GET response represents it. Field names
 * mirror the documented API; this module does not assume more structure than it checks. */
export interface LiveR2LockRule {
  id?: string;
  enabled?: boolean;
  prefix?: string;
  condition?: { type?: string; maxAge?: number; date?: string };
}

export interface DriftReport {
  drift: boolean;
  differences: string[];
}

/** Compares the expected (as-code) rule set against whatever rules are actually live. Any
 * mismatch -- including a missing rule, an extra live rule, or a changed field -- counts as
 * drift. Uncertain (e.g. the live rule list could not be fetched at all) is the CALLER's
 * responsibility to treat as drift; this function only compares what it is given. */
export function detectBucketLockDrift(expected: R2BucketLockConfigFile, live: readonly LiveR2LockRule[]): DriftReport {
  const differences: string[] = [];
  const liveById = new Map(live.map((r) => [r.id, r]));

  for (const rule of expected.rules) {
    const liveRule = liveById.get(rule.id);
    if (!liveRule) {
      differences.push(`rule '${rule.id}' is defined in config but not present live`);
      continue;
    }
    if (liveRule.enabled !== rule.enabled) {
      differences.push(`rule '${rule.id}': expected enabled=${rule.enabled}, live enabled=${liveRule.enabled}`);
    }
    if (liveRule.prefix !== rule.prefix) {
      differences.push(`rule '${rule.id}': expected prefix='${rule.prefix}', live prefix='${liveRule.prefix}'`);
    }
    if (rule.condition.type === "Age") {
      if (liveRule.condition?.type !== "Age" || liveRule.condition.maxAge !== rule.condition.maxAgeSeconds) {
        differences.push(`rule '${rule.id}': expected Age condition maxAgeSeconds=${rule.condition.maxAgeSeconds}, live condition=${JSON.stringify(liveRule.condition)}`);
      }
    } else if (liveRule.condition?.type !== rule.condition.type) {
      differences.push(`rule '${rule.id}': expected condition type '${rule.condition.type}', live type '${liveRule.condition?.type}'`);
    }
  }

  const expectedIds = new Set(expected.rules.map((r) => r.id));
  for (const liveRule of live) {
    if (liveRule.id && !expectedIds.has(liveRule.id)) {
      differences.push(`live rule '${liveRule.id}' is not declared in scripts/r2-bucket-lock-config.json`);
    }
  }

  return { drift: differences.length > 0, differences };
}
