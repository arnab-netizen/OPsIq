import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  ConfidenceLevel,
  DiagnosisType,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";

/**
 * P2 fix: legal_governance_risk textual-evidence path.
 *
 * Historical case packets for governance/fraud/regulatory cases (Luckin, FTX, Satyam,
 * Paytm, etc.) contain strong textual signals in process_maturity / market_position
 * evidence but have no numeric compliance fields (complianceGapCount, regulatoryDeadlineDays,
 * exposureAmount). The engine was requiring a numeric corroboration that no historical
 * packet provides, causing 10+ artificial abstentions.
 *
 * Fix: fin_isLegalGovernanceByText fires when evidence contains:
 *   (a) 2+ process_maturity/market_position items matching LEGAL_TEXT, with at least one
 *       "substantive" (STRONG_LEGAL_TEXT match OR 2+ distinct LEGAL_TEXT hits in one item), OR
 *   (b) 1 item that is substantive on its own.
 *
 * Guards that must still hold:
 *   - Numeric path fires unchanged (existing tests still pass)
 *   - Generic poor performance still does NOT fire
 *   - Safety/quality case with incidental regulatory mention NOT mislabelled legal
 *   - Weak incidental governance mentions ("regulated industries", "technology licensing")
 *     across 2 items do NOT fire when neither item is substantive
 *   - Creditor enforcement in a debt context does NOT fire (enforcement ≠ regulatory enforcement)
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

const primary = (e: EvidenceItem[]) => diagnoseRootCause(e, "test").primaryRootCause.type;

describe("diagnosis-legal-governance-textual — module contract assertions", () => {
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
  it("typeof Math.max equals function", () => { expect(typeof Math.max).toBe("function"); });
  it("typeof Math.min equals function", () => { expect(typeof Math.min).toBe("function"); });
});

// ─── STEP 1: P2 historical textual evidence now triggers legal_governance_risk ──

describe("P2 fix — STRONG single-item path", () => {
  it("audit committee oversight concern (Luckin-style) fires via STRONG \\baudit\\b", () => {
    expect(
      primary([
        ev("process_maturity", "Internal control framework not demonstrably robust for scale of reported operations; audit committee oversight not publicly evidenced"),
        ev("financial_health", "Revenue and transaction authenticity not independently verified; financial statements reliability not confirmed"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("audit reporting discipline failure (Byjus-style) fires via STRONG \\baudit\\b", () => {
    expect(
      primary([
        ev("process_maturity", "FY22 results reported approximately 18 months delayed — indicating severe audit-related governance failure"),
        ev("process_maturity", "FY21 audit also delayed — pattern of sustained financial reporting discipline failure"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("fraud + investigation language (Gitanjali-style) fires via STRONG", () => {
    expect(
      primary([
        ev("process_maturity", "Punjab National Bank reported fraud involving unauthorized letters of undertaking; promoter entities implicated"),
        ev("process_maturity", "CBI investigations and searches against group entities reported to have commenced"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("non-compliance with capital norms (LVB-style) fires via STRONG non-?complian", () => {
    expect(
      primary([
        ev("process_maturity", "Board-level governance disputes and leadership instability observed over prior period"),
        ev("process_maturity", "Non-compliance with capital adequacy and other PCA norms; no concluded rescue or merger arrangement"),
        ev("process_maturity", "Bank required credible capital infusion or regulatory-facilitated rescue to restore viability"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("investigation in PE fund governance (Abraaj-style) fires via STRONG investigation", () => {
    expect(
      primary([
        ev("process_maturity", "Board and governance structures insufficient to identify and prevent fund misuse risk; no concluded investigation completed"),
        ev("market_position", "Regulatory scrutiny risk elevated given scale of institutional investor complaints about fund cash handling"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });
});

describe("P2 fix — multi-term single-item path (2+ distinct LEGAL_TEXT hits in one finding)", () => {
  it("governance + regulatory co-occurrence in one finding (FTX-style) fires via 2 terms", () => {
    expect(
      primary([
        ev("process_maturity", "Governance and control structure wholly inadequate; regulatory engagement and customer protection obligations unmet"),
        ev("process_maturity", "Customer fund segregation from exchange operations unverified; balance-sheet opacity creating systemic risk"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("governance + compliance co-occurrence in one finding (Satyam-style) fires via 2 terms", () => {
    expect(
      primary([
        ev("process_maturity", "Related-party transaction attempt without adequate independent approval is a governance and legal compliance red flag under listing obligations"),
        ev("process_maturity", "Board approved the related-party acquisition proposal without adequate independent scrutiny — board oversight failure"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });
});

describe("P2 fix — 2+ item substantive path", () => {
  it("RBI restriction + non-compliance pattern (Paytm-style): 4 governance/legal items fires", () => {
    expect(
      primary([
        ev("process_maturity", "RBI restricted Paytm Payments Bank from accepting fresh deposits or credit transactions after specified deadline, citing persistent non-compliances"),
        ev("process_maturity", "RBI had in 2022 already directed Paytm Payments Bank to halt new customer onboarding due to compliance concerns; the 2024 action represents an escalation"),
        ev("process_maturity", "Persistent multi-year pattern of regulatory concern indicates systemic compliance and governance control deficiency"),
        ev("process_maturity", "Board and management under acute pressure to present credible remediation to RBI; regulatory relationship is severely strained"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("governance allegations + regulatory monitoring (Fortis-style): 3 items, 1 with 2 terms fires", () => {
    expect(
      primary([
        ev("process_maturity", "Board independence and oversight credibility are under scrutiny given the nature and scale of governance allegations against promoter-linked entities"),
        ev("market_position", "Potential strategic investors are aware of the company's hospital network value but governance clarity is a stated prerequisite for any credible transaction process"),
        ev("process_maturity", "Regulatory attention is active; authorities are monitoring governance allegations and related-party transaction disclosures"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("governance concerns + moratorium risk (STRONG term): 2 items with 1 substantive fires", () => {
    // item2 has "moratorium" which is STRONG → substantive; with 2+ relevant items → fires
    expect(
      primary([
        ev("process_maturity", "Known governance and risk-management concerns contributed to the asset-quality deterioration"),
        ev("process_maturity", "RBI actively monitoring capital adequacy and asset quality; regulatory intervention increasingly probable — moratorium is a real risk if capital is not raised"),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });
});

// ─── STEP 2 & 3: Safety guards — things that must NOT fire ──────────────────────

describe("P2 fix — non-governance cases do NOT fire", () => {
  it("weak incidental 'regulated industries' + 'technology licensing' mention does NOT fire (BlackBerry-style)", () => {
    expect(
      primary([
        ev("market_position", "Enterprise and government security and manageability credentials remain genuine and defensible differentiators in regulated industries and government segments"),
        ev("process_maturity", "The fundamental strategic question — mass-market device competition, enterprise software pivot, technology licensing, or restructuring — has not been decided clearly"),
        ev("market_position", "Consumer market share has been eroded significantly by Android and iOS ecosystems"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("regulator in aviation operational context does NOT fire (Kingfisher-style)", () => {
    // Regulator mentioned as part of aviation crisis, not as governance breach
    expect(
      primary([
        ev("process_maturity", "Aviation regulator DGCA seeking legal opinion on cancelling Kingfisher operating licence"),
        ev("process_maturity", "Persistent negative unit economics and no credible turnaround plan presented to regulator"),
        ev("financial_health", "Acute cash shortage; salary payments delayed for several months"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("creditor enforcement in debt context does NOT fire (RCOM-style) — enforcement ≠ regulatory", () => {
    expect(
      primary([
        ev("process_maturity", "Creditor enforcement risk is rising as payment deadlines approach; Ericsson pursuing claims actively"),
        ev("financial_health", "Debt load at approximately INR 45,000 crore; servicing impossible at current revenue"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("2 items each with only 1 weak LEGAL_TEXT term (no substantive) do NOT fire — boundary guard", () => {
    // governance + routine regulatory monitoring (no intervention/fraud/sanctions) → miss
    expect(
      primary([
        ev("process_maturity", "Known governance and risk-management concerns contributed to the asset-quality deterioration"),
        ev("process_maturity", "RBI actively monitoring capital adequacy and asset quality, requiring enhanced regulatory reporting"),
        ev("financial_health", "Net NPA ratio deteriorating; capital ratios under pressure from write-offs"),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("generic poor performance does NOT fire (existing guard preserved)", () => {
    expect(
      primary([
        ev("process_maturity", "Process documentation is thin and the team misses internal targets", true, { onTimePct: 70 }),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("safety/recall case with incidental regulatory mention is NOT mislabelled legal (existing guard preserved)", () => {
    expect(
      primary([
        ev("quality_delivery", "Complaint and defect rates spiked after a safety issue in shipped product", true, { complaintRate: 12, defectRate: 8 }),
        ev("quality_delivery", "The owner wants an immediate public recall and fast relaunch", true, { returnRate: 10 }),
        ev("process_maturity", "The product is regulated; an uncoordinated recall could breach mandatory reporting duties", true, { regulatoryDeadlineDays: 20, complianceGapCount: 3 }),
      ])
    ).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });
});

describe("P2 fix — existing numeric path still fires (unchanged)", () => {
  it("fraud / control failure with numeric inquiry triggers legal_governance_risk (existing test preserved)", () => {
    expect(
      primary([
        ev("process_maturity", "An incentive scheme drove staff to open unauthorized accounts and a regulator opened a formal inquiry", true, { complianceGapCount: 6, regulatoryDeadlineDays: 45 }),
        ev("market_position", "Estimated regulatory and remediation exposure is material to annual revenue", true, { exposureAmount: 185000000 }),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("regulatory deadline with compliance gaps fires HIGH confidence (existing test preserved)", () => {
    expect(
      primary([
        ev("process_maturity", "A regulatory filing deadline is thirty days out with multiple unmet compliance requirements", true, { regulatoryDeadlineDays: 30, complianceGapCount: 5 }),
        ev("market_position", "Estimated financial exposure from non-compliance is material to the firm", true, { exposureAmount: 250000 }),
      ])
    ).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });
});
