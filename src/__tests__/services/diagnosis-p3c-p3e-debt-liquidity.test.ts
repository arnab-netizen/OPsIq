import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  ConfidenceLevel,
  DiagnosisType,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";

/**
 * P3-C fix: DEBT_SOLVENCY_STRICT_CORROBORATION — plain-language debt/solvency distress
 * vocabulary added to DEBT_TEXT and corroboration regex so historical case findings without
 * explicit covenant/maturity/debt-service phrasing can fire debt_solvency_pressure.
 *
 * P3-E fix: Kingfisher-style salary arrears added to LIQUIDITY_HARD so "salary arrears"
 * triggers cash_liquidity_crisis without requiring "missed payroll" exact phrasing.
 *
 * New LIQUIDITY_HARD additions: active default | asset-liability mismatch |
 *   salary/wage/payroll arrears
 * New DEBT_TEXT additions: debt-laden | obligation.*unpaid
 * New corroboration additions: acute solvency | solvency.*acute | cannot service |
 *   debt-laden | obligation.*unpaid
 *
 * Guards: weak phrases alone ("debt pressure", "financial concern", "liquidity issue",
 *   "market challenge") must NOT trigger. Scope-gap cases must remain abstained.
 */

let seq = 0;
function ev(
  dimension: EvidenceItem["dimension"],
  finding: string,
  isCritical = true,
  supportingData?: Record<string, string | number | boolean>
): EvidenceItem {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    dimension,
    finding,
    confidence: ConfidenceLevel.HIGH,
    source: "test",
    timestamp: new Date(0),
    isCritical,
    supportingData,
  };
}

const primary = (e: EvidenceItem[]) =>
  diagnoseRootCause(e, "test").primaryRootCause.type;

// ─── P3-C: DEBT_SOLVENCY new corroboration vocabulary ───────────────────────

