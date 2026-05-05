import { v4 as uuidv4 } from "uuid";
import { logger } from "@/infra/logger";
import {
  Hypothesis,
  RootCauseAnalysis,
  Evidence,
  CausalChain,
  Falsifier,
} from "@/domain/diagnostic/root-cause";

export interface DataSufficiencyCheck {
  isSufficient: boolean;
  missingFields: string[];
  contradictionsDetected: string[];
}

export class RootCauseEngine {
  async analyzeRootCause(
    engagementId: string,
    workspaceId: string,
    metrics: Record<string, number>,
    observations: string[],
    timeline: Record<string, Date>
  ): Promise<RootCauseAnalysis | null> {
    const analysisId = uuidv4();

    // Step 1: Data sufficiency gate (STRICT)
    const sufficiencyCheck = this.checkDataSufficiency(
      metrics,
      observations,
      timeline
    );

    if (!sufficiencyCheck.isSufficient) {
      logger.warn("Root cause analysis failed: insufficient data", {
        analysisId,
        missingFields: sufficiencyCheck.missingFields,
      });
      return null;
    }

    // Step 2: Generate hypotheses (minimum 3)
    const hypotheses = this.generateHypotheses(
      metrics,
      observations,
      timeline,
      engagementId
    );

    if (hypotheses.length < 3) {
      logger.warn("Root cause analysis failed: insufficient hypotheses", {
        analysisId,
        generatedCount: hypotheses.length,
      });
      return null;
    }

    // Step 3: Score and rank hypotheses (STRICT)
    const scoredHypotheses = hypotheses.map((h) =>
      this.scoreHypothesis(h, metrics, observations)
    );

    const sorted = [...scoredHypotheses].sort(
      (a, b) => b.confidenceScore - a.confidenceScore
    );

    const selectedHypothesis = sorted[0];
    const alternatives = sorted.slice(1);

    // Step 4: Validate selected hypothesis confidence against evidence
    if (!this.validateConfidenceAgainstEvidence(selectedHypothesis)) {
      logger.warn("Root cause analysis failed: confidence exceeds evidence", {
        analysisId,
        confidence: selectedHypothesis.confidenceScore,
        evidenceCount: selectedHypothesis.supportingEvidence.length,
      });
      return null;
    }

    logger.info("Root cause analysis complete", {
      analysisId,
      engagementId,
      selectedHypothesis: selectedHypothesis.statement,
      confidence: selectedHypothesis.confidenceScore,
      alternativeCount: alternatives.length,
    });

    return {
      analysisId,
      engagementId,
      workspaceId,
      dataValidation: sufficiencyCheck,
      selectedHypothesis,
      alternativeHypotheses: alternatives,
      overallConfidence: selectedHypothesis.confidenceScore,
      uncertaintyExposure: this.exposeUncertainty(
        selectedHypothesis,
        alternatives,
        sufficiencyCheck
      ),
      analyzedAt: new Date(),
    };
  }

  private checkDataSufficiency(
    metrics: Record<string, number>,
    observations: string[],
    timeline: Record<string, Date>
  ): DataSufficiencyCheck {
    const missingFields: string[] = [];
    const contradictionsDetected: string[] = [];

    // Check minimum required data
    if (!metrics || Object.keys(metrics).length < 3) {
      missingFields.push("minimum_metrics");
    }

    if (!observations || observations.length < 2) {
      missingFields.push("minimum_observations");
    }

    if (!timeline || Object.keys(timeline).length < 2) {
      missingFields.push("timeline_events");
    }

    // Check for contradictions in metrics
    const revenueMetric = metrics["revenue_change_pct"];
    const costMetric = metrics["cost_change_pct"];

    if (
      revenueMetric !== undefined &&
      costMetric !== undefined &&
      revenueMetric < -50 &&
      costMetric < -50
    ) {
      contradictionsDetected.push(
        "simultaneous_revenue_and_cost_decline_unclear_causation"
      );
    }

    return {
      isSufficient: missingFields.length === 0 && contradictionsDetected.length === 0,
      missingFields,
      contradictionsDetected,
    };
  }

