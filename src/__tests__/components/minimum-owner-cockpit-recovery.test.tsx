/**
 * MinimumOwnerCockpit — Recovery status section proof (PASS 37).
 *
 * Proves the read-only recovery status section is low-load and honest: collapsed by default; when expanded it
 * shows the recovery state, next bottleneck, evidence + reassessment requirements, stabilization/thrive gates,
 * blocked unsafe actions, and the no-guarantee caveat; it never dumps raw milestones or audit refs, exposes no
 * hidden score, fabricates no recovery on a clean workspace, and never displaces the top action.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MinimumOwnerCockpit } from "@/components/owner/MinimumOwnerCockpit";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";
import type { OwnerRecoveryStatusResponse } from "@/domain/owner-mode/owner-recovery-status";

afterEach(() => cleanup());

const route = (over: Partial<BridgedRouteView> = {}): BridgedRouteView => ({
  taskKey: "pc:c-owner", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-owner",
  executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
  requiredEvidence: ["the supporting evidence"], completionCriteria: "Owner records a decision.",
  reassessmentTrigger: "Re-evaluate at next review.", riskIfIgnored: "the breakdown compounds",
  ownerVisibleSummary: "Approve the process correction", notActionableReason: null,
  evidenceRefs: ["proof-1"], severity: "CRITICAL", priorityRank: 1, status: "PROPOSED", ...over,
});
const bridge = (): ProcessExecutionBridgeView => ({ routes: [route()], topRoute: route(), summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } });

const recovery = (over: Partial<OwnerRecoveryStatusResponse> = {}): OwnerRecoveryStatusResponse => ({
  recoveryStatus: "RECOVERY_IN_PROGRESS",
  topRecoveryBottleneck: "Stop-loss in force: loss-making spend paused.",
  nextMilestone: { order: 1, milestone: "Stop-loss in force", requiredEvidence: "proof spend paused" },
  completedMilestones: [], blockedMilestones: [1, 2, 3, 4, 5, 6],
  requiredEvidence: ["proof the loss-making activity is paused"],
  requiredReassessment: "The next milestone must be executed with evidence before recovery advances.",
  ownerApprovalRequired: true, managerStaffActions: [],
  blockedUnsafeActions: ["Scale/growth/expansion stays blocked until stabilization is proven."],
  stabilizationGate: "BLOCKED", thriveGate: "BLOCKED",
  uncertaintyCaveat: "OpsIQ shows the next governed recovery step based on current evidence.",
  noGuaranteeStatement: "Recovery is not guaranteed.",
  sourceRefs: ["recovery:rc", "from-plan:CASH_PROTECTION_REQUIRED"],
  linkedProcessExecutionTaskIds: ["pc:c-owner"], ...over,
});
const none = (): OwnerRecoveryStatusResponse => recovery({
  recoveryStatus: "NONE", topRecoveryBottleneck: null, nextMilestone: null, blockedMilestones: [],
  requiredEvidence: [], requiredReassessment: "No recovery is in progress; nothing is required right now.",
  ownerApprovalRequired: false, linkedProcessExecutionTaskIds: [], sourceRefs: [],
});

describe("MinimumOwnerCockpit — recovery status section", () => {
  it("1. the recovery section exists and is collapsed by default", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    const group = getByTestId("cockpit-recovery-group");
    expect(group.tagName.toLowerCase()).toBe("details");
    expect(group.hasAttribute("open")).toBe(false);
  });

  it("2. it shows the recovery state and next bottleneck", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    expect(getByTestId("cockpit-recovery-state").textContent).toMatch(/recovery in progress/i);
    expect(getByTestId("cockpit-recovery-bottleneck").textContent).toMatch(/stop-loss/i);
  });

  it("3. the evidence requirement is visible", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    expect(getByTestId("cockpit-recovery-evidence").textContent).toMatch(/evidence required/i);
  });

  it("4. the reassessment requirement is visible", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    expect(getByTestId("cockpit-recovery-reassessment").textContent).toMatch(/reassess|before recovery advances/i);
  });

  it("5. the stabilization and thrive gate status are visible", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    expect(getByTestId("cockpit-recovery-stabilization").textContent).toMatch(/stabilization: blocked/i);
    expect(getByTestId("cockpit-recovery-thrive").textContent).toMatch(/growth gate: blocked/i);
  });

  it("6. blocked unsafe actions are visible", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    expect(getByTestId("cockpit-recovery-blocked").textContent).toMatch(/scale|growth|blocked/i);
  });

  it("7. the no-guarantee caveat is visible", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    expect(getByTestId("cockpit-recovery-caveat").textContent).toMatch(/not guaranteed/i);
  });

  it("8. no raw milestone dump (blocked milestone numbers are not listed inline)", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    // The section shows the next step, not a 1,2,3,4,5,6 milestone dump.
    expect(getByTestId("cockpit-recovery-group").textContent).not.toMatch(/1,\s*2,\s*3,\s*4,\s*5,\s*6/);
  });

  it("9. no raw audit dump (sourceRefs are not rendered inline)", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    expect(getByTestId("cockpit-recovery-group").textContent).not.toMatch(/from-plan:|recovery:rc/i);
  });

  it("10. no hidden score is exposed in the recovery section", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    expect(getByTestId("cockpit-recovery-group").innerHTML).not.toMatch(/\bscore\b|\btier\b/i);
  });

  it("11. a clean workspace shows no fabricated recovery", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={none()} onAction={() => {}} />);
    expect(getByTestId("cockpit-recovery-none").textContent).toMatch(/no recovery is in progress/i);
  });

  it("12. the top action remains primary (recovery does not displace it)", () => {
    const { getAllByTestId, getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    expect(getAllByTestId("cockpit-top-action-title").length).toBe(1);
    // recovery section renders after the top action card in document order.
    const top = getByTestId("cockpit-top-action");
    const rec = getByTestId("cockpit-recovery-group");
    expect(top.compareDocumentPosition(rec) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("13. no fabricated money / ROI / win-probability in the recovery section", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    const html = getByTestId("cockpit-recovery-group").innerHTML;
    expect(html).not.toMatch(/[$£€]\s?\d|\b\d+(\.\d+)?\s?%|\broi\b|win probability|guaranteed (recovery|profit|success)/i);
  });
});
