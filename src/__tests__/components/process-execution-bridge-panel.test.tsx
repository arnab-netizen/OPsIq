/**
 * ProcessExecutionBridgePanel — jsdom component test (browser-free UI proof, PASS 20).
 *
 * Proves the owner sees the single TOP bridged action (summary, route, action owner, approval level, evidence
 * to complete, why it matters), completion + reassessment collapsed, a summary line, an honest empty state,
 * a monitor-only reason, and no fabricated figure / disciplinary label / hidden score.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ProcessExecutionBridgePanel, type BridgedRouteView, type ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const route = (over: Partial<BridgedRouteView> = {}): BridgedRouteView => ({
  taskKey: "pc:c-owner", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-owner",
  executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
  requiredEvidence: ["the supporting evidence for the owner decision"], completionCriteria: "The owner records an approve/decline decision with a note.",
  reassessmentTrigger: "Re-evaluate at the next owner review.", riskIfIgnored: "the breakdown compounds if left",
  ownerVisibleSummary: "Escalate to owner — approve the process correction", notActionableReason: null,
  evidenceRefs: ["p1", "e1"], severity: "CRITICAL", priorityRank: 1, status: "PROPOSED", ...over,
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

  it("stays read-only (no interactive controls) when no onAction handler is supplied", () => {
    const { queryByTestId } = render(<ProcessExecutionBridgePanel data={view()} />);
    expect(queryByTestId("bridge-controls")).toBeNull();
    // The governance status line is still shown in read-only mode.
    expect(queryByTestId("bridge-status")!.textContent).toMatch(/proposed/i);
  });

  it("offers only the transitions valid for an owner-approval PROPOSED task and hides delegate", () => {
    const onAction = vi.fn();
    const { getByTestId, queryByTestId } = render(<ProcessExecutionBridgePanel data={view()} onAction={onAction} />);
    // Owner-approval task: APPROVE is offered, DELEGATE is NOT (owner-only material decision).
    expect(getByTestId("bridge-action-APPROVE")).toBeTruthy();
    expect(queryByTestId("bridge-action-DELEGATE")).toBeNull();
    // Owner-visible guardrail language is present.
    expect(getByTestId("bridge-note-owner").textContent).toMatch(/cannot be automated/i);
    expect(getByTestId("bridge-note-evidence").textContent).toMatch(/evidence required/i);
    // Clicking a control calls back with the task key + action; the panel performs no mutation itself.
    fireEvent.click(getByTestId("bridge-action-APPROVE"));
    expect(onAction).toHaveBeenCalledWith("pc:c-owner", "APPROVE");
  });

  it("offers delegate (not approve) for a non-owner manager/staff task and never bypasses evidence for completion", () => {
    const onAction = vi.fn();
    const top = route({ executionRoute: "CREATE_MANAGER_TASK", actionOwner: "MANAGER", approvalLevel: "MANAGER_ALLOWED" });
    const { getByTestId, queryByTestId } = render(<ProcessExecutionBridgePanel data={view({ topRoute: top, routes: [top] })} onAction={onAction} />);
    expect(getByTestId("bridge-action-DELEGATE")).toBeTruthy();
    expect(queryByTestId("bridge-action-APPROVE")).toBeNull();
    // COMPLETE is offered but the evidence-required language remains visible (the server gates it).
    expect(getByTestId("bridge-action-COMPLETE")).toBeTruthy();
    expect(getByTestId("bridge-note-evidence").textContent).toMatch(/evidence required/i);
  });

  it("shows a terminal task as final and offers only reassessment", () => {
    const onAction = vi.fn();
    const top = route({ status: "COMPLETED" });
    const { getByTestId, queryByTestId } = render(<ProcessExecutionBridgePanel data={view({ topRoute: top, routes: [top] })} onAction={onAction} />);
    expect(getByTestId("bridge-final").textContent).toMatch(/completed/i);
    expect(getByTestId("bridge-action-REQUEST_REASSESSMENT")).toBeTruthy();
    // No further mutating transitions on a terminal task.
    expect(queryByTestId("bridge-action-START")).toBeNull();
    expect(queryByTestId("bridge-action-APPROVE")).toBeNull();
    expect(queryByTestId("bridge-action-COMPLETE")).toBeNull();
  });

  it("offers no start/approve/complete on a monitor-only route, only data/reassessment", () => {
    const onAction = vi.fn();
    const top = route({ executionRoute: "MONITOR_ONLY", approvalLevel: "NEEDS_DATA", notActionableReason: "Data-insufficient: linked proof.", status: "NEEDS_DATA" });
    const { getByTestId, queryByTestId } = render(<ProcessExecutionBridgePanel data={view({ topRoute: top, routes: [top] })} onAction={onAction} />);
    expect(getByTestId("bridge-action-REQUEST_MISSING_DATA")).toBeTruthy();
    expect(getByTestId("bridge-action-REQUEST_REASSESSMENT")).toBeTruthy();
    expect(queryByTestId("bridge-action-START")).toBeNull();
    expect(queryByTestId("bridge-action-APPROVE")).toBeNull();
    expect(queryByTestId("bridge-action-COMPLETE")).toBeNull();
  });
});
