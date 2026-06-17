import { describe, it, expect } from "vitest";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { EvidenceItem, DiagnosisType } from "@/domain/consulting-engine/types";

/**
 * STAGE_A_ABSTENTION_GATE unit tests.
 *
 * The gate abstains (INSUFFICIENT_EVIDENCE) under two principled, conservative
 * triggers, designed to NEVER abstain a well-supported diagnosis:
 *  - Rule A (NO_PATTERN_SUPPORT): >=3 evidence items, top diagnosis has no
 *    supporting pattern, confidence < 40, and the evidence explicitly notes
 *    required data is missing.
 *  - Rule B (PERVASIVE_MISSING_DATA): >=4 evidence items and missing-data
 *    language density >= 1.0 per item.
 *
 * NOTE: A pure "top-two margin" abstention rule was deliberately NOT implemented:
 * several valid-correct benchmark cases legitimately win by ~5 points over a
 * co-ranked candidate (shared-pattern UEB/OB ties), so margin-only abstention
 * would regress them. See ABSTENTION_GATE_VALIDATION_REPORT.md.
 */

const synthesizer = new EvidenceSynthesisEngine();
const generator = new HypothesisGenerator();

function run(evidence: EvidenceItem[]) {
  const synthesized = synthesizer.synthesizeEvidence(evidence);
  return generator.generateHypotheses(synthesized, evidence);
}

