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
  // Locate the "action lifecycle" (Assign -> Start -> Complete -> Verify)
  // test block by its known step number -- see spec.actionLifecycleTest's
  // per-file override above for why this isn't always "$prefix-06".
  const testMarker = `test("${spec.actionLifecycleTest}`;

  it("captures the action's own id from the dashboard before clicking Complete", () => {
    const idx = src.indexOf(testMarker);
    expect(idx).toBeGreaterThan(-1);
    const clickIdx = src.indexOf('name: "Complete"', idx);
    expect(clickIdx).toBeGreaterThan(idx);
    const setup = src.slice(idx, clickIdx);
    expect(setup).toMatch(/const actionId: string = /);
  });

  it("polls the action's own id via a direct GET to confirm 'completed', using expect(...).toPass for auto-retry", () => {
    const idx = src.indexOf(testMarker);
    const block = src.slice(idx, idx + 3500);
    expect(block).toMatch(/await expect\(async \(\) => \{[\s\S]*?\}\)\.toPass\(\{ timeout: \d+ \}\)/);
    expect(block).toContain(`${spec.apiPrefix}/actions/\${actionId}`);
  });

  it("does not assert the completed status via card.toContainText('completed') (only 'assigned'/'in_progress' use the card)", () => {
    const idx = src.indexOf(testMarker);
    const block = src.slice(idx, idx + 3500);
    expect(block).not.toMatch(/expect\(card\)\.toContainText\(["']completed["']\)/);
    expect(block).toMatch(/expect\(card\)\.toContainText\(["']assigned["']\)/);
    expect(block).toMatch(/expect\(card\)\.toContainText\(["']in_progress["']\)/);
  });

  it(`locates action cards under the "${spec.actionsSection}" section`, () => {
    expect(src).toContain(spec.actionsSection);
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

  it("imports the generic domain-diagnosis/dialog-handler/journey-watchers helpers", () => {
    expect(src).toContain('from "./helpers/domain-diagnosis"');
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

describe("24-cashflow-acceptance.spec.ts — the safety-gate test never asserts a blocked fixture's action succeeds", () => {
  const src = SRC.get("24-cashflow-acceptance.spec.ts")!;

  it('24-06 (SAFETY-GATE ACCEPTANCE) asserts the action REMAINS "assigned" after Start, and never asserts "in_progress"/"completed" for it', () => {
    const idx = src.indexOf('test("24-06');
    expect(idx).toBeGreaterThan(-1);
    const nextTestIdx = src.indexOf('test("24-07', idx);
    expect(nextTestIdx).toBeGreaterThan(idx);
    const block = src.slice(idx, nextTestIdx);
    expect(block).toMatch(/await expect\(card\)\.toContainText\(["']assigned["']\)/);
    expect(block).not.toMatch(/toContainText\(["']in_progress["']\)/);
    expect(block).not.toMatch(/toContainText\(["']completed["']\)/);
    expect(block, "the refusal must be asserted as a 409, not a success").toMatch(/\.status\(\)\)\.toBe\(409\)/);
  });
});