describe("P3-C — acute solvency / solvency.*acute (RCOM-style) fires debt_solvency_pressure", () => {
  it("'creating acute solvency risk' corroborates DEBT_TEXT solvency match", () => {
    expect(
      primary([
        ev("financial_health", "Total debt is very high and significantly exceeds cash generation capacity from operations, creating acute solvency risk"),
        ev("financial_health", "Company is dependent on asset monetization to address debt obligations; no major asset sales have been completed"),
      ])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("'solvency is under acute threat' + 'cannot service' (Vodafone-style) fires debt_solvency_pressure", () => {
    expect(
      primary([
        ev("financial_health", "Combined debt and AGR dues create obligations that operating cash flow cannot service; solvency is under acute threat"),
        ev("financial_health", "Capital position is insufficient to absorb the liability shock and fund investment simultaneously"),
      ])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("'cannot service' alone in corroboration requires prior DEBT_TEXT match — standalone does not fire", () => {
    // finding with 'cannot service' but no DEBT_TEXT term → should NOT fire debt_solvency_pressure
    expect(
      primary([
        ev("financial_health", "Operations cannot service the volume of customer orders due to staffing gaps"),
      ])
    ).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

describe("P3-C — debt-laden / obligation.*unpaid (Jet Airways-style) fires debt_solvency_pressure", () => {
  it("'heavily debt-laden and unable to sustain operations' fires debt_solvency_pressure", () => {
    expect(
      primary([
        ev("financial_health", "Company is heavily debt-laden and unable to sustain operations from internal cash flows"),
        ev("financial_health", "Jet Airways suspended operations after lenders declined to provide further emergency funding"),
      ])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("'obligations to creditors are unpaid' fires debt_solvency_pressure", () => {
    expect(
      primary([
        ev("financial_health", "Obligations to creditors, employees, customers, and operational creditors are unpaid or at risk"),
        ev("financial_health", "Operations suspended; no path to resumption without capital injection from lenders or acquirer"),
      ])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("'debt laden' (no hyphen) also fires debt_solvency_pressure", () => {
    expect(
      primary([
        ev("financial_health", "The company is heavily debt laden and cannot meet its obligations from operating cash flows"),
      ])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

// ─── P3-C: LIQUIDITY_HARD new vocabulary (ILFS-style) ───────────────────────

describe("P3-C — active default / asset-liability mismatch (ILFS-style) fires cash_liquidity_crisis", () => {
  it("'active defaults on debt instruments' fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Active defaults on term deposits, short-term deposits, inter-corporate deposits, commercial paper, NCDs, and other debt instruments"),
        ev("financial_health", "Multiple credit rating agencies have downgraded instruments to below investment grade following the defaults"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'structural asset-liability mismatch' fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Structural asset-liability mismatch: long-dated infrastructure project cash flows are funded by short- and medium-term debt instruments, creating repayment obligations that project revenues cannot service on schedule"),
        ev("financial_health", "Group-level debt distributed across subsidiaries and SPVs; true aggregate debt position not transparently visible"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'asset liability mismatch' (no hyphen) also fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "There is a severe asset liability mismatch between long-term project assets and short-term funding instruments"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'active default' without additional context fires cash_liquidity_crisis (self-sufficient hard term)", () => {
    expect(
      primary([
        ev("financial_health", "The group is in active default on multiple debt instruments"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });
});

// ─── P3-E: salary arrears (Kingfisher-style) fires cash_liquidity_crisis ────

describe("P3-E — salary arrears fires cash_liquidity_crisis (Kingfisher-style)", () => {
  it("'salary arrears owed to employees' fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Seven months of salary arrears owed to employees as of 5 October 2012"),
        ev("financial_health", "Accumulated losses as at FY2011-12 end exceeded 50% of net worth; cash losses in FY2011-12 and FY2010-11"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'wage arrears' fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Wage arrears of four months outstanding to ground handling staff and cabin crew"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'payroll arrears' fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Payroll arrears have accumulated across all employee categories due to cash shortfall"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });
});

// ─── Boundary guards: weak phrases must NOT fire ─────────────────────────────

describe("P3-C/E boundary guards — weak/incidental phrases do NOT fire", () => {
  it("'debt pressure' alone does NOT fire debt_solvency_pressure", () => {
    expect(
      primary([
        ev("financial_health", "The company faces debt pressure in an uncertain macroeconomic environment"),
      ])
    ).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("'financial concern' alone does NOT fire any debt/liquidity diagnosis", () => {
    const r = diagnoseRootCause([
      ev("financial_health", "There are financial concerns about the medium-term outlook"),
    ], "test").primaryRootCause.type;
    expect(r).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
    expect(r).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'liquidity issue' alone does NOT fire cash_liquidity_crisis (too vague)", () => {
    expect(
      primary([
        ev("financial_health", "There may be a liquidity issue if revenue growth slows below projections"),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'market challenge' in market_position dim does NOT fire any debt diagnosis", () => {
    const r = diagnoseRootCause([
      ev("market_position", "The company faces a significant market challenge from digital-native competitors"),
    ], "test").primaryRootCause.type;
    expect(r).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
    expect(r).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'cannot service customers' in non-debt context does NOT fire debt_solvency_pressure", () => {
    expect(
      primary([
        ev("financial_health", "Operations cannot service the volume of customer orders due to staffing constraints"),
      ])
    ).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("'asset and liability' (not 'mismatch') in benign context does NOT fire", () => {
    expect(
      primary([
        ev("financial_health", "The asset and liability position has improved following the rights issue"),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'obligation' without 'unpaid' does NOT fire debt_solvency_pressure via new term", () => {
    expect(
      primary([
        ev("financial_health", "The obligation to maintain contractual commitments to all counterparties remains in force"),
      ])
    // "obligation" alone (no "unpaid") does not match obligation.*unpaid; no other DEBT_TEXT terms present
    ).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("process_maturity dimension evidence does NOT trigger LIQUIDITY_HARD (wrong dimension)", () => {
    // salary arrears in wrong dimension should NOT fire
    expect(
      primary([
        ev("process_maturity", "Salary arrears are a governance failure requiring board attention"),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });
});

// ─── Scope-gap cases must remain abstained (existing behavior preserved) ─────

describe("P3-C/E — scope-gap cases still do NOT commit to debt/liquidity archetype", () => {
  it("competitive-platform disruption evidence does NOT fire debt/liquidity diagnosis", () => {
    const r = diagnoseRootCause([
      ev("market_position", "Market share eroded by iOS and Android ecosystems; developer ecosystem shifted away from the platform"),
      ev("market_position", "Enterprise segment credibility retained but consumer relevance lost permanently"),
      ev("financial_health", "Revenue declined as consumer device volumes fell sharply below prior-year levels"),
    ], "test").primaryRootCause.type;
    expect(r).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
    expect(r).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("strategic turnaround evidence does NOT fire debt/liquidity diagnosis", () => {
    const r = diagnoseRootCause([
      ev("market_position", "Product portfolio has become fragmented with too many models across consumer and professional segments"),
      ev("operational_efficiency", "Non-core initiatives and resource commitments spread team capacity too thin"),
      ev("financial_health", "Operating losses reported but cost restructuring plan is in preparation"),
    ], "test").primaryRootCause.type;
    expect(r).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
    expect(r).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });
});

// ─── Existing numeric path and P1/P2 behaviors unchanged ─────────────────────

describe("P3-C/E — existing debt/liquidity paths still fire unchanged", () => {
  it("numeric leverageRatio still fires debt_solvency_pressure (existing path)", () => {
    expect(
      primary([
        ev("financial_health", "Leverage ratio at 8.5x, significantly above covenant of 5x", true, { leverageRatio: 8.5, covenantHeadroom: -3.5 }),
      ])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("'out of cash' still fires cash_liquidity_crisis (existing LIQUIDITY_HARD)", () => {
    expect(
      primary([
        ev("financial_health", "The company is out of cash and cannot fund operations past month-end"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'insolven' still fires cash_liquidity_crisis (existing LIQUIDITY_HARD)", () => {
    expect(
      primary([
        ev("financial_health", "The company is technically insolvent and no creditor remedy has been secured"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });
});
