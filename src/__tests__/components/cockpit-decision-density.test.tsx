/**
 * MinimumOwnerCockpit — "Requires your decision" compact/grouped rendering (P0-F).
 *
 * ROOT_CAUSE: `renderItem` rendered one full-height card per ExecutionLifecycleItem with no
 * grouping, so a workspace with many near-duplicate suggestions (the same PROCESS_CORRECTION
 * finding fired once per affected operator/manager/stage) rendered one large card per instance
 * — 29 in the live finding. A stable semantic grouping key already existed on the underlying
 * ProcessExecutionTask row (`sourceFamily`) but was silently dropped before reaching the
 * frontend's ExecutionLifecycleItem DTO. No raw ISO timestamp is rendered by this section today,
 * but there was also no humanization helper anywhere it might be added, so this pass adds one
 * defensively for any future/production surfacing of createdAt/dueAt (also proven never leaks a
 * raw ISO string once threaded through).
 *
 * Fix (this PR): thread `sourceFamily` + `createdAt` through the DTO
 * (owner-now-view.service.ts), then group by `(sourceFamily, ownerVisibleSummary)` — both
 * server-authoritative fields, never a raw title-string heuristic alone — collapsing a group of
 * more than one item into a single compact row with an aggregated (max) severity badge, a count,
 * and a relative "reported" time, while keeping every underlying item individually reachable (and
 * individually actionable) via a nested, collapsed detail list. A group of exactly one item still
 * renders exactly as before (no density change for genuinely single suggestions).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { MinimumOwnerCockpit, groupRequiresDecisionItems } from "@/components/owner/MinimumOwnerCockpit";
import type { ExecutionLifecycleItem, OwnerExecutionLifecycleView } from "@/services/owner-guidance/owner-now-view.service";

afterEach(() => cleanup());

function item(over: Partial<ExecutionLifecycleItem> = {}): ExecutionLifecycleItem {
  return {
    taskId: `task-${Math.random()}`,
    taskKey: `task_${Math.random()}`,
    sourceFamily: "PROCESS_CORRECTION",
    status: "PROPOSED",
    ownerVisibleSummary: "Require fresh per-task proof",
    severity: "MEDIUM",
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
    canAcknowledge: true,
    canStart: false,
    canRecordProgress: false,
    canRecordOutcome: false,
    canVerify: false,
    ...over,
  };
}

function lifecycleWith(requiresDecision: ExecutionLifecycleItem[]): OwnerExecutionLifecycleView {
  return { requiresDecision, inExecution: [], awaitingVerification: [], recentlyVerified: [], totalPendingVerification: 0 };
}

describe("groupRequiresDecisionItems — stable grouping (pure logic)", () => {
  it("groups items sharing sourceFamily + ownerVisibleSummary together", () => {
    const items = [
      item({ taskKey: "t1", assignedRole: "operator-42" }),
      item({ taskKey: "t2", assignedRole: "operator-77" }),
      item({ taskKey: "t3", assignedRole: "operator-90" }),
    ];
    const groups = groupRequiresDecisionItems(items);
    expect(groups.length).toBe(1);
    expect(groups[0].items.length).toBe(3);
  });

  it("keeps genuinely different suggestions (different summary) as separate groups", () => {
    const items = [
      item({ taskKey: "t1", ownerVisibleSummary: "Require fresh per-task proof" }),
      item({ taskKey: "t2", ownerVisibleSummary: "Coach the operator on the proof standard" }),
    ];
    const groups = groupRequiresDecisionItems(items);
    expect(groups.length).toBe(2);
    expect(groups.every((g) => g.items.length === 1)).toBe(true);
  });

  it("keeps items from different families separate even with identical summary text", () => {
    const items = [
      item({ taskKey: "t1", sourceFamily: "PROCESS_CORRECTION" }),
      item({ taskKey: "t2", sourceFamily: "CASH_PROFIT" }),
    ];
    const groups = groupRequiresDecisionItems(items);
    expect(groups.length).toBe(2);
  });

  it("does not group by title text alone -- family is required to agree too", () => {
    // Two items with the same title text but from different families must not merge, proving the
    // grouping key is (sourceFamily, title), not title alone.
    const items = [
      item({ taskKey: "t1", sourceFamily: "A", ownerVisibleSummary: "Fix this" }),
      item({ taskKey: "t2", sourceFamily: "B", ownerVisibleSummary: "Fix this" }),
    ];
    expect(groupRequiresDecisionItems(items).length).toBe(2);
  });

  it("a single ungrouped item produces its own group of size 1", () => {
    const groups = groupRequiresDecisionItems([item({ taskKey: "solo" })]);
    expect(groups.length).toBe(1);
    expect(groups[0].items).toHaveLength(1);
  });

  it("preserves first-seen order of distinct groups", () => {
    const items = [
      item({ taskKey: "a1", ownerVisibleSummary: "First kind" }),
      item({ taskKey: "b1", ownerVisibleSummary: "Second kind" }),
      item({ taskKey: "a2", ownerVisibleSummary: "First kind" }),
    ];
    const groups = groupRequiresDecisionItems(items);
    expect(groups.map((g) => g.items[0].ownerVisibleSummary)).toEqual(["First kind", "Second kind"]);
  });
});

describe("MinimumOwnerCockpit — 'Requires your decision' compact rendering (DOM)", () => {
  it("a genuinely single suggestion renders exactly as an individual card (no grouping UI)", () => {
    render(<MinimumOwnerCockpit bridge={null} actionsToAvoid={[]} executionLifecycle={lifecycleWith([item({ taskKey: "solo" })])} busy={false} />);
    expect(screen.getByTestId("cockpit-requires-decision-0")).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-requires-decision-group-0")).not.toBeInTheDocument();
  });

  it("a cluster of repeated suggestions renders as one compact row with a count, not N cards", () => {
    const items = [
      item({ taskKey: "t1", assignedRole: "operator-1" }),
      item({ taskKey: "t2", assignedRole: "operator-2" }),
      item({ taskKey: "t3", assignedRole: "operator-3" }),
      item({ taskKey: "t4", assignedRole: "operator-4" }),
      item({ taskKey: "t5", assignedRole: "operator-5" }),
    ];
    render(<MinimumOwnerCockpit bridge={null} actionsToAvoid={[]} executionLifecycle={lifecycleWith(items)} busy={false} />);
    const group = screen.getByTestId("cockpit-requires-decision-group-0");
    expect(within(group).getByTestId("cockpit-decision-group-count-0").textContent).toBe("5 suggestions");
    // Only one top-level li for the whole cluster (individual items are nested inside <details>).
    expect(screen.queryByTestId("cockpit-requires-decision-0")).not.toBeInTheDocument();
  });

  it("every underlying item in a group stays individually accessible with its own testid", () => {
    const items = [item({ taskKey: "t1" }), item({ taskKey: "t2" }), item({ taskKey: "t3" })];
    render(<MinimumOwnerCockpit bridge={null} actionsToAvoid={[]} executionLifecycle={lifecycleWith(items)} busy={false} />);
    for (let j = 0; j < 3; j++) {
      expect(screen.getByTestId(`cockpit-requires-decision-group-0-item-${j}`)).toBeInTheDocument();
    }
  });

  it("a group's badge shows the MAXIMUM severity across its members, not the first member's", () => {
    const items = [
      item({ taskKey: "t1", severity: "LOW" }),
      item({ taskKey: "t2", severity: "CRITICAL" }),
      item({ taskKey: "t3", severity: "MEDIUM" }),
    ];
    render(<MinimumOwnerCockpit bridge={null} actionsToAvoid={[]} executionLifecycle={lifecycleWith(items)} busy={false} />);
    const severityBadge = screen.getByTestId("cockpit-decision-group-severity-0");
    expect(within(severityBadge).getByText("Urgent")).toBeInTheDocument(); // CRITICAL -> "Urgent"
  });

  it("timestamps are always humanized, never rendered as a raw ISO string", () => {
    render(<MinimumOwnerCockpit bridge={null} actionsToAvoid={[]} executionLifecycle={lifecycleWith([item({ taskKey: "solo", createdAt: "2020-01-01T00:00:00.000Z" })])} busy={false} />);
    const reported = screen.getByTestId("cockpit-reported-solo");
    expect(reported.textContent).toMatch(/ago/);
    expect(reported.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // no raw ISO
  });

  it("the group row also shows a humanized reported time, never a raw ISO string", () => {
    const items = [item({ taskKey: "t1", createdAt: "2020-01-01T00:00:00.000Z" }), item({ taskKey: "t2", createdAt: "2021-01-01T00:00:00.000Z" })];
    render(<MinimumOwnerCockpit bridge={null} actionsToAvoid={[]} executionLifecycle={lifecycleWith(items)} busy={false} />);
    const group = screen.getByTestId("cockpit-requires-decision-group-0");
    expect(group.textContent).toMatch(/Reported .*ago/);
    expect(group.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("severity/status semantics on individual items are preserved inside the expanded group", () => {
    const items = [item({ taskKey: "t1", status: "PROPOSED", canAcknowledge: true })];
    // Force a group by adding a second, non-matching-summary item elsewhere is unnecessary here;
    // this proves the nested renderItem still shows the individual action control when expanded.
    const grouped = [item({ taskKey: "t1" }), item({ taskKey: "t2" })];
    render(<MinimumOwnerCockpit bridge={null} actionsToAvoid={[]} executionLifecycle={lifecycleWith(grouped)} onAction={() => {}} busy={false} />);
    expect(screen.getByTestId("cockpit-action-ACKNOWLEDGE-t1")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-action-ACKNOWLEDGE-t2")).toBeInTheDocument();
    void items;
  });
});
