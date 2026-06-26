/**
 * R26 — Vendor data scoping + access-code revocation (§3.9, §3.12, §42, §43, §47). Pure.
 *
 * Vendor-visible records are scoped projections — never financial thresholds, other quotes,
 * prior cost history, margins, or internal staff data. Access codes display only within a
 * task-active session window, every view is audited, and display is revoked after the task
 * completes/cancels/expires; an un-audited view raises a harm event.
 */

export interface FullIssueRecord {
  issueDescription: string;
  locationTaskDetails: string;
  requiredProof: string;
  scheduledTimeMs: number;
  communicationChannel: string;
  quoteSubmissionFields: string[];
  // The following must NEVER appear in a vendor projection:
  ownerApprovalThreshold: number;
  otherVendorQuotes: number[];
  priorRepairCostHistory: number[];
  workspaceFinancials: unknown;
  locationUnitEconomics: unknown;
  ownerMargin: number;
  internalStaffReliability: unknown;
}

export interface VendorProjection {
  issueDescription: string;
  locationTaskDetails: string;
  requiredProof: string;
  scheduledTimeMs: number;
  communicationChannel: string;
  quoteSubmissionFields: string[];
}

/** Build the scoped projection a vendor may see — financial/internal fields are dropped. */
export function buildVendorProjection(issue: FullIssueRecord): VendorProjection {
  return {
    issueDescription: issue.issueDescription,
    locationTaskDetails: issue.locationTaskDetails,
    requiredProof: issue.requiredProof,
    scheduledTimeMs: issue.scheduledTimeMs,
    communicationChannel: issue.communicationChannel,
    quoteSubmissionFields: issue.quoteSubmissionFields,
  };
}

export const VENDOR_FORBIDDEN_FIELDS: readonly string[] = [
  "ownerApprovalThreshold", "otherVendorQuotes", "priorRepairCostHistory", "workspaceFinancials",
  "locationUnitEconomics", "ownerMargin", "internalStaffReliability",
];

/** A vendor projection must not carry any forbidden field. Returns any leaked field names. */
export function detectVendorLeak(projection: Record<string, unknown>): string[] {
  return VENDOR_FORBIDDEN_FIELDS.filter((f) => f in projection);
}

export type AccessCodeStatus = "ACCESS_CODE_VIEWED" | "ACCESS_CODE_REVOKED";
export type TaskAccessState = "ACTIVE" | "COMPLETED_VERIFIED" | "CANCELLED" | "REASSIGNED" | "EXPIRED";

/** Access code may display only while the task is active. */
export function accessCodeVisible(taskState: TaskAccessState): boolean {
  return taskState === "ACTIVE";
}

/** After completion/cancel/reassign/expiry, display must be revoked. */
export function accessCodeMustBeRevoked(taskState: TaskAccessState): boolean {
  return taskState !== "ACTIVE";
}

export interface AccessCodeView {
  taskState: TaskAccessState;
  auditLogged: boolean;
}

/** An access-code view without an audit log raises the §3.16 harm event. */
export function accessCodeViewHarm(v: AccessCodeView): "ACCESS_CODE_EXPOSED_WITHOUT_AUDIT" | null {
  return v.auditLogged ? null : "ACCESS_CODE_EXPOSED_WITHOUT_AUDIT";
}
