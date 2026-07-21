/**
 * Startup explainability engine — derives explanation from same inputs as other engines.
 * Pure — no DB, no I/O. Builds a reproducible explanation from deterministic inputs.
 */

export interface StartupExplanationInputs {
  sessionId: string;
  ideaId: string | null;
  ideaName: string | null;
  screeningStatus: string | null;
  screeningReasons: string[];
  economicClassification: string | null;
  breakEvenMonths: number | null;
  cashRunwayMonths: number | null;
  readinessStatus: string | null;
  hardGateFailures: string[];
  failedGates: string[];
  passedGates: string[];
  evidenceGaps: string[];
  bindingConstraints: string[];
  hypothesesConfirmed: number;
  hypothesesFailed: number;
  hypothesesTotal: number;
  rejectedAlternativeIds: string[];
  rejectedAlternativeNames: string[];
  closestAlternativeName: string | null;
  systemRecommendation: string | null;  // GO | MODIFY | HOLD | REJECT | MORE_VALIDATION_REQUIRED
  systemRationale: string | null;
  unknownInputs: string[];
  whatWouldChangeRecommendation: string | null;
  evidenceIds: string[];  // IDs of evidence relied upon
  profileVersionId: string | null;
  inputSnapshotVersion: string;  // deterministic fingerprint of inputs
}

export interface StartupExplanation {
  decisionRef: string;       // canonical ref for ExplainabilityRecord lookup
  decisionType: string;      // "STARTUP_SYSTEM_RECOMMENDATION"
  recommendation: string;
  rationale: string;
  evidenceReliedUpon: string[];
  assumptions: string[];
  unknowns: string[];
  bindingConstraints: string[];
  rejectedAlternatives: Array<{ id: string; name: string; reason: string }>;
  whyRecommendationWon: string;
  whatEvidenceOrChangeWouldAlterIt: string;
  confidence: number;        // 0-100
  confidenceLevel: string;   // HIGH | MEDIUM | LOW | VERY_LOW
  factorsUsed: Array<{ factor: string; value: string; weight: string; direction: string }>;
  dataPoints: Array<{ metric: string; value: string; source: string }>;
  inputSnapshot: StartupExplanationInputs;
}

function computeConfidence(inputs: StartupExplanationInputs): number {
  let score = 50;
  if (inputs.hypothesesTotal > 0) {
    const confirmRate = inputs.hypothesesConfirmed / inputs.hypothesesTotal;
    score = Math.round(confirmRate * 60 + 20);
  }
  if (inputs.evidenceIds.length >= 5) score = Math.min(100, score + 10);
  if (inputs.unknownInputs.length > 3) score = Math.max(0, score - 15);
  if (inputs.hardGateFailures.length > 0) score = Math.min(score, 30);
  if (inputs.economicClassification === "VIABLE") score = Math.min(100, score + 10);
  if (inputs.economicClassification === "UNVIABLE") score = Math.max(0, score - 20);
  return Math.max(0, Math.min(100, score));
}

function confidenceLevel(score: number): string {
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  if (score >= 25) return "LOW";
  return "VERY_LOW";
}

