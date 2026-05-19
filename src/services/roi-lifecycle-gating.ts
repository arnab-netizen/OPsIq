import { enrichMutationAuditEvent } from '@/infra/audit-enrichment';
/**
 * ROI/Impact Lifecycle Gating Service
 *
 * Enforces strict rules about when impact and ROI values can be recorded:
 * - Projected impact: allowed before execution (DRAFT, SUBMITTED, APPROVED)
 * - Realized impact: only after OUTCOME_RECORDED or CLOSED
 * - Final ROI: only when decision is CLOSED
 * - Terminal decisions (FAILED, CANCELLED, REJECTED): excluded from realized ROI
 * - Duplicate outcomes: rejected
 * - Outcome changes after CLOSED: rejected
 */

import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { logger } from "@/infra/logger";
import { requireServiceContext } from "@/lib/service-auth";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  DecisionState,
  isTerminalState,
  TERMINAL_STATES,
} from "@/domain/decision-lifecycle";
import { ValidationError, NotFoundError, ConflictError } from "@/infra/errors";

/**
 * Impact type classification
 */
export type ImpactType = "projected" | "realized" | "final";

/**
 * Impact recording request
 */
export interface ImpactRecordingRequest {
  decisionId: string;
  workspaceId: string;
  impactType: ImpactType;
  actualOutcomeValue?: number;
  expectedOutcomeValue?: number;
  actualOutcome?: string;
}

/**
 * ROI recording request
 */
export interface ROIRecordingRequest {
  decisionId: string;
  workspaceId: string;
  roiValue: number;
  markFinal?: boolean;
}

/**
 * Impact validation result
 */
export interface ImpactValidationResult {
  allowed: boolean;
  reason?: string;
  requiredState?: DecisionState;
}

/**
 * Helper to map status to state
 */
function mapStatusToState(status: string): DecisionState | string {
  const stateMap: Record<string, DecisionState> = {
    draft: "DRAFT",
    submitted: "SUBMITTED",
    approved: "APPROVED",
    in_progress: "EXECUTED",
    outcome_recorded: "OUTCOME_RECORDED",
    done: "OUTCOME_RECORDED",
    closed: "CLOSED",
    rejected: "REJECTED",
    blocked: "REJECTED",
    cancelled: "CANCELLED",
    failed: "FAILED",
  };

  return stateMap[status?.toLowerCase()] || status;
}

/**
 * Validate if projected impact can be recorded
 *
 * Projected impact (expectedOutcomeValue) allowed before execution:
 * DRAFT, SUBMITTED, APPROVED
 */
export function validateProjectedImpactRecording(
  state: DecisionState | string
): ImpactValidationResult {
  const allowedStates: (DecisionState | string)[] = ["DRAFT", "SUBMITTED", "APPROVED"];

  if (allowedStates.includes(state as any)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Projected impact can only be recorded before execution (DRAFT, SUBMITTED, APPROVED). Current state: ${state}`,
    requiredState: "DRAFT" as DecisionState,
  };
}

/**
 * Validate if realized impact can be recorded
 *
 * Realized impact (actualOutcomeValue) allowed only after:
 * OUTCOME_RECORDED, CLOSED
 *
 * NOT allowed for terminal failure states:
 * FAILED, CANCELLED, REJECTED
 */
export function validateRealizedImpactRecording(
  state: DecisionState | string
): ImpactValidationResult {
  // Cannot record realized impact for decisions that failed/cancelled/rejected
  const excludedTerminalStates = ["FAILED", "CANCELLED", "REJECTED"];
  if (excludedTerminalStates.includes(state as any)) {
    return {
      allowed: false,
      reason: `Cannot record realized impact for ${state} decisions. Failed/cancelled/rejected decisions are excluded from realized ROI.`,
    };
  }

  // Must be in outcome recorded or closed state
  const allowedStates: (DecisionState | string)[] = ["OUTCOME_RECORDED", "CLOSED"];
  if (allowedStates.includes(state as any)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Realized impact can only be recorded after outcome is recorded (OUTCOME_RECORDED, CLOSED). Current state: ${state}`,
    requiredState: "OUTCOME_RECORDED" as DecisionState,
  };
}

