/**
 * Shock Events Domain Contract (Phase 4)
 *
 * Defines shock event types, classification, and audit trail structure.
 * Shock events are critical signals that survival factors have crossed thresholds.
 */

import type { SurvivalFactor, SurvivalFactorCategory } from "@/domain/reality/survival-factors";

export enum ShockEventType {
  FACTOR_CRITICAL = "FACTOR_CRITICAL",
  MULTIPLE_CRITICAL = "MULTIPLE_CRITICAL",
  CATEGORY_CRISIS = "CATEGORY_CRISIS",
  SURVIVAL_THREAT = "SURVIVAL_THREAT",
}

export enum ShockState {
  DETECTED = "DETECTED",
  ACKNOWLEDGED = "ACKNOWLEDGED",
  ESCALATED = "ESCALATED",
  RESOLVED = "RESOLVED",
}

export interface ShockEvent {
  id: string;
  type: ShockEventType;
  state: ShockState;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  primaryCategory: SurvivalFactorCategory;
  triggeringFactors: SurvivalFactor[];
  detectedAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  workspaceId: string;
  detectedBy?: string; // User ID who detected or confirmed
  acknowledgedBy?: string; // User ID who acknowledged
  notes?: string;
}

export interface ShockEventSignal {
  id: string;
  shockDetected: boolean;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  category: SurvivalFactorCategory;
  triggeringFactors: SurvivalFactor[];
  recommendedAction: string;
  detectedAt: Date;
  workspaceId: string;
}

export interface ShockEventAuditTrail {
  shockEventId: string;
  workspaceId: string;
  eventType: ShockEventType;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  stateChanges: Array<{
    fromState: ShockState;
    toState: ShockState;
    changedAt: Date;
    changedBy: string;
    reason?: string;
  }>;
  triggeringFactors: SurvivalFactor[];
  detectedAt: Date;
  lastUpdatedAt: Date;
}

/**
 * Shock event state machine
 */
export const SHOCK_STATE_TRANSITIONS: Record<ShockState, ShockState[]> = {
  [ShockState.DETECTED]: [ShockState.ACKNOWLEDGED, ShockState.ESCALATED],
  [ShockState.ACKNOWLEDGED]: [ShockState.RESOLVED, ShockState.ESCALATED],
  [ShockState.ESCALATED]: [ShockState.ACKNOWLEDGED, ShockState.RESOLVED],
  [ShockState.RESOLVED]: [], // Terminal state
};

/**
 * Validate shock state transition
 */
export function validateShockTransition(fromState: ShockState, toState: ShockState): void {
  const allowed = SHOCK_STATE_TRANSITIONS[fromState];
  if (!allowed.includes(toState)) {
    throw new Error(
      `Invalid shock state transition: ${fromState} → ${toState}. Allowed: ${allowed.join(", ") || "none (terminal)"}`
    );
  }
}
