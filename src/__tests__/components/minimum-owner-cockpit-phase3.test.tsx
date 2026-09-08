/**
 * MinimumOwnerCockpit — Phase 3 execution lifecycle section proof.
 * Tests that the execution lifecycle section renders correctly, that action buttons appear
 * only when server-computed can* booleans are true, and that no business logic exists
 * in the component (eligibility is purely server-driven).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MinimumOwnerCockpit } from "@/components/owner/MinimumOwnerCockpit";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";
import type { OwnerExecutionLifecycleView, ExecutionLifecycleItem } from "@/services/owner-guidance/owner-now-view.service";

afterEach(() => cleanup());

function route(over: Partial<BridgedRouteView> = {}): BridgedRouteView {
  return {
    taskKey: "pc:c-owner", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-owner",
    executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
    requiredEvidence: [], completionCriteria: "Owner records a decision.",
    reassessmentTrigger: "Re-evaluate at next review.", riskIfIgnored: "the breakdown compounds",
    ownerVisibleSummary: "Approve the process correction", notActionableReason: null,
    evidenceRefs: [], severity: "HIGH", priorityRank: 1, status: "PROPOSED",
    ...over,
  };
}

function bridge(): ProcessExecutionBridgeView {
  const r = route();
  return { routes: [r], topRoute: r, summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } };
}

function lifecycleItem(over: Partial<ExecutionLifecycleItem> = {}): ExecutionLifecycleItem {
  return {
    taskId: "task-uuid-1",
    taskKey: "task_cash",
    status: "PROPOSED",
    ownerVisibleSummary: "Improve cash flow",
    severity: "HIGH",
    assignedRole: "owner",
    dueAt: null,
    progressPct: null,
    blockerActive: false,
    outcomeId: null,
    verificationClassification: null,
    verificationClassificationLabel: null,
    expectedBenefit: null,
    baselineMetricName: null,
    baselineValue: null,
    targetValue: null,
    requiredEvidence: [],
    evidenceRefs: [],
    evidenceComplete: true,
    canAcknowledge: false,
    canStart: false,
    canRecordProgress: false,
    canRecordOutcome: false,
    canVerify: false,
    ...over,
  };
}

function emptyLifecycle(): OwnerExecutionLifecycleView {
  return {
    requiresDecision: [],
    inExecution: [],
    awaitingVerification: [],
    recentlyVerified: [],
    totalPendingVerification: 0,
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("MinimumOwnerCockpit — Phase 3 execution lifecycle section", () => {
  it("1. renders execution lifecycle section when executionLifecycle is non-null", () => {
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={emptyLifecycle()} onAction={() => {}} />
    );
    expect(getByTestId("cockpit-execution-lifecycle")).toBeDefined();
  });

  it("2. does NOT render execution lifecycle section when executionLifecycle is null", () => {
    const { queryByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={null} onAction={() => {}} />
    );
    expect(queryByTestId("cockpit-execution-lifecycle")).toBeNull();
  });

  it("3. renders execution lifecycle section when bridge is null (clean-state)", () => {
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={null} executionLifecycle={emptyLifecycle()} onAction={() => {}} />
    );
    expect(getByTestId("cockpit-execution-lifecycle")).toBeDefined();
  });

  it("4. section is a collapsed <details> by default", () => {
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={emptyLifecycle()} onAction={() => {}} />
    );
    const el = getByTestId("cockpit-execution-lifecycle");
    expect(el.tagName.toLowerCase()).toBe("details");
    expect(el.hasAttribute("open")).toBe(false);
  });

  it("5. renders all 4 sub-groups", () => {
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={emptyLifecycle()} onAction={() => {}} />
    );
    expect(getByTestId("cockpit-requires-decision-group")).toBeDefined();
    expect(getByTestId("cockpit-in-execution-group")).toBeDefined();
    expect(getByTestId("cockpit-awaiting-verification-group")).toBeDefined();
    expect(getByTestId("cockpit-recently-verified-group")).toBeDefined();
  });

  it("6. shows empty state messages when all groups are empty", () => {
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={emptyLifecycle()} onAction={() => {}} />
    );
    const section = getByTestId("cockpit-execution-lifecycle");
    // Each sub-group renders its own empty message
    expect(section.textContent).toContain("No tasks awaiting your decision.");
  });

  it("6b. never renders a raw governed-status token — every item.status value goes through STATUS_LABEL, not the raw enum (regression: Home used to render a bare 'PROPOSED' badge)", () => {
    const RAW_STATUSES = ["PROPOSED", "ACKNOWLEDGED", "NEEDS_DATA", "IN_PROGRESS", "BLOCKED", "COMPLETED", "OUTCOME_RECORDED", "OUTCOME_DISPUTED", "OUTCOME_VERIFIED"];
    const lifecycle: OwnerExecutionLifecycleView = {
      requiresDecision: [lifecycleItem({ status: "PROPOSED", taskKey: "t-proposed" }), lifecycleItem({ status: "ACKNOWLEDGED", taskKey: "t-ack" }), lifecycleItem({ status: "NEEDS_DATA", taskKey: "t-needs-data" }), lifecycleItem({ status: "BLOCKED", taskKey: "t-blocked" })],
      inExecution: [lifecycleItem({ status: "IN_PROGRESS", taskKey: "t-inprogress" })],
      awaitingVerification: [lifecycleItem({ status: "COMPLETED", taskKey: "t-completed" }), lifecycleItem({ status: "OUTCOME_RECORDED", taskKey: "t-outcome-recorded" }), lifecycleItem({ status: "OUTCOME_DISPUTED", taskKey: "t-outcome-disputed" })],
      recentlyVerified: [lifecycleItem({ status: "OUTCOME_VERIFIED", taskKey: "t-verified" })],
      totalPendingVerification: 0,
    };
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={() => {}} />
    );
    const section = getByTestId("cockpit-execution-lifecycle");
    for (const raw of RAW_STATUSES) {
      // The whole-word raw token (uppercase, underscore intact) must never appear as owner-facing
      // text — STATUS_LABEL always resolves it to a plain-language phrase first.
      expect(section.textContent, `raw token "${raw}" leaked into owner-facing text`).not.toMatch(new RegExp(`\\b${raw}\\b`));
    }
    // And the real plain-language labels are actually present, not just absent-raw-token.
    expect(section.textContent).toContain("suggested");
    expect(section.textContent).toContain("acknowledged");
    expect(section.textContent).toContain("waiting on data");
    expect(section.textContent).toContain("in progress");
  });

  it("7. renders ACKNOWLEDGE button when canAcknowledge=true", () => {
    const lifecycle: OwnerExecutionLifecycleView = {
      ...emptyLifecycle(),
      requiresDecision: [lifecycleItem({ status: "PROPOSED", canAcknowledge: true, taskKey: "task_cash" })],
    };
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={() => {}} />
    );
    expect(getByTestId("cockpit-action-ACKNOWLEDGE-task_cash")).toBeDefined();
  });

  it("8. does NOT render ACKNOWLEDGE button when canAcknowledge=false", () => {
    const lifecycle: OwnerExecutionLifecycleView = {
      ...emptyLifecycle(),
      requiresDecision: [lifecycleItem({ status: "PROPOSED", canAcknowledge: false, taskKey: "task_cash" })],
    };
    const { queryByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={() => {}} />
    );
    expect(queryByTestId("cockpit-action-ACKNOWLEDGE-task_cash")).toBeNull();
  });

  it("9. renders RECORD_PROGRESS button when canRecordProgress=true", () => {
    const lifecycle: OwnerExecutionLifecycleView = {
      ...emptyLifecycle(),
      inExecution: [lifecycleItem({ status: "IN_PROGRESS", canRecordProgress: true, taskKey: "task_progress" })],
    };
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={() => {}} />
    );
    expect(getByTestId("cockpit-action-RECORD_PROGRESS-task_progress")).toBeDefined();
  });

  it("10. renders RECORD_OUTCOME button when canRecordOutcome=true", () => {
    const lifecycle: OwnerExecutionLifecycleView = {
      ...emptyLifecycle(),
      awaitingVerification: [lifecycleItem({ status: "COMPLETED", canRecordOutcome: true, taskKey: "task_complete" })],
    };
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={() => {}} />
    );
    expect(getByTestId("cockpit-action-RECORD_OUTCOME-task_complete")).toBeDefined();
  });

  it("11. renders VERIFY_OUTCOME button when canVerify=true", () => {
    const lifecycle: OwnerExecutionLifecycleView = {
      ...emptyLifecycle(),
      awaitingVerification: [lifecycleItem({ status: "OUTCOME_RECORDED", canVerify: true, taskKey: "task_verify" })],
    };
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={() => {}} />
    );
    expect(getByTestId("cockpit-action-VERIFY_OUTCOME-task_verify")).toBeDefined();
  });

  it("12. canVerify=false hides VERIFY_OUTCOME button (no client-side eligibility override)", () => {
    const lifecycle: OwnerExecutionLifecycleView = {
      ...emptyLifecycle(),
      awaitingVerification: [lifecycleItem({ status: "OUTCOME_RECORDED", canVerify: false, taskKey: "task_verify" })],
    };
    const { queryByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={() => {}} />
    );
    expect(queryByTestId("cockpit-action-VERIFY_OUTCOME-task_verify")).toBeNull();
  });

  it("13. renders verificationClassification badge when set", () => {
    const lifecycle: OwnerExecutionLifecycleView = {
      ...emptyLifecycle(),
      recentlyVerified: [lifecycleItem({
        status: "OUTCOME_VERIFIED",
        verificationClassification: "SUCCESS",
        verificationClassificationLabel: "Verified: Success",
        taskKey: "task_verified",
      })],
    };
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={() => {}} />
    );
    expect(getByTestId("cockpit-verification-classification-task_verified")).toBeDefined();
  });

  it("14. clicking ACKNOWLEDGE calls onAction with taskKey and ACKNOWLEDGE action", () => {
    const onAction = vi.fn();
    const lifecycle: OwnerExecutionLifecycleView = {
      ...emptyLifecycle(),
      requiresDecision: [lifecycleItem({ status: "PROPOSED", canAcknowledge: true, taskKey: "task_ack" })],
    };
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={onAction} />
    );
    fireEvent.click(getByTestId("cockpit-action-ACKNOWLEDGE-task_ack"));
    expect(onAction).toHaveBeenCalledWith("task_ack", "ACKNOWLEDGE", {});
  });
});
