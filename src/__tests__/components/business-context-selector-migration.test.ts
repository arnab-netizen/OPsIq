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
  // Phase 1 (prior session)
  home: "home/page.tsx",
  "command center (root)": "page.tsx",
  finance: "finance/page.tsx",
  cashflow: "cashflow/page.tsx",
  customers: "customers/page.tsx",
  // Phase 2 (this session) — Family A canonical-Select duplicates
  sales: "sales/page.tsx",
  operations: "operations/page.tsx",
  execution: "execution/page.tsx",
  marketing: "marketing/page.tsx",
  strategy: "strategy/page.tsx",
  recovery: "recovery/page.tsx",
  data: "data/page.tsx",
  approvals: "approvals/page.tsx",
  budget: "budget/page.tsx",
  onboarding: "onboarding/page.tsx",
  trust: "trust/page.tsx",
  intake: "intake/page.tsx",
  // Phase 2 (this session) — Family B raw unlabeled <select> duplicates
  vendor: "vendor/page.tsx",
  inventory: "inventory/page.tsx",
  procurement: "procurement/page.tsx",
  "marketing campaigns": "marketing/campaigns/page.tsx",
  wealth: "wealth/page.tsx",
  // Phase 2 (this session) — Family C labelled raw <select> duplicate
  "manual entry": "manual-entry/page.tsx",
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

  it("owner/alerts (workspace-scoped, proven via getAlerts(workspaceId, userId) — no per-business filter) was NOT given a business selector", () => {
    const src = readOwnerPage("alerts/page.tsx");
    expect(src).not.toContain("BusinessContextSelector");
    expect(src).not.toContain('name="businessSelector"');
  });

  it("owner/goals (workspace-level financial goal, proven via getActiveGoal(workspaceId)) was NOT given a business selector", () => {
    const src = readOwnerPage("goals/page.tsx");
    expect(src).not.toContain("BusinessContextSelector");
    expect(src).not.toContain('name="businessSelector"');
  });

  it("owner/growth-pricing (workspace-wide pricing-tier catalog) was NOT given a business selector", () => {
    const src = readOwnerPage("growth-pricing/page.tsx");
    expect(src).not.toContain("BusinessContextSelector");
    expect(src).not.toContain('name="businessSelector"');
  });
});

describe("Business-context selector migration — Phase 2 duplicates, Family B/C shapes (raw <select>)", () => {
  it("vendor no longer hand-rolls a raw <select> keyed on selectedBizId", () => {
    const src = readOwnerPage("vendor/page.tsx");
    expect(src).not.toMatch(/<select[^>]*\n?\s*value=\{selectedBizId/);
  });

  for (const [label, rel] of Object.entries({
    inventory: "inventory/page.tsx",
    procurement: "procurement/page.tsx",
    "marketing campaigns": "marketing/campaigns/page.tsx",
  })) {
    it(`${label} no longer hand-rolls a raw <select> keyed on businessId ?? ""`, () => {
      const src = readOwnerPage(rel);
      expect(src).not.toMatch(/<select[^>]*\n?\s*value=\{businessId \?\? ""\}/);
    });
  }

  it("manual-entry no longer hand-rolls its labelled raw <select data-testid=\"manual-entry-business\">", () => {
    const src = readOwnerPage("manual-entry/page.tsx");
    expect(src).not.toContain('data-testid="manual-entry-business"');
    expect(src).toContain("<BusinessContextSelector");
  });
});

describe("Business-context selector migration — Phase 2 special routes (business-scoped backend, page-level decision)", () => {
  it("owner/now: SWITCHABLE_SELECTOR — renders BusinessContextSelector and fetches the business list", () => {
    const src = readOwnerPage("now/page.tsx");
    expect(src).toContain("<BusinessContextSelector");
    expect(src).toContain("/api/owner/businesses");
    expect(src).toContain("businessId=");
  });

  it("owner/now: implements a request-sequence guard against stale out-of-order now-view responses", () => {
    const src = readOwnerPage("now/page.tsx");
    expect(src).toContain("requestSeq");
  });

  it("owner/process-intelligence: NO_CHANGE_CORRECT — deliberately has no business selector (workspace-scoped processIntelligence)", () => {
    const src = readOwnerPage("process-intelligence/page.tsx");
    expect(src).not.toContain("<BusinessContextSelector");
    expect(src).toContain("NO selector, by design");
  });

  it("owner/cockpit: NO_CHANGE_CORRECT — deliberately has no business selector (workspace-scoped process-execution bridge)", () => {
    const src = readOwnerPage("cockpit/page.tsx");
    expect(src).not.toContain("<BusinessContextSelector");
    expect(src).toContain("NO selector, by design");
  });

  it("owner/adjudication: NO_CHANGE_CORRECT — deliberately has no business selector (workspace-scoped proof-risk queue)", () => {
    const src = readOwnerPage("adjudication/page.tsx");
    expect(src).not.toContain("<BusinessContextSelector");
    expect(src).toContain("NO selector, by design");
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
