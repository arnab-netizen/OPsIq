/**
 * Pure domain: derive verification windows from actual evidence rather than a fixed calendar.
 * Duration is the maximum of: hypothesis validation timing, cash runway, and break-even projection.
 * Failure criteria are derived from KPI thresholds and economic model constraints.
 */

export interface HypothesisTimingInput {
  expectedDurationDays: number | null;
  hypothesisType: string;
  requiresOwnerApproval: boolean;
}

export interface EconomicWindowInput {
  breakEvenMonths: number | null;
  cashRunwayMonths: number | null;
  spendingLimitCents: bigint | null;
  fixedMonthlyCostCents: number | null;
}

export interface KpiWindowInput {
  metricName: string;
  reviewCadence: string;  // DAILY | WEEKLY | FORTNIGHTLY | MONTHLY | QUARTERLY
  targetValue?: number | null;
}

export interface ValidationPlanWindowInput {
  experimentCount: number;
  safetyLimits: string[];
  stopConditions: string[];
}

export interface DeriveWindowsInput {
  ideaName: string;
  hypotheses: HypothesisTimingInput[];
  economics: EconomicWindowInput | null;
  kpis: KpiWindowInput[];
  validationPlan: ValidationPlanWindowInput | null;
  taskCount: number;
  ownerDecisionSpendingLimitCents?: bigint | null;
}

export interface DerivedVerificationWindow {
  windowLabel: string;
  durationDays: number;
  successCriteria: string[];
  failureCriteria: string[];
  metricsToMeasure: string[];
  derivationRationale: string;
  /** true when timing evidence is insufficient — owner must verify before treating window as authoritative */
  provisional: boolean;
  /** evidence that must be acquired before this window can be closed */
  evidenceRequired: string[];
  /** condition that should trigger reassessment of this window */
  reassessmentTrigger: string;
  /** 0-100 confidence in window duration accuracy based on available evidence */
  confidence: number;
}

const CADENCE_DAYS: Record<string, number> = {
  DAILY: 1,
  WEEKLY: 7,
  FORTNIGHTLY: 14,
  MONTHLY: 30,
  QUARTERLY: 90,
};

