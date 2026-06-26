/**
 * Remaining governed surfaces — workload fairness (§37), inventory/consumables (§41),
 * maintenance/vendor lifecycle (§43), multi-location comparison (§78), AI quality
 * tracking (§69), location handover (§84). Pure.
 */

import type { RemoteRole } from "@/domain/remote-operations/remote-types";

/* ----- §37 workload fairness gate (preserves the Owner Mode lean principle) ----- */
export type PhysicalIntensity = "LOW" | "MEDIUM" | "HIGH";

export interface WorkloadInput {
  dailyTaskCount: number;
  maxDailyTasks: number;
  travelTimeKnown: boolean;
  physicalIntensity: PhysicalIntensity;
  overtimeRisk: boolean;
  isHighOrCritical: boolean;
}

export type WorkloadFlag = "OK" | "ASSIGNMENT_RISK_STAFF_OVERLOAD" | "WORKLOAD_DATA_INCOMPLETE";

export function assessWorkload(i: WorkloadInput): WorkloadFlag {
  if (!i.travelTimeKnown && i.isHighOrCritical) return "WORKLOAD_DATA_INCOMPLETE";
  const intensityWeight = i.physicalIntensity === "HIGH" ? 1.5 : i.physicalIntensity === "MEDIUM" ? 1.1 : 1;
  if (i.dailyTaskCount * intensityWeight > i.maxDailyTasks || i.overtimeRisk) return "ASSIGNMENT_RISK_STAFF_OVERLOAD";
  return "OK";
}

/** Employee fault must be distinguished from system causes (scheduling/access/supplies/vendor/etc). */
export type FailureCause = "EMPLOYEE" | "BAD_SCHEDULING" | "ACCESS_ISSUE" | "MISSING_INVENTORY" | "CUSTOMER_DELAY" | "VENDOR_DELAY" | "UNCLEAR_INSTRUCTION" | "MANAGER_PLANNING";
export function isEmployeeFault(cause: FailureCause): boolean {
  return cause === "EMPLOYEE";
}

/* ----- §41 inventory / consumables ----- */
export interface InventoryItem {
  name: string;
  currentStock: number;
  minimumStock: number;
  expectedUsage: number;
}
export function stockoutRisk(i: InventoryItem): boolean {
  return i.currentStock - i.expectedUsage < i.minimumStock;
}

/* ----- §43 maintenance / vendor lifecycle close gate ----- */
export interface MaintenanceCloseInput {
  vendorPrequalifiedWhereRequired: boolean;
  completionProofPresent: boolean;
  costInvoiceRecordedWhereApplicable: boolean;
  confirmationPresentWhereRequired: boolean;
  openDispute: boolean;
  repeatIssueWithinWindow: boolean;
}
export function canCloseMaintenanceVerified(i: MaintenanceCloseInput): string[] {
  const blocked: string[] = [];
  if (!i.vendorPrequalifiedWhereRequired) blocked.push("vendor_not_prequalified");
  if (!i.completionProofPresent) blocked.push("VENDOR_WORK_CLOSED_WITHOUT_PROOF");
  if (!i.costInvoiceRecordedWhereApplicable) blocked.push("cost_invoice_missing");
  if (!i.confirmationPresentWhereRequired) blocked.push("confirmation_missing");
  if (i.openDispute) blocked.push("open_dispute");
  if (i.repeatIssueWithinWindow) blocked.push("repeat_issue_within_window");
  return blocked;
}

/* ----- §78 multi-location comparison (downgrade ranking on unequal data) ----- */
export interface LocationCompareRow {
  locationId: string;
  verifiedCompletionRate: number;
  dataConfidence: "LOW" | "MEDIUM" | "HIGH";
}
export interface LocationComparison {
  ranked: LocationCompareRow[];
  rankingDowngraded: boolean;
}
export function compareLocations(rows: readonly LocationCompareRow[]): LocationComparison {
  const confidences = new Set(rows.map((r) => r.dataConfidence));
  const rankingDowngraded = confidences.size > 1 || confidences.has("LOW");
  const ranked = [...rows].sort((a, b) => b.verifiedCompletionRate - a.verifiedCompletionRate);
  return { ranked, rankingDowngraded };
}

/* ----- §69 AI review quality / override tracking ----- */
export type AiQualityStatus = "AI_FLAG_PENDING_HUMAN_REVIEW" | "AI_FLAG_CONFIRMED" | "AI_FLAG_OVERRIDDEN" | "AI_MISSED_ISSUE_LATER_FOUND" | "AI_REVIEW_NOT_DECISIVE";
export interface AiOverride {
  overridden: boolean;
  harmOccurredAfter: boolean;
}
/** An override that later caused harm raises the §3.16 harm event. */
export function aiOverrideHarm(o: AiOverride): "AI_FLAG_OVERRIDDEN_AND_HARM_OCCURRED" | null {
  return o.overridden && o.harmOccurredAfter ? "AI_FLAG_OVERRIDDEN_AND_HARM_OCCURRED" : null;
}

/* ----- §84 location handover ----- */
export const LOCATION_HANDOVER_FIELDS = [
  "openTasks", "unresolvedIssues", "accessKeyStatus", "pendingVendorWork", "knownComplaints",
  "inventoryStatus", "nextScheduledEvents", "activeRisks", "pendingOwnerDecisions", "incomingResponsibleManager",
] as const;
export type LocationHandoverField = typeof LOCATION_HANDOVER_FIELDS[number];

export interface LocationHandover {
  fields: Partial<Record<LocationHandoverField, string>>;
  incomingManagerAcknowledged: boolean;
}
export function assessLocationHandover(h: LocationHandover): { missing: LocationHandoverField[]; complete: boolean } {
  const missing = LOCATION_HANDOVER_FIELDS.filter((f) => typeof h.fields[f] !== "string" || h.fields[f]!.trim().length === 0);
  return { missing, complete: missing.length === 0 && h.incomingManagerAcknowledged };
}

/** Who may contact an external customer/tenant/guest (§46) — staff cannot by default. */
export function canContactExternalCustomer(role: RemoteRole): boolean {
  return role === "OWNER" || role === "OPERATIONS_MANAGER" || role === "SITE_SUPERVISOR";
}
