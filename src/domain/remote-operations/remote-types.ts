/**
 * Owner Mode — Location-Aware Remote Operations: shared vocabulary (pure).
 *
 * This is an Owner Mode capability. It reuses the existing Owner Mode governance
 * vocabulary (TrainingSeverity, RecommendationConfidence, HarmType, the collective
 * CollectiveDecisionPacket) and adds only the genuinely-missing location/dispatch/
 * terminal/attendance vocabulary. No parallel decision/proof/learning engine.
 */

import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";

export type { TrainingSeverity, RecommendationConfidence };

/** Owner Mode role model (§9). */
export type RemoteRole =
  | "OWNER" | "OPERATIONS_MANAGER" | "SITE_SUPERVISOR" | "STAFF_MEMBER" | "CLEANER"
  | "RUNNER" | "MAINTENANCE_VENDOR" | "ADMIN" | "ACCOUNTANT"
  | "CUSTOMER_CONTACT" | "TENANT_CONTACT" | "GUEST_CONTACT";

export const FRONTLINE_ROLES: readonly RemoteRole[] = ["STAFF_MEMBER", "CLEANER", "RUNNER"];
export const EXTERNAL_CONTACT_ROLES: readonly RemoteRole[] = ["CUSTOMER_CONTACT", "TENANT_CONTACT", "GUEST_CONTACT"];

/** Role-scoped Owner Mode surfaces (§11) — not separate products. */
export type TerminalType = "EMPLOYEE" | "SUPERVISOR" | "MANAGER" | "OWNER";

/** Task risk / proof burden tiers (§25). */
export type RiskLevel = "LOW" | "STANDARD" | "HIGH" | "CRITICAL";
export type ProofBurden = "LIGHT" | "STANDARD" | "HIGH" | "CRITICAL";

/** High-risk tiers require the atomic transition gate + sequenced verification. */
export function isHighRisk(r: RiskLevel): boolean {
  return r === "HIGH" || r === "CRITICAL";
}

/** Task/action types (§17). */
export type RemoteTaskType =
  | "RECURRING_SERVICE" | "ONE_OFF_SERVICE" | "TURNOVER_SERVICE" | "INSPECTION" | "MAINTENANCE"
  | "EMERGENCY" | "COMPLAINT_RECOVERY" | "INVENTORY_RESTOCK" | "ACCESS_HANDOVER" | "KEY_RETURN"
  | "PAYMENT_COLLECTION" | "DAMAGE_REPORT" | "VENDOR_VISIT" | "CUSTOMER_FOLLOWUP"
  | "OWNER_APPROVAL_TASK" | "SHIFT_HANDOVER" | "QUALITY_AUDIT" | "LOCATION_HANDOVER"
  | "PRE_SHIFT_CHECK" | "VENDOR_PREQUALIFICATION_REVIEW";

/** Task/action status model (§18). */
export type RemoteTaskStatus =
  | "DRAFT" | "ASSIGNED" | "ASSIGNED_NOT_ACKNOWLEDGED" | "ACKNOWLEDGED" | "IN_PROGRESS"
  | "SUBMITTED" | "PROOF_MISSING" | "PROOF_INSUFFICIENT" | "PROOF_REJECTED"
  | "SUPERVISOR_REVIEW_REQUIRED" | "SUPERVISOR_VERIFIED" | "MANAGER_REVIEW_REQUIRED"
  | "MANAGER_REVIEWED" | "CUSTOMER_CONFIRMATION_PENDING" | "CUSTOMER_CONFIRMED"
  | "CUSTOMER_DISPUTED" | "DISPUTED" | "FAILED" | "REWORK_REQUIRED" | "OWNER_DECISION_REQUIRED"
  | "ESCALATED" | "COMPLETED_VERIFIED" | "COMPLETED_VERIFIED_PENDING_OUTCOME_WINDOW"
  | "COMPLETED_VERIFIED_OUTCOME_CONFIRMED" | "COMPLETED_VERIFIED_LATER_DISPUTED"
  | "CLOSED_UNVERIFIED" | "CANCELLED" | "PAUSED" | "BLOCKED";

