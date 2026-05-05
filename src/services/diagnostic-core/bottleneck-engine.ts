import { v4 as uuidv4 } from "uuid";
import { logger } from "@/infra/logger";
import {
  Bottleneck,
  BottleneckAnalysis,
  ConstraintType,
} from "@/domain/diagnostic/bottleneck";

export interface DataSufficiencyCheck {
  isSufficient: boolean;
  missingFields: string[];
}

export class BottleneckEngine {
  async analyzeBottleneck(
    engagementId: string,
    workspaceId: string,
    metrics: Record<string, number>,
    timelineData: Record<string, { value: number; timestamp: Date }>,
    affectedKpis: Record<string, number>
  ): Promise<BottleneckAnalysis | null> {
    const analysisId = uuidv4();

    // Step 1: Data sufficiency gate (STRICT)
    const sufficiencyCheck = this.checkDataSufficiency(
      metrics,
      timelineData,
      affectedKpis
    );

    if (!sufficiencyCheck.isSufficient) {
      logger.warn("Bottleneck analysis failed: insufficient data", {
        analysisId,
        missingFields: sufficiencyCheck.missingFields,
      });
      return null;
    }

    // Step 2: Identify potential bottlenecks
    const bottlenecks = this.identifyBottlenecks(
      metrics,
      timelineData,
      affectedKpis
    );

    if (bottlenecks.length < 1) {
      logger.warn("Bottleneck analysis failed: no bottlenecks identified", {
        analysisId,
      });
      return null;
    }

    // Step 3: Score and rank bottlenecks
    const scoredBottlenecks = bottlenecks.map((b) =>
      this.scoreBottleneck(b, metrics, affectedKpis)
    );

    const sorted = [...scoredBottlenecks].sort(
      (a, b) => b.confidenceScore - a.confidenceScore
    );

    const primaryBottleneck = sorted[0];
    const alternatives = sorted.slice(1);

    logger.info("Bottleneck analysis complete", {
      analysisId,
      engagementId,
      primaryBottleneck: primaryBottleneck.bottleneckVariable,
      confidence: primaryBottleneck.confidenceScore,
      alternativeCount: alternatives.length,
    });

    return {
      analysisId,
      engagementId,
      workspaceId,
      dataValidation: sufficiencyCheck,
      primaryBottleneck,
      alternativeBottlenecks: alternatives,
      overallConfidence: primaryBottleneck.confidenceScore,
      uncertaintyExposure: this.exposeUncertainty(
        primaryBottleneck,
        alternatives,
        sufficiencyCheck
      ),
      analyzedAt: new Date(),
    };
  }

  private checkDataSufficiency(
    metrics: Record<string, number>,
    timelineData: Record<string, { value: number; timestamp: Date }>,
    affectedKpis: Record<string, number>
  ): DataSufficiencyCheck {
    const missingFields: string[] = [];

    // Check minimum required data
    if (!metrics || Object.keys(metrics).length < 2) {
      missingFields.push("minimum_metrics");
    }

    if (!timelineData || Object.keys(timelineData).length < 2) {
      missingFields.push("timeline_data_points");
    }

    if (!affectedKpis || Object.keys(affectedKpis).length < 1) {
      missingFields.push("affected_kpis");
    }

    return {
      isSufficient: missingFields.length === 0,
      missingFields,
    };
  }

  private identifyBottlenecks(
    metrics: Record<string, number>,
    timelineData: Record<string, { value: number; timestamp: Date }>,
    affectedKpis: Record<string, number>
  ): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    // Identify capacity bottleneck
    const capacityMetric = metrics["utilization_pct"];
    if (capacityMetric !== undefined && capacityMetric > 80) {
      bottlenecks.push(
        this.createBottleneck(
          "Capacity Utilization",
          capacityMetric,
          "capacity",
          timelineData,
          affectedKpis
        )
      );
    }

    // Identify conversion bottleneck
    const conversionMetric = metrics["conversion_rate"];
    if (conversionMetric !== undefined && conversionMetric < 0.3) {
      bottlenecks.push(
        this.createBottleneck(
          "Conversion Rate",
          conversionMetric,
          "conversion",
          timelineData,
          affectedKpis
        )
      );
    }

    // Identify cost bottleneck
    const costMetric = metrics["cost_per_unit"];
    if (costMetric !== undefined && costMetric > 50) {
      bottlenecks.push(
        this.createBottleneck(
          "Cost Per Unit",
          costMetric,
          "cost",
          timelineData,
          affectedKpis
        )
      );
    }

    // Identify time bottleneck
    const timeMetric = metrics["cycle_time_days"];
    if (timeMetric !== undefined && timeMetric > 30) {
      bottlenecks.push(
        this.createBottleneck(
          "Cycle Time",
          timeMetric,
          "time",
          timelineData,
          affectedKpis
        )
      );
    }

    // Identify quality bottleneck
    const qualityMetric = metrics["defect_rate_pct"];
    if (qualityMetric !== undefined && qualityMetric > 5) {
      bottlenecks.push(
        this.createBottleneck(
          "Defect Rate",
          qualityMetric,
          "quality",
          timelineData,
          affectedKpis
        )
      );
    }

