/**
 * Regression coverage for the second batch of the full-domain-acceptance
 * expansion: tests/production/22-operations-acceptance.spec.ts,
 * 23-strategy-acceptance.spec.ts, and 24-cashflow-acceptance.spec.ts.
 *
 * Mirrors production-acceptance-sales-domain.test.ts's properties across
 * all three new spec files: exact-action-id verification (not a
 * `.first()` card), every page.request.* wrapped in timedApiCall(...), no
 * Trinity mutation, and reuse of the shared harness helpers rather than
 * per-file redefinition. All three (Operations, Strategy, Cashflow) now
 * have a reassessment test -- Cashflow's product gap was closed in a
 * separate PR (mirroring Marketing's own fix) and this spec file's coverage
 * was updated to match once that landed.
 *
 * OPSIQ-LIVE-ACCEPTANCE-CORRECTION Finding 1: Cashflow's action-lifecycle and
 * reassessment tests moved from 24-06/24-07 to 24-09/24-10 once the file
 * split into a safety-gate fixture (24-04..24-06, proves a material action
 * is REFUSED at cashflowState=INSOLVENT_RISK) and a separate closed-loop
 * fixture (24-07..24-10, proves the full lifecycle completes when the
 * fixture's state does not require a block) -- see that file's header.
 * Operations/Strategy are unaffected and keep their original numbering.
 */
import { readFileSync } from "fs";
import { join } from "path";

// The closed-loop lifecycle now lives in ONE typed helper that can only mutate a bound fixture (Production run #17
// remediation), so the exact-id properties below are asserted against that implementation.
const LOOP_SRC = readFileSync(join(process.cwd(), "tests/production/helpers/fixture-domain-loop.ts"), "utf-8");
const LIFECYCLE_BODY = LOOP_SRC.slice(LOOP_SRC.indexOf("export async function driveFixtureActionLifecycle"));

const SPECS = [
  { name: "22-operations-acceptance.spec.ts", prefix: "22", apiPrefix: "/api/owner/operations", actionsSection: "Operations actions", hasReassessmentTest: true, actionLifecycleTest: "22-06", reassessmentTest: "22-07" },
  { name: "23-strategy-acceptance.spec.ts", prefix: "23", apiPrefix: "/api/owner/strategy", actionsSection: "Strategy actions", hasReassessmentTest: true, actionLifecycleTest: "23-06", reassessmentTest: "23-07" },
  { name: "24-cashflow-acceptance.spec.ts", prefix: "24", apiPrefix: "/api/owner/cashflow", actionsSection: "Cashflow actions", hasReassessmentTest: true, actionLifecycleTest: "24-09", reassessmentTest: "24-10" },
] as const;

const SRC = new Map(
  SPECS.map((s) => [s.name, readFileSync(join(process.cwd(), "tests/production", s.name), "utf-8")])
);

describe.each(SPECS)("$name — action lifecycle verifies by exact id, not a .first() card", (spec) => {
  const src = SRC.get(spec.name)!;
  const testMarker = spec.actionLifecycleTest;

  it("takes the action's own id from the fixture's own diagnosis cycle before any mutation, and the spec drives the lifecycle through the bound helper", () => {
    const idx = src.indexOf(`test("${testMarker}`);
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 900)).toContain("driveFixtureActionLifecycle(context, page, fx)");
    const adoptIdx = LIFECYCLE_BODY.indexOf("fx.latestCycleActions");
    const firstPatchIdx = LIFECYCLE_BODY.indexOf("patchFixtureAction(");
    expect(adoptIdx).toBeGreaterThan(-1);
    expect(firstPatchIdx).toBeGreaterThan(adoptIdx);
    expect(LIFECYCLE_BODY).toMatch(/const actionId = actions\[0\]\.id;/);
  });

  it("polls the action's own id via a direct GET to confirm 'completed', using expect(...).toPass for auto-retry", () => {
    expect(LIFECYCLE_BODY).toMatch(/await expect\(async \(\) => \{[\s\S]*?readFixtureAction\(context, page, fx, actionId\)\)\.status\)\.toBe\("completed"\);[\s\S]*?\}\)\.toPass\(\{ timeout: \d+ \}\)/);
  });

  it("has no action-card UI assertions (the Production UI is read-only; every transition is read back by id)", () => {
    expect(src).not.toMatch(/expect\(card\)|\.border\.rounded|locator\("section", \{ hasText/);
    expect(LIFECYCLE_BODY).toMatch(/\(await readFixtureAction\(context, page, fx, actionId\)\)\.status\)\.toBe\(status\)/);
  });

  it(`does not drive the "${spec.actionsSection}" UI section at all`, () => {
    expect(src).not.toContain(spec.actionsSection);
  });
});

