/**
 * R30 — Upgrade hardening (§62 cross-location pooling, §81 SLA linkage, §82 communication
 * log, §43 vendor prequalification registry). Pure.
 */

import type { RemoteRole } from "@/domain/remote-operations/remote-types";

/** §62 cross-location capacity pooling — a candidate from another location. */
export interface BackupCandidate {
  staffId: string;
  locationId: string;
  qualifiedForTaskType: boolean;
  available: boolean;
  travelMinutes: number;
}

export interface CrossLocationBackupResult {
  candidates: BackupCandidate[];
  /** Presented as a manager/owner option, NOT auto-dispatched unless pre-approved rules exist. */
  autoDispatch: boolean;
}

export function findCrossLocationBackup(candidates: readonly BackupCandidate[], preApprovedAutoDispatch: boolean): CrossLocationBackupResult {
  const eligible = candidates.filter((c) => c.qualifiedForTaskType && c.available).sort((a, b) => a.travelMinutes - b.travelMinutes);
  return { candidates: eligible, autoDispatch: preApprovedAutoDispatch && eligible.length > 0 };
}

/** §81 SLA / service-promise linkage — alert BEFORE breach, not only after. */
export type SlaStatus = "ON_TRACK" | "AT_RISK" | "WILL_MISS" | "BREACHED";

export function slaStatus(slaDeadlineMs: number, nowMs: number, estimatedCompletionMs: number, atRiskBufferMs = 60 * 60 * 1000): SlaStatus {
  if (nowMs > slaDeadlineMs) return "BREACHED";
  if (estimatedCompletionMs > slaDeadlineMs) return "WILL_MISS";
  if (estimatedCompletionMs > slaDeadlineMs - atRiskBufferMs) return "AT_RISK";
  return "ON_TRACK";
}

/** §82 communication log note. */
export interface CommNote {
  author: string;
  role: RemoteRole;
  timestampMs: number;
  linkedObjectId: string;
  message: string;
  visibilityScope: "STAFF" | "SUPERVISOR" | "MANAGER" | "OWNER" | "EXTERNAL";
}

export function validateCommNote(n: CommNote): string[] {
  const v: string[] = [];
  if (typeof n.author !== "string" || n.author.trim().length === 0) v.push("missing_author");
  if (typeof n.linkedObjectId !== "string" || n.linkedObjectId.trim().length === 0) v.push("missing_linked_object");
  if (!(n.timestampMs > 0)) v.push("missing_timestamp");
  return v;
}

/** §43 vendor prequalification registry. */
export interface VendorRecord {
  vendorId: string;
  approvedTaskTypes: string[];
  licencesValid: boolean;
  insuranceValid: boolean;
  documentExpiryMs?: number;
  status: "APPROVED" | "BLOCKED" | "PENDING";
}

export interface VendorDispatchCheck {
  dispatchable: boolean;
  reasons: string[];
  expiredDocsNotify: boolean;
}

/** A vendor is dispatchable only when approved, qualified for the task, and docs are valid/unexpired. */
export function checkVendorDispatchable(v: VendorRecord, taskType: string, nowMs: number): VendorDispatchCheck {
  const reasons: string[] = [];
  if (v.status !== "APPROVED") reasons.push("vendor_not_approved");
  if (!v.approvedTaskTypes.includes(taskType)) reasons.push("task_type_not_approved");
  if (!v.licencesValid) reasons.push("licence_invalid");
  if (!v.insuranceValid) reasons.push("insurance_invalid");
  const expired = typeof v.documentExpiryMs === "number" && v.documentExpiryMs <= nowMs;
  if (expired) reasons.push("documents_expired");
  return { dispatchable: reasons.length === 0, reasons, expiredDocsNotify: expired };
}
