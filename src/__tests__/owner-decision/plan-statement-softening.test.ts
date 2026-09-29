/**
 * Plan-analysis statements beside the canonical decision are classified STRUCTURALLY (per sentence, by
 * its leading clause): prohibitions become "held back", whole-business ordering imperatives lose their
 * ordering claim, and ordinary factual prose is left exactly as written. Only CurrentOwnerDecision owns
 * the overall imperative.
 */
import { describe, it, expect } from "vitest";
import {
  neutralizePlanImperatives,
  ownerImperativeContext,
  planNextActionText,
  reconcilePlanSummary,
} from "@/domain/owner-spine/owner-imperatives";

const ORDERING = /\b(first\b|start with|before anything else|highest priority|top priority|immediately|first thing|before any (?:new |other )?(?:action|commitment|spend))/i;
const ctx = ownerImperativeContext({ primaryTarget: { title: "Extend runway", source: "domain_action", priorityClass: "SURVIVAL_CASH", findingCode: "CF_LOW_RUNWAY" }, supportingSteps: [] });

describe("plan-analysis ordering imperatives lose their whole-business claim", () => {
  it.each([
    ["First: collect overdue receivables before any new spend.", "Collect overdue receivables."],
    ["Start with cutting discount leakage.", "Cutting discount leakage."],
    ["Before anything else, stabilise cash.", "Stabilise cash."],
    ["Highest priority: fix delivery delays immediately.", "Fix delivery delays."],
    ["Must renegotiate supplier terms before any commitment.", "Renegotiate supplier terms."],
    ["First thing, call your top 5 customers.", "Call your top 5 customers."],
    ["Collect receivables first.", "Collect receivables."],
    ["Stabilise first, then re-test the growth gates.", "Stabilise, then re-test the growth gates."],
    ["Top priority — raise prices on the loss-making tier.", "Raise prices on the loss-making tier."],
  ])("%s", (input, expected) => {
    const out = neutralizePlanImperatives(input);
    expect(out.text).toBe(expected);
    expect(out.text).not.toMatch(ORDERING);
    expect(out.heldBack).toBe(false);
  });
});

describe("plan-analysis prohibitions become 'held back'", () => {
  it.each([
    ["Stop discounting.", "the plan analysis holds back discounting."],
    ["Do not: hire before cash is safe", "the plan analysis holds back hire before cash is safe"],
    ["Don't add new locations.", "the plan analysis holds back add new locations."],
    ["Never skip payroll.", "the plan analysis holds back skip payroll."],
    ["Avoid new debt.", "the plan analysis holds back new debt."],
    ["First: do not scale ads before any action on margin.", "the plan analysis holds back scale ads."],
  ])("%s", (input, expected) => {
    const out = neutralizePlanImperatives(input);
    expect(out.text).toBe(expected);
    expect(out.heldBack).toBe(true);
  });
});

describe("ordinary factual prose is never rewritten", () => {
  it.each([
    "Revenue fell 12% this month.",
    "Payroll must be paid by Friday.",
    "Stop-loss is set at 10%.",
    "The first customer cohort churned faster.",
    "Cash runway is 40 days at the current burn.",
  ])("%s", (input) => {
    expect(neutralizePlanImperatives(input)).toEqual({ text: input, heldBack: false });
  });

  it("a mixed paragraph: only the imperative sentences change", () => {
    expect(neutralizePlanImperatives("Revenue fell 12%. First: collect receivables. Payroll must be paid by Friday.").text)
      .toBe("Revenue fell 12%. Collect receivables. Payroll must be paid by Friday.");
  });
});

describe("every plan imperative surface is reconciled beside the canonical decision", () => {
  it("the supervisor's do-now line and the plan's next-best-action lose their ordering claim", () => {
    const s = reconcilePlanSummary({ doNow: "First: freeze discretionary spend before anything else.", doNotDo: [], topPriorities: [], cadence: { now: "—", thisWeek: "—", stopLoss: "—" } }, ctx);
    expect(s.doNow).toBe("Freeze discretionary spend.");
    expect(planNextActionText("Highest priority: collect overdue invoices immediately.", ctx)).toBe("Collect overdue invoices.");
    // Without a canonical decision the plan output is shown unchanged.
    expect(planNextActionText("Highest priority: collect overdue invoices.", ownerImperativeContext(null))).toBe("Highest priority: collect overdue invoices.");
  });

  it("the Command Center page and the supervisor panel route the plan's next action through the reconciler", async () => {
    const { readFileSync } = await import("fs");
    const page = readFileSync("src/app/(authenticated)/owner/page.tsx", "utf8");
    expect(page).toMatch(/planNextActionText\(wbp\.nextBestAction, imperativeCtx\)/);
    expect(page).not.toMatch(/\{wbp\.nextBestAction\}/);
    expect(page).toMatch(/<SupervisorSummary summary=\{reconcilePlanSummary\(wbp\.supervisor, imperativeCtx\)\} \/>/);
  });
});
