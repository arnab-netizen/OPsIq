/**
 * Business-context selector migration — source-contract proof (no DOM).
 *
 * Follows the existing convention in
 * src/__tests__/owner-condition/owner-home-page.test.ts (static source assertions rather than a
 * full fetch-mocked page render, since these pages fetch on mount and the render behavior of the
 * shared control itself is already proven in business-context-selector.test.tsx).
 *
 * Proves:
 *  1. Every page migrated this session imports and renders the canonical
 *     BusinessContextSelector, and no longer hand-rolls its own "which business" selector
 *     markup (no duplicate <select>/Select name="businessSelector" left behind).
 *  2. A representative workspace-scoped page (no business dimension) was NOT given a selector —
 *     the negative control the session brief requires.
 *  3. The archetype/business-type editing selector (PR #379, BUSINESS_TYPE_OPTIONS) is untouched
 *     and distinct from the canonical component — migration did not touch or duplicate it.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readOwnerPage(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../app/(authenticated)/owner", rel), "utf8");
}

const MIGRATED_PAGES: Record<string, string> = {
  home: "home/page.tsx",
  "command center (root)": "page.tsx",
  finance: "finance/page.tsx",
  cashflow: "cashflow/page.tsx",
  customers: "customers/page.tsx",
};

describe("Business-context selector migration — migrated pages", () => {
  for (const [label, rel] of Object.entries(MIGRATED_PAGES)) {
    describe(label, () => {
      const src = readOwnerPage(rel);

      it("imports the canonical BusinessContextSelector from components/owner", () => {
        expect(src).toContain(
          'import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector"'
        );
      });

      it("renders <BusinessContextSelector", () => {
        expect(src).toContain("<BusinessContextSelector");
      });

      it("no longer hand-rolls a raw unlabeled <select> for business switching", () => {
        // A raw `<select` is still permitted for OTHER purposes (e.g. segment filters) —
        // what must be gone is the specific "which business" pattern: a bare <select> whose
        // onChange sets the business id directly, which the canonical component now owns.
        expect(src).not.toMatch(/<select[^>]*\n?\s*value=\{selectedBizId/);
        expect(src).not.toMatch(/<select[^>]*\n?\s*value=\{businessId \?\? ""\}/);
      });

      it("does not still define a duplicate Select name=\"businessSelector\" primitive block", () => {
        expect(src).not.toContain('name="businessSelector"');
      });
    });
  }
});

describe("Business-context selector migration — negative control (workspace-scoped page)", () => {
  it("owner/compliance (workspace-scoped, proven via getAllComplianceItems(workspaceId) — no per-business filter) was NOT given a business selector", () => {
    const src = readOwnerPage("compliance/page.tsx");
    expect(src).not.toContain("BusinessContextSelector");
    expect(src).not.toContain('name="businessSelector"');
  });

  it("owner/risks (workspace-scoped, proven via listBusinessRisks(workspaceId) — no per-business filter) was NOT given a business selector", () => {
    const src = readOwnerPage("risks/page.tsx");
    expect(src).not.toContain("BusinessContextSelector");
    expect(src).not.toContain('name="businessSelector"');
  });

  it("owner/tasks (workspace-scoped, proven via getTaskList(workspaceId) — no per-business filter) was NOT given a business selector", () => {
    const src = readOwnerPage("tasks/page.tsx");
    expect(src).not.toContain("BusinessContextSelector");
    expect(src).not.toContain('name="businessSelector"');
  });

  it("owner/portfolio (deliberate multi-business aggregate — a selector would break its purpose) was NOT given a business selector", () => {
    const src = readOwnerPage("portfolio/page.tsx");
    expect(src).not.toContain("BusinessContextSelector");
    expect(src).not.toContain('name="businessSelector"');
  });
});

describe("Business-context selector migration — archetype selector left untouched", () => {
  it("finance page still carries its own separate BUSINESS_TYPE_OPTIONS archetype selector, unmodified by this migration", () => {
    const src = readOwnerPage("finance/page.tsx");
    expect(src).toContain("BUSINESS_TYPE_OPTIONS");
    expect(src).toContain('name="businessType"');
  });

  it("the archetype selector import is untouched (imported from domain/owner-mode/owner-data-hub, not the new component)", () => {
    const src = readOwnerPage("finance/page.tsx");
    expect(src).toContain('import { BUSINESS_TYPE_OPTIONS } from "@/domain/owner-mode/owner-data-hub"');
  });
});
