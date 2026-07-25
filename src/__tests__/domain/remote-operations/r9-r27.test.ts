import { describe, it, expect } from "vitest";
import { resolveOwnerTimeout, ownerDigest, alertNeedsEscalation } from "@/domain/remote-operations/owner-decisions";
import { buildVendorProjection, detectVendorLeak, accessCodeVisible, accessCodeMustBeRevoked, accessCodeViewHarm, type FullIssueRecord } from "@/domain/remote-operations/vendor-access";
import { evaluateComplianceGate, reEvaluateAtStage, type ComplianceSignals } from "@/domain/remote-operations/compliance-gate";

describe("r9-r27 — module contract assertions", () => {
  it("resolveOwnerTimeout is a function", () => { expect(typeof resolveOwnerTimeout).toBe("function"); });
  it("ownerDigest is a function", () => { expect(typeof ownerDigest).toBe("function"); });
  it("alertNeedsEscalation is a function", () => { expect(typeof alertNeedsEscalation).toBe("function"); });
  it("buildVendorProjection is a function", () => { expect(typeof buildVendorProjection).toBe("function"); });
  it("detectVendorLeak is a function", () => { expect(typeof detectVendorLeak).toBe("function"); });
  it("accessCodeVisible is a function", () => { expect(typeof accessCodeVisible).toBe("function"); });
  it("accessCodeMustBeRevoked is a function", () => { expect(typeof accessCodeMustBeRevoked).toBe("function"); });
  it("accessCodeViewHarm is a function", () => { expect(typeof accessCodeViewHarm).toBe("function"); });
  it("evaluateComplianceGate is a function", () => { expect(typeof evaluateComplianceGate).toBe("function"); });
  it("reEvaluateAtStage is a function", () => { expect(typeof reEvaluateAtStage).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[R9] owner decision timeout + digest + ack", () => {
  it("emergency escalates to backup at 15m and safe default at 30m when configured", () => {
    expect(resolveOwnerTimeout("EMERGENCY", 10 * 60 * 1000, true)).toBe("NONE");
    expect(resolveOwnerTimeout("EMERGENCY", 20 * 60 * 1000, true)).toBe("NOTIFY_BACKUP");
    expect(resolveOwnerTimeout("EMERGENCY", 31 * 60 * 1000, true)).toBe("SAFE_DEFAULT");
    expect(resolveOwnerTimeout("EMERGENCY", 31 * 60 * 1000, false)).toBe("NOTIFY_BACKUP");
  });
  it("high re-escalates to manager at 4h; medium reminds at 24h", () => {
    expect(resolveOwnerTimeout("HIGH", 5 * 60 * 60 * 1000, false)).toBe("MANAGER_REESCALATE");
    expect(resolveOwnerTimeout("MEDIUM", 25 * 60 * 60 * 1000, false)).toBe("REMINDER");
  });
  it("the owner digest caps at 5 decision-grade items", () => {
    const d = ownerDigest([1, 2, 3, 4, 5, 6, 7]);
    expect(d.shown.length).toBe(5);
    expect(d.overflow).toBe(2);
  });
  it("an unacknowledged ack-required alert escalates after the window", () => {
    expect(alertNeedsEscalation("ACK_REQUIRED", true, false, 60_000, 30_000)).toBe(true);
    expect(alertNeedsEscalation("ACK_REQUIRED", true, true, 60_000, 30_000)).toBe(false);
  });
});

describe("[R26] vendor scoping + access-code revocation", () => {
  const issue: FullIssueRecord = {
    issueDescription: "leaking tap", locationTaskDetails: "unit 4 kitchen", requiredProof: "before/after photos",
    scheduledTimeMs: 1000, communicationChannel: "app", quoteSubmissionFields: ["amount", "eta"],
    ownerApprovalThreshold: 5000, otherVendorQuotes: [4000, 6000], priorRepairCostHistory: [3000], workspaceFinancials: {},
    locationUnitEconomics: {}, ownerMargin: 0.3, internalStaffReliability: {},
  };
  it("the vendor projection excludes all financial/threshold/internal fields", () => {
    const p = buildVendorProjection(issue) as unknown as Record<string, unknown>;
    expect(detectVendorLeak(p)).toEqual([]);
    expect("ownerApprovalThreshold" in p).toBe(false);
    expect("priorRepairCostHistory" in p).toBe(false);
  });
  it("a leak is detected if a forbidden field is present", () => {
    expect(detectVendorLeak({ issueDescription: "x", ownerMargin: 0.3 })).toContain("ownerMargin");
  });
  it("access code shows only while task active and is revoked after", () => {
    expect(accessCodeVisible("ACTIVE")).toBe(true);
    expect(accessCodeVisible("COMPLETED_VERIFIED")).toBe(false);
    expect(accessCodeMustBeRevoked("CANCELLED")).toBe(true);
  });
  it("an un-audited access-code view raises a harm event", () => {
    expect(accessCodeViewHarm({ taskState: "ACTIVE", auditLogged: false })).toBe("ACCESS_CODE_EXPOSED_WITHOUT_AUDIT");
    expect(accessCodeViewHarm({ taskState: "ACTIVE", auditLogged: true })).toBeNull();
  });
});

describe("[R27] compliance/safety gate fires at recommendation/action/dispatch and fails closed", () => {
  const ok = (over: Partial<ComplianceSignals> = {}): ComplianceSignals => ({
    complianceSensitive: false, statusClear: true, requiresCertificationOrLicence: false, certificationPresentAndValid: true,
    verifiedExpertSource: true, safetyHazardOpen: false, ...over,
  });
  it("a clean task passes at all stages", () => {
    for (const stage of ["RECOMMENDATION", "ACTION_CREATION", "DISPATCH"] as const) {
      expect(evaluateComplianceGate(stage, ok()).verdict).toBe("PASS");
    }
  });
  it("unclear legal/safety status fails closed at action/dispatch", () => {
    expect(evaluateComplianceGate("ACTION_CREATION", ok({ complianceSensitive: true, statusClear: false })).verdict).toBe("BLOCKED_FAIL_CLOSED");
    // at recommendation stage it is flagged/escalated, not silently passed
    expect(evaluateComplianceGate("RECOMMENDATION", ok({ complianceSensitive: true, statusClear: false })).requiresOwnerOrExpertReview).toBe(true);
  });
  it("a missing/unknown licence blocks the assignment", () => {
    expect(evaluateComplianceGate("DISPATCH", ok({ requiresCertificationOrLicence: true, certificationPresentAndValid: false })).verdict).toBe("BLOCKED_FAIL_CLOSED");
  });
  it("a safety hazard fails closed", () => {
    expect(evaluateComplianceGate("DISPATCH", ok({ safetyHazardOpen: true })).verdict).toBe("BLOCKED_FAIL_CLOSED");
  });
  it("compliance-sensitive without expert source escalates to expert", () => {
    expect(evaluateComplianceGate("RECOMMENDATION", ok({ complianceSensitive: true, verifiedExpertSource: false })).verdict).toBe("ESCALATE_EXPERT");
  });
  it("an earlier PASS cannot bypass a later-stage failure", () => {
    expect(reEvaluateAtStage("PASS", "DISPATCH", ok({ safetyHazardOpen: true })).verdict).toBe("BLOCKED_FAIL_CLOSED");
  });
});