export function buildStartupExplanation(inputs: StartupExplanationInputs): StartupExplanation {
  const confidence = computeConfidence(inputs);
  const level = confidenceLevel(confidence);

  const factorsUsed: StartupExplanation["factorsUsed"] = [
    { factor: "screening_status", value: inputs.screeningStatus ?? "UNKNOWN", weight: "HIGH", direction: inputs.screeningStatus === "PASSED" ? "POSITIVE" : "NEGATIVE" },
    { factor: "economic_classification", value: inputs.economicClassification ?? "UNKNOWN", weight: "HIGH", direction: inputs.economicClassification === "VIABLE" ? "POSITIVE" : inputs.economicClassification === "UNVIABLE" ? "NEGATIVE" : "NEUTRAL" },
    { factor: "readiness_status", value: inputs.readinessStatus ?? "UNKNOWN", weight: "HIGH", direction: inputs.readinessStatus === "READY" ? "POSITIVE" : inputs.readinessStatus === "BLOCKED" ? "NEGATIVE" : "NEUTRAL" },
    { factor: "hypotheses_confirmed", value: String(inputs.hypothesesConfirmed), weight: "MEDIUM", direction: inputs.hypothesesConfirmed > 0 ? "POSITIVE" : "NEUTRAL" },
    { factor: "hypotheses_failed", value: String(inputs.hypothesesFailed), weight: "MEDIUM", direction: inputs.hypothesesFailed > 0 ? "NEGATIVE" : "NEUTRAL" },
    { factor: "hard_gate_failures", value: String(inputs.hardGateFailures.length), weight: "CRITICAL", direction: inputs.hardGateFailures.length > 0 ? "NEGATIVE" : "NEUTRAL" },
    { factor: "evidence_count", value: String(inputs.evidenceIds.length), weight: "MEDIUM", direction: inputs.evidenceIds.length >= 3 ? "POSITIVE" : "NEGATIVE" },
    { factor: "unknown_inputs", value: String(inputs.unknownInputs.length), weight: "MEDIUM", direction: inputs.unknownInputs.length === 0 ? "POSITIVE" : "NEGATIVE" },
  ];

  const dataPoints: StartupExplanation["dataPoints"] = [
    { metric: "break_even_months", value: inputs.breakEvenMonths != null ? String(inputs.breakEvenMonths) : "UNKNOWN", source: "economic_model" },
    { metric: "cash_runway_months", value: inputs.cashRunwayMonths != null ? String(inputs.cashRunwayMonths) : "UNKNOWN", source: "economic_model" },
    { metric: "passed_gates", value: String(inputs.passedGates.length), source: "readiness_assessment" },
    { metric: "failed_gates", value: String(inputs.failedGates.length), source: "readiness_assessment" },
  ];

  const assumptions = inputs.bindingConstraints.length === 0
    ? ["Capital is sufficient for execution", "Owner time is available as declared"]
    : inputs.bindingConstraints.map((c) => `Binding constraint noted: ${c}`);

  const rejectedAlternatives = inputs.rejectedAlternativeIds.map((id, idx) => ({
    id,
    name: inputs.rejectedAlternativeNames[idx] ?? id,
    reason: inputs.screeningReasons[0] ?? "Did not pass screening or arbitration",
  }));

  const recommendation = inputs.systemRecommendation ?? "UNKNOWN";
  const rationale = inputs.systemRationale ?? buildRationale(inputs);

  const whyWon = inputs.closestAlternativeName
    ? `${inputs.ideaName ?? "This idea"} ranked ahead of ${inputs.closestAlternativeName} because it scored higher on risk-adjusted arbitration across screening, economics, and readiness dimensions.`
    : `${inputs.ideaName ?? "This idea"} is the only viable candidate.`;

  const whatWouldChange = inputs.whatWouldChangeRecommendation
    ?? (inputs.unknownInputs.length > 0
      ? `Resolving unknown inputs would change recommendation: ${inputs.unknownInputs.join("; ")}`
      : `Collecting additional evidence or resolving binding constraints (${inputs.bindingConstraints.join(", ") || "none identified"}) would alter this recommendation.`);

  return {
    decisionRef: `startup:${inputs.sessionId}:${inputs.ideaId ?? "session"}`,
    decisionType: "STARTUP_SYSTEM_RECOMMENDATION",
    recommendation,
    rationale,
    evidenceReliedUpon: inputs.evidenceIds,
    assumptions,
    unknowns: inputs.unknownInputs,
    bindingConstraints: inputs.bindingConstraints,
    rejectedAlternatives,
    whyRecommendationWon: whyWon,
    whatEvidenceOrChangeWouldAlterIt: whatWouldChange,
    confidence,
    confidenceLevel: level,
    factorsUsed,
    dataPoints,
    inputSnapshot: inputs,
  };
}

function buildRationale(inputs: StartupExplanationInputs): string {
  if (inputs.hardGateFailures.length > 0) {
    return `Hard gate failures prevent recommendation: ${inputs.hardGateFailures.join(", ")}. Resolve these before any GO decision.`;
  }
  if (inputs.screeningStatus === "REJECTED") {
    return `Idea did not pass initial screening: ${inputs.screeningReasons.join("; ") || "screening criteria not met"}.`;
  }
  if (inputs.readinessStatus === "READY" && inputs.economicClassification === "VIABLE") {
    return `Idea passed all readiness gates with a viable economic model. Sufficient evidence supports a GO decision.`;
  }
  if (inputs.readinessStatus === "CONDITIONALLY_READY") {
    return `Idea is conditionally ready. Address evidence gaps: ${inputs.evidenceGaps.join("; ") || "none specified"}.`;
  }
  if (inputs.economicClassification === "INSUFFICIENT_DATA") {
    return `Economic model cannot be evaluated — insufficient inputs. Collect: ${inputs.unknownInputs.join(", ") || "cost and pricing data"}.`;
  }
  return `Assessment based on ${inputs.hypothesesConfirmed} confirmed hypotheses, ${inputs.passedGates.length} passed gates, and ${inputs.evidenceIds.length} evidence records.`;
}
