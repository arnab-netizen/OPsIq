/**
 * SupervisorSummary panel — jsdom component test (runtime-fed proof without a browser).
 * Proves: renders runtime-fed fields (main issue / do-now / do-not-do / owner-vs-delegate / proof /
 * missing-data+assumptions / confidence / action status / reassessment / impact / ≤3 priorities);
 * renders NOTHING when not found (no static fallback); mobile-bounded (responsive grid, no fixed width).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SupervisorSummary, type SupervisorSummaryView } from "@/components/owner/SupervisorSummary";

afterEach(() => cleanup());

const view = (over: Partial<SupervisorSummaryView> = {}): SupervisorSummaryView => ({
  found: true,
  emergency: false,
  mainIssue: "Below-margin work — root cause: negative contribution",
  whyItMatters: "Work that loses money on every unit drains the business.",
  doNow: "Re-price or drop the loss-making line.",
  doNotDo: ["Do not chase more volume of this line."],
  ownerDecisionRequired: "Owner approval required before: Re-price the line.",
  delegateToStaff: ["Manager builds the cost sheet."],
  opsiqPreparedWork: ["Draft the margin calculation template."],
  proofNeeded: ["fully-loaded cost sheet"],
  confidence: "medium",
  actionStatus: "owner_decision_required",
  canProceed: false,
  ledger: {
    knownFacts: ["Verified from real records: finance cash."],
    assumptions: ["Assumed (owner estimate, not a verified record): customer reputation."],
    missingData: ["working_capital"],
    confidenceReason: "Critical domains real but some recommended data missing.",
    whatWouldChange: "Supplying real records for working_capital would change this.",
  },
  impact: [
    { dimension: "profit_margin", label: "Profit / margin", statement: "Restores positive contribution.", relevant: true },
    { dimension: "cash", label: "Cash", statement: "Stops the per-unit loss.", relevant: true },
    { dimension: "customer_quality", label: "Customer / quality", statement: "—", relevant: false },
  ],
  cadence: { now: "Build the cost sheet.", today: "Brief the manager.", thisWeek: "Re-price the line.", reassessmentTrigger: "margin recovers above floor", kpiWatch: "contribution margin %", stopLoss: "Stop if margin stays negative.", nextReview: "after proof" },
  topPriorities: [
    { severity: "high", whatIsWrong: "Biggest constraint: Below-margin work.", doNext: "Re-price the line." },
    { severity: "high", whatIsWrong: "Stop: Do not chase volume.", doNext: "Hold until margin clears." },
  ],
  ...over,
});

describe("SupervisorSummary panel", () => {
  it("renders runtime-fed advice with all required owner fields", () => {
    const { container } = render(<SupervisorSummary summary={view()} />);
    expect(container.querySelector('[data-testid="owner-supervisor-summary"]')).not.toBeNull();
    const text = container.textContent ?? "";
    expect(text).toMatch(/Below-margin work/);            // main issue
    expect(text).toMatch(/Plan analysis suggests:/);      // plan analysis step (subordinate to the main target)
    expect(text).not.toMatch(/Do now:/);
    expect(text).toMatch(/Do not:/);                      // do not do
    expect(text).toMatch(/Owner vs delegate:/);           // owner/delegate split
    expect(text).toMatch(/Proof needed:/);                // proof
    expect(text).toMatch(/Missing data \/ assumptions:/); // missing/assumptions
    expect(text).toMatch(/Expected impact:/);             // profit/cash/workload impact
    expect(text).toMatch(/Reassess:/);                    // reassessment
    expect(container.querySelector('[data-testid="supervisor-action-status"]')?.textContent).toMatch(/Owner decision required/);
    expect(container.querySelector('[data-testid="supervisor-confidence"]')?.textContent).toMatch(/medium/);
  });

  it("shows at most 3 top priorities and surfaces impact dimensions", () => {
    const { container } = render(<SupervisorSummary summary={view()} />);
    expect(container.querySelectorAll('[data-testid^="supervisor-priority-"]').length).toBeLessThanOrEqual(3);
    expect(container.querySelector('[data-testid="supervisor-impact"]')?.textContent).toMatch(/Profit \/ margin|Cash/);
  });

  it("renders read-only supporting figures when present, and omits the block when absent", () => {
    const { container } = render(<SupervisorSummary summary={view({
      supportingFigures: [
        { key: "monthly_net", label: "Monthly net (revenue − cost)", value: 205000, unit: "per month", basis: "monthly revenue − (fixed + variable cost)" },
        { key: "cash_runway_days", label: "Cash runway", value: 43, unit: "days", basis: "cash on hand ÷ monthly net burn" },
      ],
    })} />);
    const block = container.querySelector('[data-testid="supervisor-supporting-figures"]');
    expect(block).not.toBeNull();
    expect(block?.textContent).toMatch(/Supporting figures/);
    expect(container.querySelector('[data-testid="supervisor-figure-monthly_net"]')?.textContent).toMatch(/205,000 per month/);
    expect(container.querySelector('[data-testid="supervisor-figure-cash_runway_days"]')?.textContent).toMatch(/43 days/);

    const { container: none } = render(<SupervisorSummary summary={view({ supportingFigures: [] })} />);
    expect(none.querySelector('[data-testid="supervisor-supporting-figures"]')).toBeNull();
  });

  it("renders the specific missing-to-quantify inputs when present, and omits the block when empty (Wave 3 S1)", () => {
    const { container } = render(<SupervisorSummary summary={view({
      missingForQuantification: ["current cash balance", "fully-loaded cost/kg and quoted rate"],
    })} />);
    const block = container.querySelector('[data-testid="supervisor-missing-to-quantify"]');
    expect(block).not.toBeNull();
    expect(block?.textContent).toMatch(/To quantify the upside, add:/);
    expect(container.querySelector('[data-testid="supervisor-quantify-missing-0"]')?.textContent).toMatch(/current cash balance/);
    expect(container.querySelector('[data-testid="supervisor-quantify-missing-1"]')?.textContent).toMatch(/fully-loaded cost\/kg/);

    const { container: none } = render(<SupervisorSummary summary={view({ missingForQuantification: [] })} />);
    expect(none.querySelector('[data-testid="supervisor-missing-to-quantify"]')).toBeNull();
    const { container: undef } = render(<SupervisorSummary summary={view()} />);
    expect(undef.querySelector('[data-testid="supervisor-missing-to-quantify"]')).toBeNull();
  });

  it("renders NOTHING when not found (no static fallback)", () => {
    const { container } = render(<SupervisorSummary summary={view({ found: false })} />);
    expect(container.querySelector('[data-testid="owner-supervisor-summary"]')).toBeNull();
    expect((container.textContent ?? "").trim()).toBe("");
    const { container: c2 } = render(<SupervisorSummary summary={null} />);
    expect((c2.textContent ?? "").trim()).toBe("");
  });

  it("is mobile-bounded — responsive grid, no fixed wide pixel widths", () => {
    const { container } = render(<SupervisorSummary summary={view()} />);
    expect(container.querySelector(".grid")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/width:\s*[2-9]\d{2,}px/);
    expect(container.innerHTML).not.toMatch(/\bw-\[[2-9]\d{2,}px\]/);
  });
});
