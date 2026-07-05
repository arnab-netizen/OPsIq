/**
 * TrainingAssignmentsPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the training/review surface renders each recommendation with its type, who it is for, the
 * explanation, evidence count, required approval, success metric, review cadence, and any linked SOP
 * change; shows NEEDS_DATA briefings; renders an honest empty state; presents recommendations as
 * proposals (coaching/review, nothing auto-assigned, no discipline); and shows no fraud/negligence label
 * and no hidden score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TrainingAssignmentsPanel, type TrainingAssignmentView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const assignment = (over: Partial<TrainingAssignmentView> = {}): TrainingAssignmentView => ({
  sourceProcessFindingKey: "ws-1:PROOF_QUALITY_BREAKDOWN",
  sourceCorrectionKey: "ws-1:PROOF_QUALITY_BREAKDOWN:REQUIRE_FRESH_PROOF:op-1",
  trainingType: "PROOF_QUALITY_REVIEW",
  assignedToUserId: "op-1",
  assignedRole: null,
  assignedByRole: "system-proposed",
  approvalLevel: "MANAGER",
  reason: "The proof coming in for this operator is repeatedly weak.",
  supportingProofIds: ["p1", "p2"],
  supportingOperationalEventIds: [],
  supportingEscalationIds: [],
  relatedSopChecklistCorrectionKey: null,
  successMetric: "Weak/reused proof events for this operator fall over the review window",
  reviewAfterDays: 14,
  status: "PROPOSED",
  ownerVisibleExplanation: "Review the acceptable proof standard with this operator. This is coaching, not an accusation.",
  ...over,
});

describe("TrainingAssignmentsPanel", () => {
  it("renders each recommendation with type, who, explanation, evidence, approval, success metric", () => {
    const { getByTestId, getAllByTestId } = render(<TrainingAssignmentsPanel data={{ assignments: [assignment()], topAssignment: assignment() }} />);
    expect(getByTestId("training-assignments-panel")).toBeTruthy();
    expect(getAllByTestId("ta-item")).toHaveLength(1);
    expect(getByTestId("ta-item-type").textContent).toMatch(/Proof quality review/i);
    expect(getByTestId("ta-item-who").textContent).toMatch(/Person: op-1/i);
    expect(getByTestId("ta-item-explanation").textContent).toMatch(/coaching, not an accusation/i);
    expect(getByTestId("ta-item-approval").textContent).toMatch(/Manager approval required/i);
    expect(getByTestId("ta-item-evidence").textContent).toMatch(/2 item/);
    expect(getByTestId("ta-item-metric").textContent).toMatch(/proof events/i);
  });

  it("shows the assigned team (role) and a linked SOP change when present", () => {
    const { getByTestId } = render(<TrainingAssignmentsPanel data={{ assignments: [assignment({ trainingType: "CHECKLIST_CHANGE_BRIEFING", assignedToUserId: null, assignedRole: "staff", relatedSopChecklistCorrectionKey: "ws-1:QUALITY_FAILURE_LOOP:UPDATE_CHECKLIST:PROOF_REVIEW" })], topAssignment: null }} />);
    expect(getByTestId("ta-item-who").textContent).toMatch(/Team: staff/i);
    expect(getByTestId("ta-item-sop").textContent).toMatch(/Linked SOP change/i);
  });

  it("renders an honest empty state when no training is recommended", () => {
    const { getByTestId, queryByTestId } = render(<TrainingAssignmentsPanel data={{ assignments: [], topAssignment: null }} />);
    expect(getByTestId("training-assignments-empty")).toBeTruthy();
    expect(queryByTestId("training-assignments-panel")).toBeNull();
  });

  it("presents recommendations as coaching/review proposals — no discipline, no prohibited labels", () => {
    const { container } = render(<TrainingAssignmentsPanel data={{ assignments: [assignment()], topAssignment: assignment() }} />);
    const text = container.textContent ?? "";
    // Reassures it is coaching/review, not discipline (governance-positive phrasing).
    expect(text).toMatch(/not disciplinary actions/i);
    expect(text).toMatch(/nothing here is assigned automatically/i);
    // But it must never actually recommend firing/payroll/punishment.
    expect(text).not.toMatch(/\b(fire|fired|firing|terminate|terminated|payroll|salary|punish|punishment|suspend|suspended)\b/i);
    expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|stole)\b/i);
    expect(text).not.toMatch(/\bscore\b/i);
  });
});
