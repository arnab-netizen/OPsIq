/**
 * Startup Readiness Assessment Engine (Phase 5).
 * Deterministic hard-gate evaluation — no critical failure hidden by averages.
 * Pure functions — no I/O.
 */
import type {
  StartupReadinessStatus,
  EconomicClassification,
} from "./startup-lifecycle";

export interface ReadinessInputs {
  // Evidence scores (0-100, null = unknown)
  problemEvidenceScore: number | null;
  customerEvidenceScore: number | null;
  wtpEvidenceScore: number | null;
  solutionFeasibilityScore: number | null;
  deliveryFeasibilityScore: number | null;
  acquisitionFeasibilityScore: number | null;

  // Economic (null = insufficient evidence)
  economicClassification: EconomicClassification | null;
  cashRunwayMonths: number | null;
  breakEvenMonths: number | null;

  // Resource
  capitalAvailableCents: bigint | null;
  requiredStartupCostCents: bigint | null;
  ownerHoursPerWeek: number | null;
  requiredHoursPerWeek: number | null;
  maxCurrentCapacity: number | null;
  minViableCapacity: number | null;

  // Regulatory
  missingLicences: string[];
  regulatoryEvidenceConfirmed: boolean;

  // Risk
  unresolvedCriticalRisks: number;
  riskRegisterConfidence: number | null; // 0-100

  // Execution plan
  executionPlanExists: boolean;
  measurementPlanExists: boolean;
  stopConditionsDefined: boolean;

  // Hypotheses
  confirmedHypotheses: number;
  rejectedHypotheses: number;
  totalHypotheses: number;
  pendingCriticalHypotheses: number;
}

export interface ReadinessGate {
  id: string;
  label: string;
  status: "PASSED" | "FAILED" | "UNKNOWN";
  isHard: boolean; // hard gates = cannot advance if failed
  score: number; // 0-100
  note: string;
}

export interface ReadinessAssessmentResult {
  // Individual dimension scores 0-100
  problemEvidenceScore: number;
  customerEvidenceScore: number;
  wtpEvidenceScore: number;
  solutionFeasibilityScore: number;
  deliveryFeasibilityScore: number;
  acquisitionFeasibilityScore: number;
  economicViabilityScore: number;
  cashSurvivalScore: number;
  resourceReadinessScore: number;
  regulatoryReadinessScore: number;
  riskReadinessScore: number;
  ownerCapacityScore: number;
  executionPlanScore: number;
  measurementPlanScore: number;
  stopConditionsScore: number;

  // Gates
  hardGateFailures: ReadinessGate[];
  passedGates: ReadinessGate[];
  failedGates: ReadinessGate[];
  unknownGates: ReadinessGate[];

  bindingConstraints: string[];
  evidenceGaps: string[];
  safeNextStep: string;
  readinessStatus: StartupReadinessStatus;
}

