import type {
  DecisionMemo,
  RootCause,
  PrioritizedIntervention,
  Scenario,
  Constraint,
} from "@/domain/consulting-engine/types";
import { v4 as uuidv4 } from "uuid";
import { DiagnosisConfidence } from "@/domain/consulting-engine/types";

/**
 * Decision Memo Engine: Compiles diagnosis, interventions, and scenarios
 * into a structured decision memo for stakeholders.
 *
 * Format: Deterministic text generation from structured data.
 */

interface DecisionMemoInput {
  engagementId: string;
  businessProblem: string;
  diagnosis: RootCause;
  diagnosisConfidence: DiagnosisConfidence;
  constraints: Constraint[];
  interventions: PrioritizedIntervention[];
  scenarios: Scenario[];
  overallCoverage: string;
  criticalGaps: string[];
}

export function generateDecisionMemo(input: DecisionMemoInput): DecisionMemo {
  const now = new Date();

  // Identify critical path: interventions that must happen in sequence
  const criticalPath = input.interventions
    .slice(0, Math.ceil(input.interventions.length / 2))
    .map((i) => i.intervention.id);

  // Total duration is sum of critical path steps
  const totalDays = input.interventions
    .filter((i) => criticalPath.includes(i.intervention.id))
    .reduce((sum, i) => sum + i.intervention.estimatedTotalDays, 0);

  const limitations: string[] = [];

  // Confidence-based limitations
  if (input.diagnosisConfidence === DiagnosisConfidence.PROVISIONAL) {
    limitations.push(
      "Diagnosis confidence is PROVISIONAL. Recommend validation through initial quick wins before major capital investment."
    );
  }
  if (input.diagnosisConfidence === DiagnosisConfidence.INSUFFICIENT_EVIDENCE) {
    limitations.push(
      "Insufficient evidence for definitive diagnosis. Recommend phase 1 investigation before committing to full intervention plan."
    );
  }

  // Evidence-based limitations
  if (input.criticalGaps.length > 0) {
    limitations.push(
      `Evidence gaps limit precision: ${input.criticalGaps.join("; ")}`
    );
  }

  // Constraint-based limitations
  if (input.constraints.length > 0) {
    limitations.push(
      `${input.constraints.length} constraint(s) must be released before full execution: ${input.constraints.map((c) => c.description).join("; ")}`
    );
  }

  // Coverage limitations
  if (input.overallCoverage === "INSUFFICIENT") {
    limitations.push(
      "Evidence coverage is insufficient across business dimensions. Deeper investigation recommended before diagnosis finalization."
    );
  }

  // Identify next review triggers
  const nextReviewTriggers = [
    "After first intervention completion: validate assumptions, collect outcome data",
    "Monthly: Track KPIs (repeat customer rate, turnaround time, complaint count)",
    "If revenue does not improve by 20% within 60 days: pivot to alternative diagnosis",
    "If team capacity exhausted: pause non-critical interventions",
    "If external market changes significantly: reassess competitive positioning",
  ];

  const memo: DecisionMemo = {
    id: uuidv4(),
    engagementId: input.engagementId,
    timestamp: now,
    businessProblem: input.businessProblem,
    rootCauseDiagnosis: input.diagnosis,
    diagnosisConfidence: input.diagnosisConfidence,
    criticalConstraints: input.constraints,
    recommendedInterventions: input.interventions,
    scenarios: input.scenarios,
    implementation: {
      firstInterventionId: input.interventions[0]?.intervention.id || "",
      totalEstimatedDays: totalDays,
      criticalPathInterventions: criticalPath,
      contingencyRequired:
        input.constraints.length > 0 ||
        input.diagnosisConfidence === DiagnosisConfidence.PROVISIONAL,
    },
    limitations,
    nextReviewTriggers,
  };

  return memo;
}

export function formatDecisionMemo(memo: DecisionMemo): string {
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("                    DECISION MEMO");
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push(`Engagement: ${memo.engagementId}`);
  lines.push(`Prepared: ${memo.timestamp.toISOString().split("T")[0]}`);
  lines.push("");

  lines.push("## BUSINESS PROBLEM");
  lines.push(memo.businessProblem);
  lines.push("");

  lines.push("## ROOT CAUSE DIAGNOSIS");
  lines.push(`**Type**: ${memo.rootCauseDiagnosis.type}`);
  lines.push(`**Description**: ${memo.rootCauseDiagnosis.description}`);
  lines.push(`**Confidence**: ${memo.diagnosisConfidence}`);
  lines.push(`**Mechanism**: ${memo.rootCauseDiagnosis.mechanismDescription}`);
  if (memo.rootCauseDiagnosis.alternativeExplanations && memo.rootCauseDiagnosis.alternativeExplanations.length > 0) {
    lines.push(`**Alternative Explanations**:`);
    for (const alt of memo.rootCauseDiagnosis.alternativeExplanations) {
      lines.push(`  • ${alt}`);
    }
  }
  lines.push("");

  if (memo.criticalConstraints.length > 0) {
    lines.push("## CRITICAL CONSTRAINTS");
    for (const constraint of memo.criticalConstraints) {
      lines.push(
        `• [${constraint.severity}] ${constraint.description}`
      );
      lines.push(
        `  Blocks: ${constraint.blocksActions.join(", ")}`
      );
    }
    lines.push("");
  }

  lines.push("## RECOMMENDED INTERVENTIONS");
  for (let i = 0; i < memo.recommendedInterventions.length; i++) {
    const item = memo.recommendedInterventions[i];
    lines.push(`\n${i + 1}. **${item.intervention.title}** [Priority ${item.priorityScore}/100]`);
    lines.push(`   Class: ${item.intervention.class}`);
    lines.push(`   Duration: ${item.intervention.estimatedTotalDays} days`);
    lines.push(`   Owner: ${item.intervention.ownerRole}`);
    lines.push(`   ${item.sequencingReason}`);
  }
  lines.push("");

  lines.push("## IMPLEMENTATION PLAN");
  lines.push(`**First Intervention**: ${memo.implementation.firstInterventionId}`);
  lines.push(`**Total Duration**: ${memo.implementation.totalEstimatedDays} days`);
  lines.push(`**Critical Path**: ${memo.implementation.criticalPathInterventions.length} intervention(s)`);
  lines.push(
    `**Contingency Required**: ${memo.implementation.contingencyRequired ? "Yes" : "No"}`
  );
  lines.push("");

  if (memo.scenarios && memo.scenarios.length > 0) {
    lines.push("## SCENARIOS");
    for (const scenario of memo.scenarios) {
      lines.push(`\n**${scenario.name}** (${scenario.likelihood} likelihood)`);
      lines.push(`${scenario.description}`);
    }
    lines.push("");
  }

  if (memo.limitations.length > 0) {
    lines.push("## LIMITATIONS & CAVEATS");
    for (const limitation of memo.limitations) {
      lines.push(`⚠ ${limitation}`);
    }
    lines.push("");
  }

  if (memo.nextReviewTriggers.length > 0) {
    lines.push("## NEXT REVIEW TRIGGERS");
    for (const trigger of memo.nextReviewTriggers) {
      lines.push(`• ${trigger}`);
    }
    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════════");

  return lines.join("\n");
}
