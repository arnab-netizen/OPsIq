/**
 * Experiment Lifecycle Service
 *
 * Manages experiment state transitions: draft → approved → active → completed → analyzed
 * Enforces validation at each transition.
 * Records audit events for all material operations.
 */

import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  validateExperiment,
  validateExperimentPlan,
  validateExperimentExecution,
  validateExperimentResult,
} from "@/domain/experiment/experiment";
import type {
  Experiment,
  ExperimentPlan,
  ExperimentExecution,
  ExperimentResult,
  ExperimentLearning,
  ExperimentStatus,
  OutcomeClassification,
} from "@/domain/experiment/experiment";

export class ExperimentLifecycleError extends Error {
  code: string;
  allowedTransitions?: ExperimentStatus[];

  constructor(code: string, message: string, allowedTransitions?: ExperimentStatus[]) {
    super(message);
    this.code = code;
    this.name = "ExperimentLifecycleError";
    this.allowedTransitions = allowedTransitions;
  }
}

/**
 * Create a new experiment in draft status
 */
export async function createExperiment(
  workspaceId: string,
  engagementId: string,
  plan: ExperimentPlan,
  name: string,
  description?: string,
  linkedDecisionId?: string,
  linkedActionId?: string,
  linkedRecommendationId?: string,
  userId?: string
): Promise<Experiment> {
  // Validate plan
  const planErrors = validateExperimentPlan(plan);
  if (planErrors.length > 0) {
    throw new ExperimentLifecycleError("INVALID_PLAN", `Plan validation failed: ${planErrors.join("; ")}`);
  }

  // Validate name
  if (!name || name.length < 5) {
    throw new ExperimentLifecycleError("INVALID_NAME", "Experiment name must be at least 5 characters");
  }

  const experimentId = `exp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  const experiment: Experiment = {
    id: experimentId,
    workspaceId,
    engagementId,
    createdAt: now,
    updatedAt: now,
    createdBy: userId || "system",
    status: "draft",
    name,
    description,
    plan,
    linkedDecisionId,
    linkedActionId,
    linkedRecommendationId,
  };

  // Validate full experiment
  const errors = validateExperiment(experiment);
  if (errors.length > 0) {
    throw new ExperimentLifecycleError("VALIDATION_FAILED", `Experiment validation failed: ${errors.join("; ")}`);
  }

  logger.info("Experiment created", {
    experimentId,
    workspaceId,
    engagementId,
    status: experiment.status,
    userId,
  });

  // Emit audit event
  if (userId) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EXPERIMENT_CREATED,
      actorId: userId,
      entityType: "Experiment",
      entityId: experimentId,
      workspaceId,
      capability: 'mutation',
      decision: 'experiment_created',
      requestId: randomUUID(),
      payload: {
        name,
        hypothesisType: plan.hypothesis.type,
        riskLevel: plan.riskLevel,
        engagementId,
      },
    }).catch((err) => logger.warn("Failed to emit audit event", { error: err.message }));
  }

  return experiment;
}

/**
 * Approve an experiment (draft → approved)
 */
export async function approveExperiment(
  experiment: Experiment,
  workspaceId: string,
  userId?: string
): Promise<Experiment> {
  // Validate workspace scoping
  if (experiment.workspaceId !== workspaceId) {
    throw new ExperimentLifecycleError("WORKSPACE_MISMATCH", "Experiment workspace does not match provided workspace");
  }

  // Validate current status
  if (experiment.status !== "draft") {
    throw new ExperimentLifecycleError(
      "INVALID_STATUS_TRANSITION",
      `Cannot approve experiment in ${experiment.status} status. Must be in draft status.`,
      ["draft"]
    );
  }

  // For critical-risk experiments, require approvals to be configured
  if (experiment.plan.riskLevel === "critical" && experiment.plan.requiredApprovals.length === 0) {
    throw new ExperimentLifecycleError(
      "APPROVALS_REQUIRED",
      "Critical-risk experiments must have requiredApprovals configured before approval"
    );
  }

  const updatedExperiment: Experiment = {
    ...experiment,
    status: "approved",
    updatedAt: new Date(),
  };

  logger.info("Experiment approved", {
    experimentId: experiment.id,
    workspaceId,
    userId,
  });

  // Emit audit event
  if (userId) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EXPERIMENT_APPROVED,
      actorId: userId,
      entityType: "Experiment",
      entityId: experiment.id,
      workspaceId,
      payload: {
        name: experiment.name,
        riskLevel: experiment.plan.riskLevel,
      },
    }).catch((err) => logger.warn("Failed to emit audit event", { error: err.message }));
  }

  return updatedExperiment;
}

/**
 * Start execution of an approved experiment (approved → active)
 */
export async function startExperiment(
  experiment: Experiment,
  workspaceId: string,
  userId?: string
): Promise<Experiment> {
  // Validate workspace scoping
  if (experiment.workspaceId !== workspaceId) {
    throw new ExperimentLifecycleError("WORKSPACE_MISMATCH", "Experiment workspace does not match provided workspace");
  }

  // Validate current status
  if (experiment.status !== "approved") {
    throw new ExperimentLifecycleError(
      "INVALID_STATUS_TRANSITION",
      `Cannot start experiment in ${experiment.status} status. Must be in approved status.`,
      ["approved"]
    );
  }

  const now = new Date();
  const targetEndDate = new Date(now);
  targetEndDate.setDate(targetEndDate.getDate() + experiment.plan.hypothesis.testDurationWeeks * 7);

  const execution: ExperimentExecution = {
    startedAt: now,
    targetEndDate,
    status: "active",
    percentComplete: 0,
    daysElapsed: 0,
    daysRemaining: experiment.plan.hypothesis.testDurationWeeks * 7,
    notes: [`Experiment started at ${now.toISOString()}`],
  };

  const updatedExperiment: Experiment = {
    ...experiment,
    status: "active",
    execution,
    updatedAt: now,
  };

  logger.info("Experiment started", {
    experimentId: experiment.id,
    workspaceId,
    startedAt: now,
    targetEndDate,
    userId,
  });

  // Emit audit event
  if (userId) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EXPERIMENT_STARTED,
      actorId: userId,
      entityType: "Experiment",
      entityId: experiment.id,
      workspaceId,
      capability: 'mutation',
      decision: 'experiment_started',
      requestId: randomUUID(),
      payload: {
        name: experiment.name,
        targetEndDate: targetEndDate.toISOString(),
        durationWeeks: experiment.plan.hypothesis.testDurationWeeks,
      },
    }).catch((err) => logger.warn("Failed to emit audit event", { error: err.message }));
  }

  return updatedExperiment;
}

/**
 * Update execution progress of an active experiment
 */
export async function updateExecution(
  experiment: Experiment,
  execution: Partial<ExperimentExecution>,
  workspaceId: string,
  userId?: string
): Promise<Experiment> {
  // Validate workspace scoping
  if (experiment.workspaceId !== workspaceId) {
    throw new ExperimentLifecycleError("WORKSPACE_MISMATCH", "Experiment workspace does not match provided workspace");
  }

  // Validate current status
  if (experiment.status !== "active" && experiment.status !== "completed") {
    throw new ExperimentLifecycleError(
      "INVALID_STATUS",
      `Cannot update execution for experiment in ${experiment.status} status. Must be active or completed.`,
      ["active", "completed"]
    );
  }

  if (!experiment.execution) {
    throw new ExperimentLifecycleError("NO_EXECUTION", "Experiment has no execution record. Must start experiment first.");
  }

  const updatedExecution: ExperimentExecution = {
    ...experiment.execution,
    ...execution,
    status: execution.status || experiment.status,
  };

  // Validate updated execution
  const executionErrors = validateExperimentExecution(updatedExecution);
  if (executionErrors.length > 0) {
    throw new ExperimentLifecycleError(
      "INVALID_EXECUTION",
      `Execution validation failed: ${executionErrors.join("; ")}`
    );
  }

  // Handle early stopping
  let newStatus: ExperimentStatus = experiment.status;
  if (updatedExecution.stoppedEarly && !experiment.execution.stoppedEarly) {
    newStatus = "completed";
    logger.info("Experiment stopped early", {
      experimentId: experiment.id,
      reason: updatedExecution.stoppingReason,
    });
  }

  const updatedExperiment: Experiment = {
    ...experiment,
    status: newStatus,
    execution: updatedExecution,
    updatedAt: new Date(),
  };

  if (userId && (execution.percentComplete || updatedExecution.stoppedEarly)) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EXPERIMENT_PROGRESS_UPDATED,
      actorId: userId,
      entityType: "Experiment",
      entityId: experiment.id,
      workspaceId,
      payload: {
        percentComplete: updatedExecution.percentComplete,
        stoppedEarly: updatedExecution.stoppedEarly,
        stoppingReason: updatedExecution.stoppingReason,
      },
    }).catch((err) => logger.warn("Failed to emit audit event", { error: err.message }));
  }

  return updatedExperiment;
}

/**
 * Record result of completed experiment (completed → analyzed)
 */
export async function recordResult(
  experiment: Experiment,
  result: ExperimentResult,
  workspaceId: string,
  userId?: string
): Promise<Experiment> {
  // Validate workspace scoping
  if (experiment.workspaceId !== workspaceId) {
    throw new ExperimentLifecycleError("WORKSPACE_MISMATCH", "Experiment workspace does not match provided workspace");
  }

  // Validate current status - can record for completed or analyzed
  if (experiment.status !== "completed" && experiment.status !== "active") {
    throw new ExperimentLifecycleError(
      "INVALID_STATUS",
      `Cannot record result for experiment in ${experiment.status} status. Must be active or completed.`,
      ["active", "completed"]
    );
  }

  // Validate result
  const resultErrors = validateExperimentResult(result);
  if (resultErrors.length > 0) {
    throw new ExperimentLifecycleError("INVALID_RESULT", `Result validation failed: ${resultErrors.join("; ")}`);
  }

  const updatedExperiment: Experiment = {
    ...experiment,
    status: "analyzed",
    result,
    updatedAt: new Date(),
  };

  logger.info("Experiment result recorded", {
    experimentId: experiment.id,
    workspaceId,
    classification: result.classification,
    successThresholdMet: result.successThresholdMet,
    userId,
  });

  // Emit audit event
  if (userId) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EXPERIMENT_RESULT_RECORDED,
      actorId: userId,
      entityType: "Experiment",
      entityId: experiment.id,
      workspaceId,
      payload: {
        classification: result.classification,
        primaryMetricChange: result.primaryMetricChange,
        roi: result.roi,
        confidenceLevel: result.confidenceLevel,
      },
    }).catch((err) => logger.warn("Failed to emit audit event", { error: err.message }));
  }

  return updatedExperiment;
}

/**
 * Capture learning from analyzed experiment
 */
export async function captureLearning(
  experiment: Experiment,
  learning: ExperimentLearning,
  workspaceId: string,
  userId?: string
): Promise<Experiment> {
  // Validate workspace scoping
  if (experiment.workspaceId !== workspaceId) {
    throw new ExperimentLifecycleError("WORKSPACE_MISMATCH", "Experiment workspace does not match provided workspace");
  }

  // Validate current status - must have result recorded
  if (!experiment.result) {
    throw new ExperimentLifecycleError(
      "NO_RESULT",
      "Must record result before capturing learning. Result not found."
    );
  }

  // Validate status
  if (experiment.status !== "analyzed") {
    throw new ExperimentLifecycleError(
      "INVALID_STATUS",
      `Cannot capture learning for experiment in ${experiment.status} status. Must be analyzed.`,
      ["analyzed"]
    );
  }

  // Basic learning validation
  if (!learning.keyFinding || learning.keyFinding.length < 10) {
    throw new ExperimentLifecycleError(
      "INVALID_LEARNING",
      "Key finding must be at least 10 characters"
    );
  }

  if (!learning.implications || learning.implications.length < 10) {
    throw new ExperimentLifecycleError(
      "INVALID_LEARNING",
      "Implications must be at least 10 characters"
    );
  }

  const updatedExperiment: Experiment = {
    ...experiment,
    learning,
    status: "archived", // Mark as archived after learning captured
    updatedAt: new Date(),
  };

  logger.info("Experiment learning captured", {
    experimentId: experiment.id,
    workspaceId,
    nextAction: learning.nextAction,
    userId,
  });

  // Emit audit event
  if (userId) {