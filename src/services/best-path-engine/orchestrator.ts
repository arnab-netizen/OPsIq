import { v4 as uuidv4 } from "uuid";
import { logger } from "@/infra/logger";
import {
  DecisionPath,
  PathScoring,
  BestPathAnalysis,
  PathReasoning,
  ConstraintSummary,
} from "@/domain/decision/best-path";

export class BestPathOrchestrator {
  async analyzePaths(
    decisionId: string,
    engagementId: string,
    workspaceId: string,
    diagnosticData: Record<string, unknown>,
    constraintData: Record<string, unknown>,
    scenarioPaths: DecisionPath[]
  ): Promise<BestPathAnalysis> {
    if (!scenarioPaths || scenarioPaths.length === 0) {
      return this.createDefaultAnalysis(decisionId, engagementId, workspaceId);
    }

    // Score all paths
    const scoredPaths = scenarioPaths.map((path) =>
      this.scorePath(path, diagnosticData, constraintData)
    );

    // Sort by score
    const sorted = [...scoredPaths].sort(
      (a, b) => b.overallScore - a.overallScore
    );

    const bestPath = sorted[0];
    const alternatives = sorted.slice(1, 3);

    const reasoning = this.generateReasoning(
      bestPath,
      diagnosticData,
      constraintData
    );

    const constraints = this.extractConstraintSummary(constraintData);
    const financialProjection = this.projectFinancials(diagnosticData);
    const confidence = this.calculateConfidence(bestPath, alternatives);

    logger.info("Best path analysis complete", {
      decisionId,
      engagementId,
      bestPathScore: bestPath.overallScore,
      alternativeCount: alternatives.length,
      confidence,
    });

    return {
      decisionId,
      engagementId,
      workspaceId,
      bestPath,
      alternatives,
      reasoning,
      constraints,
      financialProjection,
      successProbability: bestPath.successProbability,
      analyzedAt: new Date(),
      confidence,
    };
  }

  private scorePath(
    path: DecisionPath,
    diagnosticData: Record<string, unknown>,
    constraintData: Record<string, unknown>
  ): DecisionPath {
    const financialScore = this.scoreFinancialImpact(path, diagnosticData);
    const probabilityScore = this.scoreSuccessProbability(
      path,
      diagnosticData
    );
    const feasibilityScore = this.scoreExecutionFeasibility(path, diagnosticData);
    const constraintScore = this.scoreConstraintSatisfaction(
      path,
      constraintData
    );

    const weightedTotal =
      financialScore * 0.3 +
      probabilityScore * 0.3 +
      feasibilityScore * 0.25 +
      constraintScore * 0.15;

    return {
      ...path,
      overallScore: Math.round(weightedTotal * 100) / 100,
    };
  }

  private scoreFinancialImpact(
    path: DecisionPath,
    diagnosticData: Record<string, unknown>
  ): number {
    const baseScore = Math.min(100, Math.max(0, path.financialImpact || 50));
    return baseScore;
  }

  private scoreSuccessProbability(
    path: DecisionPath,
    diagnosticData: Record<string, unknown>
  ): number {
    const baseScore = (path.successProbability || 0.5) * 100;
    return Math.min(100, Math.max(0, baseScore));
  }

  private scoreExecutionFeasibility(
    path: DecisionPath,
    diagnosticData: Record<string, unknown>
  ): number {
    const actionCount = path.actions?.length || 0;
    const durationFeasibility = Math.max(
      0,
      100 - (path.estimatedDuration || 0) / 1000
    );
    const dependencyPenalty = (path.dependencies?.length || 0) * 5;

    return Math.min(100, Math.max(0, durationFeasibility - dependencyPenalty));
  }

  private scoreConstraintSatisfaction(
    path: DecisionPath,
    constraintData: Record<string, unknown>
  ): number {
    const blockerCount = path.risks?.length || 0;
    const baseScore = 100 - blockerCount * 10;
    return Math.max(0, baseScore);
  }

