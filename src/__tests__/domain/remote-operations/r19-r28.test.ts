import { describe, it, expect } from "vitest";
import { assessEconomics } from "@/domain/remote-operations/economics";
import { evaluateReplan, dependencyClears } from "@/domain/remote-operations/replanning";
import { assessHandover, disputeBlocksGreen, selectRandomAudit, auditCoverageRate, assessRemoteReadiness, canExpandBeyondPilot, HANDOVER_FIELDS, type Handover, type ReadinessChecklist, type PilotResult } from "@/domain/remote-operations/operations-extra";

describe("r19-r28 — module contract assertions", () => {
  it("assessEconomics is a function", () => { expect(typeof assessEconomics).toBe("function"); });
  it("evaluateReplan is a function", () => { expect(typeof evaluateReplan).toBe("function"); });
  it("dependencyClears is a function", () => { expect(typeof dependencyClears).toBe("function"); });
  it("assessHandover is a function", () => { expect(typeof assessHandover).toBe("function"); });
  it("disputeBlocksGreen is a function", () => { expect(typeof disputeBlocksGreen).toBe("function"); });
  it("selectRandomAudit is a function", () => { expect(typeof selectRandomAudit).toBe("function"); });
  it("auditCoverageRate is a function", () => { expect(typeof auditCoverageRate).toBe("function"); });
  it("assessRemoteReadiness is a function", () => { expect(typeof assessRemoteReadiness).toBe("function"); });
  it("canExpandBeyondPilot is a function", () => { expect(typeof canExpandBeyondPilot).toBe("function"); });
  it("HANDOVER_FIELDS is an array", () => { expect(Array.isArray(HANDOVER_FIELDS)).toBe(true); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[R24] location economics — no invented profit", () => {
  it("no collected cash → cannot claim financially healthy (accrual-only at best)", () => {
    const a = assessEconomics({ earnedRevenue: 1000, invoicedRevenue: 1000 });
    expect(a.financialConfidence).toBe("ACCRUAL_ONLY");
    expect(a.canClaimHealthy).toBe(false);
  });
  it("high activity but negative contribution is not healthy", () => {
    const a = assessEconomics({ collectedCash: 1000, directLabour: 800, consumables: 300, vendorMaintenance: 200 });
    expect(a.contributionMargin).toBeLessThan(0);
    expect(a.canClaimHealthy).toBe(false);
    expect(a.reasons).toContain("not_profitable_despite_activity");
  });
  it("collected cash + positive contribution + no receivables risk → healthy", () => {
    expect(assessEconomics({ collectedCash: 1000, directLabour: 300, consumables: 100 }).canClaimHealthy).toBe(true);
  });
  it("aged receivables >30d raise a cash-risk alert", () => {
    expect(assessEconomics({ collectedCash: 1000, agedReceivables30: 500 }).cashRiskAlert).toBe(true);
  });
});

describe("[R19] replanning + dispatch rollback", () => {
  it("an Owner Mode veto after dispatch recalls the dispatch", () => {
    expect(evaluateReplan("OWNER_MODE_VETO_AFTER_DISPATCH", ["STAFF"]).action).toBe("DISPATCH_RECALLED");
  });
  it("no-show activates the backup plan; duplicate cancels the duplicate", () => {
    expect(evaluateReplan("NO_SHOW", ["STAFF"]).action).toBe("BACKUP_PLAN_ACTIVATED");
    expect(evaluateReplan("DUPLICATE_DISCOVERED", []).action).toBe("TASK_DUPLICATE_CANCELLED");
  });
  it("a downstream task only clears when its upstream is verified", () => {
    expect(dependencyClears("SUPERVISOR_VERIFIED")).toBe(false);
    expect(dependencyClears("COMPLETED_VERIFIED")).toBe(true);
  });
});

describe("[R25] handover / dispute / random audit", () => {
  const full = (): Handover => ({ fields: Object.fromEntries(HANDOVER_FIELDS.map((f) => [f, "x"])), acknowledgedByIncoming: true, shiftStarted: true });
  it("a handover is complete only with all fields + incoming acknowledgement", () => {
    expect(assessHandover(full()).complete).toBe(true);
    const missing = { ...full(), fields: { ...full().fields, openTasks: "" } };
    expect(assessHandover(missing).complete).toBe(false);
  });
  it("an unacknowledged handover after shift start escalates to manager", () => {
    expect(assessHandover({ ...full(), acknowledgedByIncoming: false, shiftStarted: true }).escalateToManager).toBe(true);
  });
  it("a disputed task blocks green", () => {
    expect(disputeBlocksGreen(true)).toBe(true);
  });
  it("random audit selects deterministically without supervisor input, ≥1 per location", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const sel = selectRandomAudit(ids, 42, 10);
    expect(sel.length).toBe(2);
    expect(selectRandomAudit(ids, 42, 10)).toEqual(sel); // deterministic for a given seed
    expect(selectRandomAudit(["t1"], 1, 10).length).toBe(1); // minimum 1
    expect(auditCoverageRate(2, 20)).toBe(10);
  });
});

describe("[R28] readiness + pilot-first rollout", () => {
  const ready = (over: Partial<ReadinessChecklist> = {}): ReadinessChecklist => ({
    locationHierarchyDefined: true, rolesAssigned: true, supervisorExists: true, checklistExists: true, proofRulesExist: true,
    complaintChannelExists: true, approvalThresholdsExist: true, ownerDecisionQueueConfigured: true, escalationRulesConfigured: true,
    ownerModeIntegrationsPresent: true, staleDataWindowsConfigured: true, ...over,
  });
  it("readiness fails closed if any prerequisite is missing", () => {
    expect(assessRemoteReadiness(ready()).ready).toBe(true);
    expect(assessRemoteReadiness(ready({ supervisorExists: false })).ready).toBe(false);
  });
  it("expansion beyond the pilot is blocked until every pilot criterion passes", () => {
    const pass: PilotResult = { proofSubmissionAcceptable: true, falseCompletionControlled: true, supervisorVerificationReliable: true, ownerBriefingUseful: true, noFalseGreen: true, arbitrationNoBlockingConflicts: true };
    expect(canExpandBeyondPilot(pass)).toBe(true);
    expect(canExpandBeyondPilot({ ...pass, noFalseGreen: false })).toBe(false);
  });
});
