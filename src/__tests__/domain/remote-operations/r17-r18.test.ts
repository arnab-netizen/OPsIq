import { describe, it, expect } from "vitest";
import { detectManagerIntegrityIssues, checkManagerClosure, exceptionNeedsOwner, type ManagerIntegritySignals, type ManagerException } from "@/domain/remote-operations/manager-exception";
import { dedupeAlerts, groupAlerts, groupEscalates, type RemoteAlert } from "@/domain/remote-operations/escalation-dedup";

describe("[R17] manager exception queue + integrity controls", () => {
  const clean = (over: Partial<ManagerIntegritySignals> = {}): ManagerIntegritySignals => ({
    closedIssueWithoutProof: false, downgradedSeverityAfterComplaint: false, repeatedlyClosedReopenedIssues: false,
    delayedEscalationBeyondPolicy: false, repeatedNearThresholdApprovals: false, bypassedVendorQuoteRequirement: false,
    resolvedComplaintWithoutCustomerResponse: false, suppressedRepeatedIssuePattern: false, changedRiskThresholdWithoutAudit: false, ...over,
  });
  it("delayed escalation surfaces as MANAGER_SUPPRESSED_ESCALATION", () => {
    expect(detectManagerIntegrityIssues(clean({ delayedEscalationBeyondPolicy: true }))).toContain("MANAGER_SUPPRESSED_ESCALATION");
  });
  it("clean manager actions raise no flags", () => {
    expect(detectManagerIntegrityIssues(clean())).toEqual([]);
  });
  it("a manager cannot close a critical issue without proof or above threshold", () => {
    expect(checkManagerClosure({ isCritical: true, hasRequiredProof: false, costAboveManagerThreshold: false, ownerRelevantEscalation: false, customerResponseRequiredAndMissing: false })).toContain("critical_closure_requires_proof");
    expect(checkManagerClosure({ isCritical: false, hasRequiredProof: true, costAboveManagerThreshold: true, ownerRelevantEscalation: false, customerResponseRequiredAndMissing: false })).toContain("above_manager_threshold_owner_required");
  });
  it("an owner-relevant escalation cannot be hidden by the manager", () => {
    expect(checkManagerClosure({ isCritical: false, hasRequiredProof: true, costAboveManagerThreshold: false, ownerRelevantEscalation: true, customerResponseRequiredAndMissing: false })).toContain("owner_relevant_escalation_cannot_be_hidden");
  });
  it("an aged unresolved HIGH exception escalates to the owner", () => {
    const e: ManagerException = { id: "e1", locationId: "locA", severity: "HIGH", state: "OPEN", ownerActionRequired: false, ageMs: 5 * 60 * 60 * 1000 };
    expect(exceptionNeedsOwner(e)).toBe(true);
  });
});

describe("[R18] escalation deduplication + fatigue control", () => {
  it("an identical repeated alert (same group + status) is suppressed", () => {
    const alerts: RemoteAlert[] = [{ groupKey: "loc:B", severity: "MEDIUM", status: "proof_overdue" }, { groupKey: "loc:B", severity: "MEDIUM", status: "proof_overdue" }];
    const r = dedupeAlerts(alerts, new Map());
    expect(r.toSend.length).toBe(1);
    expect(r.suppressed.length).toBe(1);
  });
  it("an already-sent status is suppressed; a status change is sent", () => {
    const last = new Map([["loc:B", "proof_overdue"]]);
    expect(dedupeAlerts([{ groupKey: "loc:B", severity: "MEDIUM", status: "proof_overdue" }], last).toSend.length).toBe(0);
    expect(dedupeAlerts([{ groupKey: "loc:B", severity: "HIGH", status: "escalated" }], last).toSend.length).toBe(1);
  });
  it("related alerts group into one decision-grade summary", () => {
    const groups = groupAlerts([
      { groupKey: "loc:B", severity: "MEDIUM", status: "a" }, { groupKey: "loc:B", severity: "HIGH", status: "b" },
      { groupKey: "loc:C", severity: "LOW", status: "c" },
    ]);
    const b = groups.find((g) => g.groupKey === "loc:B")!;
    expect(b.count).toBe(2);
    expect(b.maxSeverity).toBe("HIGH");
  });
  it("a group escalates only when count crosses threshold or severity is critical", () => {
    expect(groupEscalates({ groupKey: "loc:B", count: 5, maxSeverity: "MEDIUM", summary: "" }, 5)).toBe(true);
    expect(groupEscalates({ groupKey: "loc:B", count: 2, maxSeverity: "MEDIUM", summary: "" }, 5)).toBe(false);
    expect(groupEscalates({ groupKey: "loc:B", count: 1, maxSeverity: "CRITICAL", summary: "" }, 5)).toBe(true);
  });
});
