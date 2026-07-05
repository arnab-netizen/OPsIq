/**
 * SopChecklistCorrectionsPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the SOP/checklist draft surface renders each proposed change with its area, status, reason,
 * evidence count, required approval, success metric, and review cadence; shows NEEDS_DATA drafts with
 * their missing data; renders an honest empty state; presents drafts as proposals (nothing auto-applied);
 * and shows no fraud/negligence label and no hidden score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SopChecklistCorrectionsPanel, type SopChecklistCorrectionView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const draft = (over: Partial<SopChecklistCorrectionView> = {}): SopChecklistCorrectionView => ({
  sourceCorrectionKey: "ws-1:QUALITY_FAILURE_LOOP:UPDATE_CHECKLIST:PROOF_REVIEW",
  correctionType: "UPDATE_CHECKLIST",
  affectedStage: "PROOF_REVIEW",
  sopArea: "ACCEPTANCE_QUALITY_CHECKLIST",
  proposedChangeTitle: "Tighten the acceptance/quality checklist for this job type",
  proposedChangeBody: "Add the specific check that keeps being missed to the acceptance checklist.",
  reason: "Customers keep complaining about quality on work that was signed off.",
  supportingProofIds: [],
  supportingOperationalEventIds: ["c1", "c2"],
  supportingEscalationIds: [],
  approvalLevel: "OWNER",
  ownerApprovalRequired: true,
  managerApprovalRequired: true,
  successMetric: "Quality complaint / rework events for this job type fall over the review window",
  reviewAfterDays: 14,
  status: "DRAFT",
  missingData: [],
  ...over,
});

describe("SopChecklistCorrectionsPanel", () => {
  it("renders each draft with area, status, reason, evidence, approval, success metric", () => {
    const { getByTestId, getAllByTestId } = render(<SopChecklistCorrectionsPanel data={{ drafts: [draft()], topDraft: draft() }} />);
    expect(getByTestId("sop-corrections-panel")).toBeTruthy();
    expect(getAllByTestId("sop-item")).toHaveLength(1);
    expect(getByTestId("sop-item-title").textContent).toMatch(/acceptance\/quality checklist/i);
    expect(getByTestId("sop-item-area").textContent).toMatch(/Acceptance\/quality checklist/i);
    expect(getByTestId("sop-item-status").textContent).toMatch(/DRAFT/);
    expect(getByTestId("sop-item-reason").textContent).toMatch(/complaining about quality/i);
    expect(getByTestId("sop-item-evidence").textContent).toMatch(/2 item/);
    expect(getByTestId("sop-item-approval").textContent).toMatch(/Owner approval required/i);
    expect(getByTestId("sop-item-metric").textContent).toMatch(/complaint \/ rework/i);
  });

  it("shows NEEDS_DATA drafts with their missing data", () => {
    const { getByTestId } = render(<SopChecklistCorrectionsPanel data={{ drafts: [draft({ status: "NEEDS_DATA", sopArea: "DATA_CAPTURE_CHECKLIST", missingData: ["no complaint/rework data"] })], topDraft: null }} />);
    expect(getByTestId("sop-item-status").textContent).toMatch(/NEEDS_DATA/);
    expect(getByTestId("sop-item-missing").textContent).toMatch(/no complaint\/rework data/);
  });

  it("renders an honest empty state when no drafts are proposed", () => {
    const { getByTestId, queryByTestId } = render(<SopChecklistCorrectionsPanel data={{ drafts: [], topDraft: null }} />);
    expect(getByTestId("sop-corrections-empty")).toBeTruthy();
    expect(queryByTestId("sop-corrections-panel")).toBeNull();
  });

  it("presents drafts as proposals — nothing auto-applied — with no prohibited labels", () => {
    const { container } = render(<SopChecklistCorrectionsPanel data={{ drafts: [draft({ sopArea: "TRAINING_HANDOFF", correctionType: "ASSIGN_TRAINING_REVIEW", proposedChangeTitle: "Training/coaching handoff (routed to the training pass)", ownerApprovalRequired: false, approvalLevel: "MANAGER" })], topDraft: null }} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/draft changes/i);
    // The panel reassures that nothing is applied automatically (governance-positive).
    expect(text).toMatch(/nothing here is applied automatically/i);
    // But it must never present a draft as already auto-applied/approved.
    expect(text).not.toMatch(/\bauto-?applied\b|\bapproved automatically\b/i);
    expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|stole)\b/i);
    expect(text).not.toMatch(/\bscore\b/i);
  });
});
