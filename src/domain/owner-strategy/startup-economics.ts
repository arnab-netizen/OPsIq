/**
 * Startup Economic Feasibility Engine (Phase 5).
 * Safe BigInt cents arithmetic — no floating-point money.
 * Pure functions — no I/O.
 */
import type { EconomicClassification } from "./startup-lifecycle";

export interface EconomicInputs {
  startupCostCents: bigint | null;
  fixedMonthlyCostCents: bigint | null;
  variableUnitCostCents: bigint | null;
  pricePerUnitCents: bigint | null;
  cacCents: bigint | null;
  deliveryCostCents: bigint | null;
  refundAllowanceCents: bigint | null;
  workingCapitalCents: bigint | null;
  paymentDelayDays: number | null;
  ownerLabourHoursPerWeek: number | null;
  hiredLabourCostCents: bigint | null;
  capitalAvailableCents: bigint | null;
  monthlySurvivalNeedCents: bigint | null;
  minViableCapacity: number | null; // units/month
  maxCurrentCapacity: number | null; // units/month
}

export interface EconomicModelResult {
  grossContributionCents: bigint | null;
  grossMarginBps: number | null; // basis points; null if price unknown
  totalMonthlyCostCents: bigint | null;
  breakEvenVolume: number | null;
  breakEvenMonths: number | null;
  cashRunwayMonths: number | null;
  totalInitialOutlayCents: bigint | null;
  sensitivityScenarios: {
    down: ScenarioResult;
    expected: ScenarioResult;
    up: ScenarioResult;
  } | null;
  economicClassification: EconomicClassification;
  bindingCondition: string;
  unknownInputs: string[];
}

export interface ScenarioResult {
  label: "down" | "expected" | "up";
  priceMultiplier: number;
  volumeMultiplier: number;
  monthlyRevenueCents: bigint | null;
  monthlyProfitCents: bigint | null;
  breakEvenMonths: number | null;
  cashRunwayMonths: number | null;
  classification: EconomicClassification;
}

export interface BreakEvenResult {
  breakEvenVolume: number | null;
  breakEvenMonths: number | null;
  reason: string;
}

export interface CashRunwayResult {
  cashRunwayMonths: number | null;
  monthlyBurnCents: bigint | null;
  reason: string;
}

export function buildEconomicModel(inputs: EconomicInputs): EconomicModelResult {
  const unknownInputs: string[] = [];

  if (inputs.pricePerUnitCents === null) unknownInputs.push("price_per_unit");
  if (inputs.variableUnitCostCents === null) unknownInputs.push("variable_unit_cost");
  if (inputs.fixedMonthlyCostCents === null) unknownInputs.push("fixed_monthly_cost");
  if (inputs.startupCostCents === null) unknownInputs.push("startup_cost");
  if (inputs.capitalAvailableCents === null) unknownInputs.push("capital_available");

  // Gross contribution per unit (null if either is unknown)
  const grossContributionCents =
    inputs.pricePerUnitCents !== null && inputs.variableUnitCostCents !== null
      ? inputs.pricePerUnitCents -
        inputs.variableUnitCostCents -
        (inputs.deliveryCostCents ?? BigInt(0)) -
        (inputs.refundAllowanceCents ?? BigInt(0))
      : null;

  // Gross margin bps
  const grossMarginBps =
    grossContributionCents !== null && inputs.pricePerUnitCents !== null && inputs.pricePerUnitCents > BigInt(0)
      ? Number((grossContributionCents * BigInt(10000)) / inputs.pricePerUnitCents)
      : null;

  // Total monthly fixed cost
  const totalMonthlyCostCents =
    inputs.fixedMonthlyCostCents !== null
      ? inputs.fixedMonthlyCostCents + (inputs.hiredLabourCostCents ?? BigInt(0))
      : null;

  // Break-even
  const { breakEvenVolume, breakEvenMonths } = computeBreakEven({
    grossContributionCents,
    totalMonthlyCostCents,
    minViableCapacity: inputs.minViableCapacity,
  });

  // Cash runway
  const { cashRunwayMonths } = computeCashRunway({
    capitalAvailableCents: inputs.capitalAvailableCents,
    startupCostCents: inputs.startupCostCents,
    workingCapitalCents: inputs.workingCapitalCents,
    totalMonthlyCostCents,
    monthlySurvivalNeedCents: inputs.monthlySurvivalNeedCents,
    breakEvenMonths,
  });

  // Total initial outlay
  const totalInitialOutlayCents =
    inputs.startupCostCents !== null
      ? inputs.startupCostCents +
        (inputs.workingCapitalCents ?? BigInt(0)) +
        (inputs.cacCents ?? BigInt(0))
      : null;

  // Sensitivity scenarios (only if we have enough data)
  const sensitivityScenarios =
    inputs.pricePerUnitCents !== null &&
    inputs.variableUnitCostCents !== null &&
    inputs.fixedMonthlyCostCents !== null
      ? buildSensitivityScenarios(inputs, grossContributionCents!, totalMonthlyCostCents!)
      : null;

  // Classification
  const { economicClassification, bindingCondition } = classifyEconomicViability({
    unknownInputs,
    grossMarginBps,
    breakEvenMonths,
    cashRunwayMonths,
    grossContributionCents,
    totalMonthlyCostCents,
    inputs,
  });

  return {
    grossContributionCents,
    grossMarginBps,
    totalMonthlyCostCents,
    breakEvenVolume,
    breakEvenMonths,
    cashRunwayMonths,
    totalInitialOutlayCents,
    sensitivityScenarios,
    economicClassification,
    bindingCondition,
    unknownInputs,
  };
}

