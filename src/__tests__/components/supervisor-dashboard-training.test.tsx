/**
 * AI SUPERVISOR — DASHBOARD behavioral training (jsdom component proof; runtime-fed, no browser build).
 *
 * Renders the REAL SupervisorSummary panel from REAL buildSupervisorSummary output for representative
 * domain / collective / novelty cases and proves the dashboard supervisor contract:
 *   summary present · main issue · why · do-now · do-not-do · owner-decision · delegated · OpsIQ-prepared ·
 *   proof · missing-data/assumptions · confidence · impact · reassessment · action status · ≤3 priorities ·
 *   one primary action per priority · advanced reasoning collapsed by default · mobile-bounded ·
 *   NO static fallback (renders nothing when not found / null) · runtime-fed values (the exact runtime
 *   strings appear) · a blocked case never renders as "Proceed".
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SupervisorSummary, type SupervisorSummaryView } from "@/components/owner/SupervisorSummary";
import { buildSupervisorSummary, type SupervisorInput } from "@/domain/owner-mode/supervisor-summary";

afterEach(() => cleanup());

function input(over: Partial<SupervisorInput> = {}): SupervisorInput {
  return {
    found: true,
    dominantConstraint: "owner_workload",
    topPriorityLabel: "Owner workload",
    nextBestAction: "Delegate billing to a named supervisor with a daily proof report.",
    rootCause: "Owner is the bottleneck for every routine task.",
    doNotDo: ["Do not take on new work until delegation is in place."],
    proofRequired: ["daily supervisor proof report"],
    reassessmentTriggers: ["owner hours/day exceed the sustainable band"],
    successMetrics: ["owner minutes/day"],
    redDomains: [],
    ownerApprovalRequired: false,
    ownerOffload: "Hand routine checks to the supervisor; owner reviews exceptions only.",
    delegatedWork: ["Supervisor owns each step with a daily proof report."],
    opsiqPreparedWork: ["Draft the checklist/SOP and the reassessment schedule."],
    growthScaleAllowed: false,
    growthBlockedBy: [],
    overallConfidence: "high",
    criticalDomainsAllReal: true,
    dataSourceMissing: [],
    realProviderDomains: ["finance_cash", "margin_pricing", "owner_workload_memory"],
    assessedDomains: ["finance_cash", "margin_pricing", "owner_workload_memory", "customer_reputation"],
    unsafeCount: 0,
    impact: {
      financeCash: "Cash neutral; frees ~6 owner hours/week.",
      marginPricing: "No margin change; protects delivery quality.",
      equipmentCapacity: "Capacity unchanged.",
      staffWorkload: "Adds one supervisor responsibility.",
      customerQuality: "Maintains quality via the proof report.",
    },
    ownerWorkloadOffload: "Hand routine checks to the supervisor; owner reviews exceptions only.",
    plan7Day: "Stand up the supervisor proof report and delegate the two routine tasks.",
    plan30Day: "Verify the proof and re-check owner hours.",
    ...over,
  };
}

/** buildSupervisorSummary output is structurally the panel view. */
const asView = (i: SupervisorInput): SupervisorSummaryView => buildSupervisorSummary(i) as SupervisorSummaryView;

const REQUIRED_TESTIDS = [
  "supervisor-action-status", "supervisor-confidence", "supervisor-main-issue", "supervisor-do-now",
  "supervisor-do-not-do", "supervisor-owner-delegate", "supervisor-proof", "supervisor-impact",
  "supervisor-missing-assumptions", "supervisor-reassessment", "supervisor-priorities", "supervisor-ledger-detail",
];

