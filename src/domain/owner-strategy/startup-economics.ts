/**
 * Startup economics engine — break-even, runway, unit economics.
 * All monetary values in BigInt cents. No floating point money.
 * Unknown cost inputs remain unknown — never default to zero.
 */

export interface EconomicInputs {
  startupCostCents: bigint | null;
  fixedMonthlyCostCents: bigint | null;
  variableUnitCostCents: bigint | null;
  pricePerUnitCents: bigint | null;
  cacCents: bigint | null;
  workingCapitalCents: bigint | null;
  paymentDelayDays: number | null;
  ownerLabourHoursPerWeek: number | null;
  capitalAvailableCents: bigint | null;
  cashRunwayMonthsAvailable: number | null;
}

export type EconomicClassification =
  | "VIABLE"
  | "MARGINAL"
  | "UNVIABLE"
  | "INSUFFICIENT_DATA";

export interface SensitivityScenario {
  unitsPerMonth: number;
  monthlyProfit: bigint | null;
}

export interface EconomicModelResult {
  grossMarginBps: number | null;
  breakEvenVolume: number | null;
  breakEvenMonths: number | null;
  cashRunwayMonths: number | null;
  classification: EconomicClassification;
  bindingCondition: string | null;
  unknownInputs: string[];
  sensitivityScenarios: {
    down: SensitivityScenario | null;
    expected: SensitivityScenario | null;
    up: SensitivityScenario | null;
  };
}

function computeBps(numerator: bigint, denominator: bigint): number | null {
  if (denominator === BigInt(0)) return null;
  return Number((numerator * BigInt(10000)) / denominator);
}

function scenarioProfit(
  units: number,
  pricePerUnit: bigint,
  variableUnitCost: bigint,
  fixedMonthly: bigint
): bigint {
  const revenue = pricePerUnit * BigInt(units);
  const cost = variableUnitCost * BigInt(units) + fixedMonthly;
  return revenue - cost;
}

export function buildEconomicModel(inputs: EconomicInputs): EconomicModelResult {
  const unknown: string[] = [];

  if (inputs.pricePerUnitCents == null) unknown.push("pricePerUnitCents");
  if (inputs.variableUnitCostCents == null) unknown.push("variableUnitCostCents");
  if (inputs.fixedMonthlyCostCents == null) unknown.push("fixedMonthlyCostCents");
  if (inputs.startupCostCents == null) unknown.push("startupCostCents");

  // Gross margin in basis points
  let grossMarginBps: number | null = null;
  if (inputs.pricePerUnitCents != null && inputs.variableUnitCostCents != null) {
    const contribution = inputs.pricePerUnitCents - inputs.variableUnitCostCents;
    grossMarginBps = computeBps(contribution, inputs.pricePerUnitCents);
  }

  // Break-even volume (units/month)
  let breakEvenVolume: number | null = null;
  if (
    inputs.fixedMonthlyCostCents != null &&
    inputs.pricePerUnitCents != null &&
    inputs.variableUnitCostCents != null
  ) {
    const unitContribution = inputs.pricePerUnitCents - inputs.variableUnitCostCents;
    if (unitContribution > BigInt(0)) {
      breakEvenVolume = Number(inputs.fixedMonthlyCostCents / unitContribution);
    }
    // If unitContribution <= 0, no break-even exists — leave null
  }

  // Break-even months (time to recoup startup cost)
  let breakEvenMonths: number | null = null;
  if (
    inputs.startupCostCents != null &&
    breakEvenVolume != null &&
    inputs.fixedMonthlyCostCents != null &&
    inputs.pricePerUnitCents != null &&
    inputs.variableUnitCostCents != null
  ) {
    const unitContribution = inputs.pricePerUnitCents - inputs.variableUnitCostCents;
    const earlyVolume = BigInt(Math.round(breakEvenVolume * 1.5));
    const avgMonthlyProfit = unitContribution * earlyVolume - inputs.fixedMonthlyCostCents;
    if (avgMonthlyProfit > BigInt(0)) {
      breakEvenMonths = Math.ceil(Number(inputs.startupCostCents / avgMonthlyProfit));
    }
  }

  // Cash runway
  let cashRunwayMonths: number | null = inputs.cashRunwayMonthsAvailable;
  if (
    cashRunwayMonths == null &&
    inputs.capitalAvailableCents != null &&
    inputs.fixedMonthlyCostCents != null &&
    inputs.fixedMonthlyCostCents > BigInt(0)
  ) {
    const availableCapital = inputs.workingCapitalCents
      ? inputs.capitalAvailableCents - inputs.workingCapitalCents
      : inputs.capitalAvailableCents;
    if (availableCapital > BigInt(0)) {
      cashRunwayMonths = Math.floor(Number(availableCapital / inputs.fixedMonthlyCostCents));
    }
  }

  // Sensitivity scenarios
  const makeScenario = (mult: number): SensitivityScenario | null => {
    if (breakEvenVolume == null) return null;
    const units = Math.round(breakEvenVolume * mult);
    if (
      inputs.pricePerUnitCents == null ||
      inputs.variableUnitCostCents == null ||
      inputs.fixedMonthlyCostCents == null
    ) {
      return { unitsPerMonth: units, monthlyProfit: null };
    }
    return {
      unitsPerMonth: units,
      monthlyProfit: scenarioProfit(
        units,
        inputs.pricePerUnitCents,
        inputs.variableUnitCostCents,
        inputs.fixedMonthlyCostCents
      ),
    };
  };

  const sensitivityScenarios = {
    down: makeScenario(0.5),
    expected: makeScenario(1.5),
    up: makeScenario(3),
  };

  // Classification
  let classification: EconomicClassification;
  let bindingCondition: string | null = null;

  if (unknown.length >= 2) {
    classification = "INSUFFICIENT_DATA";
    bindingCondition = `Missing critical inputs: ${unknown.join(", ")}`;
  } else if (grossMarginBps != null && grossMarginBps < 0) {
    classification = "UNVIABLE";
    bindingCondition = "Negative gross margin — unit economics unviable";
  } else if (
    cashRunwayMonths != null &&
    breakEvenMonths != null &&
    breakEvenMonths > cashRunwayMonths
  ) {
    classification = "UNVIABLE";
    bindingCondition = `Break-even (${breakEvenMonths}m) exceeds cash runway (${cashRunwayMonths}m)`;
  } else if (grossMarginBps != null && grossMarginBps < 2000) {
    classification = "MARGINAL";
    bindingCondition = `Low gross margin (${(grossMarginBps / 100).toFixed(1)}%) — vulnerable to cost increases`;
  } else if (unknown.length > 0) {
    classification = "INSUFFICIENT_DATA";
    bindingCondition = `Missing inputs: ${unknown.join(", ")}`;
  } else {
    classification = "VIABLE";
  }

  return {
    grossMarginBps,
    breakEvenVolume,
    breakEvenMonths,
    cashRunwayMonths,
    classification,
    bindingCondition,
    unknownInputs: unknown,
    sensitivityScenarios,
  };
}

export function classifyEconomicViability(result: EconomicModelResult): EconomicClassification {
  return result.classification;
}
