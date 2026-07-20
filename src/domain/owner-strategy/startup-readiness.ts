/**
 * Startup readiness gate assessment — hard gates cannot be hidden by averaging.
 * A single BLOCKED hard gate = BLOCKED status, regardless of other scores.
 */

export type ReadinessStatus = "READY" | "CONDITIONALLY_READY" | "NOT_READY" | "BLOCKED";

export interface ReadinessInputs {
  problemEvidenceCount: number;
  customerEvidenceCount: number;
  wtpEvidenceCount: number;
  deliveryTrialCompleted: boolean;
  acquisitionChannelTested: boolean;
  economicClassification: "VIABLE" | "MARGINAL" | "UNVIABLE" | "INSUFFICIENT_DATA" | null;
  cashRunwayMonths: number | null;
  breakEvenMonths: number | null;
  supplierQuoteObtained: boolean;
  regulatoryCheckCompleted: boolean;
  licenceRequired: boolean | null;
  licenceObtained: boolean | null;
  ownerHoursAvailable: number | null;
  capitalAvailableCents: bigint | null;
  startupCostCents: bigint | null;
  criticalHypothesesPassed: number;
  criticalHypothesesFailed: number;
}

export interface ReadinessAssessment {
  scores: {
    problemEvidence: number;
    customerEvidence: number;
    wtpEvidence: number;
    solutionFeasibility: number;
    deliveryFeasibility: number;
    economicViability: number;
    cashSurvival: number;
    resourceReadiness: number;
    regulatoryReadiness: number;
    ownerCapacity: number;
  };
  hardGateFailures: string[];
  passedGates: string[];
  failedGates: string[];
  evidenceGaps: string[];
  bindingConstraints: string[];
  safeNextStep: string;
  status: ReadinessStatus;
}