export function assessReadiness(inputs: ReadinessInputs): ReadinessAssessmentResult {
  const gates: ReadinessGate[] = buildGates(inputs);

  const hardGateFailures = gates.filter((g) => g.isHard && g.status === "FAILED");
  const passedGates = gates.filter((g) => g.status === "PASSED");
  const failedGates = gates.filter((g) => g.status === "FAILED");
  const unknownGates = gates.filter((g) => g.status === "UNKNOWN");

  // Dimension scores (coerce null to 0 for persistence, but keep as-is for classification)
  const problemEvidenceScore = inputs.problemEvidenceScore ?? 0;
  const customerEvidenceScore = inputs.customerEvidenceScore ?? 0;
  const wtpEvidenceScore = inputs.wtpEvidenceScore ?? 0;
  const solutionFeasibilityScore = inputs.solutionFeasibilityScore ?? 0;
  const deliveryFeasibilityScore = inputs.deliveryFeasibilityScore ?? 0;
  const acquisitionFeasibilityScore = inputs.acquisitionFeasibilityScore ?? 0;

  const economicViabilityScore = scoreEconomicViability(inputs.economicClassification);
  const cashSurvivalScore = scoreCashSurvival(inputs);
  const resourceReadinessScore = scoreResourceReadiness(inputs);
  const regulatoryReadinessScore = scoreRegulatoryReadiness(inputs);
  const riskReadinessScore = scoreRiskReadiness(inputs);
  const ownerCapacityScore = scoreOwnerCapacity(inputs);
  const executionPlanScore = inputs.executionPlanExists ? 100 : 0;
  const measurementPlanScore = inputs.measurementPlanExists ? 100 : 0;
  const stopConditionsScore = inputs.stopConditionsDefined ? 100 : 0;

  const bindingConstraints = hardGateFailures.map((g) => g.note);
  const evidenceGaps: string[] = [];
  if (inputs.problemEvidenceScore === null) evidenceGaps.push("Problem existence not evidenced");
  if (inputs.wtpEvidenceScore === null) evidenceGaps.push("Willingness-to-pay not evidenced");
  if (inputs.customerEvidenceScore === null) evidenceGaps.push("Customer segment not validated");
  if (!inputs.regulatoryEvidenceConfirmed) evidenceGaps.push("Regulatory requirements not confirmed");

  const readinessStatus = determineReadinessStatus(
    hardGateFailures,
    failedGates,
    unknownGates,
    inputs
  );

  const safeNextStep = buildSafeNextStep(readinessStatus, hardGateFailures, evidenceGaps, inputs);

  return {
    problemEvidenceScore,
    customerEvidenceScore,
    wtpEvidenceScore,
    solutionFeasibilityScore,
    deliveryFeasibilityScore,
    acquisitionFeasibilityScore,
    economicViabilityScore,
    cashSurvivalScore,
    resourceReadinessScore,
    regulatoryReadinessScore,
    riskReadinessScore,
    ownerCapacityScore,
    executionPlanScore,
    measurementPlanScore,
    stopConditionsScore,
    hardGateFailures,
    passedGates,
    failedGates,
    unknownGates,
    bindingConstraints,
    evidenceGaps,
    safeNextStep,
    readinessStatus,
  };
}

