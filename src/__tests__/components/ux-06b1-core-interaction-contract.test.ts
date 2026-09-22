/**
 * UX-06 Wave B1 — core interaction contract (static source assertions).
 *
 * Source-level structural invariants only, never a substitute for the behavioral
 * proof in domain-action-inline-forms.test.tsx / owner-<domain>-inline-actions.
 * test.tsx / owner-task-detail-page-presentation.test.tsx. Proves: the four core
 * domain pages contain zero window.prompt() call sites; DomainActionInlineForms
 * exists and is imported/used by all four; Task Detail's Submit-proof/Review-
 * proof fields carry persistent label associations; and the B1 production diff
 * did not touch any non-core owner page (the 8 files carrying the other 25
 * residual, out-of-scope native-dialog call sites).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

const CORE_PAGES = [
  "src/app/(authenticated)/owner/finance/page.tsx",
  "src/app/(authenticated)/owner/sales/page.tsx",
  "src/app/(authenticated)/owner/operations/page.tsx",
  "src/app/(authenticated)/owner/execution/page.tsx",
];

// Out of scope for B1 -- must remain byte-for-semantic unchanged (still carrying their own
// pre-existing, untouched window.prompt() call sites).
const NON_CORE_PROMPT_PAGES = [
  "src/app/(authenticated)/owner/recovery/page.tsx",
  "src/app/(authenticated)/owner/learning/page.tsx",
  "src/app/(authenticated)/owner/budget/page.tsx",
  "src/app/(authenticated)/owner/approvals/page.tsx",
  "src/app/(authenticated)/owner/strategy/page.tsx",
  "src/app/(authenticated)/owner/process-intelligence/page.tsx",
  "src/app/(authenticated)/owner/cashflow/page.tsx",
  "src/app/(authenticated)/owner/marketing/page.tsx",
];

describe("UX-06 Wave B1 core interaction contract", () => {
  it("the four core domain pages contain zero window.prompt( call sites", () => {
    for (const page of CORE_PAGES) {
      const src = read(page);
      expect(src, `expected no window.prompt( in ${page}`).not.toMatch(/window\.prompt\s*\(/);
    }
  });

  it("DomainActionInlineForms exists and exports both form components", () => {
    const src = read("src/components/owner/DomainActionInlineForms.tsx");
    expect(src).toContain("export function CompletionActionForm");
    expect(src).toContain("export function VerificationActionForm");
  });

  it("all four domain pages import CompletionActionForm and VerificationActionForm from the shared module", () => {
    for (const page of CORE_PAGES) {
      const src = read(page);
      expect(src, `expected shared-form import in ${page}`).toContain('from "@/components/owner/DomainActionInlineForms"');
      expect(src).toContain("CompletionActionForm");
      expect(src).toContain("VerificationActionForm");
    }
  });

  it("no core page defines its own window.prompt alias (window[\"prompt\"], globalThis.prompt, or a local const prompt = window.prompt)", () => {
    for (const page of CORE_PAGES) {
      const src = read(page);
      expect(src).not.toMatch(/window\s*\[\s*["']prompt["']\s*\]/);
      expect(src).not.toMatch(/globalThis\.prompt/);
      expect(src).not.toMatch(/const\s+prompt\s*=\s*window\.prompt/);
    }
  });

  it("Task Detail's Submit-proof/Review-proof fields carry persistent label associations", () => {
    const src = read("src/app/(authenticated)/owner/tasks/[taskId]/page.tsx");
    expect(src).toContain('htmlFor="submit-proof-type"');
    expect(src).toContain('id="submit-proof-type"');
    expect(src).toContain('htmlFor="submit-proof-note"');
    expect(src).toContain('id="submit-proof-note"');
    expect(src).toContain('htmlFor="review-proof-outcome"');
    expect(src).toContain('id="review-proof-outcome"');
    expect(src).toContain('htmlFor="review-proof-reason"');
    expect(src).toContain('id="review-proof-reason"');
  });

  it("Candidate 9's frozen contract remains present and untouched by this wave", () => {
    const src = read("src/app/(authenticated)/owner/tasks/[taskId]/page.tsx");
    expect(src).toContain("Ready for approval");
    expect(src).toContain("Approve task");
    expect(src).toContain("handleApproveTask");
    expect(src).not.toContain("/complete`");
  });

  it("every residual non-core owner page still contains its own pre-existing window.prompt( call sites, unchanged in count by this wave", () => {
    const expectedCounts: Record<string, number> = {
      "src/app/(authenticated)/owner/recovery/page.tsx": 3,
      "src/app/(authenticated)/owner/learning/page.tsx": 1,
      "src/app/(authenticated)/owner/budget/page.tsx": 2,
      "src/app/(authenticated)/owner/approvals/page.tsx": 1,
      "src/app/(authenticated)/owner/strategy/page.tsx": 5,
      "src/app/(authenticated)/owner/process-intelligence/page.tsx": 3,
      "src/app/(authenticated)/owner/cashflow/page.tsx": 5,
      "src/app/(authenticated)/owner/marketing/page.tsx": 5,
    };
    for (const page of NON_CORE_PROMPT_PAGES) {
      const src = read(page);
      const matches = src.match(/window\.prompt\s*\(/g) ?? [];
      expect(matches.length, `expected ${expectedCounts[page]} window.prompt( in ${page}`).toBe(expectedCounts[page]);
      // None of these pages import the new shared inline-forms component -- B1 did not touch them.
      expect(src).not.toContain("DomainActionInlineForms");
    }
  });

  it("the shared form component does not import any domain API URL, business-id, or ActiveBusinessContext symbol", () => {
    const src = read("src/components/owner/DomainActionInlineForms.tsx");
    expect(src).not.toMatch(/\/api\/owner\//);
    expect(src).not.toContain("ActiveBusinessContext");
    expect(src).not.toContain("activeBusinessId");
    expect(src).not.toContain("classifyOperatorError");
    expect(src).not.toContain("loadGenerationRef");
  });
});