/** Proof types (§22, governance-critical subset). */
export type ProofType =
  | "BEFORE_PHOTO" | "AFTER_PHOTO" | "CHECKLIST_COMPLETION" | "TIMESTAMP" | "LOCATION_TAG"
  | "SUPERVISOR_APPROVAL" | "CUSTOMER_CONFIRMATION" | "TENANT_CONFIRMATION" | "GUEST_CONFIRMATION"
  | "DAMAGE_REPORT" | "INVENTORY_USED" | "MAINTENANCE_PHOTO" | "PAYMENT_RECEIPT"
  | "KEY_HANDOVER_PROOF" | "KEY_RETURN_PROOF" | "ACCESS_CODE_CONFIRMATION" | "STAFF_NOTE"
  | "VENDOR_QUOTE" | "VENDOR_INVOICE" | "VENDOR_COMPLETION_PROOF" | "INSPECTION_REPORT"
  | "RANDOM_AUDIT_RESULT" | "OFFLINE_CAPTURE_RECORD" | "SHIFT_HANDOVER_RECORD" | "LOCATION_HANDOVER_RECORD";

/** Proof status (§23). */
export type ProofStatus =
  | "MISSING" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "INSUFFICIENT" | "CONTRADICTORY"
  | "STALE" | "DISPUTED" | "QUALITY_WEAK" | "MISSING_REQUIRED_VIEW" | "DUPLICATE_SUSPECTED"
  | "LOCATION_UNCONFIRMED" | "LOCATION_MISMATCH" | "TIMESTAMP_SUSPICIOUS" | "OFFLINE_CAPTURED"
  | "OFFLINE_SYNC_PENDING" | "OFFLINE_SYNCED" | "OFFLINE_TIMESTAMP_CONFLICT" | "METADATA_MISSING"
  | "CONTRADICTED_BY_COMPLAINT" | "ACCEPTED_LOW_CONFIDENCE" | "ACCEPTED_HIGH_CONFIDENCE";

/** Proof strength (§23). */
export type ProofStrength =
  | "NO_PROOF" | "SELF_REPORTED_ONLY" | "WEAK_PROOF" | "STANDARD_PROOF" | "MULTI_SOURCE_PROOF"
  | "VERIFIED_HIGH_CONFIDENCE" | "DISPUTED_PROOF" | "CONTRADICTORY_PROOF";

/** Site/unit readiness (§19). */
export type ReadinessStatus =
  | "NOT_READY" | "READY_PENDING_TASKS" | "READY_PENDING_DEPENDENCIES" | "READY_PENDING_PROOF"
  | "READY_PENDING_SUPERVISOR" | "READY_PENDING_MANAGER" | "READY_PENDING_CUSTOMER_OR_TENANT_CONFIRMATION"
  | "READY_VERIFIED" | "READY_DISPUTED" | "READY_BLOCKED" | "READY_LOW_CONFIDENCE" | "READY_EXPIRED";

/** Location risk score (§39). */
export type LocationRisk =
  | "GREEN_VERIFIED" | "GREEN_LOW_CONFIDENCE" | "YELLOW_MONITOR" | "ORANGE_ACTION_REQUIRED"
  | "RED_CRITICAL" | "GREY_NO_DATA" | "DISPUTED" | "PAUSED" | "BLOCKED";

/** Attendance / presence (§33). */
export type AttendanceStatus =
  | "SCHEDULED" | "PRE_SHIFT_ACK_PENDING" | "PRE_SHIFT_ACKNOWLEDGED" | "PRE_SHIFT_NO_RESPONSE_RISK"
  | "ASSIGNED_NOT_ACKNOWLEDGED" | "ACKNOWLEDGED" | "CHECKED_IN" | "CHECKED_IN_LOCATION_UNCONFIRMED"
  | "CHECKED_IN_LATE" | "NO_SHOW_RISK" | "NO_SHOW_CONFIRMED" | "LEFT_EARLY" | "SHIFT_COMPLETED"
  | "ATTENDANCE_DISPUTED" | "SUPERVISOR_CONFIRMED" | "MANAGER_CONFIRMED";

export type PresenceConfidence =
  | "PRESENCE_UNCONFIRMED" | "PRESENCE_SELF_REPORTED" | "PRESENCE_CHECKED_IN_WEAK"
  | "PRESENCE_SUPPORTED_BY_TASK_PROOF" | "PRESENCE_SUPPORTED_BY_SUPERVISOR"
  | "PRESENCE_SUPPORTED_BY_MULTI_SOURCE_PROOF" | "PRESENCE_DISPUTED";

/** The location hierarchy scope (§8). Every remote record is workspace- and location-scopeable. */
export interface LocationScope {
  workspaceId: string;
  businessId: string;
  locationId: string;
  clientAccountId?: string;
  propertyId?: string;
  unitId?: string;
}