function buildGates(inputs: ReadinessInputs): ReadinessGate[] {
  const gates: ReadinessGate[] = [];

  // HARD GATE 1: Regulatory blockers
  if (inputs.missingLicences.length > 0) {
    gates.push({
      id: "regulatory_licence",
      label: "Regulatory Licences",
      status: "FAILED",
      isHard: true,
      score: 0,
      note: `Missing mandatory licence(s): ${inputs.missingLicences.join(", ")}`,
    });
  } else if (!inputs.regulatoryEvidenceConfirmed) {
    gates.push({
      id: "regulatory_licence",
      label: "Regulatory Licences",
      status: "UNKNOWN",
      isHard: true,
      score: 50,
      note: "Regulatory requirements not confirmed from authoritative source",
    });
  } else {
    gates.push({
      id: "regulatory_licence",
      label: "Regulatory Licences",
      status: "PASSED",
      isHard: true,
      score: 100,
      note: "Regulatory requirements confirmed",
    });
  }

  // HARD GATE 2: Cash survival
  if (
    inputs.cashRunwayMonths !== null &&
    inputs.breakEvenMonths !== null &&
    inputs.cashRunwayMonths < inputs.breakEvenMonths
  ) {
    gates.push({
      id: "cash_survival",
      label: "Cash Survival",
      status: "FAILED",
      isHard: true,
      score: 0,
      note: `Cash runway (${inputs.cashRunwayMonths.toFixed(1)} months) < break-even (${inputs.breakEvenMonths.toFixed(1)} months)`,
    });
  } else if (inputs.cashRunwayMonths === null) {
    gates.push({
      id: "cash_survival",
      label: "Cash Survival",
      status: "UNKNOWN",
      isHard: true,
      score: 50,
      note: "Cash runway cannot be computed without capital and cost data",
    });
  } else {
    gates.push({
      id: "cash_survival",
      label: "Cash Survival",
      status: "PASSED",
      isHard: true,
      score: 100,
      note: `Cash runway (${inputs.cashRunwayMonths.toFixed(1)} months) covers break-even period`,
    });
  }

  // HARD GATE 3: Owner capacity
  if (
    inputs.ownerHoursPerWeek !== null &&
    inputs.requiredHoursPerWeek !== null &&
    inputs.ownerHoursPerWeek < inputs.requiredHoursPerWeek * 0.8
  ) {
    gates.push({
      id: "owner_capacity",
      label: "Owner Capacity",
      status: "FAILED",
      isHard: true,
      score: 0,
      note: `Owner available hours (${inputs.ownerHoursPerWeek}h/week) insufficient for required (${inputs.requiredHoursPerWeek}h/week)`,
    });
  } else if (inputs.ownerHoursPerWeek === null) {
    gates.push({
      id: "owner_capacity",
      label: "Owner Capacity",
      status: "UNKNOWN",
      isHard: false,
      score: 50,
      note: "Owner available hours not specified",
    });
  } else {
    gates.push({
      id: "owner_capacity",
      label: "Owner Capacity",
      status: "PASSED",
      isHard: false,
      score: 100,
      note: "Owner has sufficient capacity",
    });
  }

  // HARD GATE 4: Unresolved critical risks
  if (inputs.unresolvedCriticalRisks > 0) {
    gates.push({
      id: "critical_risks",
      label: "Critical Risks",
      status: "FAILED",
      isHard: true,
      score: 0,
      note: `${inputs.unresolvedCriticalRisks} unresolved critical risk(s) — must be mitigated before launch`,
    });
  } else {
    gates.push({
      id: "critical_risks",
      label: "Critical Risks",
      status: "PASSED",
      isHard: true,
      score: 100,
      note: "No unresolved critical risks",
    });
  }

  // NON-HARD GATES
  gates.push(scoreGate("problem_evidence", "Problem Evidence", inputs.problemEvidenceScore, 60, false));
  gates.push(scoreGate("customer_evidence", "Customer Evidence", inputs.customerEvidenceScore, 60, false));
  gates.push(scoreGate("wtp_evidence", "Willingness to Pay", inputs.wtpEvidenceScore, 60, false));
  gates.push(scoreGate("solution_feasibility", "Solution Feasibility", inputs.solutionFeasibilityScore, 50, false));
  gates.push(scoreGate("delivery_feasibility", "Delivery Feasibility", inputs.deliveryFeasibilityScore, 50, false));
  gates.push(scoreGate("acquisition_feasibility", "Acquisition Feasibility", inputs.acquisitionFeasibilityScore, 50, false));

  // Rejected hypotheses gate
  if (inputs.rejectedHypotheses > 0 && inputs.totalHypotheses > 0) {
    const rejectionRate = inputs.rejectedHypotheses / inputs.totalHypotheses;
    if (rejectionRate > 0.3) {
      gates.push({
        id: "hypothesis_rejection_rate",
        label: "Hypothesis Validation",
        status: "FAILED",
        isHard: false,
        score: Math.round((1 - rejectionRate) * 100),
        note: `${inputs.rejectedHypotheses}/${inputs.totalHypotheses} hypotheses rejected — fundamental assumptions not supported`,
      });
    } else {
      gates.push({
        id: "hypothesis_rejection_rate",
        label: "Hypothesis Validation",
        status: "PASSED",
        isHard: false,
        score: 70,
        note: `${inputs.confirmedHypotheses} hypotheses confirmed`,
      });
    }
  }

  if (inputs.pendingCriticalHypotheses > 0) {
    gates.push({
      id: "pending_critical_hypotheses",
      label: "Pending Critical Hypotheses",
      status: "UNKNOWN",
      isHard: false,
      score: 50,
      note: `${inputs.pendingCriticalHypotheses} critical hypothesis(es) not yet validated`,
    });
  }

  return gates;
}

function scoreGate(
  id: string,
  label: string,
  score: number | null,
  threshold: number,
  isHard: boolean
): ReadinessGate {
  if (score === null) {
    return { id, label, status: "UNKNOWN", isHard, score: 0, note: `${label} score unknown` };
  }
  if (score < threshold) {
    return { id, label, status: "FAILED", isHard, score, note: `${label} score (${score}) below threshold (${threshold})` };
  }
  return { id, label, status: "PASSED", isHard, score, note: `${label} passed (${score}/100)` };
}

