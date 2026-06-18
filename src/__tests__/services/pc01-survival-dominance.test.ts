import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import { ConfidenceLevel, DiagnosisType, type EvidenceItem } from "@/domain/consulting-engine/types";

/**
 * Survival-dominance diagnosis selection (PC-01). When cash/liquidity is ALREADY a
 * matched candidate at HIGH/MODERATE confidence and the evidence shows CRITICAL survival
 * pressure (≤3-month runway / payroll / insolvency / cash-shortfall), it beats a matched
 * OPTIMIZATION diagnosis (retention/demand/gtm/pricing/margin) for primary. Selection
 * only — it never creates a cash match, never changes a trigger threshold. Runs through
 * the real diagnoseRootCause. No case ids / hidden keys / answer-key text.
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

describe("PC-01 survival dominance", () => {
  it("cash survival (3-month runway) beats a matched retention diagnosis", () => {
    expect(
      primary([
        ev("financial_health", "Cash runway is three months and obligations are fixed in the near term", true, { cashRunwayMonths: 3 }),
        ev("customer_retention", "Churn is rising at eight percent with weak onboarding driving it", true, { churnPct: 8 }),
        ev("customer_retention", "Repeat rate is slipping among recent cohorts", true, { repeatRatePct: 40 }),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("cash survival beats a matched demand-generation (growth/marketing) diagnosis", () => {
    expect(
      primary([
        ev("financial_health", "Cash runway is only two months with no committed financing", true, { cashRunwayMonths: 2 }),
        ev("market_position", "New-customer acquisition has stalled and lead volume collapsed", true, { newCustomerRate: 6, leadVolume: 80 }),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("a normal retention issue WITHOUT survival pressure stays retention", () => {
    expect(
      primary([
        ev("customer_retention", "Churn is rising and repeat rate is low among recent cohorts", true, { churnPct: 9, repeatRatePct: 38 }),
        ev("customer_retention", "One-time buyers dominate with no follow-up", true, { repeatRatePct: 35 }),
      ])
    ).toBe(DiagnosisType.CUSTOMER_RETENTION_EROSION);
  });

  it("does NOT create a cash diagnosis when the cash pattern is not matched (retention + comfortable runway)", () => {
    const t = primary([
      ev("customer_retention", "Churn is rising and repeat rate is low among recent cohorts", true, { churnPct: 9, repeatRatePct: 38 }),
      ev("financial_health", "Cash runway is a comfortable eighteen months", false, { cashRunwayMonths: 18 }),
    ]);
    expect(t).toBe(DiagnosisType.CUSTOMER_RETENTION_EROSION);
    expect(t).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("a healthy long cash reserve does not trigger cash dominance", () => {
    expect(
      primary([
        ev("financial_health", "Cash reserves are healthy with a long runway", true, { cashRunwayMonths: 24 }),
        ev("customer_retention", "Churn is rising at eight percent among recent cohorts", true, { churnPct: 8, repeatRatePct: 40 }),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("survival pressure does NOT demote a non-optimization diagnosis (debt stays primary)", () => {
    // debt_solvency_pressure is NOT an optimization diagnosis; survival dominance must
    // not reorder it even when a short runway co-exists.
    const t = primary([
      ev("financial_health", "Covenant headroom is thin and a refinancing window looms; debt service is heavy", true, { covenantHeadroom: 0.04, interestCoverage: 1.1, cashRunwayMonths: 3 }),
    ]);
    expect(t).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});
