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

const BACKUPS_RULE_ID = "backups-7day-immutability-window";
const LEDGER_RULE_ID = "erasure-ledger-indefinite-immutability";

describe("the real scripts/r2-bucket-lock-config.json file", () => {
  it("parses and validates against the schema (fails the whole suite if the file is ever edited into an invalid shape)", () => {
    expect(() => parseR2BucketLockConfigFile(readFileSync(REAL_CONFIG_PATH, "utf8"))).not.toThrow();
  });
  it("declares exactly the two expected rules: the 7-day backups/ Age lock and the indefinite erasure-ledger/ lock", () => {
    expect(realConfig.rules).toHaveLength(2);
    const backupsRule = realConfig.rules.find((r) => r.id === BACKUPS_RULE_ID);
    expect(backupsRule).toMatchObject({ enabled: true, prefix: "backups/" });
    expect(backupsRule?.condition).toEqual({ type: "Age", maxAgeSeconds: 604800 });
    const ledgerRule = realConfig.rules.find((r) => r.id === LEDGER_RULE_ID);
    expect(ledgerRule).toMatchObject({ enabled: true, prefix: "erasure-ledger/" });
    expect(ledgerRule?.condition).toEqual({ type: "Indefinite" });
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

/** Both real rules, correctly matching -- the baseline every single-concern test below starts
 * from and then deliberately breaks exactly one aspect of, so a drift report is never confounded
 * by the OTHER rule also (correctly) not matching. */
function bothRulesLive(): LiveR2LockRule[] {
  return [
    { id: BACKUPS_RULE_ID, enabled: true, prefix: "backups/", condition: { type: "Age", maxAge: 604800 } },
    { id: LEDGER_RULE_ID, enabled: true, prefix: "erasure-ledger/", condition: { type: "Indefinite" } },
  ];
}

describe("detectBucketLockDrift", () => {
  it("reports no drift when both live rules exactly match the config", () => {
    expect(detectBucketLockDrift(expected, bothRulesLive())).toEqual({ drift: false, differences: [] });
  });

  it("reports drift when the backups/ rule is entirely missing live (the ledger rule still matching)", () => {
    const live = bothRulesLive().filter((r) => r.id !== BACKUPS_RULE_ID);
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes(BACKUPS_RULE_ID) && d.includes("not present live"))).toBe(true);
  });

  it("reports drift when the erasure-ledger/ rule is entirely missing live (the backups rule still matching) -- this is exactly the truncation-prevention rule a hostile review required", () => {
    const live = bothRulesLive().filter((r) => r.id !== LEDGER_RULE_ID);
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes(LEDGER_RULE_ID) && d.includes("not present live"))).toBe(true);
  });

  it("reports drift when the backups/ rule is disabled", () => {
    const live = bothRulesLive();
    live[0] = { ...live[0], enabled: false };
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes(BACKUPS_RULE_ID) && d.includes("enabled"))).toBe(true);
  });

  it("reports drift when the backups/ rule's prefix differs (e.g. accidentally widened to cover the whole bucket)", () => {
    const live = bothRulesLive();
    live[0] = { ...live[0], prefix: "" };
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes(BACKUPS_RULE_ID) && d.includes("prefix"))).toBe(true);
  });

  it("reports drift when the backups/ rule's duration is too long (e.g. accidentally left at the old 35-day candidate value)", () => {
    const live = bothRulesLive();
    live[0] = { ...live[0], condition: { type: "Age", maxAge: 3024000 } }; // 35 days instead of the decided 7
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes(BACKUPS_RULE_ID) && d.includes("maxAgeSeconds"))).toBe(true);
  });

  it("reports drift when the backups/ rule's duration is too short (e.g. 1 day instead of 7)", () => {
    const live = bothRulesLive();
    live[0] = { ...live[0], condition: { type: "Age", maxAge: 86400 } };
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes(BACKUPS_RULE_ID) && d.includes("maxAgeSeconds"))).toBe(true);
  });

  it("reports drift when the backups/ rule's condition type differs (e.g. Indefinite instead of Age)", () => {
    const live = bothRulesLive();
    live[0] = { ...live[0], condition: { type: "Indefinite" } };
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
  });

  it("reports drift when the erasure-ledger/ rule's condition is downgraded from Indefinite to a finite Age (the exact regression that would silently reopen the truncation gap)", () => {
    const live = bothRulesLive();
    live[1] = { ...live[1], condition: { type: "Age", maxAge: 3024000 } };
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes(LEDGER_RULE_ID))).toBe(true);
  });

  it("reports drift when the erasure-ledger/ rule is disabled", () => {
    const live = bothRulesLive();
    live[1] = { ...live[1], enabled: false };
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes(LEDGER_RULE_ID) && d.includes("enabled"))).toBe(true);
  });

  it("reports drift when an extra, undeclared live rule exists", () => {
    const live = [...bothRulesLive(), { id: "someone-added-this-manually", enabled: true, prefix: "", condition: { type: "Indefinite" } }];
    const r = detectBucketLockDrift(expected, live);
    expect(r.drift).toBe(true);
    expect(r.differences.some((d) => d.includes("someone-added-this-manually") && d.includes("not declared"))).toBe(true);
  });
});