function scoreEconomicViability(classification: EconomicClassification | null): number {
  if (classification === null) return 0;
  const scores: Record<EconomicClassification, number> = {
    ECONOMICALLY_VIABLE: 100,
    POTENTIALLY_VIABLE: 70,
    VIABLE_ONLY_IF_ASSUMPTIONS_HOLD: 50,
    INSUFFICIENT_EVIDENCE: 20,
    UNVIABLE: 0,
    CASH_FLOW_UNSAFE: 0,
    RESOURCE_INFEASIBLE: 0,
  };
  return scores[classification] ?? 0;
}

function scoreCashSurvival(inputs: ReadinessInputs): number {
  if (inputs.cashRunwayMonths === null || inputs.breakEvenMonths === null) return 0;
  if (inputs.cashRunwayMonths < inputs.breakEvenMonths) return 0;
  const buffer = inputs.cashRunwayMonths / inputs.breakEvenMonths;
  return Math.min(100, Math.round(buffer * 50));
}

function scoreResourceReadiness(inputs: ReadinessInputs): number {
  if (
    inputs.maxCurrentCapacity !== null &&
    inputs.minViableCapacity !== null &&
    inputs.maxCurrentCapacity >= inputs.minViableCapacity
  ) {
    return 100;
  }
  if (inputs.maxCurrentCapacity === null) return 30;
  return 0;
}

function scoreRegulatoryReadiness(inputs: ReadinessInputs): number {
  if (inputs.missingLicences.length > 0) return 0;
  if (!inputs.regulatoryEvidenceConfirmed) return 30;
  return 100;
}

function scoreRiskReadiness(inputs: ReadinessInputs): number {
  if (inputs.unresolvedCriticalRisks > 0) return 0;
  if (inputs.riskRegisterConfidence === null) return 40;
  return inputs.riskRegisterConfidence;
}

function scoreOwnerCapacity(inputs: ReadinessInputs): number {
  if (inputs.ownerHoursPerWeek === null || inputs.requiredHoursPerWeek === null) return 50;
  const ratio = inputs.ownerHoursPerWeek / inputs.requiredHoursPerWeek;
  return Math.min(100, Math.round(ratio * 100));
}

function determineReadinessStatus(
  hardGateFailures: ReadinessGate[],
  failedGates: ReadinessGate[],
  unknownGates: ReadinessGate[],
  inputs: ReadinessInputs
): StartupReadinessStatus {
  if (hardGateFailures.length > 0) {
    if (hardGateFailures.some((g) => g.id === "regulatory_licence")) return "REJECT";
    if (hardGateFailures.some((g) => g.id === "cash_survival")) return "ON_HOLD";
    return "MODIFICATION_REQUIRED";
  }

  if (failedGates.length > 2) return "MORE_VALIDATION_REQUIRED";

  if (unknownGates.filter((g) => g.isHard).length > 0) return "MORE_VALIDATION_REQUIRED";

  const confirmedRatio =
    inputs.totalHypotheses > 0
      ? inputs.confirmedHypotheses / inputs.totalHypotheses
      : 0;

  if (confirmedRatio < 0.5) return "MORE_VALIDATION_REQUIRED";

  if (failedGates.length === 0 && unknownGates.length <= 1) {
    return "READY_FOR_OWNER_GO_DECISION";
  }

  if (failedGates.length <= 1 && unknownGates.length <= 2) {
    return "READY_FOR_LIMITED_PILOT";
  }

  return "MORE_VALIDATION_REQUIRED";
}

function buildSafeNextStep(
  status: StartupReadinessStatus,
  hardGateFailures: ReadinessGate[],
  evidenceGaps: string[],
  inputs: ReadinessInputs
): string {
  if (status === "READY_FOR_OWNER_GO_DECISION") {
    return "All critical gates passed. Present to owner for GO/NO-GO decision.";
  }
  if (status === "READY_FOR_LIMITED_PILOT") {
    return "Sufficient for a limited pilot. Define pilot scope, budget, and stop conditions before launch.";
  }
  if (hardGateFailures.length > 0) {
    return `Resolve hard gate failures first: ${hardGateFailures.map((g) => g.note).join("; ")}`;
  }
  if (evidenceGaps.length > 0) {
    return `Gather required evidence: ${evidenceGaps[0]}. Run pending validation experiments.`;
  }
  return "Run remaining validation experiments and resolve evidence gaps before re-assessing readiness.";
}
