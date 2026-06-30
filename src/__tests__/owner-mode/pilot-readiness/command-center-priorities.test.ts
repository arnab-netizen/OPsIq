/**
 * Command-center priority strip — pure selection tests (no DB, no browser).
 * Proves: runtime-fed (empty when no plan — no fabricated card); capped at 5; each card answers the
 * seven owner questions; blocked readiness raises an accuracy card; do-not-do and cash/margin surface;
 * confidence/data limitation is reflected (no misleading green).
 */
import { describe, it, expect } from "vitest";
import { buildPriorityCommandStrip, type PriorityStripInput } from "@/domain/owner-mode/command-center-priorities";

function input(over: Partial<PriorityStripInput> = {}): PriorityStripInput {
  return {
    wbp: {
      found: true,
      topPriorityLabel: "Cash survival",
      dominantConstraint: "cash_survival",
      nextBestAction: "Cut the loss-making delivery route this week.",
      doNotDo: ["Do not take the discounted bulk contract."],
      proofRequired: ["weekly cash position"],
      reassessmentTriggers: ["cash runway drops below 4 weeks"],
      redDomains: ["finance_cash"],
      ownerOffload: "Hand billing to the manager.",
      overallConfidence: "medium",
      approvalRequired: true,
    },
    readiness: { blockers: [], overallScore: 80 },
    action: { responsibleParty: "owner", proofType: "metric_screenshot", escalationTrigger: "escalate in 4 days" },
    guidance: { nextBestInput: "fixed_costs", canProceedWithStrongRecommendation: true },
    ...over,
  };
}

describe("command-center priority strip", () => {
  it("returns NO cards when the runtime plan is not found (no static fallback)", () => {
    const cards = buildPriorityCommandStrip(input({ wbp: { ...input().wbp, found: false } }));
    expect(cards).toHaveLength(0);
  });

  it("returns at most five priority cards, severity-ordered", () => {
    const cards = buildPriorityCommandStrip(input({ readiness: { blockers: ["Critical data missing"], overallScore: 30 } }));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < cards.length; i++) {
      const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      expect(rank[cards[i].severity]).toBeGreaterThanOrEqual(rank[cards[i - 1].severity]);
    }
  });

  it("every card answers the seven owner questions", () => {
    const cards = buildPriorityCommandStrip(input());
    for (const c of cards) {
      expect(c.whatIsWrong.length).toBeGreaterThan(3);
      expect(c.whyItMatters.length).toBeGreaterThan(3);
      expect(c.nextStep.length).toBeGreaterThan(3);
      expect(c.owner.length).toBeGreaterThan(0);
      expect(c.proof.length).toBeGreaterThan(0);
      expect(c.reassess.length).toBeGreaterThan(0);
      expect(c.confidenceNote.length).toBeGreaterThan(0);
    }
  });

  it("a blocked readiness raises a critical accuracy card with a data limitation", () => {
    const cards = buildPriorityCommandStrip(input({ readiness: { blockers: ["Financial confidence is weak"], overallScore: 25 } }));
    const accuracy = cards.find((c) => c.id === "accuracy");
    expect(accuracy).toBeDefined();
    expect(accuracy!.severity).toBe("critical");
  });

  it("reflects a paused/limited confidence when strong recommendations are blocked (no misleading green)", () => {
    const cards = buildPriorityCommandStrip(input({ guidance: { nextBestInput: "revenue_sales", canProceedWithStrongRecommendation: false } }));
    expect(cards.every((c) => /paused|directional/i.test(c.confidenceNote))).toBe(true);
  });

  it("surfaces do-not-do and cash/margin risk as distinct cards", () => {
    const cards = buildPriorityCommandStrip(input());
    expect(cards.some((c) => c.id === "do_not_do")).toBe(true);
    expect(cards.some((c) => c.id === "cash_margin")).toBe(true);
  });
});
