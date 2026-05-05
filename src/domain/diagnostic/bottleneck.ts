export type ConstraintType = "capacity" | "conversion" | "cost" | "time" | "quality";

export interface MetricDelta {
  metric: string;
  baseline: number;
  current: number;
  unit: string;
  changePercent: number;
}

export interface Bottleneck {
  id: string;
  bottleneckVariable: string;
  metricValue: number;
  metricDelta: MetricDelta;
  throughputImpact: {
    affectedVolume: number;
    impactUnit: string;
    percentageImpact: number;
  };
  downstreamImpact: {
    affectedKpi: string;
    projectedChange: number;
    changeUnit: string;
  };
  constraintType: ConstraintType;
  evidenceLink: string;
  confidenceScore: number;
  confidenceReason: string;
}

export interface BottleneckAnalysis {
  analysisId: string;
  engagementId: string;
  workspaceId: string;
  dataValidation: {
    isSufficient: boolean;
    missingFields: string[];
  };
  primaryBottleneck: Bottleneck;
  alternativeBottlenecks: Bottleneck[];
  overallConfidence: number;
  uncertaintyExposure: {
    riskOfMisdiagnosis: string;
    missingDataList: string[];
    assumptionsList: string[];
  };
  analyzedAt: Date;
}
