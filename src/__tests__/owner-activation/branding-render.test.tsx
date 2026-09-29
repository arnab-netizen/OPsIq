/**
 * Branding proven by RENDERING, not by scanning source strings.
 *
 * `branding-regression.test.ts` scans src/ to stop the legacy name coming back. That is a useful
 * guard but it is not proof that a user sees the right name, so these tests render the surfaces the
 * owner actually looks at and assert on the resulting DOM text.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
import { ActiveBusinessProvider } from "@/context/active-business-context";
import FirstDiagnosisCta from "@/components/dashboard/FirstDiagnosisCta";
import { DiagnosisAnswerView } from "@/components/diagnosis/DiagnosisAnswerView";
import { buildGenericDiagnosisAnswer } from "@/domain/generic-diagnosis/answer";
import { metadata as rootMetadata } from "@/app/layout";

beforeEach(() => {
  // AppHeader reads the shared ActiveBusinessContext (the always-visible active-business
  // indicator); stub fetch so its mount-time /api/owner/businesses call resolves harmlessly.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: [] }) } as Response))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderHeader() {
  return render(
    <ActiveBusinessProvider>
      <AppHeader userName="Test Owner" />
    </ActiveBusinessProvider>
  );
}

describe("rendered product name", () => {
  it("the app header the owner sees on every authenticated page says OpsIQ", () => {
    // The brand mark is now the real OpsIQ logo image (not styled text), so its name is
    // carried in the accessible alt text rather than DOM textContent.
    const { container } = renderHeader();
    const brandImages = Array.from(container.querySelectorAll("img"));
    expect(brandImages.length).toBeGreaterThan(0);
    for (const img of brandImages) {
      expect(img.getAttribute("alt")).toBe("OpsIQ");
    }
    const text = container.textContent ?? "";
    expect(text).not.toContain("Rebilix");
  });

  it("the app header's brand mark is not a document heading -- each page owns the real <h1>", () => {
    // Regression: this header used to render "OpsIQ" as an <h1>, which meant every single
    // authenticated page had two <h1>s (this shell brand mark plus the page's own title),
    // violating one-h1-per-page heading hierarchy sitewide.
    const { container } = renderHeader();
    expect(container.querySelectorAll("h1")).toHaveLength(0);
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
  it("labels reported figures as not independently verified and claims no AI involvement", () => {
    const answer = buildGenericDiagnosisAnswer({
      businessName: "ZZ-TEST-SANDBOX",
      businessType: "bakery",
      problemStatement: "Costs keep rising.",
      mainIssue: "high_costs",
      monthlyRevenue: 200000,
      monthlyCosts: 260000,
    });
    const { container } = render(<DiagnosisAnswerView answer={answer} engagementCode="ZZT-001" interventionMode="recovery" />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Reported figure — not independently verified/);
    expect(text).toMatch(/Medium — one month of reported figures/);
    // It must not claim AI involvement, which does not happen on this path.
    expect(text).not.toMatch(/\bAI\b|model|GPT|Claude/i);
  });
});

