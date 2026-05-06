export interface DecisionPath {
  id: string;
  name: string;
  description: string;
  actions: string[];
  expectedOutcome: string;
  estimatedDuration: number;
  financialImpact: number;
  successProbability: number;
  executionFeasibility: number;
  constraintSatisfaction: number;
  overallScore: number;
  risks: string[];
  dependencies: string[];
}

export interface PathScoring {
  financialScore: number; // 0-100
  probabilityScore: number; // 0-100
  feasibilityScore: number; // 0-100
  constraintScore: number; // 0-100
  weightedTotal: number; // weighted average
}

export interface PathReasoning {
  pathId: string;
  selectedReason: string;
  diagnosticSummary: Record<string, unknown>;
  constraintSummary: ConstraintSummary | Record<string, unknown>;
  riskAssessment: string;
  fallbackOptions: string[];
}

export interface ConstraintSummary {
  complianceStatus: string;
  capacityLevel: string;
  approvalRequired: boolean;
  blockers: string[];
}

export interface BestPathAnalysis {
  decisionId: string;
  engagementId: string;
  workspaceId: string;
  bestPath: DecisionPath;
  alternatives: DecisionPath[];
  reasoning: PathReasoning;
  constraints: ConstraintSummary;
  financialProjection: Record<string, number>;
  successProbability: number;
  analyzedAt: Date;
  confidence: number;
}
