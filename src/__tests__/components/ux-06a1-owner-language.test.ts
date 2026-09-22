/**
 * UX-06 Wave A1 — owner-language contract regression (static source assertions).
 *
 * Reads the specific source files this wave changed and asserts the exact owner-
 * visible string literals landed, and that their old raw/jargon forms did not merely
 * move elsewhere in the same file. This is deliberately a source-level check, not a
 * full DOM render, for the copy-only changes where a render would add no additional
 * behavioral proof beyond what the component/page presentation tests already cover.
 *
 * Assertions target the specific literal being changed, not a blanket word-ban across
 * whole files — internal comments and code identifiers (e.g. `workspaceName`,
 * `WorkspaceMembership`) are expected to keep using internal vocabulary and are not
 * asserted against here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

describe("UX-06 Wave A1 owner-language contract", () => {
  it("Signup shows 'Business name' and never labels the field 'Workspace Name'", () => {
    const src = read("src/app/signup/page.tsx");
    expect(src).toContain('label="Business name"');
    expect(src).not.toContain('label="Workspace Name"');
  });

  it("Trust page's H1 is 'Evidence & Trust', never 'Trust & Explainability'", () => {
    const src = read("src/app/(authenticated)/owner/trust/page.tsx");
    expect(src).toContain('title="Evidence & Trust"');
    expect(src).not.toContain("Trust & Explainability");
  });

  it("Tasks page's H1 is 'Tasks', never 'Actions'", () => {
    const src = read("src/app/(authenticated)/owner/tasks/page.tsx");
    expect(src).toContain('title="Tasks"');
    expect(src).not.toContain('title="Actions"');
  });

  it("Sales page's H1 is 'Sales', never 'Owner Sales'", () => {
    const src = read("src/app/(authenticated)/owner/sales/page.tsx");
    expect(src).toContain('title="Sales"');
    expect(src).not.toContain('title="Owner Sales"');
    expect(src).not.toContain("Owner Sales");
  });

  it("Finance owner-visible copy never contains 'BLOCKED tier'", () => {
    const src = read("src/app/(authenticated)/owner/finance/page.tsx");
    expect(src).not.toContain("BLOCKED tier");
  });

  it("Operations owner-visible helper copy never contains 'scaling gate' or 'human-execution-reality dimension'", () => {
    const src = read("src/app/(authenticated)/owner/operations/page.tsx");
    // The two owner-visible <p> hint lines specifically (not the internal comments
    // above them, which retain engineering vocabulary by design).
    expect(src).toContain(
      "This helps OpsIQ judge whether the business has enough capacity to grow safely."
    );
    expect(src).toContain(
      "This helps OpsIQ understand how much of the day-to-day work depends on you."
    );
    expect(src).not.toMatch(/<p[^>]*>[^<]*scaling gate/);
    expect(src).not.toMatch(/<p[^>]*>[^<]*human-execution-reality dimension/);
  });

  it("Execution page's description explains 'Standard Operating Procedure'", () => {
    const src = read("src/app/(authenticated)/owner/execution/page.tsx");
    expect(src).toContain("Standard Operating Procedure");
  });

  it("all 11 targeted loading labels no longer contain the word 'workspace'", () => {
    const files = [
      "src/app/(authenticated)/owner/finance/page.tsx",
      "src/app/(authenticated)/owner/sales/page.tsx",
      "src/app/(authenticated)/owner/operations/page.tsx",
      "src/app/(authenticated)/owner/execution/page.tsx",
      "src/app/(authenticated)/owner/approvals/page.tsx",
      "src/app/(authenticated)/owner/recovery/page.tsx",
      "src/app/(authenticated)/owner/cashflow/page.tsx",
      "src/app/(authenticated)/owner/strategy/page.tsx",
      "src/app/(authenticated)/owner/marketing/page.tsx",
      "src/app/(authenticated)/owner/learning/page.tsx",
      "src/app/(authenticated)/owner/growth-pricing/page.tsx",
    ];
    for (const file of files) {
      const src = read(file);
      const loadingLabelMatch = src.match(/<CardDashboardSkeleton label="([^"]*)"/);
      expect(loadingLabelMatch, `expected a CardDashboardSkeleton label in ${file}`).not.toBeNull();
      expect(loadingLabelMatch![1]!.toLowerCase()).not.toContain("workspace");
    }
  });

  it("AI Precheck labels are humanized in the task-detail page", () => {
    const src = read("src/app/(authenticated)/owner/tasks/[taskId]/page.tsx");
    expect(src).toContain("Automatically checked — passed");
    expect(src).toContain("Automatically checked — needs review");
    expect(src).not.toContain("AI Precheck Passed");
    expect(src).not.toContain("AI Precheck Failed");
  });

  it("the ProofType label map is shared, not duplicated, between the new-task and task-detail pages", () => {
    const detailSrc = read("src/app/(authenticated)/owner/tasks/[taskId]/page.tsx");
    const newTaskSrc = read("src/app/(authenticated)/owner/tasks/new/page.tsx");
    expect(detailSrc).toContain('from "@/lib/owner-proof-type-labels"');
    expect(newTaskSrc).toContain('from "@/lib/owner-proof-type-labels"');
    const shared = read("src/lib/owner-proof-type-labels.ts");
    expect(shared).toContain("CSV upload");
    expect(shared).toContain("Before/after image");
  });

  it("the global Input primitive was not modified to add password-visibility behavior", () => {
    const src = read("src/ui/primitives/input.tsx");
    expect(src).not.toContain("Show password");
    expect(src).not.toContain("Hide password");
    expect(src).not.toContain("PasswordInput");
  });
});
