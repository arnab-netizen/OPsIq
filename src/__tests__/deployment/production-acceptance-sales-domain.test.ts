/**
 * Regression coverage for tests/production/21-sales-acceptance.spec.ts --
 * the first domain added in the full-domain-acceptance expansion (see the
 * owner's "expand live acceptance to all Owner domains" directive).
 *
 * A dedicated investigation confirmed owner-sales/action.service.ts
 * mirrors owner-finance/action.service.ts's automatic re-diagnosis-on-
 * completion mechanism exactly (proven end to end against real Postgres in
 * src/__tests__/owner-sales/services.db.test.ts's new hostile test). The
 * Sales acceptance spec was therefore written to verify Complete/Verify by
 * the action's own id from the start, and to route every page.request.*
 * call through timedApiCall(), applying both lessons from workflow run
 * #32568877293 ("run #6") proactively instead of repeating that forensic
 * investigation for a second domain.
 *
 * These tests prove, per-property, that the new spec actually does this:
 *  (a) it captures the action's own id before mutating, and verifies
 *      Complete/Verify by that exact id, never by re-reading a `.first()`
 *      card
 *  (b) every page.request.* call site is wrapped in timedApiCall(...)
 *  (c) it reuses the shared journey-watchers/dialog-handler/domain-
 *      diagnosis helpers rather than redefining Finance-specific logic
 *  (d) it never sends a mutating request carrying trinityBusinessId
 *  (e) the shared helpers themselves behave correctly in isolation
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { Page } from "@playwright/test";
import { registerActionDialogHandler } from "../../../tests/production/helpers/dialog-handler";
import { createJourneyWatch } from "../../../tests/production/helpers/journey-watchers";

const SALES_SPEC_SRC = readFileSync(
  join(process.cwd(), "tests/production/21-sales-acceptance.spec.ts"),
  "utf-8"
);

// ---------------------------------------------------------------------------
// (a) Action completion verified by exact id, not a `.first()` card
// ---------------------------------------------------------------------------
describe("(a) 21-06 verifies Sales action completion by id, not by re-reading a .first() card", () => {
  it("captures the action's own id from the dashboard before clicking Complete", () => {
    const idx = SALES_SPEC_SRC.indexOf('test("21-06');
    expect(idx).toBeGreaterThan(-1);
    const clickIdx = SALES_SPEC_SRC.indexOf('name: "Complete"', idx);
    expect(clickIdx).toBeGreaterThan(idx);
    const setup = SALES_SPEC_SRC.slice(idx, clickIdx);
    expect(setup).toMatch(/const actionId: string = /);
  });

  it("polls the action's own id via a direct GET to confirm 'completed', using expect(...).toPass for auto-retry", () => {
    const idx = SALES_SPEC_SRC.indexOf('test("21-06');
    const block = SALES_SPEC_SRC.slice(idx, idx + 3000);
    expect(block).toMatch(/await expect\(async \(\) => \{[\s\S]*?\}\)\.toPass\(\{ timeout: \d+ \}\)/);
    expect(block).toMatch(/\/api\/owner\/sales\/actions\/\$\{actionId\}/);
  });

  it("does not assert the completed status via card.toContainText('completed') (only 'assigned'/'in_progress' use the card)", () => {
    const idx = SALES_SPEC_SRC.indexOf('test("21-06');
    const block = SALES_SPEC_SRC.slice(idx, idx + 3000);
    expect(block).not.toMatch(/expect\(card\)\.toContainText\(["']completed["']\)/);
    expect(block).toMatch(/expect\(card\)\.toContainText\(["']assigned["']\)/);
    expect(block).toMatch(/expect\(card\)\.toContainText\(["']in_progress["']\)/);
  });
});

// ---------------------------------------------------------------------------
// (b) Every page.request.* call site is wrapped in timedApiCall(...)
// ---------------------------------------------------------------------------
describe("(b) every page.request.* call site in the Sales spec is wrapped in timedApiCall(...)", () => {
  it("no bare page.request.(get|post|patch|put|delete) call exists", () => {
    const callRegex = /page\.request\.(get|post|patch|put|delete)\(/g;
    let match: RegExpExecArray | null;
    let checked = 0;
    while ((match = callRegex.exec(SALES_SPEC_SRC)) !== null) {
      checked++;
      const windowStart = Math.max(0, match.index - 200);
      const preceding = SALES_SPEC_SRC.slice(windowStart, match.index);
      expect(
        preceding,
        `page.request.${match[1]}( at offset ${match.index} is not wrapped in timedApiCall(...)`
      ).toContain("timedApiCall(");
    }
    expect(checked, "expected at least one page.request.* call site").toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// (c) Reuses the shared helpers rather than redefining Finance-specific logic
// ---------------------------------------------------------------------------
describe("(c) the Sales spec reuses shared harness helpers, not Finance-specific duplicates", () => {
  it("imports the generic domain-diagnosis/dialog-handler/journey-watchers helpers", () => {
    expect(SALES_SPEC_SRC).toContain('from "./helpers/domain-diagnosis"');
    expect(SALES_SPEC_SRC).toContain('from "./helpers/dialog-handler"');
    expect(SALES_SPEC_SRC).toContain('from "./helpers/journey-watchers"');
  });

  it("does not redefine its own watchPage/fatalErrors or Finance-specific dialog handler", () => {
    expect(SALES_SPEC_SRC).not.toMatch(/function watchPage\(/);
    expect(SALES_SPEC_SRC).not.toMatch(/function fatalErrors\(/);
    expect(SALES_SPEC_SRC).not.toMatch(/function registerFinanceDialogHandler\(/);
  });
});

// ---------------------------------------------------------------------------
// (d) Trinity Services is never mutated
// ---------------------------------------------------------------------------
describe("(d) tests/production/21-sales-acceptance.spec.ts never mutates Trinity Services", () => {
  it("trinityBusinessId is never passed to page.request.post or page.request.patch", () => {
    const mutatingCalls = [...SALES_SPEC_SRC.matchAll(/page\.request\.(post|patch)\([^)]*\)/gs)];
    for (const m of mutatingCalls) {
      expect(m[0]).not.toContain("trinityBusinessId");
    }
  });
});

// ---------------------------------------------------------------------------
// (e) Shared helpers behave correctly in isolation
// ---------------------------------------------------------------------------
describe("(e) shared harness helpers -- behavioral proof", () => {
  it("createJourneyWatch() returns independent state per call (no cross-spec-file leakage)", () => {
    const watchA = createJourneyWatch();
    const watchB = createJourneyWatch();
    watchA.consoleErrors.push("error from A");
    expect(watchB.consoleErrors).toHaveLength(0);
    expect(watchA.fatalErrors()).toEqual([]);
    watchA.consoleErrors.push("Cannot read properties of undefined");
    expect(watchA.fatalErrors()).toEqual(["Cannot read properties of undefined"]);
  });

  it("watchPage() records 5xx responses and console errors via page.on", () => {
    const watch = createJourneyWatch();
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const page = {
      on: (event: string, handler: (...args: unknown[]) => unknown) => {
        handlers[event] = handler;
      },
    } as unknown as Page;

    watch.watchPage(page);
    handlers.console({ type: () => "error", text: () => "boom" } as never);
    handlers.response({ status: () => 502, url: () => "https://example.test/api/x" } as never);
    handlers.response({ status: () => 200, url: () => "https://example.test/api/ok" } as never);

    expect(watch.consoleErrors).toEqual(["boom"]);
    expect(watch.networkFailures).toEqual([{ url: "https://example.test/api/x", status: 502 }]);
  });

  it("registerActionDialogHandler() answers each prompt type correctly, matched by substring regardless of domain-specific wording", async () => {
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const page = {
      on: (event: string, handler: (...args: unknown[]) => unknown) => {
        handlers[event] = handler;
      },
    } as unknown as Page;
    registerActionDialogHandler(page);

    const cases: Array<{ message: string; expected: string }> = [
      { message: "Completion notes:", expected: "Live production acceptance: completion notes" },
      { message: "Completion evidence:", expected: "acceptance-test-evidence-reference" },
      { message: "BEFORE value for leads:", expected: "100" },
      { message: "AFTER value for orders:", expected: "50" },
      { message: "Target direction (up / down):", expected: "down" },
    ];
    for (const c of cases) {
      let accepted: string | undefined;
      const dialog = {
        message: () => c.message,
        accept: (v: string) => {
          accepted = v;
        },
        dismiss: () => {},
      };
      await handlers.dialog(dialog as never);
      expect(accepted).toBe(c.expected);
    }
  });

  it("registerActionDialogHandler() dismisses an unrecognized prompt rather than accepting it blind", async () => {
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const page = {
      on: (event: string, handler: (...args: unknown[]) => unknown) => {
        handlers[event] = handler;
      },
    } as unknown as Page;
    registerActionDialogHandler(page);

    let dismissed = false;
    let accepted = false;
    const dialog = {
      message: () => "Some unrelated prompt",
      accept: () => {
        accepted = true;
      },
      dismiss: () => {
        dismissed = true;
      },
    };
    await handlers.dialog(dialog as never);
    expect(dismissed).toBe(true);
    expect(accepted).toBe(false);
  });
});
