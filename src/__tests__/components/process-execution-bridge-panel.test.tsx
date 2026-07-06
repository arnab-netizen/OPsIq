/**
 * ProcessExecutionBridgePanel — jsdom component test (browser-free UI proof, PASS 20).
 *
 * Proves the owner sees the single TOP bridged action (summary, route, action owner, approval level, evidence
 * to complete, why it matters), completion + reassessment collapsed, a summary line, an honest empty state,
 * a monitor-only reason, and no fabricated figure / disciplinary label / hidden score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ProcessExecutionBridgePanel, type BridgedRouteView, type ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const route = (over: Partial<BridgedRouteView> = {}): BridgedRouteView => ({
  taskKey: "pc:c-owner", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-owner",
  executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
  requiredEvidence: ["the supporting evidence for the owner decision"], completionCriteria: "The owner records an approve/decline decision with a note.",
  reassessmentTrigger: "Re-evaluate at the next owner review.", riskIfIgnored: "the breakdown compounds if left",
  ownerVisibleSummary: "Escalate to owner — approve the process correction", notActionableReason: null,
  evidenceRefs: ["p1", "e1"], severity: "CRITICAL", priorityRank: 1, ...over,
});
const view = (over: Partial<ProcessExecutionBridgeView> = {}): ProcessExecutionBridgeView => ({
  routes: [route()], topRoute: route(),
  summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 }, ...over,
});

describe("ProcessExecutionBridgePanel", () => {
  it("shows the top bridged action: summary, route, action owner, approval, evidence, and why it matters", () => {
    const { getByTestId } = render(<ProcessExecutionBridgePanel data={view()} />);
    expect(getByTestId("bridge-summary-text").textContent).toMatch(/approve the process correction/i);
    expect(getByTestId("bridge-route").textContent).toMatch(/owner approval/i);
    expect(getByTestId("bridge-owner").textContent).toMatch(/owner/i);
    expect(getByTestId("bridge-approval").textContent).toBeTruthy();
    expect(getByTestId("bridge-risk").textContent).toMatch(/why it matters/i);
    expect(getByTestId("bridge-evidence-req").textContent).toMatch(/evidence to complete/i);
  });

  it("renders an honest empty state when there is no bridged action", () => {
    const { getByTestId } = render(<ProcessExecutionBridgePanel data={{ routes: [], topRoute: null, summary: { total: 0, ownerApproval: 0, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } }} />);
    expect(getByTestId("bridge-empty").textContent).toMatch(/no bridged action/i);
  });

  it("shows a monitor-only reason instead of evidence when the route is not actionable yet", () => {
    const { getByTestId, queryByTestId } = render(<ProcessExecutionBridgePanel data={view({ topRoute: route({ executionRoute: "MONITOR_ONLY", approvalLevel: "NEEDS_DATA", notActionableReason: "Data-insufficient: linked proof." }) })} />);
    expect(getByTestId("bridge-monitor").textContent).toMatch(/data-insufficient/i);
    expect(queryByTestId("bridge-evidence-req")).toBeNull();
  });

  it("fabricates no currency figure, no disciplinary label, no hidden score", () => {
    const { container } = render(<ProcessExecutionBridgePanel data={view()} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/[$£€]\s?\d/);
    expect(html).not.toMatch(/\b(fraud|negligent|lazy|dishonest|payroll)\b/i);
    expect(html).not.toMatch(/hidden\s*score/i);
  });
});
