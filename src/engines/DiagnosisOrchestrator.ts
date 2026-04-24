import {
  Engine,
  BusinessAssessment,
  OrchestratedDiagnosis,
  EngineSignal,
  EngineResult,
} from "./contracts";
import { mapSeverityToDiagnosticPhase, type DiagnosticInterventionPhase } from "@/domain/constants/diagnostic-phases";

/**
 * DiagnosisOrchestrator
 * Synthesizes outputs from multiple engines into a unified diagnostic recommendation
 * Engines vote on severity and category; orchestrator resolves conflicts and determines diagnostic phase
 *
 * CRITICAL: This produces a diagnostic recommendation, NOT an engagement lifecycle state.
 * The diagnosticInterventionPhase is separate from the engagement's operational phase.
 */

export class DiagnosisOrchestrator {
  constructor(private engines: Engine[]) {}

  async orchestrate(input: BusinessAssessment): Promise<OrchestratedDiagnosis> {
    // Run all engines in parallel
    const engineResults = await Promise.all(
      this.engines.map((engine) => engine.assess(input))
    );

    // Aggregate signals
    const allSignals = engineResults.flatMap((result) => result.signals);
    const allIssues = engineResults.flatMap((result) => result.issues);

    // Synthesize severity (maximum severity weighted by confidence)
    const severity = this.synthesizeSeverity(allSignals);

    // Synthesize category (most common category among high-confidence signals)
    const category = this.synthesizeCategory(allSignals, input.mainIssue);

    // Determine diagnostic phase (separate from engagement lifecycle phase)
    const recommendedDiagnosticPhase = mapSeverityToDiagnosticPhase(severity);

    // Calculate diagnostic confidence
    const diagnosticConfidence = this.calculateDiagnosticConfidence(
      allSignals,
      engineResults
    );

    return {
      severity,
      category,
      recommendedDiagnosticPhase,
      signals: allSignals,
      allEngineResults: engineResults,
      issues: [...new Set(allIssues)], // Deduplicate
      diagnosticConfidence,
    };
  }

  private synthesizeSeverity(
    signals: EngineSignal[]
  ): "low" | "medium" | "high" | "critical" {
    if (!signals.length) return "medium";

    const severityOrder = ["low", "medium", "high", "critical"];
    let maxSeverity = "low";
    let maxScore = 0;

    for (const severity of severityOrder) {
      const score = signals
        .filter((s) => s.severity === severity)
        .reduce((sum, s) => sum + s.confidence, 0);

      if (score > maxScore) {
        maxScore = score;
        maxSeverity = severity;
      }
    }

    return maxSeverity as "low" | "medium" | "high" | "critical";
  }

  private synthesizeCategory(
    signals: EngineSignal[],
    userReportedIssue: string
  ): string {
    // Build category vote based on high-confidence signals
    const categoryVotes: Record<string, number> = {};

    signals.forEach((signal) => {
      if (signal.category && signal.confidence >= 0.7) {
        categoryVotes[signal.category] =
          (categoryVotes[signal.category] || 0) + signal.confidence;
      }
    });

    // If engines strongly recommend a category, use it
    const topCategory = Object.entries(categoryVotes).sort(
      ([, a], [, b]) => b - a
    )[0];

    if (topCategory && topCategory[1] > 1.5) {
      return topCategory[0];
    }

    // Otherwise, use user-reported issue as tiebreaker
    const categoryMap: Record<string, string> = {
      low_sales: "revenue_generation",
      high_costs: "cost_control",
      cash_flow: "cash_flow_stability",
      customer_retention: "customer_retention",
      operations: "operational_efficiency",
      unclear: "general_business_recovery",
    };

    return categoryMap[userReportedIssue] || "general_business_recovery";
  }

  private calculateDiagnosticConfidence(
    signals: EngineSignal[],
    engineResults: EngineResult[]
  ): number {
    if (!signals.length) return 0.3;

    // Average confidence of all signals, weighted by severity importance
    const severityWeights: Record<string, number> = {
      critical: 1.0,
      high: 0.8,
      medium: 0.6,
      low: 0.4,
    };

    const weightedConfidence = signals.reduce((sum, signal) => {
      const weight = severityWeights[signal.severity] || 0.5;
      return sum + signal.confidence * weight;
    }, 0);

    const baseConfidence =
      weightedConfidence / Math.max(1, signals.length * 0.8);

    // Penalize if engines disagree significantly
    const engineCount = engineResults.length;
    const enginesWithSignals = engineResults.filter(
      (e) => e.signals.length > 0
    ).length;
    const engineCoverage = enginesWithSignals / Math.max(1, engineCount);

    return Math.min(1, baseConfidence * (0.7 + engineCoverage * 0.3));
  }
}
