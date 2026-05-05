export type MaturityLevel = 1 | 2 | 3 | 4 | 5;
export type ExecutionComplexity = "simple" | "moderate" | "complex" | "expert";
export type DecisionHorizon = "days" | "weeks" | "months";
export type StrategyType =
  | "cost_reduction"
  | "revenue_growth"
  | "market_expansion"
  | "product_innovation"
  | "operational_efficiency"
  | "customer_retention"
  | "debt_reduction"
  | "infrastructure_investment"
  | "team_building"
  | "strategic_partnership";

export interface ExecutionCapabilities {
  maturityLevel: MaturityLevel;
  maxExecutionComplexity: ExecutionComplexity;
  maxDecisionHorizonDays: number;
  maxPlanSizeActions: number;
  allowedStrategyTypes: StrategyType[];
  blockedStrategyTypes: StrategyType[];
  processMaturityScore: number; // 0-1
  teamCapabilityScore: number; // 0-1
  systemsMaturityScore: number; // 0-1
  governanceMaturityScore: number; // 0-1
}

export interface MaturityAnalysis {
  analysisId: string;
  engagementId: string;
  workspaceId: string;
  dataValidation: {
    isSufficient: boolean;
    missingFields: string[];
  };
  currentMaturity: ExecutionCapabilities;
  alternativeAssessments: ExecutionCapabilities[];
  overallMaturityScore: number;
  overallConfidence: number;
  maturityGaps: {
    dimension: string;
    currentScore: number;
    targetScore: number;
    gap: number;
  }[];
  uncertaintyExposure: {
    assessmentConfidence: string;
    missingDataList: string[];
    assumptionsList: string[];
  };
  analyzedAt: Date;
}
