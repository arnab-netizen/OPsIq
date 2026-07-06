/**
 * PortfolioPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the Executive Cockpit surface for the Opportunity Portfolio / Capital Allocation engine: the single
 * top portfolio decision, the validation status that gates it, an explicit scale-blocked / scale-unblocked
 * line, qualitative capital-at-risk + expected-return bands (never fabricated money), an always-present
 * capital-discipline note, an allocation summary, an honest empty state, and no guarantee / hidden score /
 * reckless-scale language.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PortfolioPanel, type PortfolioItemView, type OpportunityPortfolioView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const item = (over: Partial<PortfolioItemView> = {}): PortfolioItemView => ({
  opportunityType: "NEW_SERVICE", signalSourceType: "SERVICE_GAP", title: "A same-day option could win time-sensitive customers",
  targetCustomerSegment: "busy local professionals", portfolioDecision: "VALIDATE_CHEAPLY", validationStatus: "NOT_STARTED",
  confidence: "MEDIUM", cashRisk: "LOW", capitalAtRiskBand: "LOW", expectedReturnBand: "MODERATE",
  requiresOwnerApproval: false, approvalLevel: "MANAGER",
  scaleBlockedReason: "Validation has not passed yet — capital and scale are withheld until it does.",
  recommendedAction: "Run the cheap validation experiment before allocating any capital.",
  riskIfIgnored: "capital sits idle", supportingRefs: ["ev-1"], ...over,
});
const view = (over: Partial<OpportunityPortfolioView> = {}): OpportunityPortfolioView => ({
  items: [item()], topItem: item(),
  capitalDisciplineNote: "Capital and scale follow proof, not hunches: only opportunities whose validation has passed can be scaled — the rest are validated, reviewed, parked, or stopped.",
  summary: { itemsConsidered: 2, validateFirst: 1, ownerReviewRequired: 0, parkedOrRejected: 1, killed: 0, scaleCandidates: 0, doNow: 0 },
  ...over,
});

describe("PortfolioPanel", () => {
  it("shows the top decision, validation status, and recommended action", () => {
    const { getByTestId } = render(<PortfolioPanel data={view()} />);
    expect(getByTestId("portfolio-panel").getAttribute("data-decision")).toBe("VALIDATE_CHEAPLY");
    expect(getByTestId("port-title").textContent).toMatch(/Validate cheaply first/i);
    expect(getByTestId("port-validation").textContent).toMatch(/NOT_STARTED/);
    expect(getByTestId("port-action").textContent).toMatch(/before allocating any capital/i);
  });

  it("shows scale-blocked when validation has not passed", () => {
    const { getByTestId } = render(<PortfolioPanel data={view()} />);
    expect(getByTestId("port-scale").textContent).toMatch(/Scaling blocked/i);
  });

  it("shows scale-unblocked for a passed, scalable item", () => {
    const scalable = item({ portfolioDecision: "DO_NOW", validationStatus: "PASSED", scaleBlockedReason: null });
    const { getByTestId } = render(<PortfolioPanel data={view({ items: [scalable], topItem: scalable })} />);
    expect(getByTestId("port-scale").textContent).toMatch(/unblocked — validation has passed/i);
  });

  it("shows a SCALE_CANDIDATE needing owner approval", () => {
    const sc = item({ portfolioDecision: "SCALE_CANDIDATE", validationStatus: "PASSED", scaleBlockedReason: null, requiresOwnerApproval: true, approvalLevel: "OWNER" });
    const { getByTestId } = render(<PortfolioPanel data={view({ items: [sc], topItem: sc })} />);
    expect(getByTestId("port-title").textContent).toMatch(/Scale candidate/i);
    expect(getByTestId("port-approval-badge").textContent).toMatch(/Owner approval required/i);
  });

  it("reports capital + return as qualitative bands, never fabricated money", () => {
    const { getByTestId, container } = render(<PortfolioPanel data={view()} />);
    expect(getByTestId("port-capital").textContent).toMatch(/Capital at risk: LOW/);
    expect(getByTestId("port-return").textContent).toMatch(/Expected return: MODERATE/);
    expect((container.textContent ?? "")).not.toMatch(/[$£€]\s?\d/);
  });

  it("always carries the capital-discipline note", () => {
    const { getByTestId } = render(<PortfolioPanel data={view()} />);
    expect(getByTestId("port-discipline").textContent).toMatch(/follow proof/i);
  });

  it("summarises the allocation rather than dumping the item list", () => {
    const { getByTestId } = render(<PortfolioPanel data={view()} />);
    expect(getByTestId("port-summary").textContent).toMatch(/2 opportunity\(ies\)/i);
    expect(getByTestId("port-summary").textContent).toMatch(/1 validate\/collect/i);
  });

  it("renders an honest empty state when there is no portfolio item", () => {
    const { getByTestId, queryByTestId } = render(<PortfolioPanel data={{ items: [], topItem: null, capitalDisciplineNote: "n", summary: { itemsConsidered: 0, validateFirst: 0, ownerReviewRequired: 0, parkedOrRejected: 0, killed: 0, scaleCandidates: 0, doNow: 0 } }} />);
    expect(getByTestId("portfolio-empty").textContent).toMatch(/No opportunity in the portfolio yet/i);
    expect(queryByTestId("portfolio-panel")).toBeNull();
  });

  it("carries no guarantee / reckless-scale / hidden score / disciplinary language", () => {
    const sc = item({ portfolioDecision: "SCALE_CANDIDATE", validationStatus: "PASSED", scaleBlockedReason: null });
    const { container } = render(<PortfolioPanel data={view({ items: [sc], topItem: sc })} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/guaranteed|profit guarantee|scale now|risk-free/);
    expect(text).not.toMatch(/\bscore\b/);
    expect(text).not.toMatch(/\b(fraud|negligence|firing|payroll|discipline)\b/);
  });
});
