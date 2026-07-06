/**
 * CashProfitPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the Executive Cockpit surface: the single most severe cash/profit risk by default (protective
 * action first, plain explanation, a REAL metric value when available, owner-review marker + guardrail),
 * evidence collapsed in a <details>, the summary counts, an honest empty state, and no fabricated money /
 * disciplinary label / hidden score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CashProfitPanel, type CashProfitSignalView, type CashProfitProtectionView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const signal = (over: Partial<CashProfitSignalView> = {}): CashProfitSignalView => ({
  signalType: "CASH_SAFETY_RISK",
  category: "CASH",
  severity: "CRITICAL",
  title: "Cash runway is short",
  ownerExplanation: "The cash on hand covers only a short runway.",
  protectiveAction: "PROTECT_CASH_RUNWAY",
  approvalLevel: "OWNER",
  requiresOwnerReview: true,
  riskGuardrail: "This is a material money decision — you review and decide; nothing is changed automatically.",
  observedCount: 1,
  metricType: "CASH_RUNWAY_DAYS",
  metricValue: 8,
  metricThreshold: 30,
  thresholdBreached: true,
  supportingProofIds: [],
  supportingOperationalEventIds: [],
  supportingFinancialSnapshotIds: [],
  missingData: [],
  ...over,
});

const view = (over: Partial<CashProfitProtectionView> = {}): CashProfitProtectionView => ({
  signals: [signal()],
  topSignal: signal(),
  summary: { total: 1, critical: 1, high: 0, ownerReviewRequired: 1 },
  ...over,
});

describe("CashProfitPanel", () => {
  it("shows the top risk: title, real metric, protective action, owner-review marker, guardrail", () => {
    const { getByTestId } = render(<CashProfitPanel data={view()} />);
    expect(getByTestId("cash-profit-panel").getAttribute("data-signal-type")).toBe("CASH_SAFETY_RISK");
    expect(getByTestId("cp-title").textContent).toMatch(/Cash runway is short/i);
    expect(getByTestId("cp-metric").textContent).toMatch(/8 days of runway/i);
    expect(getByTestId("cp-action").textContent).toMatch(/Protect cash runway/i);
    expect(getByTestId("cp-approval").textContent).toMatch(/Owner review required/i);
    expect(getByTestId("cp-guardrail").textContent).toMatch(/material money decision/i);
  });

  it("omits the metric chip when there is no real metric value (never fabricates one)", () => {
    const noMetric = signal({ signalType: "PROFIT_DATA_INSUFFICIENT", title: "Not enough financial data", metricType: null, metricValue: null, protectiveAction: "COLLECT_FINANCIAL_DATA", severity: "LOW", requiresOwnerReview: false, approvalLevel: "MANAGER", missingData: ["complete financial snapshot"] });
    const { queryByTestId, getByTestId } = render(<CashProfitPanel data={view({ signals: [noMetric], topSignal: noMetric, summary: { total: 1, critical: 0, high: 0, ownerReviewRequired: 0 } })} />);
    expect(queryByTestId("cp-metric")).toBeNull();
    expect(getByTestId("cp-missing").textContent).toMatch(/financial snapshot/i);
  });

  it("collapses evidence by default in a <details> element", () => {
    const { getByTestId } = render(<CashProfitPanel data={view({
      signals: [signal({ supportingFinancialSnapshotIds: ["f1"] })],
      topSignal: signal({ supportingFinancialSnapshotIds: ["f1"] }),
    })} />);
    const details = getByTestId("cp-evidence");
    expect(details.tagName.toLowerCase()).toBe("details");
    expect(details.hasAttribute("open")).toBe(false);
  });

  it("renders only the top risk by default; the rest are behind a summary + a counts line", () => {
    const { getByTestId, queryAllByTestId } = render(<CashProfitPanel data={view({
      signals: [signal(), signal({ signalType: "REWORK_COST_RISK", severity: "MEDIUM", title: "Rework is eating margin", requiresOwnerReview: false, approvalLevel: "MANAGER" })],
      topSignal: signal(),
      summary: { total: 2, critical: 1, high: 0, ownerReviewRequired: 1 },
    })} />);
    expect(queryAllByTestId("cash-profit-panel")).toHaveLength(1);
    expect(getByTestId("cp-more").textContent).toMatch(/1 more cash\/profit risk/i);
    expect(getByTestId("cp-summary").textContent).toMatch(/1 need owner review/i);
  });

  it("renders an honest empty state when nothing needs protecting", () => {
    const { getByTestId, queryByTestId } = render(<CashProfitPanel data={{ signals: [], topSignal: null, summary: { total: 0, critical: 0, high: 0, ownerReviewRequired: 0 } }} />);
    expect(getByTestId("cash-profit-empty")).toBeTruthy();
    expect(queryByTestId("cash-profit-panel")).toBeNull();
  });

  it("carries no fabricated money figure, no disciplinary label, no hidden score", () => {
    const { container } = render(<CashProfitPanel data={view({
      signals: [signal({ signalType: "STAFF_INEFFICIENCY_COST_RISK", title: "Avoidable labour cost on some work", protectiveAction: "REBALANCE_STAFFING", requiresOwnerReview: false, approvalLevel: "MANAGER", metricType: "SLOW_JOB_COUNT", metricValue: 4 })],
      topSignal: signal({ signalType: "STAFF_INEFFICIENCY_COST_RISK", title: "Avoidable labour cost on some work", protectiveAction: "REBALANCE_STAFFING", requiresOwnerReview: false, approvalLevel: "MANAGER", metricType: "SLOW_JOB_COUNT", metricValue: 4 }),
    })} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/[$£€]\s?\d/);
    expect(text).not.toMatch(/\b(fraud|negligence|fire|firing|payroll|discipline|punish)\b/);
    expect(text).not.toMatch(/hidden\s*score/);
  });
});