describe.each(SPECS)("$name — every page.request.* call site is wrapped in timedApiCall(...)", (spec) => {
  const src = SRC.get(spec.name)!;

  it("no bare page.request.(get|post|patch|put|delete) call exists", () => {
    const callRegex = /page\.request\.(get|post|patch|put|delete)\(/g;
    let match: RegExpExecArray | null;
    let checked = 0;
    while ((match = callRegex.exec(src)) !== null) {
      checked++;
      const windowStart = Math.max(0, match.index - 200);
      const preceding = src.slice(windowStart, match.index);
      expect(
        preceding,
        `${spec.name}: page.request.${match[1]}( at offset ${match.index} is not wrapped in timedApiCall(...)`
      ).toContain("timedApiCall(");
    }
    expect(checked, `${spec.name}: expected at least one page.request.* call site`).toBeGreaterThan(0);
  });
});

describe.each(SPECS)("$name — reuses shared harness helpers, no per-file redefinition", (spec) => {
  const src = SRC.get(spec.name)!;

  it("imports the generic fixture-domain-loop/dialog-handler/journey-watchers helpers (the UI diagnosis helper is gone)", () => {
    expect(src).toContain('from "./helpers/fixture-domain-loop"');
    expect(src).not.toContain('from "./helpers/domain-diagnosis"');
    expect(src).toContain('from "./helpers/dialog-handler"');
    expect(src).toContain('from "./helpers/journey-watchers"');
  });

  it("does not redefine its own watchPage/fatalErrors or a domain-specific dialog handler", () => {
    expect(src).not.toMatch(/function watchPage\(/);
    expect(src).not.toMatch(/function fatalErrors\(/);
    expect(src).not.toMatch(/function register\w*DialogHandler\(/);
  });
});

describe.each(SPECS)("$name — never mutates Trinity Services", (spec) => {
  const src = SRC.get(spec.name)!;

  it("trinityBusinessId is never passed to page.request.post or page.request.patch", () => {
    const mutatingCalls = [...src.matchAll(/page\.request\.(post|patch)\([^)]*\)/gs)];
    for (const m of mutatingCalls) {
      expect(m[0]).not.toContain("trinityBusinessId");
    }
  });
});

describe.each(SPECS.filter((s) => s.hasReassessmentTest))(
  "$name — has a reassessment test",
  (spec) => {
    const src = SRC.get(spec.name)!;

    it(`contains a "${spec.reassessmentTest} — reassessment" test`, () => {
      expect(src).toMatch(new RegExp(`test\\("${spec.reassessmentTest} — reassessment`));
    });
  }
);

describe("24-cashflow-acceptance.spec.ts — the safety-gate test asserts a governed outcome for every material transition", () => {
  const src = SRC.get("24-cashflow-acceptance.spec.ts")!;

  it("24-06 (SAFETY-GATE OUTCOME) accepts only a governed 200 or 409, requires a refused action to stay \"assigned\" and name INSOLVENT_RISK, and never lets a refused action count as started", () => {
    const idx = src.indexOf('test("24-06');
    expect(idx).toBeGreaterThan(-1);
    const nextTestIdx = src.indexOf('test("24-07', idx);
    expect(nextTestIdx).toBeGreaterThan(idx);
    const block = src.slice(idx, nextTestIdx);
    expect(block, "only a success or a governed refusal is acceptable; a 5xx fails").toMatch(/expect\(\[200, 409\][^\n]*\)\.toContain\(start\.status\(\)\)/);
    expect(block).toMatch(/if \(start\.status\(\) === 409\) \{[\s\S]*?INSOLVENT_RISK[\s\S]*?readFixtureAction\(context, page, fx, actionId\)\)\.status, "a refused action must remain assigned"\)\.toBe\("assigned"\)/);
    // The "in_progress" read-back exists only in the allowed (200) branch.
    const refusedBranch = block.slice(block.indexOf("if (start.status() === 409)"), block.indexOf("} else {"));
    expect(refusedBranch).not.toMatch(/in_progress|completed/);
    expect(block, "a counted block must raise the owner-visible block counter").toMatch(/if \(refused > 0\)[\s\S]*?toBeGreaterThan\(blocksBefore\)/);
    expect(block).toContain("fx.latestCycleActions");
  });
});
