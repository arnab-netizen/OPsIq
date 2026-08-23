/**
 * Regression coverage for the second batch of the full-domain-acceptance
 * expansion: tests/production/22-operations-acceptance.spec.ts,
 * 23-strategy-acceptance.spec.ts, and 24-cashflow-acceptance.spec.ts.
 *
 * Mirrors production-acceptance-sales-domain.test.ts's properties across
 * all three new spec files: exact-action-id verification (not a
 * `.first()` card), every page.request.* wrapped in timedApiCall(...), no
 * Trinity mutation, and reuse of the shared harness helpers rather than
 * per-file redefinition. Operations and Strategy each also have a
 * reassessment test (22-07/23-07); Cashflow deliberately does not (see
 * 24-cashflow-acceptance.spec.ts's own header for why).
 */
import { readFileSync } from "fs";
import { join } from "path";

const SPECS = [
  { name: "22-operations-acceptance.spec.ts", prefix: "22", apiPrefix: "/api/owner/operations", actionsSection: "Operations actions", hasReassessmentTest: true },
  { name: "23-strategy-acceptance.spec.ts", prefix: "23", apiPrefix: "/api/owner/strategy", actionsSection: "Strategy actions", hasReassessmentTest: true },
  { name: "24-cashflow-acceptance.spec.ts", prefix: "24", apiPrefix: "/api/owner/cashflow", actionsSection: "Cashflow actions", hasReassessmentTest: false },
] as const;

const SRC = new Map(
  SPECS.map((s) => [s.name, readFileSync(join(process.cwd(), "tests/production", s.name), "utf-8")])
);

describe.each(SPECS)("$name — action lifecycle verifies by exact id, not a .first() card", (spec) => {
  const src = SRC.get(spec.name)!;
  // Locate the "action lifecycle" test block by its known step number
  // (e.g. "22-06", "23-06", "24-06" -- the 6th numbered test in every one
  // of these files, immediately after navigate/snapshot/diagnosis).
  const testMarker = `test("${spec.prefix}-06`;

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

describe("22/23-only — reassessment test exists; 24 (Cashflow) deliberately omits it", () => {
  it("Operations (22-07) and Strategy (23-07) each have a reassessment test", () => {
    expect(SRC.get("22-operations-acceptance.spec.ts")).toContain('test("22-07');
    expect(SRC.get("23-strategy-acceptance.spec.ts")).toContain('test("23-07');
  });

  it("Cashflow's spec file documents why no reassessment test exists (no fabricated coverage)", () => {
    const cashflowSrc = SRC.get("24-cashflow-acceptance.spec.ts")!;
    expect(cashflowSrc).not.toMatch(/test\("24-07 — reassessment/);
    expect(cashflowSrc).toMatch(/do NOT trigger automatic re-diagnosis/i);
  });
});
