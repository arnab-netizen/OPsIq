/**
 * Branding proven by RENDERING, not by scanning source strings.
 *
 * `branding-regression.test.ts` scans src/ to stop the legacy name coming back. That is a useful
 * guard but it is not proof that a user sees the right name, so these tests render the surfaces the
 * owner actually looks at and assert on the resulting DOM text.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/hooks/useOperatorMutation", () => ({
  useOperatorMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AppHeader } from "@/ui/shell/app-header";
import FirstDiagnosisCta from "@/components/dashboard/FirstDiagnosisCta";
import DiagnosisEvidenceScopeNotice from "@/components/diagnosis/DiagnosisEvidenceScopeNotice";
import { metadata as rootMetadata } from "@/app/layout";

afterEach(() => cleanup());

describe("rendered product name", () => {
  it("the app header the owner sees on every authenticated page says OpsIQ", () => {
    const { container } = render(<AppHeader userName="Test Owner" />);
    const text = container.textContent ?? "";
    expect(text).toContain("OpsIQ");
    expect(text).not.toContain("Rebilix");
  });

  it("the first-diagnosis call to action names OpsIQ, not the legacy brand", () => {
    const { container } = render(<FirstDiagnosisCta />);
    const text = container.textContent ?? "";
    expect(text).toContain("OpsIQ");
    expect(text).not.toContain("Rebilix");
  });

  it("the document title metadata names OpsIQ", () => {
    expect(String(rootMetadata.title)).toContain("OpsIQ");
    expect(String(rootMetadata.title)).not.toContain("Rebilix");
  });
});

describe("diagnosis honesty is rendered, not merely present in source", () => {
  it("tells the owner the assessment ignores stored records and routes them to the fix", () => {
    const { container, getByTestId } = render(<DiagnosisEvidenceScopeNotice placement="result" />);
    const text = container.textContent ?? "";
    // It must not claim to have used stored intake data.
    expect(text).toMatch(/only what you typed above/i);
    expect(text).toMatch(/does not yet read the revenue, costs, uploads or records/i);
    // It must not claim AI involvement, which does not happen on this path.
    expect(text).not.toMatch(/\bAI\b|model|GPT|Claude/i);
    expect(getByTestId("diagnosis-evidence-scope-notice").querySelector("a")!.getAttribute("href")).toBe(
      "/owner/data",
    );
  });
});
