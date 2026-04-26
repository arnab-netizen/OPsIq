export type UUID = string;
export type ISODateTime = string;
export type Severity = "low" | "medium" | "high" | "critical";
export type Priority = "low" | "medium" | "high" | "critical";
export type RiskClass = "safe_now" | "controlled_rollout" | "pilot_only" | "review_required" | "blocked";
export type DiagnosisV2RunMode = "provisional" | "full" | "targeted_recheck";
export type DiagnosisV2Status = "completed" | "needs_input";
export type DiagnosisDomainKey =
  | "liquidity"
  | "profitability"
  | "revenue_quality"
  | "demand_generation"
  | "retention"
  | "operations"
  | "people_capacity"
  | "controls_reporting"
  | "strategy_resilience";

export type FactSource = "user_input" | "derived" | "repo_context" | "evidence" | "integration";
export type ValidationIssueType =
  | "missing_data"
  | "contradiction"
  | "stale_data"
  | "invalid_value"
  | "ambiguous_definition"
  | "anomaly"
  | "insufficient_evidence";

export interface EvidenceRefV2 {
  type: "metric" | "fact" | "user_input" | "validation_issue" | "evidence" | "assumption";
  key?: string;
  label: string;
  confidence?: number;
}

export interface ServiceLineInput {
  name: string;
  share?: number;
  revenue?: number;
  cost?: number;
  orderCount?: number;
  customerCount?: number;
}

export interface DiagnosisV2Input {
  engagementId: UUID;
  runId?: UUID;
  nowIso: ISODateTime;
  businessName?: string;
  businessType?: string;
  problemStatement?: string;
  mainIssue?: string;
  monthlyRevenue?: number;
  monthlyCosts?: number;
  customerCount?: number;
  orderCount?: number;
  cashOnHand?: number;
  overduePayables?: number;
  grossMarginPct?: number;
  repeatCustomerPct?: number;
  leadCount?: number;
  conversionRatePct?: number;
  complaintCount?: number;
  staffCount?: number;
  serviceLines?: ServiceLineInput[];
  evidenceLabels?: string[];
  additionalInputs?: Record<string, unknown>;
}

export interface NormalizedFact {
  key: string;
  value: unknown;
  unit?: string;
  confidence: number;
  source: FactSource;
  observedAt?: ISODateTime;
  lineage: string[];
}

export interface ValidationIssueV2 {
  issueType: ValidationIssueType;
  severity: Severity;
  message: string;
  fieldRefs: string[];
  blocksCompletion: boolean;
  details: Record<string, unknown>;
}

export interface EvidenceSufficiencyV2 {
  score: number;
  minimumViable: boolean;
  missing: string[];
  present: string[];
  rationale: string[];
}

export interface DerivedMetricV2 {
  metricKey: string;
  metricValue: number;
  unit?: string;
  confidence: number;
  lineage: string[];
}

export interface DomainScoreV2 {
  domainKey: DiagnosisDomainKey;
  score: number;
  band: "stable" | "stressed" | "critical" | "fragile_recovery" | "growth_capable";
  rationale: {
    topDrivers: Array<{ key: string; contribution: number; explanation: string }>;
    confidence: number;
  };
}

export interface HypothesisV2 {
  hypothesisKey: string;
  title: string;
  description: string;
  rank: number;
  confidence: number;
  evidenceFor: EvidenceRefV2[];
  evidenceAgainst: EvidenceRefV2[];
}

export interface RecommendationV2 {
  recommendationKey: string;
  title: string;
  category: string;
  description: string;
  rationale: string;
  priority: Priority;
  confidence: number;
  expectedUpside: Record<string, unknown>;
  downsideRisk: Record<string, unknown>;
  preconditions: string[];
  linkedHypothesisKeys: string[];
}

export interface RiskItemV2 {
  riskType:
    | "financial"
    | "operational"
    | "customer"
    | "legal"
    | "reputation"
    | "dependency"
    | "people"
    | "data"
    | "execution"
    | "technology"
    | "external_shock";
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  detectability: number;
  reversibility: number;
  velocity: number;
  residualScore: number;
  mitigationControls: string[];
}

export interface RecommendationRiskV2 {
  recommendationKey: string;
  recommendationTitle: string;
  overallRiskScore: number;
  riskClass: RiskClass;
  items: RiskItemV2[];
}

export interface ContingencyPlanV2 {
  recommendationKey: string;
  recommendationTitle: string;
  preconditions: string[];
  earlyWarningSignals: string[];
  stopLossTriggers: string[];
  fallbackActions: string[];
  recoveryActions: string[];
  communicationPlan: Record<string, unknown>;
}

export interface PolicyDecisionV2 {
  recommendationKey: string;
  recommendationTitle: string;
  outcome: "allowed" | "requires_approval" | "blocked";
  reason: string;
}

export interface ScenarioCaseV2 {
  caseKey: "base" | "downside" | "severe_downside" | "upside";
  label: string;
  assumptions: Record<string, unknown>;
  outputs: Record<string, unknown>;
  robustnessRank: number;
}

export interface DiagnosisRunSummaryV2 {
  engagementId: UUID;
  runId?: UUID;
  status: DiagnosisV2Status;
  runMode: DiagnosisV2RunMode;
  confidence: number;
  summary: string;
  completedAt: ISODateTime;
}

export interface DiagnosisV2Result {
  run: DiagnosisRunSummaryV2;
  audit: {
    engineVersion: "diagnosis-v2.2-enterprise";
    deterministic: true;
    warnings: string[];
  };
  facts: NormalizedFact[];
  validationIssues: ValidationIssueV2[];
  evidenceSufficiency: EvidenceSufficiencyV2;
  metrics: DerivedMetricV2[];
  scorecard: DomainScoreV2[];
  hypotheses: HypothesisV2[];
  recommendations: RecommendationV2[];
  risks: RecommendationRiskV2[];
  contingencies: ContingencyPlanV2[];
  policyDecisions: PolicyDecisionV2[];
  scenarios: ScenarioCaseV2[];
  needsInput: boolean;
}

export interface PersistedDiagnosisV2Record {
  run: DiagnosisRunSummaryV2;
  result: DiagnosisV2Result;
}
