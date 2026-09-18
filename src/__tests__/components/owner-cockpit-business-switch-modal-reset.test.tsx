/**
 * Owner Cockpit — pending action forms reset when the active business changes mid-form.
 *
 * ROOT_CAUSE: every inline action form on this page (the top-priority action's evidence/reason/
 * delegate form, and each execution-lifecycle item's Phase 3 RECORD_OUTCOME/VERIFY_OUTCOME/
 * RECORD_PROGRESS form) is local component state (`pending` + its input fields) that is not bound
 * to the business that was active when the form was opened. `onAction()` in
 * owner/cockpit/page.tsx reads `businessId` for RECORD_OUTCOME/VERIFY_OUTCOME from the page's
 * LIVE `activeBusinessId` at submit time via a closure. If the active business were ever able to
 * change while this page stayed mounted with a form open (this page renders no selector of its
 * own today, but every other owner page does, and `ActiveBusinessContext` is shared app-wide),
 * clicking Confirm afterwards would submit a stale taskKey (bound to the business the form was
 * opened for) alongside a businessId belonging to whatever business is now active — a
 * "phantom action on a switched context" hole. Exactly one instance of this root cause exists:
 * the two `pending` form states in MinimumOwnerCockpit.tsx (the top-priority action form and
 * ExecutionLifecycleSection's Phase 3 form) — both are fixed by the same mechanism below.
 *
 * Fix: MinimumOwnerCockpit now accepts an `activeBusinessId` prop used ONLY to discard any open
 * pending form (both the top-priority action form and each ExecutionLifecycleSection Phase 3
 * form) the instant it changes — never to decide what gets submitted. This closes the whole class
 * at once rather than threading a captured-at-open-time business id through every action's input.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
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
    taskKey: "task_default",
    sourceFamily: "CASH_PROFIT",
    status: "PROPOSED",
    ownerVisibleSummary: "Improve cash flow",
    severity: "HIGH",
    assignedRole: "owner",
    createdAt: "2026-01-01T00:00:00.000Z",
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
  return { requiresDecision: [], inExecution: [], awaitingVerification: [], recentlyVerified: [], totalPendingVerification: 0 };
}

describe("MinimumOwnerCockpit — pending action forms reset on active-business change", () => {
  it("discards an open RECORD_OUTCOME Phase 3 form when activeBusinessId changes, before Confirm can be clicked", () => {
    const onAction = vi.fn();
    const lifecycle: OwnerExecutionLifecycleView = {
      ...emptyLifecycle(),
      awaitingVerification: [lifecycleItem({ taskKey: "task_complete", status: "COMPLETED", canRecordOutcome: true })],
    };
    const { rerender } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={onAction} activeBusinessId="biz-A" />
    );

    // Owner opens the Record Outcome form for a task that belongs to (was fetched under) biz-A.
    fireEvent.click(screen.getByTestId("cockpit-action-RECORD_OUTCOME-task_complete"));
    expect(screen.getByTestId("cockpit-phase3-action-form")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-phase3-confirm")).toBeInTheDocument();

    // The active business changes while the form is still open (e.g. a future header switcher,
    // or ActiveBusinessContext resolving to a different business out from under this page).
    rerender(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={onAction} activeBusinessId="biz-B" />
    );

    // The form (and its Confirm button) must be gone -- there must be nothing left on screen that
    // could submit task_complete's RECORD_OUTCOME against biz-B.
    expect(screen.queryByTestId("cockpit-phase3-action-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-phase3-confirm")).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("discards an open VERIFY_OUTCOME Phase 3 form when activeBusinessId changes", () => {
    const onAction = vi.fn();
    const lifecycle: OwnerExecutionLifecycleView = {
      ...emptyLifecycle(),
      awaitingVerification: [lifecycleItem({ taskKey: "task_verify", status: "OUTCOME_RECORDED", canVerify: true })],
    };
    const { rerender } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={onAction} activeBusinessId="biz-A" />
    );

    fireEvent.click(screen.getByTestId("cockpit-action-VERIFY_OUTCOME-task_verify"));
    expect(screen.getByTestId("cockpit-phase3-confirm")).toBeInTheDocument();

    rerender(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={onAction} activeBusinessId="biz-B" />
    );

    expect(screen.queryByTestId("cockpit-phase3-confirm")).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("does NOT reset an open Phase 3 form when activeBusinessId stays the same across a re-render", () => {
    const onAction = vi.fn();
    const lifecycle: OwnerExecutionLifecycleView = {
      ...emptyLifecycle(),
      awaitingVerification: [lifecycleItem({ taskKey: "task_complete", status: "COMPLETED", canRecordOutcome: true })],
    };
    const { rerender } = render(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={onAction} activeBusinessId="biz-A" busy={false} />
    );

    fireEvent.click(screen.getByTestId("cockpit-action-RECORD_OUTCOME-task_complete"));
    expect(screen.getByTestId("cockpit-phase3-confirm")).toBeInTheDocument();

    // An unrelated re-render (e.g. `busy` toggling) with the SAME activeBusinessId must not
    // discard the form the owner is actively filling in.
    rerender(
      <MinimumOwnerCockpit bridge={bridge()} executionLifecycle={lifecycle} onAction={onAction} activeBusinessId="biz-A" busy={true} />
    );

    expect(screen.getByTestId("cockpit-phase3-confirm")).toBeInTheDocument();
  });

  it("discards an open top-priority action form (e.g. REJECT's reason input) when activeBusinessId changes", () => {
    const onAction = vi.fn();
    const r = route({ executionRoute: "CREATE_OWNER_APPROVAL_TASK" });
    const b: ProcessExecutionBridgeView = { routes: [r], topRoute: r, summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } };
    const { rerender } = render(
      <MinimumOwnerCockpit bridge={b} executionLifecycle={emptyLifecycle()} onAction={onAction} activeBusinessId="biz-A" />
    );

    fireEvent.click(screen.getByTestId("cockpit-action-REJECT"));
    expect(screen.getByTestId("cockpit-action-form")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("cockpit-reason-input"), { target: { value: "wrong call" } });

    rerender(
      <MinimumOwnerCockpit bridge={b} executionLifecycle={emptyLifecycle()} onAction={onAction} activeBusinessId="biz-B" />
    );

    expect(screen.queryByTestId("cockpit-action-form")).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });
});
