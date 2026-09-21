/**
 * UX-03 — OwnerAssessmentSummary (presentation-only component proof).
 *
 * Renders the already-finished UX-02B OwnerAssessmentNarrative verbatim. This test passes the
 * narrative directly — it never calls reconcileOwnerAssessment/composeOwnerAssessment — because
 * this component must have no reconciliation, health, category, or confidence logic of its own.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { OwnerAssessmentSummary } from "@/components/owner/OwnerAssessmentSummary";
import type { OwnerAssessmentNarrative } from "@/domain/owner-guidance/owner-assessment-composer";

afterEach(() => cleanup());

function narrative(overrides: Partial<OwnerAssessmentNarrative> = {}): OwnerAssessmentNarrative {
  return {
    headline: "No major problem is showing in the current evidence.",
    primaryConcern: null,
    confidenceLabel: "Strong evidence",
    confidenceMessage: "The assessment is supported by the available evidence.",
    nextDataStep: null,
    ...overrides,
  };
}

describe("OwnerAssessmentSummary — UX-03 presentation-only component", () => {
  it("1. renders headline verbatim", () => {
    render(<OwnerAssessmentSummary narrative={narrative({ headline: "The business needs attention." })} />);
    expect(screen.getByTestId("owner-assessment-headline")).toHaveTextContent("The business needs attention.");
  });

  it("2. renders primaryConcern verbatim when provided", () => {
    render(<OwnerAssessmentSummary narrative={narrative({ primaryConcern: "Cash flow is the first issue to address." })} />);
    expect(screen.getByTestId("owner-assessment-primary-concern")).toHaveTextContent(
      "Cash flow is the first issue to address.",
    );
  });

  it("3. does not render a fabricated primary-concern placeholder when null", () => {
    render(<OwnerAssessmentSummary narrative={narrative({ primaryConcern: null })} />);
    expect(screen.queryByTestId("owner-assessment-primary-concern")).not.toBeInTheDocument();
    const text = screen.getByTestId("owner-assessment-summary").textContent ?? "";
    expect(text).not.toMatch(/no concern/i);
    expect(text).not.toMatch(/everything looks fine/i);
    expect(text).not.toMatch(/no issues/i);
  });

  it("4. renders confidenceLabel verbatim", () => {
    render(<OwnerAssessmentSummary narrative={narrative({ confidenceLabel: "Limited confidence" })} />);
    expect(screen.getByTestId("owner-assessment-confidence-label")).toHaveTextContent("Limited confidence");
  });

  it("5. renders confidenceMessage verbatim", () => {
    render(
      <OwnerAssessmentSummary
        narrative={narrative({ confidenceMessage: "Some important data is missing, so this assessment is provisional." })}
      />,
    );
    expect(screen.getByTestId("owner-assessment-confidence-message")).toHaveTextContent(
      "Some important data is missing, so this assessment is provisional.",
    );
  });

  it("6. renders nextDataStep verbatim when provided", () => {
    render(<OwnerAssessmentSummary narrative={narrative({ nextDataStep: "Add or update latest cash position." })} />);
    expect(screen.getByTestId("owner-assessment-next-data-step")).toHaveTextContent(
      "Add or update latest cash position.",
    );
  });

  it("7. renders 'Update business data' linking to /owner/data when nextDataStep exists", () => {
    render(<OwnerAssessmentSummary narrative={narrative({ nextDataStep: "Add or update latest cash position." })} />);
    const cta = screen.getByTestId("owner-assessment-update-data-cta");
    expect(cta).toHaveTextContent("Update business data");
    expect(cta.closest("a")).toHaveAttribute("href", "/owner/data");
  });

  it("8. hides the entire next-data block and CTA when nextDataStep is null", () => {
    render(<OwnerAssessmentSummary narrative={narrative({ nextDataStep: null })} />);
    expect(screen.queryByTestId("owner-assessment-next-data-step-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("owner-assessment-next-data-step")).not.toBeInTheDocument();
    expect(screen.queryByTestId("owner-assessment-update-data-cta")).not.toBeInTheDocument();
  });

  it("9. does not render businessId", () => {
    render(<OwnerAssessmentSummary narrative={narrative()} />);
    const text = screen.getByTestId("owner-assessment-summary").textContent ?? "";
    expect(text).not.toMatch(/business-secret-id|workspace-secret-id/i);
  });

  it("10. does not render internal enum/category tokens supplied nowhere in the narrative", () => {
    render(<OwnerAssessmentSummary narrative={narrative()} />);
    const text = screen.getByTestId("owner-assessment-summary").textContent ?? "";
    for (const token of [
      "AVAILABLE",
      "LIMITED",
      "INSUFFICIENT",
      "CASH_DANGER",
      "OVERLOAD",
      "PROFIT_LEAK",
      "OWNER_NOW_VIEW",
      "VERIFIED",
      "STRONG",
      "MODERATE",
      "WEAK",
    ]) {
      expect(text).not.toContain(token);
    }
  });
});