function cap(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function assessReadiness(inputs: ReadinessInputs): ReadinessAssessment {
  const hardGateFailures: string[] = [];
  const passedGates: string[] = [];
  const failedGates: string[] = [];
  const evidenceGaps: string[] = [];
  const bindingConstraints: string[] = [];

  // ── Scores ──────────────────────────────────────────────────────────────

  const problemEvidence = cap((inputs.problemEvidenceCount / 5) * 100);
  const customerEvidence = cap((inputs.customerEvidenceCount / 10) * 100);
  const wtpEvidence = cap((inputs.wtpEvidenceCount / 5) * 100);
  const solutionFeasibility = inputs.deliveryTrialCompleted ? 80 : 20;
  const deliveryFeasibility = inputs.acquisitionChannelTested ? 70 : 20;

  const economicViability =
    inputs.economicClassification === "VIABLE" ? 90
    : inputs.economicClassification === "MARGINAL" ? 50
    : inputs.economicClassification === "UNVIABLE" ? 0
    : 30;

  const cashSurvival =
    inputs.cashRunwayMonths == null ? 30
    : inputs.cashRunwayMonths < 3 ? 0
    : inputs.cashRunwayMonths < 6 ? 50
    : 80;

  let resourceReadiness = 50;
  if (inputs.supplierQuoteObtained) resourceReadiness += 30;
  if (
    inputs.capitalAvailableCents != null &&
    inputs.startupCostCents != null &&
    inputs.capitalAvailableCents >= inputs.startupCostCents
  ) resourceReadiness += 20;
  resourceReadiness = cap(resourceReadiness);

  const regulatoryReadiness =
    !inputs.regulatoryCheckCompleted ? 20
    : inputs.licenceRequired === true && inputs.licenceObtained !== true ? 10
    : 90;

  const ownerCapacity =
    inputs.ownerHoursAvailable == null ? 40
    : inputs.ownerHoursAvailable < 10 ? 10
    : inputs.ownerHoursAvailable < 20 ? 60
    : 90;

  // ── Hard gate checks ─────────────────────────────────────────────────────

  // Gate 1: Cash survival
  if (cashSurvival === 0) {
    hardGateFailures.push("CASH_SURVIVAL: Runway below 3 months — launch unsafe");
    failedGates.push("cash_survival");
  } else {
    passedGates.push("cash_survival");
  }

  // Gate 2: Economic viability
  if (inputs.economicClassification === "UNVIABLE") {
    hardGateFailures.push("ECONOMIC_VIABILITY: Unit economics unviable — negative gross margin");
    failedGates.push("economic_viability");
  } else if (inputs.economicClassification === "INSUFFICIENT_DATA") {
    evidenceGaps.push("Economic model inputs incomplete — cannot confirm viability");
    failedGates.push("economic_data_complete");
  } else {
    passedGates.push("economic_viability");
  }

  // Gate 3: Regulatory
  if (inputs.licenceRequired === true && inputs.licenceObtained !== true) {
    hardGateFailures.push("REGULATORY: Licence required but not obtained — launch blocked");
    failedGates.push("regulatory_clearance");
  } else if (!inputs.regulatoryCheckCompleted) {
    evidenceGaps.push("Regulatory check not completed");
    failedGates.push("regulatory_checked");
  } else {
    passedGates.push("regulatory_clearance");
  }

  // Gate 4: Owner capacity
  if (inputs.ownerHoursAvailable != null && inputs.ownerHoursAvailable < 10) {
    hardGateFailures.push("OWNER_CAPACITY: Fewer than 10h/week available — insufficient for launch");
    failedGates.push("owner_capacity");
  } else {
    passedGates.push("owner_capacity");
  }

  // Gate 5: Critical hypothesis failures
  if (inputs.criticalHypothesesFailed > 0) {
    hardGateFailures.push(
      `HYPOTHESIS_FAILED: ${inputs.criticalHypothesesFailed} critical hypothesis(es) disconfirmed`
    );
    failedGates.push("critical_hypotheses");
  } else if (inputs.criticalHypothesesPassed >= 3) {
    passedGates.push("critical_hypotheses");
  }

  // Gate 6: Break-even vs runway
  if (
    inputs.cashRunwayMonths != null &&
    inputs.breakEvenMonths != null &&
    inputs.breakEvenMonths > inputs.cashRunwayMonths
  ) {
    hardGateFailures.push(
      `CASH_FLOW_TIMING: Break-even (${inputs.breakEvenMonths}m) exceeds runway (${inputs.cashRunwayMonths}m)`
    );
    failedGates.push("cash_flow_timing");
  } else {
    passedGates.push("cash_flow_timing");
  }

  // Evidence gaps
  if (inputs.problemEvidenceCount < 3) evidenceGaps.push("Insufficient problem evidence (need ≥3 records)");
  if (inputs.customerEvidenceCount < 5) evidenceGaps.push("Insufficient customer evidence (need ≥5 interviews)");
  if (inputs.wtpEvidenceCount < 3) evidenceGaps.push("Insufficient WTP evidence (need ≥3 signals)");

  // Status determination — hard gates override everything
  let status: ReadinessStatus;
  if (hardGateFailures.length > 0) {
    status = "BLOCKED";
    bindingConstraints.push(...hardGateFailures);
  } else if (failedGates.length > 0 || evidenceGaps.length > 2) {
    status = "NOT_READY";
  } else if (evidenceGaps.length > 0) {
    status = "CONDITIONALLY_READY";
  } else {
    status = "READY";
  }

  const safeNextStep =
    status === "BLOCKED"
      ? `Resolve hard gate failures before proceeding: ${hardGateFailures[0]}`
      : status === "NOT_READY"
      ? `Address failed gates: ${failedGates.join(", ")}`
      : status === "CONDITIONALLY_READY"
      ? `Fill evidence gaps: ${evidenceGaps[0]}`
      : "All gates passed — ready for owner decision";

  return {
    scores: {
      problemEvidence,
      customerEvidence,
      wtpEvidence,
      solutionFeasibility,
      deliveryFeasibility,
      economicViability,
      cashSurvival,
      resourceReadiness,
      regulatoryReadiness,
      ownerCapacity,
    },
    hardGateFailures,
    passedGates,
    failedGates,
    evidenceGaps,
    bindingConstraints,
    safeNextStep,
    status,
  };
}
