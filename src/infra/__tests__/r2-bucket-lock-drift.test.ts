/**
 * Hostile/regression tests for the R2 Bucket Lock drift-detection logic. Pure-function only --
 * no network, no real Cloudflare API. Mirrors the shape detectBucketLockDrift expects from a
 * real Cloudflare GET .../r2/buckets/<bucket>/lock response.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectBucketLockDrift, parseR2BucketLockConfigFile, type LiveR2LockRule, type R2BucketLockConfigFile } from "@/infra/r2-bucket-lock-drift";

// The REAL as-code file (not a hand-rolled fixture): if it is ever edited to no longer match the
// schema, or to a value the rest of this test suite's expectations silently assume, this closes
// the gap a hostile fresh-context review found -- the drift-detector's own tests previously never
// actually read scripts/r2-bucket-lock-config.json, so the two could silently diverge unnoticed.
const REAL_CONFIG_PATH = resolve(__dirname, "../../../scripts/r2-bucket-lock-config.json");
const realConfig = parseR2BucketLockConfigFile(readFileSync(REAL_CONFIG_PATH, "utf8"));

describe("the real scripts/r2-bucket-lock-config.json file", () => {
  it("parses and validates against the schema (fails the whole suite if the file is ever edited into an invalid shape)", () => {
    expect(() => parseR2BucketLockConfigFile(readFileSync(REAL_CONFIG_PATH, "utf8"))).not.toThrow();
  });
  it("declares exactly the one expected rule, scoped to backups/ only, matching the closure doc's recommendation", () => {
    expect(realConfig.rules).toHaveLength(1);
    expect(realConfig.rules[0]).toMatchObject({ id: "backups-ransomware-protection", enabled: true, prefix: "backups/" });
    expect(realConfig.rules[0].condition).toEqual({ type: "Age", maxAgeSeconds: 3024000 });
  });
  it("rejects a config file that no longer matches the schema (hostile mutation of the raw JSON)", () => {
    expect(() => parseR2BucketLockConfigFile(JSON.stringify({ rules: [{ id: "x", enabled: "not-a-boolean", prefix: "backups/", condition: { type: "Age", maxAgeSeconds: 1 } }] }))).toThrow();
    expect(() => parseR2BucketLockConfigFile(JSON.stringify({ rules: [{ id: "x", enabled: true, prefix: "backups/", condition: { type: "Age", maxAgeSeconds: -5 } }] }))).toThrow();
    expect(() => parseR2BucketLockConfigFile(JSON.stringify({ rules: [{ id: "x", enabled: true, prefix: "backups/", condition: { type: "NotARealType" } }] }))).toThrow();
    expect(() => parseR2BucketLockConfigFile("not json at all")).toThrow();
  });
});

// The rest of this file's tests exercise detectBucketLockDrift's comparison logic in isolation
// using the REAL parsed config above (not a separately hand-maintained duplicate), so a future
// edit to the real file automatically flows through to these cases too.
const expected: R2BucketLockConfigFile = realConfig;

describe("detectBucketLockDrift", () => {
  it("reports no drift when the live rule exactly matches the config", () => {
    const live: LiveR2LockRule[] = [{ id: "backups-ransomware-protection", enabled: true, prefix: "backups/", condition: { type: "Age", maxAge: 3024000 } }];
    expect(detectBucketLockDrift(expected, live)).toEqual({ drift: false, differences: [] });
  });

  it("reports drift when the expected rule is entirely missing live", () => {
    const r = detectBucketLockDrift(expected, []);
    expect(r.drift).toBe(true);
    expect(r.differences[0]).toContain("not present live");
  });

  it("reports drift when the live rule is disabled", () => {
    const live: LiveR2LockRule[] = [{ id: "backups-ransomware-protection", enabled: false, prefix: "backups/", condition: { type: "Age", maxAge: 3024000 } }];
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes("enabled"))).toBe(true);
  });

  it("reports drift when the live prefix differs (e.g. accidentally widened to cover the whole bucket)", () => {
    const live: LiveR2LockRule[] = [{ id: "backups-ransomware-protection", enabled: true, prefix: "", condition: { type: "Age", maxAge: 3024000 } }];
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes("prefix"))).toBe(true);
  });

  it("reports drift when the live duration differs from the recommended 35-day value", () => {
    const live: LiveR2LockRule[] = [{ id: "backups-ransomware-protection", enabled: true, prefix: "backups/", condition: { type: "Age", maxAge: 604800 } }]; // 7 days instead of 35
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes("maxAgeSeconds"))).toBe(true);
  });

  it("reports drift when the live condition type differs (e.g. Indefinite instead of Age)", () => {
    const live: LiveR2LockRule[] = [{ id: "backups-ransomware-protection", enabled: true, prefix: "backups/", condition: { type: "Indefinite" } }];
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
  });

  it("reports drift when an extra, undeclared live rule exists", () => {
    const live: LiveR2LockRule[] = [
      { id: "backups-ransomware-protection", enabled: true, prefix: "backups/", condition: { type: "Age", maxAge: 3024000 } },
      { id: "someone-added-this-manually", enabled: true, prefix: "", condition: { type: "Indefinite" } },
    ];
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes("someone-added-this-manually") && d.includes("not declared"))).toBe(true);
  });
});