export function deriveVerificationWindows(
  input: DeriveWindowsInput
): DerivedVerificationWindow[] {
  const windows: DerivedVerificationWindow[] = [];

  // Window 1: Validation window — duration driven by hypotheses and validation plan
  const maxHypothesisDays = input.hypotheses
    .map((h) => h.expectedDurationDays ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);

  // At least 1 review cadence cycle per KPI
  const maxKpiCycleDays = input.kpis
    .map((k) => CADENCE_DAYS[k.reviewCadence] ?? 30)
    .reduce((a, b) => Math.max(a, b), 0);

  const validationDays = Math.max(
    maxHypothesisDays,
    maxKpiCycleDays,
    14   // minimum — at least 2 weeks to gather any evidence
  );

  const validationSuccessCriteria: string[] = [];
  const validationFailureCriteria: string[] = [];

  if (input.hypotheses.length > 0) {
    validationSuccessCriteria.push(
      `At least ${Math.ceil(input.hypotheses.length * 0.6)} of ${input.hypotheses.length} hypotheses confirmed`
    );
    validationFailureCriteria.push(
      `More than ${Math.floor(input.hypotheses.length * 0.5)} of ${input.hypotheses.length} hypotheses falsified`
    );
  }

  if (input.validationPlan) {
    if (input.validationPlan.stopConditions.length > 0) {
      validationFailureCriteria.push(...input.validationPlan.stopConditions);
    }
    if (input.validationPlan.safetyLimits.length > 0) {
      validationFailureCriteria.push(...input.validationPlan.safetyLimits.map((s) => `Safety limit triggered: ${s}`));
    }
    validationSuccessCriteria.push(
      `All ${input.validationPlan.experimentCount} experiments completed without stop condition`
    );
  }

  if (input.economics?.spendingLimitCents) {
    const limitFormatted = `$${(Number(input.economics.spendingLimitCents) / 100).toFixed(0)}`;
    validationFailureCriteria.push(`Spending exceeds ${limitFormatted} before validation complete`);
  }

  const hasTimingEvidence = input.hypotheses.length > 0 || input.kpis.length > 0 || input.validationPlan != null;
  const validationProvisional = !hasTimingEvidence;
  const validationConfidence = input.hypotheses.length > 0 && input.kpis.length > 0
    ? 85
    : input.hypotheses.length > 0
    ? 70
    : input.kpis.length > 0
    ? 55
    : 30;

  const validationEvidenceRequired: string[] = [];
  if (input.hypotheses.length === 0) validationEvidenceRequired.push("At least one testable hypothesis with expected duration");
  if (input.kpis.length === 0) validationEvidenceRequired.push("At least one measurable KPI with review cadence");
  // Only require validation plan when there is no other timing evidence at all
  if (input.validationPlan == null && input.hypotheses.length === 0 && input.kpis.length === 0) validationEvidenceRequired.push("Validation plan with experiment count and stop conditions");

  windows.push({
    windowLabel: `${input.ideaName} — Validation Window`,
    durationDays: validationDays,
    successCriteria:
      validationSuccessCriteria.length > 0
        ? validationSuccessCriteria
        : ["Validation experiments completed and results reviewed"],
    failureCriteria:
      validationFailureCriteria.length > 0
        ? validationFailureCriteria
        : ["No evidence acquired within window period"],
    metricsToMeasure: input.kpis.map((k) => k.metricName),
    derivationRationale: `${validationDays}d = max(hypothesisDays=${maxHypothesisDays}, kpiCycleDays=${maxKpiCycleDays}, minDays=14)`,
    provisional: validationProvisional,
    evidenceRequired: validationEvidenceRequired,
    reassessmentTrigger: "hypothesis_result_recorded_or_experiment_completed",
    confidence: validationConfidence,
  });

  // Window 2: Break-even window — only if economics provided
  if (input.economics?.breakEvenMonths != null && input.economics.breakEvenMonths > 0) {
    const breakEvenDays = Math.ceil(input.economics.breakEvenMonths * 30);
    const cashRunwayDays =
      input.economics.cashRunwayMonths != null
        ? Math.floor(input.economics.cashRunwayMonths * 30)
        : null;

    const beSuccessCriteria = [
      `Revenue covers all fixed and variable costs within ${input.economics.breakEvenMonths} months`,
      `Gross margin positive`,
    ];
    const beFailureCriteria = [
      `Break-even not achieved within ${input.economics.breakEvenMonths + 1} months`,
    ];

    if (cashRunwayDays != null && cashRunwayDays < breakEvenDays) {
      beFailureCriteria.push(
        `Cash runway (${input.economics.cashRunwayMonths} months) exhausted before break-even target`
      );
    }

    if (input.economics.fixedMonthlyCostCents) {
      const monthlyBurnFormatted = `$${(input.economics.fixedMonthlyCostCents / 100).toFixed(0)}/mo`;
      beSuccessCriteria.push(`Monthly burn (${monthlyBurnFormatted}) sustainably covered by revenue`);
    }

    windows.push({
      windowLabel: `${input.ideaName} — Break-Even Window`,
      durationDays: breakEvenDays,
      successCriteria: beSuccessCriteria,
      failureCriteria: beFailureCriteria,
      metricsToMeasure: ["revenue", "fixed_cost_coverage", "gross_margin", "cash_runway_months"],
      derivationRationale: `breakEvenMonths=${input.economics.breakEvenMonths} derived from economic model`,
      provisional: input.economics.fixedMonthlyCostCents == null,
      evidenceRequired: input.economics.fixedMonthlyCostCents == null
        ? ["Fixed monthly cost evidence required to validate break-even projection"]
        : [],
      reassessmentTrigger: "break_even_achieved_or_missed_or_economic_model_updated",
      confidence: input.economics.fixedMonthlyCostCents != null ? 75 : 50,
    });
  }

  // Window 3: Cash survival window — always add if runway known
  if (
    input.economics?.cashRunwayMonths != null &&
    input.economics.cashRunwayMonths > 0 &&
    input.economics.cashRunwayMonths <= 12
  ) {
    const runwayDays = Math.floor(input.economics.cashRunwayMonths * 30);
    windows.push({
      windowLabel: `${input.ideaName} — Cash Survival Window`,
      durationDays: runwayDays,
      successCriteria: [
        `Cash position positive through full ${input.economics.cashRunwayMonths}-month window`,
        "Revenue or injection covers ongoing burn",
      ],
      failureCriteria: [
        `Cash balance reaches zero`,
        `Working capital insufficient to fulfill next order/customer`,
      ],
      metricsToMeasure: ["cash_balance", "burn_rate", "working_capital_days", "cash_runway_months"],
      derivationRationale: `cashRunwayMonths=${input.economics.cashRunwayMonths} — owner must monitor survival throughout`,
      provisional: false,
      evidenceRequired: ["Actual cash balance and monthly burn rate — must be updated as spending occurs"],
      reassessmentTrigger: "cash_balance_drops_below_2_month_burn_or_revenue_injection_received",
      confidence: 80,
    });
  }

  return windows;
}