export function computeBreakEven(opts: {
  grossContributionCents: bigint | null;
  totalMonthlyCostCents: bigint | null;
  minViableCapacity: number | null;
}): BreakEvenResult {
  const { grossContributionCents, totalMonthlyCostCents, minViableCapacity } = opts;

  if (grossContributionCents === null || totalMonthlyCostCents === null) {
    return {
      breakEvenVolume: null,
      breakEvenMonths: null,
      reason: "Cannot compute break-even: price or cost unknown",
    };
  }

  if (grossContributionCents <= BigInt(0)) {
    return {
      breakEvenVolume: null,
      breakEvenMonths: null,
      reason: "Gross contribution is zero or negative — break-even is impossible",
    };
  }

  const breakEvenVolumeFloat =
    Number(totalMonthlyCostCents) / Number(grossContributionCents);

  if (
    minViableCapacity !== null &&
    breakEvenVolumeFloat > minViableCapacity
  ) {
    return {
      breakEvenVolume: breakEvenVolumeFloat,
      breakEvenMonths: null,
      reason: `Break-even volume (${breakEvenVolumeFloat.toFixed(1)}) exceeds minimum viable capacity (${minViableCapacity})`,
    };
  }

  // Months to break-even assuming linear ramp from 0 to break-even volume
  const breakEvenMonths = minViableCapacity
    ? breakEvenVolumeFloat / minViableCapacity
    : null;

  return {
    breakEvenVolume: breakEvenVolumeFloat,
    breakEvenMonths,
    reason: "Computed from gross contribution and fixed costs",
  };
}

export function computeCashRunway(opts: {
  capitalAvailableCents: bigint | null;
  startupCostCents: bigint | null;
  workingCapitalCents: bigint | null;
  totalMonthlyCostCents: bigint | null;
  monthlySurvivalNeedCents: bigint | null;
  breakEvenMonths: number | null;
}): CashRunwayResult {
  const {
    capitalAvailableCents,
    startupCostCents,
    workingCapitalCents,
    totalMonthlyCostCents,
    monthlySurvivalNeedCents,
    breakEvenMonths,
  } = opts;

  if (capitalAvailableCents === null) {
    return {
      cashRunwayMonths: null,
      monthlyBurnCents: null,
      reason: "Cannot compute cash runway: capital available unknown",
    };
  }

  const initialOutlay =
    (startupCostCents ?? BigInt(0)) + (workingCapitalCents ?? BigInt(0));
  const capitalAfterStartup = capitalAvailableCents - initialOutlay;

  if (capitalAfterStartup < BigInt(0)) {
    return {
      cashRunwayMonths: 0,
      monthlyBurnCents: totalMonthlyCostCents,
      reason: "Startup outlay exceeds available capital — zero runway",
    };
  }

  const monthlyBurnCents =
    (totalMonthlyCostCents ?? BigInt(0)) + (monthlySurvivalNeedCents ?? BigInt(0));

  if (monthlyBurnCents <= BigInt(0)) {
    return {
      cashRunwayMonths: null,
      monthlyBurnCents: BigInt(0),
      reason: "Monthly burn unknown or zero — runway cannot be computed",
    };
  }

  const cashRunwayMonths =
    Number(capitalAfterStartup) / Number(monthlyBurnCents);

  const isSafe =
    breakEvenMonths === null || cashRunwayMonths >= breakEvenMonths * 1.2;

  return {
    cashRunwayMonths,
    monthlyBurnCents,
    reason: isSafe
      ? `Cash runway (${cashRunwayMonths.toFixed(1)} months) is sufficient to reach break-even`
      : `Cash runway (${cashRunwayMonths.toFixed(1)} months) may be insufficient to reach break-even (${breakEvenMonths?.toFixed(1)} months needed + 20% buffer)`,
  };
}

