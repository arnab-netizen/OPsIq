/**
 * Owner Process Intelligence page — jsdom integration test (browser-free).
 *
 * Stubs fetch to serve the now-view payload and asserts the page loads the process-intelligence block,
 * renders the top breakdown, links back to the Owner Now View, and shows a safe error on failure.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import OwnerProcessIntelligencePage from "@/app/(authenticated)/owner/process-intelligence/page";

const PAYLOAD = {
  processIntelligence: {
    topFinding: {
      findingType: "ESCALATION_RESPONSE_BREAKDOWN", severity: "HIGH", confidence: "MEDIUM", affectedStage: "ESCALATION_RESPONSE",
      affectedActorId: null, affectedManagerId: "mgr-1", supportingProofIds: [], supportingOperationalEventIds: [],
      supportingEscalationIds: ["esc1", "esc2"], supportingAdjudicationIds: [], relatedProfitLeak: null, relatedConstraint: "MANAGER",
      relatedSLO: "ANTI_GAMING_RISK", ownerExplanation: "Escalations are reaching this manager but not being acknowledged in time.",
      recommendedCorrectiveAction: "Reassign the overdue escalations and set a hard acknowledgement deadline.",
      expectedImpactType: "TRUST_RISK", requiredApprovalLevel: "OWNER", missingData: [],
    },
    findings: [],
  },
  processCorrections: {
    corrections: [
      {
        correctionId: "ws-1:ESCALATION_RESPONSE_BREAKDOWN:ESCALATE_TO_OWNER:mgr-1",
        sourceFindingType: "ESCALATION_RESPONSE_BREAKDOWN", correctionType: "ESCALATE_TO_OWNER",
        title: "Reassign the overdue escalations", instruction: "Reassign the overdue escalations now and set a hard acknowledgement deadline.",
        affectedStage: "ESCALATION_RESPONSE", targetActorId: null, targetManagerId: "mgr-1", severity: "HIGH",
        priorityRank: 1, requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, autoExecutable: false, status: "PROPOSED",
      },
    ],
    topCorrection: {
      correctionId: "ws-1:ESCALATION_RESPONSE_BREAKDOWN:ESCALATE_TO_OWNER:mgr-1",
      sourceFindingType: "ESCALATION_RESPONSE_BREAKDOWN", correctionType: "ESCALATE_TO_OWNER",
      title: "Reassign the overdue escalations", instruction: "Reassign the overdue escalations now and set a hard acknowledgement deadline.",
      affectedStage: "ESCALATION_RESPONSE", targetActorId: null, targetManagerId: "mgr-1", severity: "HIGH",
      priorityRank: 1, requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, autoExecutable: false, status: "PROPOSED",
    },
  },
  sopChecklistCorrections: {
    drafts: [
      {
        sourceCorrectionKey: "ws-1:QUALITY_FAILURE_LOOP:UPDATE_CHECKLIST:PROOF_REVIEW",
        correctionType: "UPDATE_CHECKLIST", affectedStage: "PROOF_REVIEW", sopArea: "ACCEPTANCE_QUALITY_CHECKLIST",
        proposedChangeTitle: "Tighten the acceptance/quality checklist for this job type",
        proposedChangeBody: "Add the specific check that keeps being missed to the acceptance checklist.",
        reason: "Customers keep complaining about quality on work that was signed off.",
        supportingProofIds: [], supportingOperationalEventIds: ["c1"], supportingEscalationIds: [],
        approvalLevel: "OWNER", ownerApprovalRequired: true, managerApprovalRequired: true,
        successMetric: "Quality complaint / rework events fall over the review window", reviewAfterDays: 14,
        status: "DRAFT", missingData: [],
      },
    ],
    topDraft: {
      sourceCorrectionKey: "ws-1:QUALITY_FAILURE_LOOP:UPDATE_CHECKLIST:PROOF_REVIEW",
      correctionType: "UPDATE_CHECKLIST", affectedStage: "PROOF_REVIEW", sopArea: "ACCEPTANCE_QUALITY_CHECKLIST",
      proposedChangeTitle: "Tighten the acceptance/quality checklist for this job type",
      proposedChangeBody: "Add the specific check that keeps being missed to the acceptance checklist.",
      reason: "Customers keep complaining about quality on work that was signed off.",
      supportingProofIds: [], supportingOperationalEventIds: ["c1"], supportingEscalationIds: [],
      approvalLevel: "OWNER", ownerApprovalRequired: true, managerApprovalRequired: true,
      successMetric: "Quality complaint / rework events fall over the review window", reviewAfterDays: 14,
      status: "DRAFT", missingData: [],
    },
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/owner/now-view")) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(PAYLOAD) } as Response);
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("OwnerProcessIntelligencePage", () => {
  it("loads the process-intelligence block, renders the top breakdown, and links back to the Now View", async () => {
    const { container, findByTestId } = render(<OwnerProcessIntelligencePage />);
    await findByTestId("process-intelligence-panel");
    expect(container.textContent ?? "").toMatch(/Escalation response breakdown/i);
    expect(container.textContent ?? "").toMatch(/Reassign the overdue escalations/i);
    // The routed corrections render too, with the owner-approval marker.
    await findByTestId("process-corrections-panel");
    expect(container.textContent ?? "").toMatch(/Recommended corrections/i);
    expect(container.textContent ?? "").toMatch(/Owner approval required/i);
    // The SOP/checklist draft surface renders too.
    await findByTestId("sop-corrections-panel");
    expect(container.textContent ?? "").toMatch(/Proposed SOP \/ checklist changes/i);
    expect(container.textContent ?? "").toMatch(/acceptance\/quality checklist/i);
    const back = container.querySelector('[data-testid="back-to-now"]') as HTMLAnchorElement;
    expect(back.getAttribute("href")).toBe("/owner/now");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/owner/now-view"))).toBe(true);
  });

  it("shows a safe error (no raw internal detail) when the request fails", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response));
    const { findByTestId } = render(<OwnerProcessIntelligencePage />);
    const err = await findByTestId("pi-error");
    expect(err.textContent ?? "").toMatch(/not authorized/i);
    expect(err.textContent ?? "").not.toMatch(/stack|Prisma|undefined/i);
  });
});
