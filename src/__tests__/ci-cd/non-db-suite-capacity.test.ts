/**
 * Prevention controls for NON_DB_SUITE_TIMEOUT_HEADROOM_EXHAUSTED.
 *
 * The non-DB suite step was killed on two consecutive attempts of the identical
 * commit with zero test failures — every one of 1,009 files passed both times. The
 * cap, not the code, was the failure.
 *
 * These tests exist so the fix cannot be quietly undone, and — more importantly —
 * so it cannot be quietly *neutralised*. The dangerous edit is not lowering the
 * step cap back to 20; it is lowering the job cap under it, which makes the step
 * cap unreachable while leaving it looking correct in the diff.
 *
 * Everything here reads the real workflow file. Nothing is mocked.
 *
 * Full analysis: docs/opsiq/ci/NON_DB_SUITE_CAPACITY.md
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import YAML from "js-yaml";

const root = join(__dirname, "..", "..", "..");
const CI_PATH = join(root, ".github", "workflows", "ci.yml");
const raw = readFileSync(CI_PATH, "utf8");

type Step = { name?: string; run?: string; "timeout-minutes"?: number; "continue-on-error"?: boolean };
type Job = { "timeout-minutes"?: number; steps?: Step[]; needs?: string[] | string; if?: string };
const ci = YAML.load(raw) as { jobs: Record<string, Job> };

const buildAndTest = ci.jobs["build-and-test"];
const suiteStep = (buildAndTest.steps ?? []).find((s) => s.name?.includes("Run non-DB test suite"));

/** The step cap is only meaningful if the job outlives it. */
const MIN_STEP_MINUTES = 30;

describe("CI capacity — the non-DB suite has room to finish", () => {
  it("the non-DB suite step still exists and is found by name", () => {
    expect(buildAndTest).toBeDefined();
    expect(suiteStep, "step 'Run non-DB test suite' not found in ci.yml").toBeDefined();
  });

  it(`the step cap is at least ${MIN_STEP_MINUTES} minutes`, () => {
    expect(suiteStep?.["timeout-minutes"]).toBeGreaterThanOrEqual(MIN_STEP_MINUTES);
  });

  it("the job cap strictly exceeds the step cap, or the step cap is unreachable", () => {
    // The trap this guards: raising the step to 30 while the job stays at 25 reads
    // as a fix and behaves as none — the job is killed first and the step never
    // reports its own timeout. The job must also leave room for setup before the
    // step starts, observed at ~2 minutes.
    const jobCap = buildAndTest["timeout-minutes"];
    const stepCap = suiteStep?.["timeout-minutes"];
    expect(jobCap).toBeDefined();
    expect(stepCap).toBeDefined();
    expect(jobCap!).toBeGreaterThan(stepCap!);
    expect(jobCap! - stepCap!).toBeGreaterThanOrEqual(5);
  });

  it("the step remains blocking — continue-on-error is false or absent", () => {
    expect(suiteStep?.["continue-on-error"] ?? false).toBe(false);
  });

  // Superseded by the CI risk classifier (owner correction pass, 2026-08-29):
  // this step is now intentionally conditional on
  // needs.classify.outputs.suite_mode == 'BROAD_NON_DB' -- exactly the tiers
  // for which the broad suite is warranted, never RECOVERY_INFRA_ONLY or
  // DOCS_ONLY. The invariant this test now protects is narrower and more
  // precise than "unconditional": the condition must be this exact
  // classifier output, not some other gate that could accidentally admit
  // more (or fewer) tiers than intended. See
  // src/__tests__/workflows/ci-risk-classifier.test.ts for the classifier's
  // own tier-to-suiteMode proof.
  it("the step's condition is exactly the classifier's BROAD_NON_DB suite mode, not some other gate", () => {
    expect(suiteStep?.if).toBe("needs.classify.outputs.suite_mode == 'BROAD_NON_DB'");
  });
});

describe("CI capacity — the fix did not weaken what CI asserts", () => {
  const run = suiteStep?.run ?? "";

  it("still runs the full non-DB suite through vitest", () => {
    expect(run).toContain("npx vitest run");
    expect(run).toContain("--exclude '**/*.db.test.ts'");
  });

  it("still excludes exactly the quarantine list, computed from the ledger", () => {
    // Quarantine membership must keep coming from .claude/test-quarantine.json.
    // Hard-coding exclusions here would let a failing test be parked invisibly.
    expect(run).toContain("test-quarantine.json");
    expect(run).toContain("--exclude");
  });

  it("no test-selection narrowing was introduced to buy time", () => {
    for (const narrowing of ["--bail", "--shard", "--testNamePattern", "--changed", ".skip", "--passWithNoTests"]) {
      expect(run, `suite command must not contain ${narrowing}`).not.toContain(narrowing);
    }
  });

  it("exit-code handling is intact — no swallowing via || true", () => {
    expect(run).not.toMatch(/\|\|\s*true/);
    expect(run).not.toMatch(/set\s+\+e/);
    expect(run).not.toMatch(/;\s*exit\s+0/);
  });

  it("branch-protection still depends on build-and-test", () => {
    const bp = ci.jobs["branch-protection"];
    expect(bp).toBeDefined();
    const needs = Array.isArray(bp.needs) ? bp.needs : [bp.needs].filter(Boolean);
    expect(needs).toContain("build-and-test");
    expect(needs).toContain("lint");
    expect(needs).toContain("bundle-validate");
  });

  it("the quarantine ledger is still a real file the step can read", () => {
    const ledger = join(root, ".claude", "test-quarantine.json");
    expect(existsSync(ledger)).toBe(true);
    const parsed = JSON.parse(readFileSync(ledger, "utf8")) as { files: unknown[]; total_files: number };
    expect(Array.isArray(parsed.files)).toBe(true);
    expect(parsed.total_files).toBe(parsed.files.length);
  });
});

describe("CI capacity — the deferred work is recorded, not forgotten", () => {
  it("the capacity analysis document exists and names the unfixed cause", () => {
    const doc = join(root, "docs", "opsiq", "ci", "NON_DB_SUITE_CAPACITY.md");
    expect(existsSync(doc)).toBe(true);
    const text = readFileSync(doc, "utf8");
    // A timeout increase that does not say what it failed to fix invites the same
    // wall to be hit again and treated as new.
    expect(text).toContain("NON_DB_SUITE_TIMEOUT_HEADROOM_EXHAUSTED");
    expect(text).toMatch(/does not fix/i);
    expect(text).toMatch(/environment instantiation/i);
  });
});
