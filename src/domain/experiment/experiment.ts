/**
 * Experiment Domain Contract
 *
 * Models test-first approach to risky growth actions.
 * Captures hypothesis, test plan, execution, and measured outcomes.
 * Enables learning from controlled experiments vs arbitrary actions.
 */

/**
 * Experiment status lifecycle:
 * - draft: Hypothesis and plan defined, awaiting approval
 * - approved: Ready to execute
 * - active: Currently executing
 * - completed: Execution finished, data collected
 * - analyzed: Results analyzed, learning recorded
 * - archived: No longer relevant
 */
export type ExperimentStatus = "draft" | "approved" | "active" | "completed" | "analyzed" | "archived";

/**
 * Experiment hypothesis type categorizes risk profile
 * Influences required rigor and success threshold
 */
export type HypothesisType =
  | "revenue_growth" // Revenue or volume increase
  | "retention_improvement" // Reduce churn, increase loyalty
  | "cost_reduction" // Lower COGS, opex, or burn
  | "market_expansion" // New segment, geography, or channel
  | "product_pivot" // Material product/service change
  | "operational_efficiency" // Process, team, or tech improvement
  | "risk_mitigation"; // De-risk existing business

/**
 * Experiment rigor level determines measurement standard
 * Higher rigor = more data, longer duration, stronger signal required
 */
export type RigorLevel =
  | "exploratory" // Quick learning: 1-2 weeks, single metric, 10% threshold
  | "standard" // Typical experiment: 3-4 weeks, multiple metrics, 20% threshold
  | "strict" // High-risk change: 6+ weeks, holistic metrics, 30% threshold
  | "controlled"; // A/B test with control group, statistical significance

/**
 * Experiment outcome classification
 */
export type OutcomeClassification =
  | "success" // Met primary success criterion
  | "partial" // Mixed results (some goals met, some not)
  | "failure" // Did not meet primary criterion
  | "inconclusive"; // Insufficient data to determine

export interface Hypothesis {
  // Core statement
  statement: string; // "If we [action], then [metric] will increase/decrease by [threshold]%"

  // Risk categorization
  type: HypothesisType;

  // What success looks like
  successCriterion: string; // "Increase monthly revenue by 15%"
  successThreshold: number; // 15 (percent change)
  successMetric: string; // "monthly_revenue"

  // What could go wrong
  failureRisk: string; // Description of downside risk
  failureThreshold: number; // Abort if metric moves more than 20% negative

  // Time horizon
  testDurationWeeks: number;
  reviewCadenceWeeks: number; // How often to measure progress
}

export interface ExperimentPlan {
  // What is being tested
  hypothesis: Hypothesis;

  // How we will test it
  actionDescription: string; // Plain language description of what will be done
  targetAudience: string; // Who/what will be affected (e.g., "US SMB segment", "product tier 2")
  controlGroup: string; // Who/what will not be affected (for comparison)

  // What we will measure
  primaryMetric: string; // The main KPI (e.g., monthly_revenue)
  secondaryMetrics: string[]; // Supporting metrics (e.g., customer_count, avg_order_value)
  confoundingFactors: string[]; // Things that could bias results (seasonality, marketing spend, etc.)

  // Resource requirements
  estimatedCost: number;
  estimatedEffort: string; // "20 hours", "2 FTE-weeks", etc.
  requiredCapabilities: string[]; // What the team needs to execute
  dependencies: string[]; // Blockers (waiting on product feature, data pipeline, etc.)

  // Governance
  requiredApprovals: string[]; // Who must approve (finance, ops, legal, etc.)
  riskLevel: "low" | "medium" | "high" | "critical";
  rigorLevel: RigorLevel;
}

export interface ExperimentExecution {
  // Timing
  startedAt?: Date;
  targetEndDate: Date;
  actualEndDate?: Date;

  // Progress tracking
  status: ExperimentStatus;
  percentComplete: number; // 0-100
  daysElapsed: number;
  daysRemaining: number;

  // What actually happened
  deviations?: string; // What differed from plan
  notes: string[]; // Running log of observations, blockers, decisions

  // Early stopping (optional)
  stoppedEarly?: boolean;
  stoppingReason?: string; // "Success achieved early", "Risk threshold exceeded", "Blocker", etc.
}

export interface ExperimentResult {
  // Final outcome
  classification: OutcomeClassification;
  successThresholdMet: boolean;
  primaryMetricValue: number;
  primaryMetricChange: number; // Percent change from baseline
  primaryMetricTrend: "increasing" | "decreasing" | "flat";

  // Secondary results
  secondaryResults: Record<string, {
    value: number;
    change: number;
    trend: "increasing" | "decreasing" | "flat";
  }>;

  // Statistical confidence (if applicable)
  confidenceLevel?: number; // 0-100 (90%+ indicates statistical significance)
  sampleSize?: number;
  controlGroupValue?: number; // Baseline for comparison

  // Cost-benefit
  actualCost: number;
  roi: number; // Return on investment (%, can be negative)
  paybackPeriodDays?: number;

  // Measurement quality
  dataQuality: "high" | "medium" | "low"; // Was data collection clean?
  confoundingFactorsObserved?: string[]; // What else changed that might affect results?
}

export interface ExperimentLearning {
  // What we learned
  keyFinding: string; // "Customer acquisition cost dropped but retention suffered"
  implications: string; // What this means for the business
  confidence: "high" | "medium" | "low"; // How confident are we in this learning?

