import type {
  ConsultingEngineInput,
  ConsultingEngineOutput,
  EvidenceItem,
  Constraint,
} from "@/domain/consulting-engine/types";
import { ConsultingEngineOutputSchema } from "@/domain/consulting-engine/types";
import { analyzeEvidence } from "./evidence-engine";
import { identifyConstraints } from "./constraint-engine";
import { diagnoseRootCause } from "./diagnosis-engine";
import { designInterventions } from "./intervention-design-engine";
import { prioritizeInterventions } from "./prioritization-engine";
import { generateScenarios } from "./scenario-engine";
import { generateDecisionMemo, formatDecisionMemo } from "./decision-memo-engine";
import { DiagnosisConfidence } from "@/domain/consulting-engine/types";

/**
 * Consulting Engine Orchestrator: Coordinates all engines in logical sequence
 *
 * Pipeline:
 * 1. Evidence Analysis → validate and categorize
 * 2. Constraint Identification → what blocks execution?
 * 3. Diagnosis → identify root cause(s)
 * 4. Intervention Design → generate intervention options
 * 5. Prioritization → rank by impact and feasibility
 * 6. Scenario Generation → create execution alternatives
 * 7. Decision Memo → compile recommendation
 *
 * Deterministic: pure orchestration of deterministic engines.
 */

export async function runConsultingEngine(
  input: ConsultingEngineInput
): Promise<ConsultingEngineOutput> {
  // Step 1: Analyze evidence
  const evidenceAnalysis = analyzeEvidence(input.evidence);

  // Step 2: Identify constraints
  const constraintAnalysis = identifyConstraints(
    input.evidence,
    {
      industryRequiresCapital: ["retail", "manufacturing", "hospitality"].includes(
        input.clientContext.industry.toLowerCase()
      ),
      businessSize: input.clientContext.size,
    }
  );

  // Step 3: Diagnose root cause
  const diagnosisResult = diagnoseRootCause(
    input.evidence,
    input.businessProblem
  );

  // Step 4: Design interventions
  const interventions = designInterventions(
    diagnosisResult.primaryRootCause,
    input.evidence
  );

  // Step 5: Prioritize interventions
  const prioritizedInterventions = prioritizeInterventions(
    interventions,
    {
      revenueUrgency: input.clientContext.revenueImpactUrgency,
      executionCapacity:
        input.clientContext.size === "micro"
          ? "LOW"
          : input.clientContext.size === "small"
            ? "MEDIUM"
            : "HIGH",
      constraints: constraintAnalysis.identifiedConstraints,
    }
  );

  // Step 6: Generate scenarios
  const scenarios = generateScenarios(
    prioritizedInterventions,
    constraintAnalysis.identifiedConstraints
  );

  // Step 7: Compile decision memo
  const decisionMemo = generateDecisionMemo({
    engagementId: input.engagementId,
    businessProblem: input.businessProblem,
    diagnosis: diagnosisResult.primaryRootCause,
    diagnosisConfidence: diagnosisResult.confidence,
    constraints: constraintAnalysis.identifiedConstraints,
    interventions: prioritizedInterventions,
    scenarios,
    overallCoverage: evidenceAnalysis.overallCoverage,
    criticalGaps: evidenceAnalysis.criticalEvidenceGaps,
  });

  // Determine status
  let status: "SUCCESS" | "PROVISIONAL" | "INSUFFICIENT_EVIDENCE";
  if (diagnosisResult.confidence === DiagnosisConfidence.INSUFFICIENT_EVIDENCE) {
    status = "INSUFFICIENT_EVIDENCE";
  } else if (diagnosisResult.confidence === DiagnosisConfidence.PROVISIONAL) {
    status = "PROVISIONAL";
  } else {
    status = "SUCCESS";
  }

  const warnings: string[] = [];
  if (evidenceAnalysis.criticalEvidenceGaps.length > 0) {
    warnings.push(
      `Evidence gaps: ${evidenceAnalysis.criticalEvidenceGaps.join("; ")}`
    );
  }
  if (diagnosisResult.warningFlags.length > 0) {
    warnings.push(...diagnosisResult.warningFlags);
  }
  if (constraintAnalysis.identifiedConstraints.length > 0) {
    warnings.push(
      `${constraintAnalysis.identifiedConstraints.length} constraint(s) identified that may block execution`
    );
  }

  const output: ConsultingEngineOutput = {
    decisionMemo,
    status,
    warnings,
  };

  // Validate output structure
  const validation = ConsultingEngineOutputSchema.safeParse(output);
  if (!validation.success) {
    throw new Error(`Invalid output structure: ${validation.error.message}`);
  }

  return output;
}

/**
 * Format consulting output as text for display/logging
 */
export function formatConsultingOutput(output: ConsultingEngineOutput): string {
  const sections: string[] = [];

  sections.push(`Status: ${output.status}\n`);

  if (output.warnings.length > 0) {
    sections.push("Warnings:");
    for (const warning of output.warnings) {
      sections.push(`  ⚠ ${warning}`);
    }
    sections.push("");
  }

  sections.push(formatDecisionMemo(output.decisionMemo));

  return sections.join("\n");
}

export { formatDecisionMemo };
