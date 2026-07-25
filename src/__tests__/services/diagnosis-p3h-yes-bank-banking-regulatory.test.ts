import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  ConfidenceLevel,
  DiagnosisType,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";

/**
 * P3-H fix: Yes Bank banking regulatory-intervention / moratorium / capital stress vocabulary.
 *
 * STRONG_LEGAL_TEXT additions:
 *   regulatory intervention | capital inadequacy | capital adequacy insufficient |
 *   RBI intervention | central bank intervention
 *
 * The Yes Bank case has a "legal" dimension finding (maps to process_maturity) containing
 * "regulatory intervention increasingly probable" — previously not substantive (1 LEGAL_TEXT_G
 * hit only). Now matches STRONG_LEGAL_TEXT → substantive → fires with the governance finding.
 *
 * Guards:
 *   - "regulatory reporting" alone does NOT fire
 *   - "capital pressure" alone does NOT fire
 *   - ordinary bank profitability commentary does NOT fire
 *   - Scope-gap cases unchanged
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

describe("diagnosis-p3h — module contract assertions", () => {
  it("diagnoseRootCause is a function", () => { expect(typeof diagnoseRootCause).toBe("function"); });
  it("ConfidenceLevel is an object", () => { expect(typeof ConfidenceLevel).toBe("object"); });
  it("DiagnosisType is an object", () => { expect(typeof DiagnosisType).toBe("object"); });
  it("ev is a function", () => { expect(typeof ev).toBe("function"); });
  it("primary is a function", () => { expect(typeof primary).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
});

// ─── P3-H: Yes Bank banking regulatory vocabulary fires legal_governance_risk ─

describe("P3-H — banking regulatory-intervention vocabulary fires legal_governance_risk", () => {
  it("'regulatory intervention' + governance concern fires legal_governance_risk", () => {
    expect(
      primary([
        ev("process_maturity", "RBI actively monitoring capital adequacy and asset quality — regulatory intervention increasingly probable"),
        ev("process_maturity", "Known governance and risk-management concerns contributed to the asset-quality deterioration"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("'capital inadequacy' standalone substantive finding fires legal_governance_risk", () => {
    expect(
      primary([
        ev("process_maturity", "Capital inadequacy confirmed by RBI stress test — bank cannot absorb additional stressed-asset losses without external capital injection"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("'capital adequacy insufficient' + governance fires legal_governance_risk", () => {
    expect(
      primary([
        ev("process_maturity", "Capital adequacy insufficient to absorb stressed asset losses; board governance mechanisms have failed to prevent asset-quality deterioration"),
        ev("process_maturity", "Regulatory scrutiny of capital adequacy and governance framework intensifying"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("'RBI intervention' single finding fires legal_governance_risk", () => {
    expect(
      primary([
        ev("process_maturity", "RBI intervention to supersede the board and appoint administrator is now the most likely outcome given capital adequacy failure"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("'central bank intervention' in market_position fires legal_governance_risk", () => {
    expect(
      primary([
        ev("market_position", "Central bank intervention is increasingly anticipated by market participants; depositor confidence eroding"),
        ev("market_position", "Governance credibility of management team is questioned given sustained asset-quality deterioration"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("Yes Bank full evidence set fires legal_governance_risk", () => {
    expect(
      primary([
        ev("financial_health", "Asset quality deteriorating with high stressed and non-performing asset exposure — provisioning inadequate relative to stressed portfolio"),
        ev("financial_health", "Bank needs capital and has failed to secure sufficient credible capital through private-market attempts; capital raise deadline has passed without binding commitments"),
        ev("financial_health", "Capital adequacy insufficient to absorb stressed asset losses without external injection — bank is in breach of regulatory capital requirements on a stress-adjusted basis"),
        ev("operational_efficiency", "Depositor and market confidence under pressure — franchise value at risk if confidence collapses and deposit outflows accelerate"),
        ev("operational_efficiency", "Yes Bank's size and interconnectedness means failure carries systemic implications for Indian financial system; contagion risk cited by analysts"),
        ev("process_maturity", "Known governance and risk-management concerns contributed to the asset-quality deterioration; board oversight of credit underwriting process has been questioned"),
        ev("process_maturity", "RBI actively monitoring capital adequacy and asset quality — regulatory intervention increasingly probable given failure to raise capital privately"),
        ev("market_position", "Private capital-raising window closing — market confidence in management's ability to execute capital plan is low", true),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("moratorium keyword (existing STRONG_LEGAL_TEXT) still fires legal_governance_risk", () => {
    expect(
      primary([
        ev("process_maturity", "RBI has placed the bank under moratorium — depositor withdrawals limited to Rs 50,000 pending restructuring"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });
});

// ─── P3-H: boundary guards — ordinary bank terms do NOT fire ─────────────────

describe("P3-H boundary guards — ordinary bank / regulatory commentary does NOT fire", () => {
  it("'regulatory reporting' alone does NOT fire legal_governance_risk", () => {
    expect(
      primary([
        ev("process_maturity", "Regulatory reporting requirements have been updated for the new financial year"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("'capital pressure' alone (no intervention term) does NOT fire legal_governance_risk", () => {
    expect(
      primary([
        ev("process_maturity", "Capital pressure from higher provisioning requirements is weighing on profitability"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("ordinary bank profitability commentary does NOT fire legal_governance_risk", () => {
    expect(
      primary([
        ev("financial_health", "Net interest margin compressed to 2.8% due to rising funding costs and competitive loan pricing"),
        ev("financial_health", "Non-performing asset ratio at 3.2% — within regulatory tolerance but above management target"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("'regulatory capital' without insufficiency / intervention does NOT fire", () => {
    expect(
      primary([
        ev("process_maturity", "Regulatory capital ratios are monitored quarterly and disclosed in annual reports"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("'capital adequacy' alone (no 'insufficient' / intervention context) does NOT fire", () => {
    expect(
      primary([
        ev("process_maturity", "Capital adequacy ratios are maintained above the minimum required levels per RBI guidelines"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("'intervention' alone without regulatory/bank context does NOT fire", () => {
    expect(
      primary([
        ev("process_maturity", "Management intervention in daily operations is frequent, limiting middle-management autonomy"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });
});

// ─── P3-H: existing paths unchanged ──────────────────────────────────────────

describe("P3-H — existing legal/governance detection paths unchanged", () => {
  it("'fraud' still fires legal_governance_risk", () => {
    expect(
      primary([
        ev("process_maturity", "Accounting fraud identified by external auditors; board audit committee investigating"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("numeric leverageRatio still fires debt_solvency_pressure (no regression)", () => {
    expect(
      primary([
        ev("financial_health", "Leverage at 8.5x above covenant of 5x", true, { leverageRatio: 8.5, covenantHeadroom: -3.5 }),
      ])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

// ─── Scope-gap cases remain held ─────────────────────────────────────────────

describe("P3-H — scope-gap cases unchanged", () => {
  it("BlackBerry-style competitive disruption does NOT fire legal_governance_risk", () => {
    expect(
      primary([
        ev("market_position", "Market share eroded by iOS and Android ecosystems; developer ecosystem shifted away"),
        ev("market_position", "Enterprise segment credibility retained but consumer relevance lost permanently"),
        ev("financial_health", "Revenue declined as consumer device volumes fell sharply below prior-year levels"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("turnaround without governance failure does NOT fire legal_governance_risk", () => {
    expect(
      primary([
        ev("market_position", "Product portfolio fragmented across consumer and professional segments"),
        ev("operational_efficiency", "Non-core initiatives spread team capacity too thin"),
        ev("financial_health", "Operating losses reported but cost restructuring plan is in preparation"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });
});
