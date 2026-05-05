export type RiskProfile = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CapitalSensitivity = "HIGH" | "MEDIUM" | "LOW";
export type GrowthMode = "survival" | "stabilize" | "grow" | "scale";
export type ExecutionComplexity = "simple" | "moderate" | "complex" | "expert";
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

export interface DecisionConstraints {
  allowedStrategyTypes: StrategyType[];
  forbiddenStrategyTypes: StrategyType[];
  maximumInvestmentHorizonMonths: number;
  maximumExecutionComplexity: ExecutionComplexity;
}

export interface Archetype {
  id: string;
  archetyppe: string; // e.g., "High-Growth SaaS", "Turnaround Play", "Stable Mature Business"
  riskProfile: RiskProfile;
  capitalSensitivity: CapitalSensitivity;
  growthMode: GrowthMode;
  decisionConstraints: DecisionConstraints;
  confidenceScore: number;
  confidenceReason: string;
}

export interface ArchetypeAnalysis {
  analysisId: string;
  engagementId: string;
  workspaceId: string;
  dataValidation: {
    isSufficient: boolean;
    missingFields: string[];
  };
  selectedArchetype: Archetype;
  alternativeArchetypes: Archetype[];
  overallConfidence: number;
  uncertaintyExposure: {
    riskOfMisclassification: string;
    missingDataList: string[];
    assumptionsList: string[];
  };
  analyzedAt: Date;
}
