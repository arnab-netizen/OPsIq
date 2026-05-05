export interface Evidence {
  id: string;
  type: "metric" | "observation" | "timeline" | "stakeholder" | "document";
  description: string;
  value?: number | string;
  confidence: "high" | "medium" | "low";
  timestamp?: Date;
  source: string;
}

export interface CausalChain {
  cause: string;
  mechanism: string;
  effect: string;
  metricChange: {
    metric: string;
    baseline: number;
    current: number;
    unit: string;
    changePercent: number;
  };
}

export interface Falsifier {
  condition: string;
  testMethod: string;
  expectedResult: string;
  disproveThreshold: number;
}

export interface Hypothesis {
  id: string;
  statement: string;
  causalChain: CausalChain;
  supportingEvidence: Evidence[];
  falsifier: Falsifier;
  confidenceScore: number;
  confidenceReason: string;
}

export interface RootCauseAnalysis {
  analysisId: string;
  engagementId: string;
  workspaceId: string;
  dataValidation: {
    isSufficient: boolean;
    missingFields: string[];
    contradictionsDetected: string[];
  };
  selectedHypothesis: Hypothesis;
  alternativeHypotheses: Hypothesis[];
  overallConfidence: number;
  uncertaintyExposure: {
    riskOfMisdiagnosis: string;
    missingDataList: string[];
    assumptionsList: string[];
  };
  analyzedAt: Date;
}
