/**
 * R17 — Manager exception queue + integrity controls (§14, §87). Pure.
 *
 * The manager terminal handles exceptions but cannot close a critical issue without proof,
 * approve above threshold, hide owner-relevant escalation, or suppress repeated patterns.
 * Manager integrity signals are detected and feed reliability (sample-gated elsewhere).
 */

export interface ManagerIntegritySignals {
  closedIssueWithoutProof: boolean;
  downgradedSeverityAfterComplaint: boolean;
  repeatedlyClosedReopenedIssues: boolean;
  delayedEscalationBeyondPolicy: boolean;
  repeatedNearThresholdApprovals: boolean;
  bypassedVendorQuoteRequirement: boolean;
  resolvedComplaintWithoutCustomerResponse: boolean;
  suppressedRepeatedIssuePattern: boolean;
  changedRiskThresholdWithoutAudit: boolean;
}

/** Returns the manager integrity flags raised (empty = clean). */
export function detectManagerIntegrityIssues(s: ManagerIntegritySignals): string[] {
  const flags: string[] = [];
  if (s.closedIssueWithoutProof) flags.push("closed_issue_without_proof");
  if (s.downgradedSeverityAfterComplaint) flags.push("downgraded_severity_after_complaint");
  if (s.repeatedlyClosedReopenedIssues) flags.push("repeatedly_closed_reopened_issues");
  if (s.delayedEscalationBeyondPolicy) flags.push("MANAGER_SUPPRESSED_ESCALATION");
  if (s.repeatedNearThresholdApprovals) flags.push("repeated_near_threshold_approvals");
  if (s.bypassedVendorQuoteRequirement) flags.push("bypassed_vendor_quote_requirement");
  if (s.resolvedComplaintWithoutCustomerResponse) flags.push("resolved_complaint_without_customer_response");
  if (s.suppressedRepeatedIssuePattern) flags.push("suppressed_repeated_issue_pattern");
  if (s.changedRiskThresholdWithoutAudit) flags.push("changed_risk_threshold_without_audit");
  return flags;
}

export interface ManagerClosureInput {
  isCritical: boolean;
  hasRequiredProof: boolean;
  costAboveManagerThreshold: boolean;
  ownerRelevantEscalation: boolean;
  customerResponseRequiredAndMissing: boolean;
}

/** A manager may NOT close a critical issue without proof, above threshold, or hide escalation. */
export function checkManagerClosure(i: ManagerClosureInput): string[] {
  const blocked: string[] = [];
  if (i.isCritical && !i.hasRequiredProof) blocked.push("critical_closure_requires_proof");
  if (i.costAboveManagerThreshold) blocked.push("above_manager_threshold_owner_required");
  if (i.ownerRelevantEscalation) blocked.push("owner_relevant_escalation_cannot_be_hidden");
  if (i.customerResponseRequiredAndMissing) blocked.push("customer_response_required");
  return blocked;
}

export type ManagerExceptionState = "OPEN" | "IN_PROGRESS" | "RESOLVED_PENDING_PROOF" | "RESOLVED_VERIFIED" | "ESCALATED_TO_OWNER";

export interface ManagerException {
  id: string;
  locationId: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  state: ManagerExceptionState;
  ownerActionRequired: boolean;
  ageMs: number;
}

/** Unresolved HIGH+/aged exceptions escalate to the owner. */
export function exceptionNeedsOwner(e: ManagerException, highAgeMs = 4 * 60 * 60 * 1000): boolean {
  if (e.severity === "CRITICAL" || e.severity === "HIGH") return e.state !== "RESOLVED_VERIFIED" && e.ageMs >= highAgeMs;
  return e.ownerActionRequired;
}
