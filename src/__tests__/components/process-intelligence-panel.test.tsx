/**
 * ProcessIntelligencePanel — jsdom component test (browser-free UI proof).
 *
 * Proves the owner surface renders the top process breakdown: title, affected stage, severity/confidence,
 * evidence counts + refs, related profit-leak/constraint/SLO, why it's breaking, the one recommended
 * correction, and the required approval level; handles DATA_INSUFFICIENT + empty honestly; and shows no
 * fraud/negligence label and no hidden staff score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ProcessIntelligencePanel, type ProcessFindingView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const finding = (over: Partial<ProcessFindingView> = {}): ProcessFindingView => ({
  findingType: "QUALITY_FAILURE_LOOP", severity: "HIGH", confidence: "HIGH", affectedStage: "PROOF_REVIEW",
  affectedActorId: null, affectedManagerId: null, supportingProofIds: [], supportingOperationalEventIds: ["e1", "e2"],
  supportingEscalationIds: [], supportingAdjudicationIds: [], relatedProfitLeak: "COMPLAINT_REVENUE_RISK",
  relatedConstraint: "QUALITY", relatedSLO: "OPERATIONAL_EVENT_RESOLUTION",
  ownerExplanation: "Customers keep complaining about quality on work that was signed off.",
  recommendedCorrectiveAction: "Tighten the acceptance checklist and re-check recent approvals.",
  expectedImpactType: "COMPLAINT_RISK", requiredApprovalLevel: "OWNER", missingData: [], ...over,
});

describe("ProcessIntelligencePanel", () => {
  it("renders the top breakdown: title, stage, correction, approval, evidence", () => {
    const { container, getByTestId } = render(<ProcessIntelligencePanel data={{ topFinding: finding(), findings: [finding()] }} />);
    expect(getByTestId("process-intelligence-panel").getAttribute("data-finding-type")).toBe("QUALITY_FAILURE_LOOP");
    expect(getByTestId("pi-title").textContent).toMatch(/Quality failure loop/i);
    expect(getByTestId("pi-stage").textContent).toMatch(/Proof review/i);
    expect(getByTestId("pi-why").textContent).toMatch(/complaining about quality/i);
    expect(getByTestId("pi-correction").textContent).toMatch(/acceptance checklist/i);
    expect(getByTestId("pi-approval").textContent).toMatch(/Owner approval required/i);
    expect(getByTestId("pi-evidence-count").textContent).toMatch(/2 item/);
    expect(getByTestId("pi-evidence-refs").textContent).toMatch(/e1, e2/);
    expect(container.textContent ?? "").toMatch(/HIGH/);
  });

  it("shows related profit leak / constraint / SLO where present", () => {
    const { getByTestId } = render(<ProcessIntelligencePanel data={{ topFinding: finding(), findings: [] }} />);
    expect(getByTestId("pi-profit-leak").textContent).toMatch(/COMPLAINT_REVENUE_RISK/);
    expect(getByTestId("pi-constraint").textContent).toMatch(/QUALITY/);
    expect(getByTestId("pi-slo").textContent).toMatch(/OPERATIONAL_EVENT_RESOLUTION/);
  });

  it("handles DATA_INSUFFICIENT honestly with the missing data", () => {
    const { getByTestId, queryByTestId } = render(<ProcessIntelligencePanel data={{ topFinding: finding({ findingType: "DATA_INSUFFICIENT", affectedStage: "NONE", relatedProfitLeak: null, relatedConstraint: null, relatedSLO: null, missingData: ["no complaint/rework data"], ownerExplanation: "No process breakdown is established yet." }), findings: [] }} />);
    expect(getByTestId("process-intelligence-data-insufficient")).toBeTruthy();
    expect(getByTestId("pi-missing-data").textContent).toMatch(/no complaint\/rework data/);
    expect(queryByTestId("process-intelligence-panel")).toBeNull();
  });

  it("renders an empty state when there is no finding", () => {
    const { getByTestId } = render(<ProcessIntelligencePanel data={{ topFinding: null, findings: [] }} />);
    expect(getByTestId("process-intelligence-empty")).toBeTruthy();
  });

  it("shows no fraud/negligence label and no hidden staff score", () => {
    const { container } = render(<ProcessIntelligencePanel data={{ topFinding: finding({ findingType: "PROOF_QUALITY_BREAKDOWN", affectedActorId: "op-1" }), findings: [] }} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|stole)\b/i);
    expect(text).not.toMatch(/\bscore\b/i);
    // The fairness note is present.
    expect(text).toMatch(/not an accusation/i);
  });
});
