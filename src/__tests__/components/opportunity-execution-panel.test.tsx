/**
 * OpportunityExecutionPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the execution-cockpit surface: the single top task with who must do it, why it matters, the
 * required evidence (collapsed), the blocked reason, the OpsIQ drafts-only guardrail, a grouped summary,
 * and an honest empty state — with no fake money/percent and no forbidden action language.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { OpportunityExecutionPanel, type OpportunityExecutionView, type ExecutionTaskView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const task = (over: Partial<ExecutionTaskView> = {}): ExecutionTaskView => ({
  opportunityKey: "TENDER:HOTEL_LINEN",
  taskKey: "task:ws-12345:TENDER:HOTEL_LINEN:COLLECT_COST_DATA",
  sourceType: "MISSING_DATA",
  taskType: "COLLECT_COST_DATA",
  taskTitle: "Collect per-unit cost data",
  taskDescription: "Capture the true per-item wash/dry/press cost so the bid margin is real, not guessed.",
  nextActionOwner: "MANAGER",
  requiredEvidence: ["per-unit cost figure", "source of the figure"],
  status: "ASSIGNED",
  approvalLevel: "MANAGER",
  riskIfSkipped: "You bid blind and could win an unprofitable contract.",
  blockingReason: null,
  outcomeSummary: null,
  ...over,
});

const view = (top: ExecutionTaskView, over: Partial<OpportunityExecutionView> = {}): OpportunityExecutionView => ({
  tasks: [top],
  topTask: top,
  capabilityRecommendations: [],
  summary: { totalTasks: 1, proposed: 0, inProgressOrAssigned: 1, blocked: 0, completed: 0, ownerApprovalRequired: 0, delegated: 1 },
  ...over,
});

describe("OpportunityExecutionPanel", () => {
  it("shows the single top task with owner, description, and skip-risk", () => {
    const { getByTestId } = render(<OpportunityExecutionPanel data={view(task())} />);
    const panel = getByTestId("execution-panel");
    expect(panel.getAttribute("data-task-type")).toBe("COLLECT_COST_DATA");
    expect(panel.getAttribute("data-owner")).toBe("MANAGER");
    expect(panel.getAttribute("data-status")).toBe("ASSIGNED");
    expect(getByTestId("exec-title").textContent).toMatch(/Collect per-unit cost data/);
    expect(getByTestId("exec-owner").textContent).toMatch(/Manager/);
    expect(getByTestId("exec-desc").textContent).toMatch(/per-item wash\/dry\/press cost/);
    expect(getByTestId("exec-risk").textContent).toMatch(/If skipped:/);
  });

  it("always shows the OpsIQ drafts-only guardrail (never submits/contacts/spends)", () => {
    const { getByTestId } = render(<OpportunityExecutionPanel data={view(task())} />);
    expect(getByTestId("exec-guardrail").textContent).toMatch(/never submits, contacts customers, or spends/i);
  });

  it("surfaces the blocking reason when a task is blocked", () => {
    const { getByTestId } = render(<OpportunityExecutionPanel data={view(task({ status: "BLOCKED", blockingReason: "Waiting on the utility bill to compute cost." }))} />);
    expect(getByTestId("execution-panel").getAttribute("data-status")).toBe("BLOCKED");
    expect(getByTestId("exec-blocking").textContent).toMatch(/Waiting on the utility bill/);
  });

  it("flags owner approval on an owner-decision task", () => {
    const { getByTestId } = render(<OpportunityExecutionPanel data={view(task({ taskType: "OWNER_APPROVAL_REVIEW", nextActionOwner: "OWNER", approvalLevel: "OWNER", taskTitle: "Owner: approve the bid before submission" }))} />);
    expect(getByTestId("execution-panel").getAttribute("data-owner")).toBe("OWNER");
    expect(getByTestId("exec-owner").textContent).toMatch(/Owner/);
    expect(getByTestId("exec-guardrail").textContent).toMatch(/Owner approval required/i);
  });

  it("keeps evidence collapsed in a details element and shows a grouped summary", () => {
    const { getByTestId } = render(<OpportunityExecutionPanel data={view(task())} />);
    const details = getByTestId("exec-evidence");
    expect(details.tagName.toLowerCase()).toBe("details");
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(getByTestId("exec-summary").textContent).toMatch(/1 task\(s\)/);
  });

  it("renders an honest empty state when there is no top task", () => {
    const { getByTestId, queryByTestId } = render(<OpportunityExecutionPanel data={null} />);
    expect(getByTestId("execution-empty").textContent).toMatch(/No opportunity execution task yet/i);
    expect(queryByTestId("execution-panel")).toBeNull();
  });

  it("carries no fabricated money/percent and no forbidden action language", () => {
    const { container } = render(<OpportunityExecutionPanel data={view(task())} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/[$£€]\s?\d/);
    expect(text).not.toMatch(/\d\s?%/);
    expect(text).not.toMatch(/guaranteed|profit guarantee|win probability/);
  });
});
