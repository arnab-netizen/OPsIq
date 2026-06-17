import { describe, it, expect } from "vitest";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { EvidenceItem, DiagnosisType } from "@/domain/consulting-engine/types";

describe("STAGE_A_REMEDIATION_SLICE_6: Demand/Cycle/Market Signal Recognition", () => {
  let generator: HypothesisGenerator;
  let synthesizer: EvidenceSynthesisEngine;

  beforeEach(() => {
    generator = new HypothesisGenerator();
    synthesizer = new EvidenceSynthesisEngine();
  });

  test("should recognize market-rate reversion signal (BLND-006: growth deceleration + stable satisfaction = demand saturation)", () => {
    const blnd006TestCases = [
      { dimension: "financial_health", finding: "CAC $45, LTV $2,800, 62-month payback. Rising CAC: marketing spend +40% for 15% acquisition growth." },
      { dimension: "market_position", finding: "Company growing faster than 15% annual TAM; competitors better-funded (Rent the Runway $70M Series C); acquisition decelerating 25% MoM -> 15% MoM" },
      { dimension: "customer_retention", finding: "Churn rising 4% -> 5% but NPS 48, repeat rate 72%, indicating stable satisfaction" },
    ];

    const evidenceItems: EvidenceItem[] = blnd006TestCases.map((tc, i) => ({
      id: `ev-${i}`,
      dimension: tc.dimension,
      finding: tc.finding,
      isCritical: i === 1,
    }));

    const synthesized = synthesizer.synthesizeEvidence(evidenceItems);
    const hypotheses = generator.generateHypotheses(synthesized, evidenceItems);

    // Should recognize DEMAND_FORECASTING_MISMATCH
    expect(hypotheses.length).toBeGreaterThan(0);
    const demandHyp = hypotheses.find(h => h.rootCause === DiagnosisType.DEMAND_FORECASTING_MISMATCH);
    expect(demandHyp).toBeDefined();
    expect(demandHyp!.confidence).toBeGreaterThanOrEqual(30);
  });

  test("should recognize quality/trust crisis signal despite growth (SYN-011: reliability issues + support burden = quality crisis)", () => {
    const syn011TestCases = [
      { dimension: "quality_delivery", finding: "Uptime 99.2% (below 99.9%+ standard), 2-3 incidents per month, recent 4-hour outage on data sync, 8-minute page load times during peak" },
      { dimension: "customer_retention", finding: "Churn rising 2% -> 3% MRR (~35% annualized)" },
      { dimension: "quality_delivery", finding: "Support tickets trending up 40% YoY; detractors cite reliability/performance, not features" },
    ];

    const evidenceItems: EvidenceItem[] = syn011TestCases.map((tc, i) => ({
      id: `ev-${i}`,
      dimension: tc.dimension,
      finding: tc.finding,
      isCritical: i === 0,
    }));

    const synthesized = synthesizer.synthesizeEvidence(evidenceItems);
    const hypotheses = generator.generateHypotheses(synthesized, evidenceItems);

    // Should recognize TRUST_QUALITY_CRISIS over CUSTOMER_RETENTION_EROSION
    expect(hypotheses.length).toBeGreaterThan(0);
    const trustHyp = hypotheses.find(h => h.rootCause === DiagnosisType.TRUST_QUALITY_CRISIS);
    expect(trustHyp).toBeDefined();
    expect(trustHyp!.confidence).toBeGreaterThanOrEqual(20);
  });

  test("should recognize demand cycle signal from leading indicators (PD-017: declining orders/placements = demand softening)", () => {
    const pd017TestCases = [
      { dimension: "operational_efficiency", finding: "Perm placement -8%, orders -6%, temp hours -2% sequential trends" },
      { dimension: "operational_efficiency", finding: "Fixed capacity added +4%, but leading indicators all declining" },
      { dimension: "financial_health", finding: "No mention of cost issues; forward planning continues despite demand weakness" },
    ];

    const evidenceItems: EvidenceItem[] = pd017TestCases.map((tc, i) => ({
      id: `ev-${i}`,
      dimension: tc.dimension,
      finding: tc.finding,
      isCritical: i === 0,
    }));

    const synthesized = synthesizer.synthesizeEvidence(evidenceItems);
    const hypotheses = generator.generateHypotheses(synthesized, evidenceItems);

    // Should recognize DEMAND_FORECASTING_MISMATCH
    expect(hypotheses.length).toBeGreaterThan(0);
    const demandHyp = hypotheses.find(h => h.rootCause === DiagnosisType.DEMAND_FORECASTING_MISMATCH);
    expect(demandHyp).toBeDefined();
    expect(demandHyp!.confidence).toBeGreaterThanOrEqual(15);
  });

  test("should recognize talent pipeline constraint (RW-024: junior turnover + low utilization = delivery bottleneck)", () => {
    const rw024TestCases = [
      { dimension: "operational_efficiency", finding: "Junior turnover rising 10% -> 18% (~6-7 annual departures from 35-person base)" },
      { dimension: "operational_efficiency", finding: "Delivery utilization 72% vs 75-80% peer benchmark due to training burden" },
      { dimension: "operational_efficiency", finding: "Training overhead constraining capacity for new clients" },
    ];

    const evidenceItems: EvidenceItem[] = rw024TestCases.map((tc, i) => ({
      id: `ev-${i}`,
      dimension: tc.dimension,
      finding: tc.finding,
      isCritical: i === 0,
    }));

    const synthesized = synthesizer.synthesizeEvidence(evidenceItems);
    const hypotheses = generator.generateHypotheses(synthesized, evidenceItems);

    // Should recognize OPERATIONAL_BOTTLENECK
    expect(hypotheses.length).toBeGreaterThan(0);
    const opHyp = hypotheses.find(h => h.rootCause === DiagnosisType.OPERATIONAL_BOTTLENECK);
    expect(opHyp).toBeDefined();
    expect(opHyp!.confidence).toBeGreaterThanOrEqual(15);
  });

  test("should recognize pricing power signal (BLND-010: strong win rate in niche = undermonetized)", () => {
    const blnd010TestCases = [
      { dimension: "financial_health", finding: "Flat billing rates despite depth-driven losses (35%) vs price losses (20%)" },
      { dimension: "market_position", finding: "50% win rate in niche segment vs 32% overall win rate - strong positioning but not leveraged" },
      { dimension: "financial_health", finding: "Expertise depth strong but pricing power not captured in revenue model" },
    ];

    const evidenceItems: EvidenceItem[] = blnd010TestCases.map((tc, i) => ({
      id: `ev-${i}`,
      dimension: tc.dimension,
      finding: tc.finding,
      isCritical: i === 0,
    }));

    const synthesized = synthesizer.synthesizeEvidence(evidenceItems);
    const hypotheses = generator.generateHypotheses(synthesized, evidenceItems);

    // Should recognize STRATEGIC_PRICING_ERROR (may be lower confidence due to single dimension)
    expect(hypotheses.length).toBeGreaterThan(0);
    const pricingHyp = hypotheses.find(h => h.rootCause === DiagnosisType.STRATEGIC_PRICING_ERROR);
    expect(pricingHyp).toBeDefined();
    expect(pricingHyp!.confidence).toBeGreaterThanOrEqual(10);
  });

  test("verify no regression on existing working cases", () => {
    // UNIT_ECONOMICS cases should still work
    const unitEconomicsTestCases = [
      { dimension: "financial_health", finding: "CAC rising, margin declining, payback extending" },
      { dimension: "operational_efficiency", finding: "Operations efficient at $12/unit" },
    ];

    const evidenceItems: EvidenceItem[] = unitEconomicsTestCases.map((tc, i) => ({
      id: `ev-${i}`,
      dimension: tc.dimension,
      finding: tc.finding,
      isCritical: i === 0,
    }));

    const synthesized = synthesizer.synthesizeEvidence(evidenceItems);
    const hypotheses = generator.generateHypotheses(synthesized, evidenceItems);

    expect(hypotheses.length).toBeGreaterThan(0);
    expect(hypotheses[0].rootCause).toBe(DiagnosisType.UNIT_ECONOMICS_BREAKDOWN);
    expect(hypotheses[0].confidence).toBeGreaterThanOrEqual(40);
  });
});
