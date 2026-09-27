/**
 * Owner Strategy decision card — heading semantics and information hierarchy (production polish).
 *
 * Production acceptance found "Why this looks promising" over the supporting points of NOT_YET
 * and NEED_INFO decisions, and the four dimension lines rendered before those reasons. The card
 * now renders: headline → reasons (why, supporting points under a decision-specific heading) →
 * Profit → Cash → Downside → Evidence → conditions → one next step. Decisions come from the real
 * engine; nothing here changes decision evidence.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { StrategyDecisionCard } from "@/components/owner/StrategyDecisionCard";
import { deriveStrategyDecision, type StrategyDecision, type StrategySnapshotInput } from "@/domain/owner-strategy";
import {
  STRATEGY_SUPPORTING_POINTS_HEADING,
  formatStrategyPeriod,
  legacyStrategyRatingText,
  strategyScenarioName,
  LEGACY_STRATEGY_RATING_NOTE,
} from "@/domain/owner-strategy/presentation";

const NOW = new Date("2026-09-26T00:00:00Z");
const base = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", currentRevenue: 500000, timeToImpactMonths: 2, capacityImpactPct: 10, staffImpact: 1 };
const decide = (over: Partial<StrategySnapshotInput>) => deriveStrategyDecision({ ...base, riskLevel: "low", ...over } as StrategySnapshotInput, { now: NOW });

const CASES: Record<string, StrategyDecision> = {
  GO: decide({ investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 60000, costChange: 12000 }),
  GO_WITH_CONDITIONS: decide({ investmentRequired: 50000, cashAvailable: 400000, expectedRevenueChange: 30000, costChange: 20000, riskLevel: "medium" }),
  NOT_YET: decide({ investmentRequired: 150000, cashAvailable: 100000, expectedRevenueChange: 30000, costChange: 12000, riskLevel: "medium" }),
  NEED_INFO: decide({ investmentRequired: 150000, expectedRevenueChange: 60000, costChange: 12000 }),
  DONT_AS_PLANNED: decide({ investmentRequired: 50000, cashAvailable: 400000, expectedRevenueChange: 10000, costChange: 15000 }),
};

afterEach(() => cleanup());

function renderCard(decision: StrategyDecision) {
  return render(<StrategyDecisionCard decision={decision} caption="Current decision · evaluation #1" nextStepRow={null} />);
}

/** True when `a` precedes `b` in document order. */
function before(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe("fixtures produce the decision they are named after", () => {
  it.each(Object.entries(CASES))("%s", (code, d) => {
    expect(d.code).toBe(code);
  });
});

describe("supporting-points heading fits the decision", () => {
  it("maps every decision to its own heading; only GO says 'promising'", () => {
    expect(STRATEGY_SUPPORTING_POINTS_HEADING).toEqual({
      GO: "Why this looks promising",
      GO_WITH_CONDITIONS: "What supports this — and what needs attention",
      NOT_YET: "What the numbers say",
      NEED_INFO: "What we know so far",
      DONT_AS_PLANNED: "Why this plan needs to change",
    });
  });

  it.each(["GO", "GO_WITH_CONDITIONS", "NOT_YET", "NEED_INFO"])("%s renders its heading over real supporting points", (code) => {
    const d = CASES[code];
    expect(d.promising.length).toBeGreaterThan(0);
    renderCard(d);
    const block = screen.getByTestId("strategy-supporting-points");
    expect(within(block).getByRole("heading", { level: 3 }).textContent).toBe(STRATEGY_SUPPORTING_POINTS_HEADING[d.code]);
    if (code !== "GO") expect(screen.queryByText("Why this looks promising")).toBeNull();
    // The points themselves are unchanged engine output.
    expect(within(block).getAllByRole("listitem").map((li) => li.textContent)).toEqual(d.promising.map((p) => p.text));
  });

  it("DONT_AS_PLANNED: never 'promising' (heading applied to the same points, evidence untouched)", () => {
    const d = CASES.DONT_AS_PLANNED;
    // The engine emits no supporting points when the economics fail; the heading still never
    // reads as promising if a point is present.
    expect(d.promising).toEqual([]);
    renderCard(d);
    expect(screen.queryByTestId("strategy-supporting-points")).toBeNull();
    cleanup();
    renderCard({ ...d, promising: [{ code: "STRONG_RETURN", text: "fact" }] } as StrategyDecision);
    expect(within(screen.getByTestId("strategy-supporting-points")).getByRole("heading").textContent).toBe("Why this plan needs to change");
  });
});

describe("information hierarchy", () => {
  it.each(Object.keys(CASES))("%s: headline → reasons → Profit → Cash → Downside → Evidence → conditions → next step", (code) => {
    const d = CASES[code];
    renderCard(d);
    const card = screen.getByTestId("strategy-decision");
    const order: Element[] = [within(card).getByRole("heading", { level: 2 })];
    const why = screen.queryByTestId("strategy-decision-why");
    const supporting = screen.queryByTestId("strategy-supporting-points");
    if (why) order.push(why);
    if (supporting) order.push(supporting);
    for (const k of ["profit", "cash", "downside", "evidence"]) order.push(screen.getByTestId(`strategy-dimension-${k}`));
    const conditions = screen.queryByTestId("strategy-decision-conditions");
    if (conditions) order.push(conditions);
    order.push(screen.getByTestId("strategy-next-step"));
    for (let i = 1; i < order.length; i++) expect(before(order[i - 1], order[i])).toBe(true);
    // Exactly one primary next step.
    expect(card.querySelectorAll("[data-testid='strategy-next-step']")).toHaveLength(1);
    // Reasons exist for every non-GO decision (either a why list or supporting points).
    if (code !== "GO") expect(why !== null || supporting !== null || d.headlineDetail !== null).toBe(true);
    if (code === "GO_WITH_CONDITIONS") expect(conditions).not.toBeNull();
  });
});

describe("presentation helpers", () => {
  it("legacy ratings are labelled as legacy and never mapped onto current decisions", () => {
    expect(legacyStrategyRatingText("GO")).toBe("Legacy rating: Go");
    expect(legacyStrategyRatingText("AVOID")).toBe("Legacy rating: Avoid");
    expect(legacyStrategyRatingText("STRONG_GO")).toBe("Legacy rating: Strong go");
    expect(legacyStrategyRatingText("SOMETHING_NEW")).toBe("Legacy rating: SOMETHING_NEW");
    expect(legacyStrategyRatingText("constructor")).toBe("Legacy rating: constructor");
    expect(legacyStrategyRatingText(null)).toBe("Legacy rating: not recorded");
    expect(LEGACY_STRATEGY_RATING_NOTE).toBe("Calculated using the previous Strategy model");
    for (const s of ["STRONG_GO", "GO", "MARGINAL", "RISKY", "AVOID"]) {
      expect(legacyStrategyRatingText(s)).not.toMatch(/Go ahead|Not yet|Can't say yet|Don't do it/);
    }
  });

  it("periods are calendar dates in UTC with fixed month names", () => {
    expect(formatStrategyPeriod("2026-07-01T00:00:00.000Z", "2026-07-31T00:00:00.000Z")).toBe("1 Jul 2026 – 31 Jul 2026");
    expect(formatStrategyPeriod(new Date("2026-09-01T00:00:00Z"), new Date("2026-09-30T00:00:00Z"))).toBe("1 Sep 2026 – 30 Sep 2026");
    expect(formatStrategyPeriod("not-a-date", "2026-01-31T00:00:00Z")).toBe("not-a-date – 31 Jan 2026");
  });

  it("an unnamed scenario is called so", () => {
    expect(strategyScenarioName(null)).toBe("Unnamed scenario");
    expect(strategyScenarioName("   ")).toBe("Unnamed scenario");
    expect(strategyScenarioName(" Second van ")).toBe("Second van");
  });
});

describe("a step the owner action gate holds back is shown as HELD, with what holds it and what clears it", () => {
  it("held: the plan's step is named with the hold text — never 'already verified', never 'add it to your action list'", () => {
    const held = "This step is currently held by the cash safety limit. Stabilise cash before proceeding.";
    render(<StrategyDecisionCard decision={CASES.GO} caption="Current decision · evaluation #1" nextStepRow={null} replacedStep={{ replacedBecause: held, held: true, step: null }} />);
    const line = screen.getByTestId("strategy-decision-step-held");
    expect(line.textContent).toContain(CASES.GO.primaryStep.title);
    expect(line.textContent).toContain(held);
    expect(screen.queryByTestId("strategy-decision-step-replaced")).toBeNull();
    const card = screen.getByTestId("strategy-decision");
    expect(card.textContent ?? "").not.toMatch(/already verified|to add this step to your action list/);
  });
});