describe("STAGE_A_ABSTENTION_GATE", () => {
  // Test 1 — pervasive missing-data evidence abstains instead of forcing a diagnosis.
  it("abstains when evidence pervasively declares required data is missing", () => {
    const evidence: EvidenceItem[] = [
      { id: "e1", dimension: "financial_health", finding: "Margins moved but per-segment profitability has never been computed and is unknown.", isCritical: true },
      { id: "e2", dimension: "operational_efficiency", finding: "Utilization reported firm-wide only; it is unknown whether the decline is broad or concentrated.", isCritical: true },
      { id: "e3", dimension: "market_position", finding: "No win/loss analysis has been produced, so competitive contribution is unverified.", isCritical: false },
      { id: "e4", dimension: "customer_retention", finding: "Cohort retention has not been analyzed; durability is uncharacterized.", isCritical: false },
    ];
    const hyps = run(evidence);
    expect(hyps[0].rootCause).toBe(DiagnosisType.INSUFFICIENT_EVIDENCE);
  });

  // Test 2 — generic/unsupported top diagnosis with missing-data note abstains.
  it("abstains when the top diagnosis has no pattern support and data is noted missing", () => {
    const evidence: EvidenceItem[] = [
      { id: "e1", dimension: "financial_health", finding: "Blended payback looks fine but the marginal cohort has not been measured.", isCritical: true },
      { id: "e2", dimension: "go_to_market", finding: "Channel mix shifted; fully-loaded CAC bridge has not been produced.", isCritical: false },
      { id: "e3", dimension: "customer_retention", finding: "Retention has not been cut by cohort or channel and is unknown.", isCritical: false },
    ];
    const hyps = run(evidence);
    expect(hyps[0].rootCause).toBe(DiagnosisType.INSUFFICIENT_EVIDENCE);
  });

  // Test 3 — ambiguity WITHOUT pattern support + missing data abstains; BUT a
  // close margin WITH pattern support does NOT abstain (protects valid ties).
  it("abstains on unsupported ambiguity but NOT on pattern-supported close margins", () => {
    const unsupported: EvidenceItem[] = [
      { id: "e1", dimension: "market_position", finding: "Signals are mixed and the cause is unclear; not yet known which factor dominates.", isCritical: true },
      { id: "e2", dimension: "customer_retention", finding: "Churn moved but exit reasons have not been analyzed.", isCritical: false },
      { id: "e3", dimension: "financial_health", finding: "Margin moved but drivers are not quantified.", isCritical: false },
      { id: "e4", dimension: "quality_delivery", finding: "Quality impact is uncharacterized and not measured.", isCritical: false },
    ];
    expect(run(unsupported)[0].rootCause).toBe(DiagnosisType.INSUFFICIENT_EVIDENCE);

    // Pattern-supported case with a real diagnosis must NOT abstain.
    const supported: EvidenceItem[] = [
      { id: "e1", dimension: "financial_health", finding: "CAC $400, LTV $2800, payback 10 months, contribution margin compressing", isCritical: true },
      { id: "e2", dimension: "operational_efficiency", finding: "Cost per unit rising, throughput steady, utilization healthy", isCritical: true },
    ];
    expect(run(supported)[0].rootCause).not.toBe(DiagnosisType.INSUFFICIENT_EVIDENCE);
  });

  // Test 4 — missing-required-evidence (no patterns) abstains.
  it("abstains when no evidence pattern supports any diagnosis (with missing-data note)", () => {
    const evidence: EvidenceItem[] = [
      { id: "e1", dimension: "team_capability", finding: "Some attrition noted but root cause is unknown.", isCritical: true },
      { id: "e2", dimension: "process_maturity", finding: "Process gaps suspected but never documented.", isCritical: false },
      { id: "e3", dimension: "market_position", finding: "Competitive position has not been analyzed.", isCritical: false },
    ];
    const hyps = run(evidence);
    expect(hyps[0].rootCause).toBe(DiagnosisType.INSUFFICIENT_EVIDENCE);
  });

  // Test 5 — a strong, well-supported diagnosis does NOT abstain.
  it("does not abstain on a strong, well-supported unit-economics diagnosis", () => {
    const evidence: EvidenceItem[] = [
      { id: "e1", dimension: "financial_health", finding: "CAC $450 rising, LTV $1900 falling, payback period extended to 30 months, contribution margin negative", isCritical: true },
      { id: "e2", dimension: "operational_efficiency", finding: "Cost per unit rising sharply, gross margin compressing each quarter", isCritical: true },
      { id: "e3", dimension: "financial_health", finding: "ARPU declining while delivery cost per account climbs", isCritical: true },
    ];
    const hyps = run(evidence);
    expect(hyps[0].rootCause).not.toBe(DiagnosisType.INSUFFICIENT_EVIDENCE);
    expect(hyps[0].rootCause).toBe(DiagnosisType.UNIT_ECONOMICS_BREAKDOWN);
  });

  // Test 6 — clean, low-uncertainty evidence does not abstain even without 2-dim patterns.
  it("does not abstain on clean single-theme evidence with no missing-data language", () => {
    const evidence: EvidenceItem[] = [
      { id: "e1", dimension: "financial_health", finding: "CAC $400, LTV $2800, payback period 10 months, unit economics strong", isCritical: true },
      { id: "e2", dimension: "financial_health", finding: "Contribution margin 70%, ARPU $250, revenue scaling profitably", isCritical: true },
      { id: "e3", dimension: "financial_health", finding: "Payback calculation shows strong unit economics fundamentals", isCritical: false },
    ];
    const hyps = run(evidence);
    expect(hyps[0].rootCause).not.toBe(DiagnosisType.INSUFFICIENT_EVIDENCE);
  });

  // Test 7 — abstention confidence is low and within cap.
  it("emits abstention at low confidence within the <=65 cap", () => {
    const evidence: EvidenceItem[] = [
      { id: "e1", dimension: "financial_health", finding: "Value cannot be compared until structure is known; it is unknown and unverified.", isCritical: true },
      { id: "e2", dimension: "market_position", finding: "Standalone path is unverified and not quantified.", isCritical: true },
      { id: "e3", dimension: "customer_retention", finding: "Retention durability is only partially characterized and not yet known.", isCritical: false },
      { id: "e4", dimension: "quality_delivery", finding: "Transferable value is undocumented and uncharacterized.", isCritical: false },
    ];
    const hyps = run(evidence);
    expect(hyps[0].rootCause).toBe(DiagnosisType.INSUFFICIENT_EVIDENCE);
    expect(hyps[0].confidence).toBeLessThanOrEqual(65);
    expect(hyps[0].confidence).toBeLessThanOrEqual(40);
  });

  // Test 8 — abstention preserves evidence traceability (carries supporting counts + reasoning).
  it("preserves evidence references and explains what is missing when abstaining", () => {
    const evidence: EvidenceItem[] = [
      { id: "e1", dimension: "financial_health", finding: "Profit fell but the decline drivers have never been computed and are unknown.", isCritical: true },
      { id: "e2", dimension: "operational_efficiency", finding: "Utilization reported firm-wide only; not measured by segment.", isCritical: true },
      { id: "e3", dimension: "market_position", finding: "Competitive displacement suspected but no win/loss analysis produced.", isCritical: false },
      { id: "e4", dimension: "customer_retention", finding: "Concentration risk noted but cohorts have not been analyzed.", isCritical: false },
    ];
    const hyps = run(evidence);
    expect(hyps[0].rootCause).toBe(DiagnosisType.INSUFFICIENT_EVIDENCE);
    expect(hyps[0].reasoning).toMatch(/INSUFFICIENT_EVIDENCE/);
    expect(hyps[0].reasoning.toLowerCase()).toMatch(/missing|no evidence pattern/);
    // Original strongest candidate is preserved for traceability at a lower rank.
    expect(hyps.length).toBeGreaterThan(1);
  });
});
