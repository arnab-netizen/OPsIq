/**
 * OwnerWorkloadReductionPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the Executive Cockpit surface: the single top avoidable owner burden by default (owner action
 * first, explanation second, evidence collapsed in a <details>), the required approval, the risk guardrail,
 * a high-risk KEEP_OWNER_APPROVAL item, an honest empty state, and no fabricated time saving, no
 * disciplinary label, and no hidden score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { OwnerWorkloadReductionPanel, type OwnerWorkloadFindingView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const finding = (over: Partial<OwnerWorkloadFindingView> = {}): OwnerWorkloadFindingView => ({
  workloadType: "REPEATED_OWNER_ADJUDICATION",
  severity: "MEDIUM",
  burdenCount: 4,
  estimatedOwnerTouches: 4,
  supportingProofIds: [],
  supportingAdjudicationIds: ["a1", "a2", "a3", "a4"],
  supportingOperationalEventIds: [],
  supportingEscalationIds: [],
  supportingCorrectionKeys: [],
  supportingTrainingKeys: [],
  relatedProcessFinding: "PROOF_QUALITY_BREAKDOWN",
  relatedSLO: "ANTI_GAMING_RISK",
  ownerVisibleExplanation: "You keep adjudicating the same kind of weak-proof risk.",
  recommendedReductionAction: "REQUIRE_BETTER_PROOF_UPFRONT",
  approvalLevel: "MANAGER",
  riskGuardrail: "High-risk decisions stay with the owner; only routine repeats are delegated.",
  missingData: [],
  ...over,
});

describe("OwnerWorkloadReductionPanel", () => {
  it("shows the single top avoidable burden: action first, explanation, approval, guardrail", () => {
    const { getByTestId } = render(<OwnerWorkloadReductionPanel data={{ findings: [finding()], topFinding: finding() }} />);
    expect(getByTestId("owner-workload-panel").getAttribute("data-workload-type")).toBe("REPEATED_OWNER_ADJUDICATION");
    expect(getByTestId("owr-action").textContent).toMatch(/Require better proof upfront/i);
    expect(getByTestId("owr-explanation").textContent).toMatch(/weak-proof risk/i);
    expect(getByTestId("owr-approval").textContent).toMatch(/Manager approval required/i);
    expect(getByTestId("owr-guardrail").textContent).toMatch(/stay with the owner/i);
    expect(getByTestId("owr-touches").textContent).toMatch(/4 owner touches/);
  });

  it("collapses evidence by default in a <details> element (no owner overload)", () => {
    const { getByTestId } = render(<OwnerWorkloadReductionPanel data={{ findings: [finding()], topFinding: finding() }} />);
    const details = getByTestId("owr-evidence");
    expect(details.tagName.toLowerCase()).toBe("details");
    expect(details.hasAttribute("open")).toBe(false);
  });

  it("renders only the top finding by default; extra items are collapsed behind a summary", () => {
    const { getByTestId, queryAllByTestId } = render(<OwnerWorkloadReductionPanel data={{
      findings: [finding({ severity: "HIGH" }), finding({ workloadType: "LOW_RISK_OWNER_INTERRUPT", severity: "LOW" })],
      topFinding: finding({ severity: "HIGH" }),
    }} />);
    // Only one main panel body (top finding). The remainder is a collapsed "more" affordance.
    expect(queryAllByTestId("owner-workload-panel")).toHaveLength(1);
    expect(getByTestId("owr-more").textContent).toMatch(/1 more workload item/i);
  });

  it("a high-risk item keeps owner approval and never claims a fabricated time saving", () => {
    const { getByTestId, container } = render(<OwnerWorkloadReductionPanel data={{
      findings: [finding({ workloadType: "CORRECTION_APPROVAL_BACKLOG", recommendedReductionAction: "KEEP_OWNER_APPROVAL", approvalLevel: "OWNER", estimatedOwnerTouches: 2, supportingCorrectionKeys: ["c1", "c2"], supportingAdjudicationIds: [] })],
      topFinding: finding({ workloadType: "CORRECTION_APPROVAL_BACKLOG", recommendedReductionAction: "KEEP_OWNER_APPROVAL", approvalLevel: "OWNER", estimatedOwnerTouches: 2, supportingCorrectionKeys: ["c1", "c2"], supportingAdjudicationIds: [] }),
    }} />);
    expect(getByTestId("owr-action").textContent).toMatch(/Keep owner approval/i);
    expect(getByTestId("owr-approval").textContent).toMatch(/Owner approval required/i);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/hours saved|minutes saved|time saved/);
    expect(text).not.toMatch(/\b(fraud|negligence|fire|firing|payroll|discipline|punish)\b/);
    expect(text).not.toMatch(/\bscore\b/);
  });

  it("renders an honest empty state when there is no avoidable burden", () => {
    const { getByTestId, queryByTestId } = render(<OwnerWorkloadReductionPanel data={{ findings: [], topFinding: null }} />);
    expect(getByTestId("owner-workload-empty")).toBeTruthy();
    expect(queryByTestId("owner-workload-panel")).toBeNull();
  });
});
