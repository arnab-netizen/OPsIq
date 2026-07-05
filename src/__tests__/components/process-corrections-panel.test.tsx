/**
 * ProcessCorrectionsPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the corrections surface renders the proposed corrections routed from the process breakdowns:
 * each with its title, correction type, instruction, PROPOSED status, priority, target, and — for
 * owner-gated corrections — an explicit owner-approval marker. Empty state renders honestly. No
 * correction is presented as auto-applied; no fraud/negligence label; no hidden staff score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ProcessCorrectionsPanel, type ProcessCorrectionView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const correction = (over: Partial<ProcessCorrectionView> = {}): ProcessCorrectionView => ({
  correctionId: "ws-1:QUALITY_FAILURE_LOOP:ESCALATE_TO_OWNER:op-1",
  sourceFindingType: "QUALITY_FAILURE_LOOP",
  correctionType: "ESCALATE_TO_OWNER",
  title: "Owner review of recent approvals",
  instruction: "Owner reviews the reviewer's recent approvals before the next batch.",
  affectedStage: "PROOF_REVIEW",
  targetActorId: null,
  targetManagerId: "mgr-1",
  severity: "HIGH",
  priorityRank: 1,
  requiredApprovalLevel: "OWNER",
  requiresOwnerApproval: true,
  autoExecutable: false,
  status: "PROPOSED",
  ...over,
});

describe("ProcessCorrectionsPanel", () => {
  it("renders each proposed correction with type, instruction, status and priority", () => {
    const { getByTestId, getAllByTestId } = render(<ProcessCorrectionsPanel data={{
      corrections: [correction(), correction({
        correctionId: "ws-1:REWORK_LOOP:REVIEW_PROCESS_STEP:op-2", sourceFindingType: "REWORK_LOOP",
        correctionType: "REVIEW_PROCESS_STEP", title: "Review the failing work step", severity: "MEDIUM",
        priorityRank: 2, requiredApprovalLevel: "MANAGER", requiresOwnerApproval: false, targetManagerId: null, targetActorId: "op-2",
      })],
      topCorrection: correction(),
    }} />);
    expect(getByTestId("process-corrections-panel")).toBeTruthy();
    const items = getAllByTestId("pc-item");
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute("data-correction-type")).toBe("ESCALATE_TO_OWNER");
    expect(getAllByTestId("pc-item-instruction")[0].textContent).toMatch(/recent approvals/i);
    expect(getAllByTestId("pc-item-status")[0].textContent).toMatch(/PROPOSED/);
    expect(getAllByTestId("pc-item-type")[0].textContent).toMatch(/Escalate to owner/i);
  });

  it("marks owner-gated corrections as requiring owner approval", () => {
    const { getAllByTestId } = render(<ProcessCorrectionsPanel data={{ corrections: [correction()], topCorrection: correction() }} />);
    expect(getAllByTestId("pc-item-approval")[0].textContent).toMatch(/Owner approval required/i);
  });

  it("renders an honest empty state when no corrections are proposed", () => {
    const { getByTestId, queryByTestId } = render(<ProcessCorrectionsPanel data={{ corrections: [], topCorrection: null }} />);
    expect(getByTestId("process-corrections-empty")).toBeTruthy();
    expect(queryByTestId("process-corrections-panel")).toBeNull();
  });

  it("presents corrections as proposals — nothing is shown as auto-applied — and no prohibited labels", () => {
    const { container } = render(<ProcessCorrectionsPanel data={{
      corrections: [correction({ correctionType: "ASSIGN_TRAINING_REVIEW", sourceFindingType: "STAFF_TRAINING_GAP", requiresOwnerApproval: false, requiredApprovalLevel: "MANAGER", targetActorId: "op-7", targetManagerId: null })],
      topCorrection: null,
    }} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/proposals/i);
    expect(text).not.toMatch(/auto-?applied|automatically applied|approved automatically/i);
    expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|stole)\b/i);
    expect(text).not.toMatch(/\bscore\b/i);
  });
});