function buildSensitivityScenarios(
  inputs: EconomicInputs,
  grossContributionCents: bigint,
  totalMonthlyCostCents: bigint
): EconomicModelResult["sensitivityScenarios"] {
  const scenarios: Array<{
    label: "down" | "expected" | "up";
    priceMultiplier: number;
    volumeMultiplier: number;
  }> = [
    { label: "down", priceMultiplier: 0.8, volumeMultiplier: 0.6 },
    { label: "expected", priceMultiplier: 1.0, volumeMultiplier: 1.0 },
    { label: "up", priceMultiplier: 1.1, volumeMultiplier: 1.3 },
  ];

  const capacity = inputs.maxCurrentCapacity ?? 10;

  return {
    down: buildScenario(scenarios[0], inputs, grossContributionCents, totalMonthlyCostCents, capacity),
    expected: buildScenario(scenarios[1], inputs, grossContributionCents, totalMonthlyCostCents, capacity),
    up: buildScenario(scenarios[2], inputs, grossContributionCents, totalMonthlyCostCents, capacity),
  };
}

function buildScenario(
  scenario: { label: "down" | "expected" | "up"; priceMultiplier: number; volumeMultiplier: number },
  inputs: EconomicInputs,
  baseGrossContributionCents: bigint,
  totalMonthlyCostCents: bigint,
  capacity: number
): ScenarioResult {
  const adjustedContributionCents = BigInt(
    Math.round(Number(baseGrossContributionCents) * scenario.priceMultiplier)
  );
  const adjustedVolume = Math.round(capacity * scenario.volumeMultiplier);
  const monthlyRevenueCents =
    inputs.pricePerUnitCents !== null
      ? BigInt(Math.round(Number(inputs.pricePerUnitCents) * scenario.priceMultiplier * adjustedVolume))
      : null;
  const monthlyProfitCents =
    adjustedContributionCents > BigInt(0)
      ? adjustedContributionCents * BigInt(adjustedVolume) - totalMonthlyCostCents
      : null;

  const breakEvenVol =
    adjustedContributionCents > BigInt(0)
      ? Number(totalMonthlyCostCents) / Number(adjustedContributionCents)
      : null;
  const breakEvenMonths =
    breakEvenVol !== null && adjustedVolume > 0
      ? breakEvenVol / adjustedVolume
      : null;

  const cashRunwayMonths =
    inputs.capitalAvailableCents !== null && inputs.startupCostCents !== null
      ? Number(inputs.capitalAvailableCents - inputs.startupCostCents) /
        (Number(totalMonthlyCostCents) + Number(inputs.monthlySurvivalNeedCents ?? BigInt(0)))
      : null;

  const classification = classifyScenario(
    monthlyProfitCents,
    breakEvenMonths,
    cashRunwayMonths,
    adjustedContributionCents
  );

  return {
    label: scenario.label,
    priceMultiplier: scenario.priceMultiplier,
    volumeMultiplier: scenario.volumeMultiplier,
    monthlyRevenueCents,
    monthlyProfitCents,
    breakEvenMonths,
    cashRunwayMonths,
    classification,
  };
}

