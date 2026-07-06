/**
 * EffectivenessPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the effectiveness surface renders each evaluation with its targeted problem, direction, baseline
 * vs current metric, summary, recommended next action, and required approval; shows INSUFFICIENT_DATA with
 * its missing-data note; renders an honest empty state; and shows no fraud/negligence label, no hidden
 * score, and no fabricated money figure.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { EffectivenessPanel, type EffectivenessEvaluationView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const evaluation = (over: Partial<EffectivenessEvaluationView> = {}): EffectivenessEvaluationView => ({
  sourceCorrectionKey: "ws-1:QUALITY_FAILURE_LOOP:UPDATE_CHECKLIST:PROOF_REVIEW",
  sourceTrainingKey: null,
  sourceProcessFindingKey: "ws-1:QUALITY_FAILURE_LOOP",
  evaluationType: "SOP_CHECKLIST_EFFECTIVENESS",
  targetedProblemType: "QUALITY_COMPLAINTS",
  baselineMetricValue: 5,
  currentMetricValue: 2,
  direction: "IMPROVED",
  confidence: "MEDIUM",
  ownerVisibleSummary: "The quality complaints fell from 5 to 2 after the correction — it appears to be working.",
  recommendedNextAction: "KEEP",
  approvalLevel: "OWNER",
  missingData: [],
  ...over,
});

describe("EffectivenessPanel", () => {
  it("renders an evaluation with direction, baseline vs current, summary, next action, approval", () => {
    const { getByTestId } = render(<EffectivenessPanel data={{ evaluations: [evaluation()], topEvaluation: evaluation() }} />);
    expect(getByTestId("effectiveness-panel")).toBeTruthy();
    expect(getByTestId("eff-item-problem").textContent).toMatch(/QUALITY COMPLAINTS/i);
    expect(getByTestId("eff-item-direction").textContent).toMatch(/Improved/i);
    expect(getByTestId("eff-item-metric").textContent).toMatch(/5 → 2/);
    expect(getByTestId("eff-item-summary").textContent).toMatch(/appears to be working/i);
    expect(getByTestId("eff-item-next").textContent).toMatch(/Keep/i);
    expect(getByTestId("eff-item-approval").textContent).toMatch(/Owner approval required/i);
  });

  it("shows INSUFFICIENT_DATA honestly with the missing-data note", () => {
    const { getByTestId } = render(<EffectivenessPanel data={{ evaluations: [evaluation({ direction: "INSUFFICIENT_DATA", baselineMetricValue: null, currentMetricValue: 2, missingData: ["no earlier snapshot to use as a baseline"] })], topEvaluation: null }} />);
    expect(getByTestId("eff-item-direction").textContent).toMatch(/Not enough data yet/i);
    expect(getByTestId("eff-item-missing").textContent).toMatch(/no earlier snapshot/i);
  });

  it("renders an honest empty state when there are no evaluations", () => {
    const { getByTestId, queryByTestId } = render(<EffectivenessPanel data={{ evaluations: [], topEvaluation: null }} />);
    expect(getByTestId("effectiveness-empty")).toBeTruthy();
    expect(queryByTestId("effectiveness-panel")).toBeNull();
  });

  it("never fabricates a money figure or prohibited label", () => {
    const { container } = render(<EffectivenessPanel data={{ evaluations: [evaluation({ direction: "WORSENED", baselineMetricValue: 2, currentMetricValue: 6, ownerVisibleSummary: "The quality complaints rose from 2 to 6 after the correction — it is not working and needs a rethink." })], topEvaluation: null }} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/never estimates a money figure/i);
    expect(text).not.toMatch(/[$£€]\s?\d/);
    expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy)\b/i);
    expect(text).not.toMatch(/\bscore\b/i);
  });
});
