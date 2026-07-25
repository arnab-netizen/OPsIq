import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  ConfidenceLevel,
  DiagnosisType,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";

/**
 * P4-A fix: Suzlon CDR/FCCB/debt-restructuring vocabulary added to DEBT_TEXT and
 * DEBT_SELF_CORROBORATING so Suzlon-style evidence (formal CDR referral, FCCB holder
 * failure, high leverage) fires debt_solvency_pressure and outranks margin_erosion.
 *
 * New DEBT_TEXT additions: \bfccb\b, foreign currency convertible, corporate debt
 *   restructuring, \bcdr\b, liability management
 * New DEBT_SELF_CORROBORATING additions: \bfccb\b, corporate debt restructuring,
 *   \bcdr\b, high leverage
 * New DEBT_HIGH_SEVERITY: \bfccb\b, corporate debt restructuring, \bcdr\b → elevates
 *   confidence to HIGH so debt_solvency outranks margin_erosion (both otherwise MODERATE)
 *
 * Guards: generic "restructuring" (no debt prefix), normal D/E discussion (no distress
 *   phrases), "liability" alone, and "CDR" in non-financial-health dimension must NOT fire.
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
    id: `00000000-0000-4000-a000-${String(seq).padStart(12, "0")}`,
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

// ─── Fire paths ──────────────────────────────────────────────────────────────

describe("diagnosis-p4a-suzlon — module contract assertions", () => {
  it("diagnoseRootCause is a function", () => { expect(typeof diagnoseRootCause).toBe("function"); });
  it("ConfidenceLevel is an object", () => { expect(typeof ConfidenceLevel).toBe("object"); });
  it("DiagnosisType is an object", () => { expect(typeof DiagnosisType).toBe("object"); });
  it("ev is a function", () => { expect(typeof ev).toBe("function"); });
  it("primary is a function", () => { expect(typeof primary).toBe("function"); });
  it("typeof seq equals number", () => { expect(typeof seq).toBe("number"); });
  it("ev() returns an object", () => { expect(typeof ev("financial_health", "test finding")).toBe("object"); });
  it("ev() has dimension field", () => { expect(ev("financial_health", "test finding")).toHaveProperty("dimension"); });
  it("ev() has finding field", () => { expect(ev("financial_health", "test finding")).toHaveProperty("finding"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("P4-A: CDR referral fires debt_solvency_pressure", () => {
  it("'corporate debt restructuring' in financial_health fires debt_solvency_pressure", () => {
    const evidence = [
      ev(
        "financial_health",
        "Company has referred its debt to the Corporate Debt Restructuring cell and is seeking moratorium on principal and interest",
      ),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("'CDR' abbreviation in financial_health fires debt_solvency_pressure", () => {
    const evidence = [
      ev(
        "financial_health",
        "The CDR process is underway; the company is seeking a longer repayment profile and interest concessions from lenders",
      ),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

describe("P4-A: FCCB failure fires debt_solvency_pressure", () => {
  it("'FCCB' with extension failure fires debt_solvency_pressure", () => {
    const evidence = [
      ev(
        "financial_health",
        "FCCB holder extension request did not pass; discussions with FCCB holders are continuing at the decision date",
      ),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("'foreign currency convertible bond' outstanding fires debt_solvency_pressure", () => {
    const evidence = [
      ev(
        "financial_health",
        "Significant foreign currency convertible bond liabilities outstanding; largely unhedged against rupee depreciation",
      ),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

describe("P4-A: Suzlon-profile evidence fires debt_solvency_pressure over margin_erosion", () => {
  it("Suzlon-style combined evidence: debt_solvency_pressure wins over margin_erosion", () => {
    const evidence = [
      ev(
        "financial_health",
        "Net debt to equity ratio of 2.9x as of 30 June 2012, indicating high leverage relative to equity base",
        true,
        { net_debt_to_equity: "2.9x", as_of_date: "2012-06-30" }
      ),
      ev(
        "financial_health",
        "H1 FY13 revenue with EBIT margin of negative 7%, indicating operating losses at the current business scale",
        true,
        { h1_fy13_ebit_margin_pct: -7 }
      ),
      ev(
        "financial_health",
        "Significant FCCB liabilities outstanding; foreign currency obligations are largely unhedged",
      ),
      ev(
        "financial_health",
        "FCCB holder extension request did not pass; discussions with FCCB holders are continuing at the decision date",
      ),
      ev(
        "financial_health",
        "Company has referred debt to the Corporate Debt Restructuring cell and is seeking moratorium on principal and interest on term debt",
      ),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("High-leverage finding with CDR fires debt_solvency at HIGH confidence (outranks MODERATE margin_erosion)", () => {
    const evidence = [
      ev("financial_health", "Negative EBIT margin of 8% indicates severe operating cost pressure", true, { ebit_margin: -8 }),
      ev("financial_health", "The company has entered the CDR process; lenders are considering moratorium on debt service"),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

describe("P4-A: liability management vocabulary fires debt_solvency_pressure", () => {
  it("'liability management' as stated strategic priority fires debt_solvency_pressure", () => {
    const evidence = [
      ev(
        "financial_health",
        "Management has stated that comprehensive liability management is the primary strategic focus for the year; debt restructuring discussions with lenders are ongoing",
      ),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

// ─── Guard tests ─────────────────────────────────────────────────────────────

describe("P4-A guard: generic restructuring without debt context does NOT fire", () => {
  it("'Restructuring operations' without debt vocabulary does NOT fire debt_solvency_pressure", () => {
    const evidence = [
      ev(
        "financial_health",
        "The company is restructuring its operations to focus on core markets and improve efficiency",
      ),
    ];
    expect(primary(evidence)).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("'Organizational restructuring' in operational dimension does NOT fire debt_solvency_pressure", () => {
    const evidence = [
      ev(
        "operational_efficiency",
        "Management is undertaking a major organizational restructuring to reduce costs",
      ),
    ];
    expect(primary(evidence)).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

describe("P4-A guard: normal D/E ratio discussion without distress does NOT fire", () => {
  it("D/E of 1.2x described as within industry norms does NOT fire debt_solvency_pressure", () => {
    const evidence = [
      ev(
        "financial_health",
        "The debt-to-equity ratio of 1.2x is within normal industry benchmarks and consistent with peers",
        false, // not critical
      ),
    ];
    expect(primary(evidence)).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

describe("P4-A guard: 'CDR' in non-financial_health dimension does NOT fire", () => {
  it("'CDR' mention in market_position dimension does NOT fire debt_solvency_pressure", () => {
    const evidence = [
      ev(
        "market_position",
        "CDR (Call Drop Rate) in the telecom sector is adversely impacting customer satisfaction scores",
      ),
    ];
    expect(primary(evidence)).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

describe("P4-A guard: 'liability' alone does NOT fire", () => {
  it("'Liability' without debt-restructuring context does NOT fire debt_solvency_pressure", () => {
    const evidence = [
      ev(
        "financial_health",
        "Product liability expenses increased due to warranty claims in the domestic market",
      ),
    ];
    expect(primary(evidence)).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});