/**
 * Validate if ROI can be marked final
 *
 * Final ROI only allowed when decision is CLOSED
 */
export function validateFinalROIMarking(
  state: DecisionState | string
): ImpactValidationResult {
  if (state === "CLOSED") {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `ROI can only be marked final when decision is CLOSED. Current state: ${state}`,
    requiredState: "CLOSED" as DecisionState,
  };
}

/**
 * Record impact with strict lifecycle gating
 *
 * Enforces:
 * - Projected impact before execution
 * - Realized impact only after outcome recorded
 * - Terminal failure decisions excluded
 * - Duplicate outcome rejected
 * - Outcome changes after closed rejected
 */
export async function recordImpactWithGating(
  request: ImpactRecordingRequest,
  authContext: CanonicalAuthContext
): Promise<{ decisionId: string; impactType: ImpactType; recorded: boolean }> {
  // Verify auth
  requireServiceContext(authContext, request.workspaceId);

  const { decisionId, workspaceId, impactType, actualOutcomeValue, actualOutcome } = request;

  try {
    // Fetch decision
    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });

    if (!decision) {
      throw new NotFoundError("Decision", decisionId);
    }

    const state = mapStatusToState(decision.status);

    logger.info("Recording impact with gating", {
      decisionId,
      impactType,
      state,
      workspaceId,
    });

    // Route to appropriate validation based on impact type
    if (impactType === "projected") {
      const validation = validateProjectedImpactRecording(state);
      if (!validation.allowed) {
        throw new ValidationError(validation.reason || "Invalid state for projected impact");
      }

      // Projected impact stored as expectedOutcomeValue, no gating needed beyond state check
      await db.operatorItem.update({
        where: { id: decisionId },
        data: {
          impactExpected: request.expectedOutcomeValue || null,
          updatedAt: new Date(),
          lastUpdatedBy: authContext.verifiedActorId,
        },
      });

      await emitAuditEvent({
        eventName: AUDIT_EVENTS.DECISION_IMPACT_PROJECTED,
        actorId: authContext.verifiedActorId,
        entityType: "decision",
        entityId: decisionId,
        workspaceId,
        payload: { expectedValue: request.expectedOutcomeValue },
        visibility: "internal",
      });

      logger.info("Projected impact recorded", {
        decisionId,
        expectedValue: request.expectedOutcomeValue,
      });

      return { decisionId, impactType: "projected", recorded: true };
    }

    if (impactType === "realized") {
      const validation = validateRealizedImpactRecording(state);
      if (!validation.allowed) {
        throw new ValidationError(validation.reason || "Invalid state for realized impact");
      }

      // Check if outcome change after closed (terminal immutability check first)
      if (state === "CLOSED" && decision.actualOutcomeValue !== null) {
        throw new ConflictError(
          "Closed decision immutability: Cannot modify outcome for Closed decisions."
        );
      }

      // Check for duplicate outcome
      if (decision.actualOutcomeValue !== null && decision.actualOutcomeValue !== undefined) {
        throw new ConflictError(
          "Duplicate outcome: Decision already has recorded outcome. Cannot re-record after outcome is set."
        );
      }

      // Record actual outcome
      await db.operatorItem.update({
        where: { id: decisionId },
        data: {
          actualOutcomeValue: actualOutcomeValue || null,
          actualOutcome: actualOutcome || null,
          updatedAt: new Date(),
          lastUpdatedBy: authContext.verifiedActorId,
        },
      });

      await emitAuditEvent({
        eventName: AUDIT_EVENTS.DECISION_IMPACT_REALIZED,
        actorId: authContext.verifiedActorId,
        entityType: "decision",
        entityId: decisionId,
        workspaceId,
        payload: { actualValue: actualOutcomeValue, actualOutcome },
        visibility: "internal",
      });

      logger.info("Realized impact recorded", {
        decisionId,
        actualValue: actualOutcomeValue,
        actualOutcome,
      });

      return { decisionId, impactType: "realized", recorded: true };
    }

    throw new ValidationError(`Unknown impact type: ${impactType}`);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ConflictError || error instanceof NotFoundError) {
      throw error;
    }
    logger.error("Error recording impact with gating", {
      decisionId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Record ROI with strict lifecycle gating
 *
 * Enforces:
 * - Final ROI only when CLOSED
 * - Excludes failed/cancelled/rejected from realized ROI
 * - Prevents ROI marking before decision is closed
 */
export async function recordROIWithGating(
  request: ROIRecordingRequest,
  authContext: CanonicalAuthContext
): Promise<{ decisionId: string; roiValue: number; isFinal: boolean }> {
  // Verify auth
  requireServiceContext(authContext, request.workspaceId);

  const { decisionId, workspaceId, roiValue, markFinal } = request;

  try {
    // Fetch decision
    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });

    if (!decision) {
      throw new NotFoundError("Decision", decisionId);
    }

    const state = mapStatusToState(decision.status);

    logger.info("Recording ROI with gating", {
      decisionId,
      roiValue,
      markFinal,
      state,
      workspaceId,
    });

    // Check if decision is in terminal failure state
    if (["FAILED", "CANCELLED", "REJECTED"].includes(state as any)) {
      throw new ValidationError(
        `Cannot record ROI for ${state} decisions. Failed/cancelled/rejected decisions are excluded from realized ROI.`
      );
    }

    // If marking final, must be CLOSED
    if (markFinal) {
      const validation = validateFinalROIMarking(state);
      if (!validation.allowed) {
        throw new ValidationError(validation.reason || "ROI cannot be marked final in current state");
      }
    }

    // Record ROI
    await db.operatorItem.update({
      where: { id: decisionId },
      data: {
        impactActual: roiValue,
        isROIFinal: markFinal ? true : false,
        updatedAt: new Date(),
        lastUpdatedBy: authContext.verifiedActorId,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.DECISION_ROI_RECORDED,
      actorId: authContext.verifiedActorId,
      entityType: "decision",
      entityId: decisionId,
      workspaceId,
      payload: { roiValue, isFinal: markFinal },
      visibility: "internal",
    });

    logger.info("ROI recorded with gating", {
      decisionId,
      roiValue,
      isFinal: markFinal,
    });

    return { decisionId, roiValue, isFinal: markFinal || false };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    logger.error("Error recording ROI with gating", {
      decisionId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Validate decision state allows impact modification
 *
 * Used before allowing any impact/ROI changes
 */
export function validateImpactModificationAllowed(
  state: DecisionState | string
): ImpactValidationResult {
  // Cannot modify any impact data for closed decisions
  if (state === "CLOSED") {
    return {
      allowed: false,
      reason: "Cannot modify impact data for closed decisions. Closed decisions are final.",
    };
  }

  // Cannot modify for terminal failure states
  if (["FAILED", "CANCELLED", "REJECTED"].includes(state as any)) {
    return {
      allowed: false,
      reason: `Cannot modify impact for ${state} decisions.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if decision can contribute to realized ROI calculation
 *
 * Returns true only for OUTCOME_RECORDED or CLOSED states
 * Excludes FAILED, CANCELLED, REJECTED
 */
export function canContributeToRealizedROI(state: DecisionState | string): boolean {
  // Excluded terminal states
  if (["FAILED", "CANCELLED", "REJECTED"].includes(state as any)) {
    return false;
  }

  // Only outcome recorded and closed can contribute
  return ["OUTCOME_RECORDED", "CLOSED"].includes(state as any);
}

/**
 * Get impact restrictions for a decision state
 *
 * Returns human-readable summary of what's allowed
 */
export function getImpactRestrictionsForState(
  state: DecisionState | string
): {
  canRecordProjected: boolean;
  canRecordRealized: boolean;
  canMarkFinalROI: boolean;
  reason: string;
} {
  const projected = validateProjectedImpactRecording(state);
  const realized = validateRealizedImpactRecording(state);
  const finalROI = validateFinalROIMarking(state);

  const reasons: string[] = [];
  if (!projected.allowed) reasons.push("Cannot record projected impact");
  if (!realized.allowed) reasons.push("Cannot record realized impact");
  if (!finalROI.allowed) reasons.push("Cannot mark ROI final");

  return {
    canRecordProjected: projected.allowed,
    canRecordRealized: realized.allowed,
    canMarkFinalROI: finalROI.allowed,
    reason: reasons.join("; ") || "All impact operations allowed for this state",
  };
}