    return bottlenecks;
  }

  private createBottleneck(
    variable: string,
    currentValue: number,
    constraintType: ConstraintType,
    timelineData: Record<string, { value: number; timestamp: Date }>,
    affectedKpis: Record<string, number>
  ): Bottleneck {
    // Get baseline from timeline data - use first entry as baseline
    const timelineEntries = Object.entries(timelineData).sort(
      (a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime()
    );

    // For constraint types with different scales, derive baseline from metric context
    let baseline: number;
    if (constraintType === "capacity" || constraintType === "quality") {
      // These are percentages; baseline from timeline
      baseline = timelineEntries[0]?.[1].value || currentValue * 0.8;
    } else if (constraintType === "conversion") {
      // Conversion rates: assume 30% baseline if not specified
      baseline = timelineEntries[0]?.[1].value || 0.3;
    } else if (constraintType === "cost") {
      // Cost per unit: derive from timeline
      baseline = timelineEntries[0]?.[1].value || currentValue * 0.9;
    } else {
      // Time (days): derive from timeline
      baseline = timelineEntries[0]?.[1].value || currentValue * 0.8;
    }

    // Normalize change calculation based on metric type
    let changePercent: number;
    if (constraintType === "capacity" || constraintType === "quality") {
      // These are percentage metrics; direct comparison
      changePercent =
        baseline !== 0 ? ((currentValue - baseline) / baseline) * 100 : 100;
    } else if (constraintType === "conversion") {
      // Conversion rates: percentage point change
      changePercent =
        baseline !== 0
          ? ((currentValue - baseline) / Math.max(baseline, 0.01)) * 100
          : 100;
    } else {
      // Cost and time: relative change
      changePercent =
        baseline !== 0 ? ((currentValue - baseline) / baseline) * 100 : 100;
    }

    const metricDelta = {
      metric: variable,
      baseline,
      current: currentValue,
      unit: this.getUnitForConstraint(constraintType),
      changePercent,
    };

    // Calculate throughput impact
    const throughputImpact = {
      affectedVolume: Math.abs(metricDelta.changePercent * 10), // Proxy calculation
      impactUnit: "units/period",
      percentageImpact: Math.abs(metricDelta.changePercent),
    };

    // Link to affected KPI
    const affectedKpiName = Object.keys(affectedKpis)[0];
    const downstreamImpact = {
      affectedKpi: affectedKpiName,
      projectedChange: affectedKpis[affectedKpiName] * (metricDelta.changePercent / 100),
      changeUnit: this.getUnitForKpi(affectedKpiName),
    };

    return {
      id: uuidv4(),
      bottleneckVariable: variable,
      metricValue: currentValue,
      metricDelta,
      throughputImpact,
      downstreamImpact,
      constraintType,
      evidenceLink: `metric:${variable}_timeline_analysis`,
      confidenceScore: 0,
      confidenceReason: "",
    };
  }

  private scoreBottleneck(
    bottleneck: Bottleneck,
    metrics: Record<string, number>,
    affectedKpis: Record<string, number>
  ): Bottleneck {
    // Score based on impact magnitude
    const impactScore = Math.min(
      0.6,
      (Math.abs(bottleneck.metricDelta.changePercent) / 100) * 0.6
    );

    // Score based on downstream KPI effect
    const downstreamScore = Math.min(
      0.3,
      (Math.abs(bottleneck.downstreamImpact.projectedChange) / 100000) * 0.3
    );

    // Score based on throughput constraint
    const throughputScore = Math.min(
      0.1,
      (bottleneck.throughputImpact.percentageImpact / 100) * 0.1
    );

    const rawScore = impactScore + downstreamScore + throughputScore;
    const confidenceScore = Math.min(1, Math.max(0, rawScore));

    bottleneck.confidenceScore = confidenceScore;
    bottleneck.confidenceReason = `Based on ${Math.abs(bottleneck.metricDelta.changePercent).toFixed(1)}% metric change and ${Math.abs(bottleneck.downstreamImpact.projectedChange).toFixed(0)} KPI impact.`;

    return bottleneck;
  }

  private getUnitForConstraint(constraint: ConstraintType): string {
    const units: Record<ConstraintType, string> = {
      capacity: "%",
      conversion: "rate",
      cost: "$/unit",
      time: "days",
      quality: "%",
    };
    return units[constraint];
  }

  private getUnitForKpi(kpiName: string): string {
    if (kpiName.includes("revenue")) return "$";
    if (kpiName.includes("count")) return "units";
    if (kpiName.includes("rate")) return "%";
    return "value";
  }

  private exposeUncertainty(
    primary: Bottleneck,
    alternatives: Bottleneck[],
    dataCheck: DataSufficiencyCheck
  ) {
    const missingDataList = [];

    if (dataCheck.missingFields.length > 0) {
      missingDataList.push(...dataCheck.missingFields);
    }

    const riskLevel =
      primary.confidenceScore < 0.4
        ? "HIGH"
        : primary.confidenceScore < 0.6
          ? "MEDIUM"
          : "LOW";

    return {
      riskOfMisdiagnosis: `${riskLevel} risk. Alternative bottlenecks: ${alternatives.map((a) => a.bottleneckVariable).join("; ")}`,
      missingDataList,
      assumptionsList: [
        "Metric baseline is accurate and representative",
        "Timeline data points are chronologically correct",
        "Affected KPI causation is linear",
        "No external shocks during measurement period",
      ],
    };
  }
}

export const bottleneckEngine = new BottleneckEngine();
