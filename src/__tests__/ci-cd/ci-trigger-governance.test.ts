/**
 * Regression controls for CI trigger hardening.
 *
 * CI_TRIGGER_GAP_PR284: PR #284 converted from draft to ready-for-review but CI
 * did not re-run because the default pull_request event set omits ready_for_review.
 * This can leave a PR with no CI run at the HEAD that merges.
 *
 * CI_RECOVERY_DISPATCH_ABSENT: main-integration.yml had no workflow_dispatch trigger,
 * making manual re-runs after a missing or stale CI run impossible without a dummy push.
 *
 * These tests are pure YAML file reads — no database, no mocking. They are NOT gated
 * behind SHOULD_RUN_DB_TESTS and run in the standard non-DB PR gate.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import YAML from "js-yaml";

const root = join(__dirname, "..", "..", "..");
const CI_PATH = join(root, ".github", "workflows", "ci.yml");
const MI_PATH = join(root, ".github", "workflows", "main-integration.yml");

type Step = {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  shell?: string;
  "timeout-minutes"?: number;
  "continue-on-error"?: boolean;
};
type Job = {
  "timeout-minutes"?: number;
  steps?: Step[];
  needs?: string | string[];
  if?: string;
  services?: Record<string, unknown>;
};
type Workflow = {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
};

const ci = YAML.load(readFileSync(CI_PATH, "utf8")) as Workflow;
const mi = YAML.load(readFileSync(MI_PATH, "utf8")) as Workflow;

// ─── ci.yml trigger coverage ────────────────────────────────────────────────

describe("ci.yml — pull_request trigger coverage (CI_TRIGGER_GAP_PR284)", () => {
  const pr = ci.on["pull_request"] as {
    branches?: string[];
    types?: string[];
  } | undefined;

  it("pull_request trigger is defined", () => {
    expect(pr).toBeDefined();
  });

  it("branches filter includes main", () => {
    const branches = pr?.branches ?? [];
    expect(branches).toContain("main");
  });

  it("explicit types block is present (absent block = missing ready_for_review)", () => {
    expect(Array.isArray(pr?.types)).toBe(true);
    expect((pr?.types ?? []).length).toBeGreaterThan(0);
  });

  it("types includes opened", () => {
    expect(pr?.types ?? []).toContain("opened");
  });

  it("types includes synchronize", () => {
    expect(pr?.types ?? []).toContain("synchronize");
  });

  it("types includes reopened", () => {
    expect(pr?.types ?? []).toContain("reopened");
  });

  it("types includes ready_for_review (the missing type that caused CI_TRIGGER_GAP_PR284)", () => {
    expect(pr?.types ?? []).toContain("ready_for_review");
  });

  it("ci.yml does not have a push trigger (adding one would double-run on every main push)", () => {
    const on = ci.on as Record<string, unknown>;
    expect(on).not.toHaveProperty("push");
  });
});

// ─── main-integration.yml trigger and dispatch controls ────────────────────

describe("main-integration.yml — workflow_dispatch trigger (CI_RECOVERY_DISPATCH_ABSENT)", () => {
  const on = mi.on as Record<string, unknown>;

  it("push trigger is still present targeting main", () => {
    const push = on.push as { branches?: string[] } | undefined;
    expect(push).toBeDefined();
    expect(push?.branches ?? []).toContain("main");
  });

  it("workflow_dispatch trigger is present", () => {
    expect(on).toHaveProperty("workflow_dispatch");
  });

  it("workflow_dispatch has no inputs block (callers cannot target an arbitrary SHA)", () => {
    const dispatch = on.workflow_dispatch as { inputs?: Record<string, unknown> } | null | undefined;
    // dispatch is null when 'workflow_dispatch:' is a bare key with no children
    if (dispatch != null) {
      expect(dispatch.inputs).toBeUndefined();
    }
  });
});

// ─── identity gate structural enforcement ──────────────────────────────────

describe("main-integration.yml — identity gate step (fail-closed dispatch)", () => {
  const fullSuiteJob = mi.jobs["full-suite"];
  const steps = fullSuiteJob?.steps ?? [];

  const gateStep = steps.find(
    (s) => typeof s.name === "string" && /identity gate/i.test(s.name)
  );
  const checkoutStep = steps.find(
    (s) => typeof s.name === "string" && /checkout/i.test(s.name)
  );
  const migrationStep = steps.find(
    (s) => typeof s.name === "string" && /prisma database migration/i.test(s.name)
  );
  const dbTestStep = steps.find(
    (s) => typeof s.name === "string" && /run full test suite/i.test(s.name)
  );

  const gateIdx = gateStep ? steps.indexOf(gateStep) : -1;
  const checkoutIdx = checkoutStep ? steps.indexOf(checkoutStep) : -1;
  const migrationIdx = migrationStep ? steps.indexOf(migrationStep) : -1;
  const dbTestIdx = dbTestStep ? steps.indexOf(dbTestStep) : -1;

  it("identity gate step exists", () => {
    expect(gateStep).toBeDefined();
  });

  it("identity gate has an if condition", () => {
    expect(gateStep?.if).toBeDefined();
  });

  it("identity gate if condition gates on workflow_dispatch only", () => {
    expect(gateStep?.if ?? "").toMatch(/workflow_dispatch/);
  });

  it("identity gate runs after checkout (needs the repo)", () => {
    expect(checkoutIdx).toBeGreaterThanOrEqual(0);
    expect(gateIdx).toBeGreaterThan(checkoutIdx);
  });

  it("identity gate runs before Prisma migration (before DB credentials are consumed)", () => {
    expect(migrationIdx).toBeGreaterThanOrEqual(0);
    expect(gateIdx).toBeLessThan(migrationIdx);
  });

  it("identity gate runs before the DB test step", () => {
    expect(dbTestIdx).toBeGreaterThanOrEqual(0);
    expect(gateIdx).toBeLessThan(dbTestIdx);
  });

  it("identity gate is not allow-failure (continue-on-error is false or absent)", () => {
    expect(gateStep?.["continue-on-error"] ?? false).toBe(false);
  });

  it("identity gate run script verifies github.ref equals refs/heads/main", () => {
    expect(gateStep?.run ?? "").toContain("refs/heads/main");
  });

  it("identity gate run script checks HEAD SHA matches github.sha", () => {
    expect(gateStep?.run ?? "").toContain("git rev-parse HEAD");
  });

  it("identity gate run script fetches origin/main to detect post-dispatch main advancement", () => {
    expect(gateStep?.run ?? "").toContain("origin/main");
  });

  it("identity gate run script exits non-zero on any identity failure", () => {
    expect(gateStep?.run ?? "").toContain("exit 1");
  });
});