  private generateReasoning(
    bestPath: DecisionPath,
    diagnosticData: Record<string, unknown>,
    constraintData: Record<string, unknown>
  ): PathReasoning {
    return {
      pathId: bestPath.id,
      selectedReason: `Selected for highest overall score (${bestPath.overallScore}), balancing financial impact, success probability, execution feasibility, and constraint satisfaction.`,
      diagnosticSummary: this.extractDiagnosticSummary(diagnosticData),
      constraintSummary: this.extractConstraintSummary(constraintData),
      riskAssessment: this.assessRisks(bestPath),
      fallbackOptions: [
        "Review alternative paths if execution challenges emerge",
        "Escalate to stakeholders if success probability drops below threshold",
      ],
    };
  }

  private extractDiagnosticSummary(
    diagnosticData: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      rootCauseIdentified: !!diagnosticData.rootCause,
      bottlenecksDetected: (diagnosticData.bottlenecks as any[])?.length || 0,
      rfmSegment: diagnosticData.rfmSegment || "unknown",
      metricsHealthy: (diagnosticData.metrics as any[])?.length > 0,
    };
  }

  private extractConstraintSummary(
    constraintData: Record<string, unknown>
  ): ConstraintSummary {
    return {
      complianceStatus:
        (constraintData.complianceStatus as string) || "compliant",
      capacityLevel: (constraintData.capacityLevel as string) || "adequate",
      approvalRequired: !!constraintData.requiresApproval,
      blockers: (constraintData.blockers as string[]) || [],
    };
  }

  private projectFinancials(
    diagnosticData: Record<string, unknown>
  ): Record<string, number> {
    return {
      baselineRevenue: (diagnosticData.baselineRevenue as number) || 0,
      projectedImpact: (diagnosticData.projectedImpact as number) || 0,
      roi: (diagnosticData.roi as number) || 0,
      paybackPeriodDays: (diagnosticData.paybackDays as number) || 0,
    };
  }

  private assessRisks(path: DecisionPath): string {
    if (path.risks?.length === 0) {
      return "Low risk execution path with clear dependencies and feasible timeline.";
    }
    const riskCount = path.risks?.length || 0;
    if (riskCount <= 2) {
      return `${riskCount} identified risk(s) are manageable with standard mitigation strategies.`;
    }
    return `${riskCount} identified risks require careful monitoring and proactive mitigation throughout execution.`;
  }

  private calculateConfidence(
    bestPath: DecisionPath,
    alternatives: DecisionPath[]
  ): number {
    if (alternatives.length === 0) return 0.5;

    const bestScore = bestPath.overallScore;
    const secondBestScore = alternatives[0]?.overallScore || 0;
    const margin = bestScore - secondBestScore;

    // Confidence based on score margin: 0-20 margin = 0.5, >40 = 0.95
    return Math.min(0.95, Math.max(0.5, 0.5 + margin / 80));
  }

  private createDefaultAnalysis(
    decisionId: string,
    engagementId: string,
    workspaceId: string
  ): BestPathAnalysis {
    const defaultPath: DecisionPath = {
      id: uuidv4(),
      name: "Default Path",
      description: "Default path due to no alternatives",
      actions: [],
      expectedOutcome: "Execute standard decision flow",
      estimatedDuration: 86400000,
      financialImpact: 0,
      successProbability: 0.5,
      executionFeasibility: 0.5,
      constraintSatisfaction: 100,
      overallScore: 50,
      risks: [],
      dependencies: [],
    };

    return {
      decisionId,
      engagementId,
      workspaceId,
      bestPath: defaultPath,
      alternatives: [],
      reasoning: {
        pathId: defaultPath.id,
        selectedReason: "Default path used due to insufficient scenario data",
        diagnosticSummary: {},
        constraintSummary: {
          complianceStatus: "unknown",
          capacityLevel: "unknown",
          approvalRequired: false,
          blockers: [],
        },
        riskAssessment: "Risk assessment unavailable",
        fallbackOptions: ["Provide more scenario data for better path analysis"],
      },
      constraints: {
        complianceStatus: "unknown",
        capacityLevel: "unknown",
        approvalRequired: false,
        blockers: [],
      },
      financialProjection: {},
      successProbability: 0.5,
      analyzedAt: new Date(),
      confidence: 0.5,
    };
  }
}

export const bestPathOrchestrator = new BestPathOrchestrator();