  private generateHypotheses(
    metrics: Record<string, number>,
    observations: string[],
    timeline: Record<string, Date>,
    engagementId: string
  ): Hypothesis[] {
    const hypotheses: Hypothesis[] = [];

    // Hypothesis 1: Market-driven cause
    hypotheses.push(
      this.createHypothesis(
        `Market downturn in ${engagementId}`,
        "Market conditions deteriorated",
        "Revenue decline across customer base",
        metrics["revenue_change_pct"] || -15,
        "revenue_impact",
        "%"
      )
    );

    // Hypothesis 2: Operational cause
    hypotheses.push(
      this.createHypothesis(
        `Operational inefficiency in ${engagementId}`,
        "Process breakdown or quality issue",
        "Cost increase and customer churn",
        metrics["cost_change_pct"] || 20,
        "cost_impact",
        "%"
      )
    );

    // Hypothesis 3: Leadership/execution cause
    hypotheses.push(
      this.createHypothesis(
        `Execution gap in ${engagementId}`,
        "Leadership communication failure",
        "Strategy misalignment and delayed actions",
        metrics["execution_delay_days"] || 30,
        "delay_impact",
        "days"
      )
    );

    return hypotheses;
  }

  private createHypothesis(
    statement: string,
    mechanism: string,
    effect: string,
    metricValue: number,
    metricName: string,
    unit: string
  ): Hypothesis {
    const baseline = unit === "%" ? 0 : unit === "days" ? 0 : 0;
    const changePercent =
      baseline !== 0 ? ((metricValue - baseline) / Math.abs(baseline)) * 100 : 100;

    return {
      id: uuidv4(),
      statement,
      causalChain: {
        cause: statement,
        mechanism,
        effect,
        metricChange: {
          metric: metricName,
          baseline,
          current: metricValue,
          unit,
          changePercent,
        },
      },
      supportingEvidence: [],
      falsifier: this.createFalsifier(statement, metricName),
      confidenceScore: 0,
      confidenceReason: "",
    };
  }

  private createFalsifier(
    hypothesis: string,
    metric: string
  ): Falsifier {
    return {
      condition: `${metric} returns to baseline or improves by >20%`,
      testMethod: `Track ${metric} over 4-week period`,
      expectedResult: "Sustained improvement disproves hypothesis",
      disproveThreshold: 0.2,
    };
  }

  private scoreHypothesis(
    hypothesis: Hypothesis,
    metrics: Record<string, number>,
    observations: string[]
  ): Hypothesis {
    // Score based ONLY on evidence quality and quantity
    const evidenceScore = Math.min(
      0.7,
      (observations.length / 10) * 0.5 + (Object.keys(metrics).length / 15) * 0.2
    );

    const coherenceScore = this.scoreCoherence(
      hypothesis.causalChain,
      observations
    );
    const falseifiabilityScore = 0.15; // Bonus for having a falsifier

    const rawScore = evidenceScore + coherenceScore + falseifiabilityScore;
    const confidenceScore = Math.min(1, Math.max(0, rawScore));

    hypothesis.confidenceScore = confidenceScore;
    hypothesis.confidenceReason = `Based on ${observations.length} observations and ${Object.keys(metrics).length} metrics. Coherence: ${Math.round(coherenceScore * 100)}%.`;

    return hypothesis;
  }

  private scoreCoherence(causalChain: CausalChain, observations: string[]): number {
    const mentionsChainElements = observations.filter(
      (o) =>
        o.toLowerCase().includes(causalChain.cause.toLowerCase()) ||
        o.toLowerCase().includes(causalChain.mechanism.toLowerCase())
    ).length;

    return Math.min(0.5, (mentionsChainElements / observations.length) * 0.5);
  }

  private validateConfidenceAgainstEvidence(hypothesis: Hypothesis): boolean {
    // FAIL if confidence > 0.7 and less than 5 evidence points
    if (hypothesis.confidenceScore > 0.7 && hypothesis.supportingEvidence.length < 5) {
      return false;
    }

    // FAIL if confidence > 0.85 and less than 8 evidence points
    if (hypothesis.confidenceScore > 0.85 && hypothesis.supportingEvidence.length < 8) {
      return false;
    }

    return true;
  }

  private exposeUncertainty(
    selected: Hypothesis,
    alternatives: Hypothesis[],
    dataCheck: DataSufficiencyCheck
  ) {
    const missingDataList = [];

    if (dataCheck.missingFields.length > 0) {
      missingDataList.push(...dataCheck.missingFields);
    }

    if (selected.supportingEvidence.length < 5) {
      missingDataList.push("additional_supporting_evidence");
    }

    const riskLevel =
      selected.confidenceScore < 0.6
        ? "HIGH"
        : selected.confidenceScore < 0.75
          ? "MEDIUM"
          : "LOW";

    return {
      riskOfMisdiagnosis: `${riskLevel} risk. Alternative hypotheses: ${alternatives.map((a) => a.statement).join("; ")}`,
      missingDataList,
      assumptionsList: [
        "Market conditions remain stable",
        "Data collection is accurate",
        "Timeline events are correctly sequenced",
      ],
    };
  }
}

export const rootCauseEngine = new RootCauseEngine();
