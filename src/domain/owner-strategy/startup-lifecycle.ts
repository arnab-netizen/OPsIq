/**
 * Startup session lifecycle state machine — pure domain, no I/O.
 * Defines valid transitions and terminal states.
 */
import { InvalidStateTransitionError } from "@/infra/errors";

export type StartupSessionStatus =
  | "DRAFT"
  | "CONTEXT_CAPTURE"
  | "DISCOVERY"
  | "IDEA_GENERATION"
  | "SCREENING"
  | "VALIDATION_PLANNED"
  | "VALIDATION_IN_PROGRESS"
  | "ECONOMICS_REVIEW"
  | "READINESS_REVIEW"
  | "OWNER_DECISION_REQUIRED"
  | "APPROVED"
  | "MODIFICATION_REQUIRED"
  | "ON_HOLD"
  | "REJECTED"
  | "EXECUTION_PLANNED"
  | "STALE_REAPPROVAL_REQUIRED"
  | "ACTIVE"; // real target of the F-STARTUP-NO-HANDOFF business handoff (see EXECUTION_PLANNED transitions below); its own outbound edges remain legacy reassessment paths

export const VALID_TRANSITIONS: Map<StartupSessionStatus, StartupSessionStatus[]> = new Map([
  ["DRAFT", ["CONTEXT_CAPTURE"]],
  ["CONTEXT_CAPTURE", ["DISCOVERY", "IDEA_GENERATION"]],
  ["DISCOVERY", ["IDEA_GENERATION"]],
  ["IDEA_GENERATION", ["SCREENING"]],
  ["SCREENING", ["VALIDATION_PLANNED", "ECONOMICS_REVIEW"]],
  ["VALIDATION_PLANNED", ["VALIDATION_IN_PROGRESS"]],
  ["VALIDATION_IN_PROGRESS", ["ECONOMICS_REVIEW", "SCREENING"]],
  ["ECONOMICS_REVIEW", ["READINESS_REVIEW"]],
  ["READINESS_REVIEW", ["OWNER_DECISION_REQUIRED"]],
  ["OWNER_DECISION_REQUIRED", ["APPROVED", "MODIFICATION_REQUIRED", "REJECTED", "ON_HOLD"]],
  ["APPROVED", ["EXECUTION_PLANNED", "STALE_REAPPROVAL_REQUIRED"]],
  ["MODIFICATION_REQUIRED", ["SCREENING", "IDEA_GENERATION", "CONTEXT_CAPTURE"]],
  ["ON_HOLD", ["OWNER_DECISION_REQUIRED", "REJECTED"]],
  ["REJECTED", []],
  ["EXECUTION_PLANNED", ["STALE_REAPPROVAL_REQUIRED", "ACTIVE"]],
  ["STALE_REAPPROVAL_REQUIRED", ["OWNER_DECISION_REQUIRED", "REJECTED"]],
  ["ACTIVE", ["CONTEXT_CAPTURE", "SCREENING", "OWNER_DECISION_REQUIRED"]], // legacy path
]);

export const TERMINAL_STATUSES: Set<StartupSessionStatus> = new Set(["REJECTED"]);

export function isTerminalStatus(status: StartupSessionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function assertValidTransition(
  from: StartupSessionStatus,
  to: StartupSessionStatus
): void {
  const allowed = VALID_TRANSITIONS.get(from) ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidStateTransitionError("OwnerStartupSession", from, to);
  }
}

export function getValidNextStatuses(from: StartupSessionStatus): StartupSessionStatus[] {
  return VALID_TRANSITIONS.get(from) ?? [];
}
