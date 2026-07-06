/**
 * ValidationPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the Executive Cockpit surface for the Opportunity Validation Experiment Engine: the single next
 * experiment (cheapest bounded probe) with a pass AND fail threshold, hard caps + a stop-loss, an explicit
 * "not permission to scale" note, an owner-approval flag where material, a "why this experiment" collapsed
 * detail, an ingest/deferred summary, an honest empty state, and no fabricated money / hidden score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ValidationPanel, type ValidationExperimentView, type OpportunityValidationView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const experiment = (over: Partial<ValidationExperimentView> = {}): ValidationExperimentView => ({
  experimentType: "WHATSAPP_OR_CALL_SCRIPT_TEST",
  opportunityType: "RETENTION_CAMPAIGN",
  hypothesis: "A direct message to recently-complaining customers recovers them",
  riskiestAssumption: "That real customers respond, not just that the offer sounds good",
  method: "Contact a small list with a short honest script — no mass blast",
  successThreshold: "a meaningful share respond positively",
  failureThreshold: "near-zero response or negative reaction",
  stopLossRule: "Abort immediately if owner time exceeds 60 minutes or the failure threshold is hit",
  costCap: null,
  ownerTimeCapMinutes: 60,
  durationDays: 5,
  sampleSizeTarget: 15,
  dataToCollect: ["customers contacted", "responded positive/negative/none"],
  requiresOwnerApproval: false,
  approvalLevel: "MANAGER",
  cheaperAlternativeConsidered: "A paid re-engagement campaign was rejected until a hand-run script shows signal",
  doNotScaleNote: "A passing result validates the assumption only — it is not permission to scale.",
  confidence: "MEDIUM",
  ...over,
});
const view = (over: Partial<OpportunityValidationView> = {}): OpportunityValidationView => ({
  experiments: [experiment()],
  topExperiment: experiment(),
  deferred: [],
  summary: { candidatesConsidered: 2, experimentsDesigned: 1, deferred: 1, dataCollectionOnly: 0, ownerApprovalRequired: 0 },
  ...over,
});

describe("ValidationPanel", () => {
  it("shows the top experiment: type, hypothesis, and manager-runnable badge", () => {
    const { getByTestId } = render(<ValidationPanel data={view()} />);
    expect(getByTestId("validation-panel").getAttribute("data-experiment-type")).toBe("WHATSAPP_OR_CALL_SCRIPT_TEST");
    expect(getByTestId("val-title").textContent).toMatch(/Direct message\/call test/i);
    expect(getByTestId("val-hypothesis").textContent).toMatch(/recovers them/i);
    expect(getByTestId("val-approval-badge").textContent).toMatch(/Manager can run/i);
  });

  it("shows both a pass threshold and a fail threshold (falsifiable)", () => {
    const { getByTestId } = render(<ValidationPanel data={view()} />);
    expect(getByTestId("val-success").textContent).toMatch(/Pass if/i);
    expect(getByTestId("val-failure").textContent).toMatch(/Fail if/i);
  });

  it("shows hard caps and a stop-loss; no-spend experiments say 'no spend'", () => {
    const { getByTestId } = render(<ValidationPanel data={view()} />);
    expect(getByTestId("val-caps").textContent).toMatch(/60 min owner time/i);
    expect(getByTestId("val-caps").textContent).toMatch(/no spend/i);
    expect(getByTestId("val-stoploss").textContent).toMatch(/Abort|Stop/i);
  });

  it("always carries a do-not-scale note", () => {
    const { getByTestId } = render(<ValidationPanel data={view()} />);
    expect(getByTestId("val-noscale").textContent).toMatch(/not permission to scale/i);
  });

  it("flags owner approval when the experiment is material", () => {
    const owned = experiment({ requiresOwnerApproval: true, approvalLevel: "OWNER" });
    const { getByTestId } = render(<ValidationPanel data={view({ experiments: [owned], topExperiment: owned })} />);
    expect(getByTestId("val-approval-badge").textContent).toMatch(/Owner approval required/i);
  });

  it("collapses the 'why this experiment' detail by default", () => {
    const { getByTestId } = render(<ValidationPanel data={view()} />);
    const details = getByTestId("val-detail");
    expect(details.tagName.toLowerCase()).toBe("details");
    expect(details.hasAttribute("open")).toBe(false);
  });

  it("summarises candidates/experiments/deferred rather than dumping the list", () => {
    const { getByTestId } = render(<ValidationPanel data={view()} />);
    expect(getByTestId("val-summary").textContent).toMatch(/2 candidate\(s\)/i);
    expect(getByTestId("val-summary").textContent).toMatch(/1 deferred/i);
  });

  it("renders an honest empty state when there is no experiment", () => {
    const { getByTestId, queryByTestId } = render(<ValidationPanel data={{ experiments: [], topExperiment: null, deferred: [], summary: { candidatesConsidered: 0, experimentsDesigned: 0, deferred: 0, dataCollectionOnly: 0, ownerApprovalRequired: 0 } }} />);
    expect(getByTestId("validation-empty").textContent).toMatch(/No validation experiment to run yet/i);
    expect(queryByTestId("validation-panel")).toBeNull();
  });

  it("carries no fabricated money, profit guarantee, or hidden score", () => {
    const { container } = render(<ValidationPanel data={view({
      experiments: [experiment({ costCap: 40 })], topExperiment: experiment({ costCap: 40 }),
    })} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/[$£€]\s?\d/);
    expect(text).not.toMatch(/guaranteed|profit guarantee|ready to scale/);
    expect(text).not.toMatch(/\bscore\b/);
    expect(text).not.toMatch(/\b(fraud|negligence|firing|payroll|discipline)\b/);
  });
});
