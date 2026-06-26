/**
 * R23 — Location/site readiness, risk score, no-false-green + stale data (§19, §39, §3.15).
 * Pure.
 *
 * A site cannot be READY_VERIFIED / a location cannot be GREEN_VERIFIED while proof is
 * missing/weak, a complaint/dispute/critical issue is open, a verifier step is missing, or
 * the data is stale. GREY_NO_DATA is UNKNOWN risk, not low risk, and escalates on age.
 */

import type { ReadinessStatus, LocationRisk } from "@/domain/remote-operations/remote-types";

export interface ReadinessBlockers {
  criticalTaskOpen: boolean;
  upstreamDependencyUnverified: boolean;
  proofMissing: boolean;
  proofInsufficient: boolean;
  customerDisputeOpen: boolean;
  criticalMaintenanceUnresolved: boolean;
  keyAccessUnresolved: boolean;
  safetyComplianceOpen: boolean;
  supervisorVerificationMissing: boolean;
  managerReviewMissing: boolean;
  dataStale: boolean;
  locationPaused: boolean;
}

/** A unit/site is READY_VERIFIED only when NO blocker is present. */
export function assessReadiness(b: ReadinessBlockers): ReadinessStatus {
  if (b.locationPaused) return "READY_BLOCKED";
  if (b.safetyComplianceOpen || b.criticalMaintenanceUnresolved || b.keyAccessUnresolved) return "READY_BLOCKED";
  if (b.customerDisputeOpen) return "READY_DISPUTED";
  if (b.criticalTaskOpen) return "READY_PENDING_TASKS";
  if (b.upstreamDependencyUnverified) return "READY_PENDING_DEPENDENCIES";
  if (b.proofMissing || b.proofInsufficient) return "READY_PENDING_PROOF";
  if (b.supervisorVerificationMissing) return "READY_PENDING_SUPERVISOR";
  if (b.managerReviewMissing) return "READY_PENDING_MANAGER";
  if (b.dataStale) return "READY_EXPIRED";
  return "READY_VERIFIED";
}

export interface LocationRiskSignals {
  hasData: boolean;
  dataStale: boolean;
  criticalOrEmergencyComplaint: boolean;
  safetyIssueOpen: boolean;
  verifiedFalseCompletionLast24h: boolean;
  dispatchBypassedVeto: boolean;
  accessKeyCriticalFailureWithOccupancy: boolean;
  highComplaintOpen: boolean;
  proofRejectionRateOver20: boolean;
  criticalTaskOverdue2h: boolean;
  handoverUnacknowledgedAfterShift: boolean;
  mediumComplaintOpen: boolean;
  proofMissingRateOver10: boolean;
  disputeOpen: boolean;
  paused: boolean;
  blocked: boolean;
  /** Any condition that forbids GREEN_VERIFIED (no false green, §39). */
  greenBlockers: boolean;
}

/** Assess location risk with the no-false-green rule and §39 thresholds. */
export function assessLocationRisk(s: LocationRiskSignals): LocationRisk {
  if (s.blocked) return "BLOCKED";
  if (s.paused) return "PAUSED";
  if (s.disputeOpen) return "DISPUTED";
  if (!s.hasData) return "GREY_NO_DATA";
  if (s.criticalOrEmergencyComplaint || s.safetyIssueOpen || s.verifiedFalseCompletionLast24h
    || s.dispatchBypassedVeto || s.accessKeyCriticalFailureWithOccupancy) return "RED_CRITICAL";
  if (s.highComplaintOpen || s.proofRejectionRateOver20 || s.criticalTaskOverdue2h || s.handoverUnacknowledgedAfterShift) return "ORANGE_ACTION_REQUIRED";
  if (s.mediumComplaintOpen || s.proofMissingRateOver10) return "YELLOW_MONITOR";
  // No false green: any green-blocker (incl. stale data) downgrades to low confidence.
  if (s.greenBlockers || s.dataStale) return "GREEN_LOW_CONFIDENCE";
  return "GREEN_VERIFIED";
}

/** §3.15 default staleness windows (ms). */
export const STALE_WINDOW_MS = {
  daily_proof: 24 * 60 * 60 * 1000,
  attendance_checkin: 2 * 60 * 60 * 1000,
  green_risk_score: 4 * 60 * 60 * 1000,
  inventory_count: 72 * 60 * 60 * 1000,
  vendor_quote: 7 * 24 * 60 * 60 * 1000,
} as const;

export function isStale(kind: keyof typeof STALE_WINDOW_MS, ageMs: number): boolean {
  return ageMs > STALE_WINDOW_MS[kind];
}

export type GreyEscalation = "NONE" | "MANAGER_NOTIFY" | "OWNER_ESCALATE";

/** GREY_NO_DATA on an active location: notify manager after 24h, escalate to owner after 48h. */
export function greyNoDataEscalation(ageMs: number): GreyEscalation {
  if (ageMs >= 48 * 60 * 60 * 1000) return "OWNER_ESCALATE";
  if (ageMs >= 24 * 60 * 60 * 1000) return "MANAGER_NOTIFY";
  return "NONE";
}