function classifyScenario(
  monthlyProfitCents: bigint | null,
  breakEvenMonths: number | null,
  cashRunwayMonths: number | null,
  grossContributionCents: bigint
): EconomicClassification {
  if (grossContributionCents <= BigInt(0)) return "UNVIABLE";
  if (cashRunwayMonths !== null && breakEvenMonths !== null && cashRunwayMonths < breakEvenMonths) {
    return "CASH_FLOW_UNSAFE";
  }
  if (monthlyProfitCents !== null && monthlyProfitCents > BigInt(0)) return "ECONOMICALLY_VIABLE";
  if (monthlyProfitCents !== null && monthlyProfitCents <= BigInt(0)) return "UNVIABLE";
  return "INSUFFICIENT_EVIDENCE";
}

function classifyEconomicViability(opts: {
  unknownInputs: string[];
  grossMarginBps: number | null;
  breakEvenMonths: number | null;
  cashRunwayMonths: number | null;
  grossContributionCents: bigint | null;
  totalMonthlyCostCents: bigint | null;
  inputs: EconomicInputs;
}): { economicClassification: EconomicClassification; bindingCondition: string } {
  const { unknownInputs, grossMarginBps, breakEvenMonths, cashRunwayMonths, grossContributionCents, inputs } = opts;

  if (unknownInputs.length >= 2) {
    return {
      economicClassification: "INSUFFICIENT_EVIDENCE",
      bindingCondition: `Missing inputs: ${unknownInputs.join(", ")}`,
    };
  }

  // Check resource feasibility
  if (
    inputs.maxCurrentCapacity !== null &&
    inputs.minViableCapacity !== null &&
    inputs.maxCurrentCapacity < inputs.minViableCapacity
  ) {
    return {
      economicClassification: "RESOURCE_INFEASIBLE",
      bindingCondition: `Current capacity (${inputs.maxCurrentCapacity}) below minimum viable (${inputs.minViableCapacity})`,
    };
  }

  // Cash flow safety
  if (
    cashRunwayMonths !== null &&
    breakEvenMonths !== null &&
    cashRunwayMonths < breakEvenMonths
  ) {
    return {
      economicClassification: "CASH_FLOW_UNSAFE",
      bindingCondition: `Cash runway (${cashRunwayMonths.toFixed(1)} months) < break-even (${breakEvenMonths.toFixed(1)} months)`,
    };
  }

  if (grossContributionCents !== null && grossContributionCents <= BigInt(0)) {
    return {
      economicClassification: "UNVIABLE",
      bindingCondition: "Gross contribution is zero or negative — business model does not generate profit per unit",
    };
  }

  if (grossMarginBps !== null && grossMarginBps < 1000) {
    return {
      economicClassification: "UNVIABLE",
      bindingCondition: `Gross margin (${grossMarginBps / 100}%) too thin to sustain operations`,
    };
  }

  if (unknownInputs.length === 1) {
    return {
      economicClassification: "VIABLE_ONLY_IF_ASSUMPTIONS_HOLD",
      bindingCondition: `Viability assumes ${unknownInputs[0]} is within acceptable range`,
    };
  }

  // Capital sufficiency check
  if (inputs.capitalAvailableCents !== null && inputs.startupCostCents !== null) {
    const survivalBuffer = (inputs.monthlySurvivalNeedCents ?? BigInt(0)) * BigInt(3);
    const required = inputs.startupCostCents + (inputs.workingCapitalCents ?? BigInt(0)) + survivalBuffer;
    if (inputs.capitalAvailableCents < required) {
      return {
        economicClassification: "CASH_FLOW_UNSAFE",
        bindingCondition: "Available capital insufficient to cover startup cost + 3-month survival buffer",
      };
    }
  }

  if (grossMarginBps !== null && grossMarginBps >= 3000) {
    return {
      economicClassification: "ECONOMICALLY_VIABLE",
      bindingCondition: "Positive gross margin, sufficient capital, and viable break-even trajectory",
    };
  }

  return {
    economicClassification: "POTENTIALLY_VIABLE",
    bindingCondition: "Economic model shows potential but requires validation of key assumptions",
  };
}
