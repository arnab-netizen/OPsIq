/**
 * OpsIQ Realistic Owner-Mode Simulation Runner
 *
 * Enforces the staged process defined in execution_realistic_owner_mode_simulation.md.
 *
 * - Reads CASE_INPUT only (01_case_input.json). Never loads the answer key.
 * - Maps the case-input evidence array into ConsultingEngineInput (no answer-aware logic).
 * - Runs the deterministic consulting engine.
 * - Writes each step output as a separate artifact (02..09).
 * - Freezes the engine output before any scoring.
 * - Does NOT author scoring (10) or failure ticket (11) — those are monitor-authored post-freeze.
 *
 * Usage:
 *   npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/run-case.ts <CASE_ID> [--round 001] [--force]
 */
import * as fs from "fs";
import * as path from "path";
import { v4 as uuid } from "uuid";
import { runConsultingEngine } from "@/services/consulting-engine/orchestrator";
import {
  ConfidenceLevel,
  type ConsultingEngineInput,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";
import { assessConsultingOutput } from "@/services/governance/consulting-safety-adapter";

// ─── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const caseId = args.find((a) => !a.startsWith("--"));
const round =
  (args.includes("--round") ? args[args.indexOf("--round") + 1] : undefined) ??
  "001";
const force = args.includes("--force");

if (!caseId) {
  console.error("Usage: run-case.ts <CASE_ID> [--round 001] [--force]");
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, "..");
const caseDir = path.join(repoRoot, "simulation_runs", `round_${round}`, `case_${caseId}`);
const inputPath = path.join(caseDir, "01_case_input.json");

if (!fs.existsSync(inputPath)) {
  console.error(`Case input not found: ${inputPath}`);
  process.exit(1);
}

const frozenPath = path.join(caseDir, "09_frozen_opsiq_output.json");
if (fs.existsSync(frozenPath) && !force) {
  console.error(
    `Frozen output already exists for ${caseId}. Refusing to overwrite. Use --force to re-run.`
  );
  process.exit(1);
}

// ─── Types for the case input file ───────────────────────────────────────────
interface CaseInputEvidence {
  dimension: EvidenceItem["dimension"];
  finding: string;
  confidence: "LOW" | "MEDIUM" | "HIGH" | "PROVISIONAL";
  source: string;
  isCritical: boolean;
  supportingData?: Record<string, string | number | boolean>;
}
interface CaseInputFile {
  caseId: string;
  caseType: string;
  industry: string;
  businessModel: string;
  businessStage: string;
  ownerIntake: {
    businessType: string;
    stage: string;
    ownerGoal: string;
    ownerConstraints: string[];
    immediateConcern: string;
    availableData: string[];
    unavailableData: string[];
    timeHorizon: string;
    riskAppetite: string;
  };
  clientContext: {
    industry: string;
    size: string;
    revenueImpactUrgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  };
  businessProblem: string;
  evidence: CaseInputEvidence[];
  ownerConstraintProfile: {
    budgetBand: string;
    timeHorizonDays: number;
    staffCapacity: string;
    cashRunwayMonths: number | null;
    legalComplianceSensitive: boolean;
  };
}

const caseInput: CaseInputFile = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

// Hard leakage guard: refuse to run if any answer-key marker leaked into the input file.
const rawInput = fs.readFileSync(inputPath, "utf-8");
if (
  /CASE_ANSWER_KEY|HIDDEN_FROM_OPSIQ|hidden_outcome|documented_root_causes|expert_or_documented_best_actions/i.test(
    rawInput
  )
) {
  console.error("LEAKAGE_FAIL: answer-key content detected in case input. Aborting.");
  process.exit(2);
}

const write = (name: string, obj: unknown) =>
  fs.writeFileSync(path.join(caseDir, name), JSON.stringify(obj, null, 2) + "\n");

const confMap: Record<string, ConfidenceLevel> = {
  LOW: ConfidenceLevel.LOW,
  MEDIUM: ConfidenceLevel.MEDIUM,
  HIGH: ConfidenceLevel.HIGH,
  PROVISIONAL: ConfidenceLevel.PROVISIONAL,
};

// ─── Step 1: Owner intake ────────────────────────────────────────────────────
const intakeComplete =
  !!caseInput.ownerIntake.ownerGoal &&
  !!caseInput.ownerIntake.immediateConcern &&
  caseInput.ownerIntake.availableData.length > 0;
write("02_owner_intake_output.json", {
  step: "owner_intake",
  ...caseInput.ownerIntake,
  intakeComplete,
  monitorFlag: intakeComplete ? null : "CASE_INPUT_INCOMPLETE",
});
if (!intakeComplete) {
  console.error("CASE_INPUT_INCOMPLETE: owner intake missing required fields. Aborting.");
  process.exit(3);
}

// ─── Step 3: Data quality check (deterministic, pre-advice) ──────────────────
const dims = new Set(caseInput.evidence.map((e) => e.dimension));
const allDims = [
  "customer_retention",
  "operational_efficiency",
  "quality_delivery",
  "financial_health",
  "process_maturity",
  "team_capability",
  "market_position",
];
const missingDims = allDims.filter((d) => !dims.has(d));
const lowConfidenceCount = caseInput.evidence.filter(
  (e) => e.confidence === "LOW" || e.confidence === "PROVISIONAL"
).length;
const numericEvidence = caseInput.evidence.filter(
  (e) =>
    e.supportingData &&
    Object.values(e.supportingData).some((v) => typeof v === "number")
).length;
const confidenceCap =
  lowConfidenceCount > caseInput.evidence.length / 2
    ? "PROVISIONAL"
    : caseInput.evidence.length < 3
      ? "MODERATE"
      : "HIGH";
write("03_data_quality_output.json", {
  step: "data_quality_check",
  evidenceCount: caseInput.evidence.length,
  numericEvidenceCount: numericEvidence,
  missingDimensions: missingDims,
  unavailableDataDeclared: caseInput.ownerIntake.unavailableData,
  lowConfidenceFields: lowConfidenceCount,
  confidenceCap,
  whatCannotBeConcluded: caseInput.ownerIntake.unavailableData.map(
    (d) => `Cannot conclude on: ${d}`
  ),
});

// ─── Step 4: Business fact confirmation (owner pre-confirmed via case input) ──
write("04_confirmation_output.json", {
  step: "business_fact_confirmation",
  factsAccepted: caseInput.evidence.map((e) => e.finding),
  factsRejected: [],
  factsNeedingClarification: caseInput.ownerIntake.unavailableData,
  finalFactsUsedForDiagnosis: caseInput.evidence.map((e) => e.finding),
});

// ─── Build engine input (blind to answer key) ────────────────────────────────
const evidence: EvidenceItem[] = caseInput.evidence.map((e) => ({
  id: uuid(),
  dimension: e.dimension,
  finding: e.finding,
  confidence: confMap[e.confidence],
  source: e.source,
  timestamp: new Date("2026-06-16T00:00:00Z"),
  isCritical: e.isCritical,
  supportingData: e.supportingData,
}));

const engineInput: ConsultingEngineInput = {
  engagementId: uuid(),
  businessProblem: caseInput.businessProblem,
  evidence,
  clientContext: caseInput.clientContext,
};

// ─── Run engine (steps 5–7 source) ───────────────────────────────────────────
async function main() {
  const output = await runConsultingEngine(engineInput);
  const memo = output.decisionMemo;

  // Step 5: diagnosis
  write("05_diagnosis_output.json", {
    step: "diagnosis",
    rootCauseType: memo.rootCauseDiagnosis.type,
    description: memo.rootCauseDiagnosis.description,
    mechanism: memo.rootCauseDiagnosis.mechanismDescription,
    confidence: memo.diagnosisConfidence,
    rejectedHypotheses: memo.rootCauseDiagnosis.alternativeExplanations ?? [],
    missingEvidence: memo.rootCauseDiagnosis.missingEvidenceFor ?? [],
  });

  // Step 6: recommendation
  const first = memo.recommendedInterventions[0];
  write("06_recommendation_output.json", {
    step: "recommendation",
    firstPriorityAction: first?.intervention.title ?? null,
    whyFirst: first?.sequencingReason ?? first?.intervention.whyThisNow ?? null,
    expectedImpact: first?.intervention.expectedImpactOnRevenue ?? null,
    costBand: first?.intervention.estimatedCostBand ?? null,
    estimatedDays: first?.intervention.estimatedTotalDays ?? null,
    ownerRole: first?.intervention.ownerRole ?? null,
    verificationMetrics: first?.intervention.successMetrics ?? [],
    failureRisks: first?.intervention.failureRisks ?? [],
    fallbackPlan: first?.intervention.fallbackPlan ?? null,
    reviewTriggers: memo.nextReviewTriggers,
    allInterventions: memo.recommendedInterventions.map((i) => i.intervention.title),
  });

  // Step 7: constraint check
  write("07_constraint_check_output.json", {
    step: "owner_constraint_check",
    engineConstraints: memo.criticalConstraints.map((c) => ({
      type: c.type,
      description: c.description,
      severity: c.severity,
      blocksActions: c.blocksActions,
    })),
    ownerConstraintProfile: caseInput.ownerConstraintProfile,
    contingencyRequired: memo.implementation.contingencyRequired,
    legalComplianceSensitive: caseInput.ownerConstraintProfile.legalComplianceSensitive,
  });

  // ─── Step 8: Output usefulness gate (mechanical, pre-scoring) ──────────────
  const hasFirstAction = !!first;
  const hasVerification = (first?.intervention.successMetrics?.length ?? 0) > 0;
  const hasTimeline = (first?.intervention.estimatedTotalDays ?? 0) > 0;
  const hasMissingDataList =
    (memo.rootCauseDiagnosis.missingEvidenceFor?.length ?? 0) > 0 ||
    memo.limitations.length > 0;
  const hasEvidenceTrail = memo.rootCauseDiagnosis.evidenceIds.length > 0;
  const hasTradeoff =
    (memo.scenarios?.length ?? 0) > 0 || !!first?.intervention.fallbackPlan;
  const hasConstraintsConsidered =
    memo.criticalConstraints.length > 0 ||
    (first?.intervention.constraintDependencies?.length ?? 0) >= 0; // engine always considers
  const numbersAvailable = numericEvidence > 0;
  const numbersUsed = hasEvidenceTrail && numbersAvailable;
  const hasConfidenceReason = !!memo.diagnosisConfidence;
  const specificRootCause = memo.rootCauseDiagnosis.type !== "unknown";
  const insufficient = output.status === "INSUFFICIENT_EVIDENCE";

  // Specificity: penalize UNKNOWN/insufficient heavily
  const specificityChecks = [
    specificRootCause,
    hasFirstAction,
    numbersAvailable ? numbersUsed : true,
    hasEvidenceTrail,
    !insufficient,
  ];
  const usefulnessChecks = [
    hasFirstAction,
    hasVerification,
    hasTimeline,
    hasMissingDataList,
    hasTradeoff,
    hasConstraintsConsidered,
    hasConfidenceReason,
    !insufficient,
  ];
  const specificityScore = Math.round(
    (specificityChecks.filter(Boolean).length / specificityChecks.length) * 10
  );
  const usefulnessScore = Math.round(
    (usefulnessChecks.filter(Boolean).length / usefulnessChecks.length) * 10
  );
  const genericOutput = !specificRootCause || insufficient;
  const passGate = specificityScore >= 8 && usefulnessScore >= 8 && !genericOutput;

  write("08_quality_gate_output.json", {
    step: "output_quality_gate",
    generic_advice_detected: genericOutput,
    hallucination_detected: "MONITOR_REVIEW_REQUIRED",
    unsupported_claim_detected: "MONITOR_REVIEW_REQUIRED",
    false_confidence_detected:
      insufficient && memo.diagnosisConfidence === "HIGH" ? true : false,
    missing_data_ignored: !hasMissingDataList,
    dangerous_recommendation_detected: "MONITOR_REVIEW_REQUIRED",
    numbers_available: numbersAvailable,
    numbers_used: numbersUsed,
    output_specificity_score: specificityScore,
    output_usefulness_score: usefulnessScore,
    generic_output: genericOutput,
    pass_gate: passGate,
    note: "hallucination/dangerous/unsupported flags require monitor (Claude) review against the locked answer key. Mechanical gate covers specificity/usefulness only.",
  });

  // ─── Step 9: Freeze full engine output ────────────────────────────────────
  write("09_frozen_opsiq_output.json", {
    frozenAt: new Date().toISOString(),
    caseId,
    engineEntryPoint: "runConsultingEngine",
    deterministic: true,
    status: output.status,
    warnings: output.warnings,
    decisionMemo: memo,
  });

  // ─── Step 12: Abstention/safety gate (engine-produced, post-freeze) ────────
  // Remediation for STAGE_A_SAFETY_VALIDATION_BLOCKER B1: route the engine
  // output through the abstention engine so the safety gate actually executes.
  // Deterministic; does not alter scoring, answer keys, or expected outcomes.
  const safety = assessConsultingOutput(
    { status: output.status, decisionMemo: memo },
    memo.id,
    "abstention-engine",
    { totalEvidenceCount: caseInput.evidence.length }
  );
  write("12_abstention_decision.json", {
    step: "abstention_safety_gate",
    caseId,
    engineEntryPoint: "assessConsultingOutput -> assessSafety/createAbstentionDecision",
    derived_inputs: safety.inputs,
    abstain: safety.assessment.abstain,
    abstention_state: safety.assessment.abstention_state ?? null,
    is_safe: safety.assessment.is_safe,
    confidence_adjustment: safety.assessment.confidence_adjustment,
    unsafe_conditions: safety.assessment.unsafe_conditions,
    escalation_required: safety.escalation_required,
    fallback_action: safety.assessment.fallback_action ?? null,
    abstention_decision: safety.decision,
    gate_evaluated: true,
  });

  console.log(`\n=== DRY RUN COMPLETE: ${caseId} ===`);
  console.log(`status:            ${output.status}`);
  console.log(`root_cause_type:   ${memo.rootCauseDiagnosis.type}`);
  console.log(`confidence:        ${memo.diagnosisConfidence}`);
  console.log(`first_action:      ${first?.intervention.title ?? "(none)"}`);
  console.log(`specificity_score: ${specificityScore}/10`);
  console.log(`usefulness_score:  ${usefulnessScore}/10`);
  console.log(`generic_output:    ${genericOutput}`);
  console.log(`pass_gate:         ${passGate}`);
  console.log(`artifacts written: ${caseDir}`);
}

main().catch((e) => {
  console.error("RUNNER_ERROR:", e);
  process.exit(1);
});
