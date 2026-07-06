/**
 * ValidationOutcomePanel — jsdom component test (browser-free UI proof).
 *
 * Proves the recorded-outcome cockpit surface: the top result, next decision, why scale/kill/park is or is
 * not allowed, approval level, stop-loss flag, and an honest empty state — with no fake money/percent.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ValidationOutcomePanel, type ValidationOutcomeView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const outcome = (over: Partial<ValidationOutcomeView> = {}): ValidationOutcomeView => ({
  opportunityKey: "SERVICE_GAP:NEW_SERVICE", experimentKey: "exp-1", status: "COMPLETED", result: "PASSED",
  validationStatus: "PASSED", nextRecommendedDecision: "SCALE_CANDIDATE", approvalLevel: "OWNER", stopLossTriggered: false,
  ownerVisibleSummary: "Validation passed with cost + margin evidence — bring a scaling plan to the owner.", recordedAt: "2026-07-06T00:00:00.000Z",
  ...over,
});

describe("ValidationOutcomePanel", () => {
  it("shows a passed result with a scale-candidate decision and owner approval", () => {
    const { getByTestId } = render(<ValidationOutcomePanel data={[outcome()]} />);
    expect(getByTestId("outcome-panel").getAttribute("data-result")).toBe("PASSED");
    expect(getByTestId("outcome-panel").getAttribute("data-next-decision")).toBe("SCALE_CANDIDATE");
    expect(getByTestId("outcome-result").textContent).toMatch(/Result: PASSED/);
    expect(getByTestId("outcome-approval").textContent).toMatch(/Owner approval/i);
    expect(getByTestId("outcome-gate").textContent).toMatch(/Scaling is unblocked/i);
  });

  it("shows a failed result as a stop with scaling off the table", () => {
    const { getByTestId } = render(<ValidationOutcomePanel data={[outcome({ result: "FAILED", validationStatus: "FAILED", nextRecommendedDecision: "KILL", ownerVisibleSummary: "Validation failed — stop this opportunity." })]} />);
    expect(getByTestId("outcome-gate").textContent).toMatch(/off the table/i);
  });

  it("shows the stop-loss flag when triggered", () => {
    const { getByTestId } = render(<ValidationOutcomePanel data={[outcome({ result: "FAILED", nextRecommendedDecision: "KILL", stopLossTriggered: true })]} />);
    expect(getByTestId("outcome-stoploss").textContent).toMatch(/Stop-loss was triggered/i);
  });

  it("blocks scaling for an inconclusive result", () => {
    const { getByTestId } = render(<ValidationOutcomePanel data={[outcome({ result: "INCONCLUSIVE", validationStatus: "INCONCLUSIVE", nextRecommendedDecision: "RETEST", approvalLevel: "MANAGER", ownerVisibleSummary: "Inconclusive — retest." })]} />);
    expect(getByTestId("outcome-gate").textContent).toMatch(/stays blocked/i);
  });

  it("renders an honest empty state", () => {
    const { getByTestId, queryByTestId } = render(<ValidationOutcomePanel data={null} />);
    expect(getByTestId("outcome-empty").textContent).toMatch(/No validation outcome recorded yet/i);
    expect(queryByTestId("outcome-panel")).toBeNull();
  });

  it("carries no fabricated money or percent", () => {
    const { container } = render(<ValidationOutcomePanel data={[outcome()]} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/[$£€]\s?\d/);
    expect(text).not.toMatch(/\d\s?%/);
    expect(text).not.toMatch(/guaranteed|profit guarantee|win probability/);
  });
});