describe("AI supervisor dashboard training — runtime-fed panel across representative cases", () => {
  it("[domain] renders every required supervisor field from runtime values", () => {
    const view = asView(input());
    const { container } = render(<SupervisorSummary summary={view} />);
    expect(container.querySelector('[data-testid="owner-supervisor-summary"]')).not.toBeNull();
    for (const id of REQUIRED_TESTIDS) {
      expect(container.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
    }
    const text = container.textContent ?? "";
    // Runtime-fed (not static): the exact runtime strings reach the panel.
    expect(text).toContain(view.doNow);
    expect(text).toContain(view.mainIssue);
    expect(text).toContain(view.doNotDo[0]);
    expect(text).toContain(view.proofNeeded[0]);
    expect(text).toContain(view.cadence.reassessmentTrigger);
  });

  it("[collective] an owner-decision conflict shows do-not-do, owner decision, proof, impact and ≤3 priorities", () => {
    const view = asView(input({
      dominantConstraint: "below_margin",
      topPriorityLabel: "Below-margin work",
      ownerApprovalRequired: true,
      nextBestAction: "Re-quote the contract to a viable margin or decline.",
      doNotDo: ["Do not sign the contract at the offered rate — it loses money per unit."],
      proofRequired: ["fully-loaded cost vs offered rate"],
      impact: { ...input().impact, marginPricing: "Contribution margin is negative after fully-loaded cost." },
    }));
    const { container } = render(<SupervisorSummary summary={view} />);
    expect(container.querySelector('[data-testid="supervisor-action-status"]')?.textContent).toMatch(/Owner decision required/);
    expect(container.querySelector('[data-testid="supervisor-do-not-do"]')?.textContent).toMatch(/Do not sign/);
    expect(container.querySelector('[data-testid="supervisor-owner-delegate"]')?.textContent).toMatch(/Owner approval required/);
    expect(container.querySelector('[data-testid="supervisor-impact"]')?.textContent).toMatch(/margin/i);
    expect(container.querySelectorAll('[data-testid^="supervisor-priority-"]').length).toBeLessThanOrEqual(3);
  });

  it("[novelty-sparse] need-more-data renders a data request and never reads Proceed", () => {
    const view = asView(input({
      criticalDomainsAllReal: false,
      overallConfidence: "low",
      dataSourceMissing: ["finance_cash", "working_capital"],
      realProviderDomains: [],
      assessedDomains: ["finance_cash", "working_capital", "operations"],
    }));
    const { container } = render(<SupervisorSummary summary={view} />);
    const status = container.querySelector('[data-testid="supervisor-action-status"]')?.textContent ?? "";
    expect(status).toMatch(/Need more data/);
    expect(status).not.toMatch(/Proceed/);
    expect(container.querySelector('[data-testid="supervisor-do-now"]')?.textContent).toMatch(/missing|enter|data/i);
    expect(container.querySelector('[data-testid="supervisor-missing-assumptions"]')?.textContent).toMatch(/missing/i);
  });

  it("[blocked] a compliance block renders Blocked + Emergency and never Proceed", () => {
    const view = asView(input({
      dominantConstraint: "compliance_block",
      topPriorityLabel: "Compliance / legal block",
      nextBestAction: "Pause and obtain a written professional compliance review.",
      doNotDo: ["Do not proceed past the compliance grey area."],
      proofRequired: ["written professional compliance review"],
      redDomains: ["compliance_review"],
    }));
    const { container } = render(<SupervisorSummary summary={view} />);
    const status = container.querySelector('[data-testid="supervisor-action-status"]')?.textContent ?? "";
    expect(status).toMatch(/Blocked/);
    expect(status).not.toMatch(/Proceed/);
    expect(container.textContent).toMatch(/Emergency/);
    expect(container.querySelector('[data-testid="supervisor-proof"]')?.textContent).toMatch(/professional|review/i);
  });

  it("renders one primary action per priority (a single next-step arrow each)", () => {
    const { container } = render(<SupervisorSummary summary={asView(input())} />);
    const priorities = container.querySelectorAll('[data-testid^="supervisor-priority-"]');
    expect(priorities.length).toBeGreaterThan(0);
    priorities.forEach((p) => {
      expect((p.textContent ?? "").match(/→/g)?.length ?? 0).toBe(1);
    });
  });

  it("keeps advanced reasoning collapsed by default (details not open)", () => {
    const { container } = render(<SupervisorSummary summary={asView(input())} />);
    const details = container.querySelector('[data-testid="supervisor-ledger-detail"]');
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(false);
  });

  it("is mobile-bounded — responsive grid, no fixed wide pixel widths", () => {
    const { container } = render(<SupervisorSummary summary={asView(input())} />);
    expect(container.querySelector(".grid")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/width:\s*[2-9]\d{2,}px/);
    expect(container.innerHTML).not.toMatch(/\bw-\[[2-9]\d{2,}px\]/);
  });

  it("NO static fallback — renders nothing when not found or null", () => {
    const { container: notFound } = render(<SupervisorSummary summary={asView(input({ found: false }))} />);
    expect((notFound.textContent ?? "").trim()).toBe("");
    const { container: nul } = render(<SupervisorSummary summary={null} />);
    expect((nul.textContent ?? "").trim()).toBe("");
  });
});
