/**
 * CapabilityGapPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the Executive Cockpit surface: the single highest-priority capability by default (what OpsIQ can't
 * do today, the recommendation, the owner benefit, what it unlocks, the governance guardrail), evidence
 * collapsed in a <details>, the summary counts, an honest empty state, and no fabricated money /
 * disciplinary label / hidden score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CapabilityGapPanel, type CapabilityRecommendationView, type CapabilityGapView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const rec = (over: Partial<CapabilityRecommendationView> = {}): CapabilityRecommendationView => ({
  capabilityType: "REFUND_RECONCILIATION",
  title: "Refund reconciliation",
  severity: "MEDIUM",
  problemStatement: "OpsIQ cannot tie a refund back to a confirmed original charge.",
  recommendedCapability: "A refund-reconciliation capability linking each refund to its verified original transaction.",
  ownerBenefit: "Refund decisions backed by a real record instead of a manual owner check.",
  unlocksAutomation: true,
  unlockedActionTypes: ["REFUND_ABOVE_THRESHOLD"],
  governanceGuardrail: "Even once built, material money decisions stay owner-controlled.",
  signalCount: 2,
  evidenceRefs: [],
  blocksToday: [],
  missingData: [],
  estimatedComplexity: "MEDIUM",
  priorityRank: 1,
  ...over,
});

const view = (over: Partial<CapabilityGapView> = {}): CapabilityGapView => ({
  recommendations: [rec()],
  topRecommendation: rec(),
  summary: { total: 1, critical: 0, high: 0, unlocksAutomation: 1 },
  ...over,
});

describe("CapabilityGapPanel", () => {
  it("shows the top capability: problem, recommendation, benefit, what it unlocks, guardrail", () => {
    const { getByTestId } = render(<CapabilityGapPanel data={view()} />);
    expect(getByTestId("capability-gap-panel").getAttribute("data-capability-type")).toBe("REFUND_RECONCILIATION");
    expect(getByTestId("cap-title").textContent).toMatch(/Refund reconciliation/i);
    expect(getByTestId("cap-problem").textContent).toMatch(/tie a refund/i);
    expect(getByTestId("cap-capability").textContent).toMatch(/refund-reconciliation capability/i);
    expect(getByTestId("cap-benefit").textContent).toMatch(/backed by a real record/i);
    expect(getByTestId("cap-unlocks").textContent).toMatch(/REFUND_ABOVE_THRESHOLD/);
    expect(getByTestId("cap-guardrail").textContent).toMatch(/owner-controlled/i);
  });

  it("collapses the evidence/why in a <details> element (no owner overload)", () => {
    const { getByTestId } = render(<CapabilityGapPanel data={view({
      recommendations: [rec({ evidenceRefs: ["e1"], blocksToday: ["a refund cannot be safely automated today"] })],
      topRecommendation: rec({ evidenceRefs: ["e1"], blocksToday: ["a refund cannot be safely automated today"] }),
    })} />);
    const details = getByTestId("cap-evidence");
    expect(details.tagName.toLowerCase()).toBe("details");
    expect(details.hasAttribute("open")).toBe(false);
  });

  it("renders only the top recommendation by default; the rest are behind a summary + a counts line", () => {
    const { getByTestId, queryAllByTestId } = render(<CapabilityGapPanel data={view({
      recommendations: [rec({ severity: "CRITICAL", capabilityType: "VERIFIED_FINANCIAL_LEDGER", title: "Verified financial ledger" }), rec({ capabilityType: "MARGIN_SIMULATION", title: "Margin simulation" })],
      topRecommendation: rec({ severity: "CRITICAL", capabilityType: "VERIFIED_FINANCIAL_LEDGER", title: "Verified financial ledger" }),
      summary: { total: 2, critical: 1, high: 0, unlocksAutomation: 2 },
    })} />);
    expect(queryAllByTestId("capability-gap-panel")).toHaveLength(1);
    expect(getByTestId("cap-more").textContent).toMatch(/1 more capability recommendation/i);
    expect(getByTestId("cap-summary").textContent).toMatch(/2 capability gap/i);
  });

  it("renders an honest empty state when there is no capability gap", () => {
    const { getByTestId, queryByTestId } = render(<CapabilityGapPanel data={{ recommendations: [], topRecommendation: null, summary: { total: 0, critical: 0, high: 0, unlocksAutomation: 0 } }} />);
    expect(getByTestId("capability-gap-empty")).toBeTruthy();
    expect(queryByTestId("capability-gap-panel")).toBeNull();
  });

  it("carries no fabricated money, no disciplinary label, no hidden score", () => {
    const { container } = render(<CapabilityGapPanel data={view({
      recommendations: [rec({ capabilityType: "COMPENSATION_INTEGRATION", title: "Read-only compensation feed", problemStatement: "OpsIQ has no view of staff compensation and must never change it.", unlocksAutomation: false, unlockedActionTypes: [] })],
      topRecommendation: rec({ capabilityType: "COMPENSATION_INTEGRATION", title: "Read-only compensation feed", problemStatement: "OpsIQ has no view of staff compensation and must never change it.", unlocksAutomation: false, unlockedActionTypes: [] }),
    })} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/[$£€]\s?\d/);
    expect(text).not.toMatch(/\b(fraud|negligence|fire|firing|payroll|discipline|punish)\b/);
    expect(text).not.toMatch(/hidden\s*score/);
  });
});