  // What comes next
  nextAction?: string; // "Scale to all segments", "Pivot strategy", "Abandon approach", etc.
  priorityAfterLearning?: "critical" | "high" | "medium" | "low";

  // Refinement suggestions
  howToImproveMetric?: string; // How to strengthen results
  alternativeApproach?: string; // Completely different approach based on this learning
}

export interface Experiment {
  // Identity
  id: string; // UUID
  workspaceId: string; // Multi-tenancy
  engagementId: string; // Which engagement/business is being experimented on
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // User ID

  // Status
  status: ExperimentStatus;

  // Content
  name: string;
  description?: string;
  plan: ExperimentPlan;
  execution?: ExperimentExecution;
  result?: ExperimentResult;
  learning?: ExperimentLearning;

  // Links
  linkedDecisionId?: string; // Which decision triggered this experiment
  linkedActionId?: string; // Which action is being validated
  linkedRecommendationId?: string; // Which recommendation is being tested
}

/**
 * Validators for domain contracts
 */

export function validateHypothesis(hypothesis: Hypothesis): string[] {
  const errors: string[] = [];

  if (!hypothesis.statement || hypothesis.statement.length < 20) {
    errors.push("Hypothesis statement must be at least 20 characters");
  }

  if (!hypothesis.successMetric) {
    errors.push("Success metric is required");
  }

  if (hypothesis.successThreshold <= 0) {
    errors.push("Success threshold must be greater than 0%");
  }

  if (hypothesis.failureThreshold >= 0) {
    errors.push("Failure threshold must be negative (downside risk)");
  }

  if (hypothesis.testDurationWeeks < 1) {
    errors.push("Test duration must be at least 1 week");
  }

  if (hypothesis.reviewCadenceWeeks < 1 || hypothesis.reviewCadenceWeeks > hypothesis.testDurationWeeks) {
    errors.push("Review cadence must be 1+ weeks and <= test duration");
  }

  return errors;
}

export function validateExperimentPlan(plan: ExperimentPlan): string[] {
  const errors: string[] = [];

  const hypothesisErrors = validateHypothesis(plan.hypothesis);
  errors.push(...hypothesisErrors);

  if (!plan.actionDescription || plan.actionDescription.length < 20) {
    errors.push("Action description must be at least 20 characters");
  }

  if (!plan.primaryMetric) {
    errors.push("Primary metric is required");
  }

  if (plan.secondaryMetrics.length === 0) {
    errors.push("At least one secondary metric is required");
  }

  if (plan.confoundingFactors.length === 0) {
    errors.push("Must identify at least one potential confounding factor");
  }

  if (plan.estimatedCost < 0) {
    errors.push("Estimated cost cannot be negative");
  }

  if (plan.riskLevel === "critical" && plan.requiredApprovals.length === 0) {
    errors.push("Critical-risk experiments must have required approvals");
  }

  return errors;
}

export function validateExperimentExecution(execution: ExperimentExecution): string[] {
  const errors: string[] = [];

  if (execution.status !== "draft" && !execution.startedAt) {
    errors.push("Started experiments must have a startedAt timestamp");
  }

  if (execution.percentComplete < 0 || execution.percentComplete > 100) {
    errors.push("Percent complete must be 0-100");
  }

  if (execution.status === "completed" && !execution.actualEndDate) {
    errors.push("Completed experiments must have an actualEndDate");
  }

  if (execution.actualEndDate && execution.startedAt && execution.actualEndDate < execution.startedAt) {
    errors.push("Actual end date cannot be before start date");
  }

  return errors;
}

export function validateExperimentResult(result: ExperimentResult): string[] {
  const errors: string[] = [];

  if (result.primaryMetricValue === undefined || result.primaryMetricValue === null) {
    errors.push("Primary metric value is required");
  }

  if (result.primaryMetricChange === undefined || result.primaryMetricChange === null) {
    errors.push("Primary metric change is required");
  }

  if (result.actualCost < 0) {
    errors.push("Actual cost cannot be negative");
  }

  if (result.confidenceLevel !== undefined && (result.confidenceLevel < 0 || result.confidenceLevel > 100)) {
    errors.push("Confidence level must be 0-100");
  }

  if (result.classification === "success" && !result.successThresholdMet) {
    errors.push("Classification cannot be 'success' if threshold not met");
  }

  return errors;
}

export function validateExperiment(experiment: Experiment): string[] {
  const errors: string[] = [];

  if (!experiment.id || experiment.id.trim() === "") {
    errors.push("Experiment ID is required");
  }

  if (!experiment.workspaceId || experiment.workspaceId.trim() === "") {
    errors.push("Workspace ID is required");
  }

  if (!experiment.engagementId || experiment.engagementId.trim() === "") {
    errors.push("Engagement ID is required");
  }

  if (!experiment.name || experiment.name.length < 5) {
    errors.push("Experiment name must be at least 5 characters");
  }

  const planErrors = validateExperimentPlan(experiment.plan);
  if (planErrors.length > 0) {
    errors.push(`Plan validation errors: ${planErrors.join("; ")}`);
  }

  if (experiment.execution) {
    const executionErrors = validateExperimentExecution(experiment.execution);
    errors.push(...executionErrors);
  }

  if (experiment.result) {
    const resultErrors = validateExperimentResult(experiment.result);
    errors.push(...resultErrors);
  }

  return errors;
}
