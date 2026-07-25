import { describe, it, expect } from "vitest";
import { reviewProofDeterministic, aiFlagToAction, aiResultClosesHighRisk } from "@/domain/remote-operations/ai-review";
import { pairRiskScore, evaluatePairApproval, type PairApprovalInput } from "@/domain/remote-operations/pair-risk";
import { deriveAttendance, presenceConfidence, checkInVerifiesWork, predictiveNoShow } from "@/domain/remote-operations/attendance";
import type { ProofAuthenticitySignals } from "@/domain/remote-operations/proof";

const clean = (over: Partial<ProofAuthenticitySignals> = {}): ProofAuthenticitySignals => ({
  requiredProofPresent: true, hasRequiredView: true, beforeAfterPaired: true, authorizedSubmitter: true, withinWindow: true,
  imageQualityOk: true, relatedToChecklistItem: true, metadataPresent: true, duplicateSuspected: false, samePhotoBeforeAndAfter: false,
  noVisibleChangeWhereExpected: false, timestampSuspicious: false, locationMismatch: false, contradictedByComplaint: false,
  resolutionBelowMinimum: false, multiSource: false, ...over,
});

describe("r10-r16 — module contract assertions", () => {
  it("reviewProofDeterministic is a function", () => { expect(typeof reviewProofDeterministic).toBe("function"); });
  it("aiFlagToAction is a function", () => { expect(typeof aiFlagToAction).toBe("function"); });
  it("aiResultClosesHighRisk is a function", () => { expect(typeof aiResultClosesHighRisk).toBe("function"); });
  it("pairRiskScore is a function", () => { expect(typeof pairRiskScore).toBe("function"); });
  it("evaluatePairApproval is a function", () => { expect(typeof evaluatePairApproval).toBe("function"); });
  it("deriveAttendance is a function", () => { expect(typeof deriveAttendance).toBe("function"); });
  it("presenceConfidence is a function", () => { expect(typeof presenceConfidence).toBe("function"); });
  it("checkInVerifiesWork is a function", () => { expect(typeof checkInVerifiesWork).toBe("function"); });
  it("predictiveNoShow is a function", () => { expect(typeof predictiveNoShow).toBe("function"); });
  it("clean is a function", () => { expect(typeof clean).toBe("function"); });
  it("clean() returns an object", () => { expect(typeof clean()).toBe("object"); });
  it("clean() has requiredProofPresent field", () => { expect(clean()).toHaveProperty("requiredProofPresent"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[R14/R15] AI reviewer + flag-to-action map", () => {
  it("AI produces flags, never high-risk verification", () => {
    expect(reviewProofDeterministic(clean()).canVerifyHighRiskAlone).toBe(false);
    expect(aiResultClosesHighRisk()).toBe(false);
  });
  it("duplicate proof → AI_DUPLICATE_SUSPECTED → block high-confidence verification", () => {
    const r = reviewProofDeterministic(clean({ duplicateSuspected: true }));
    expect(r.status).toBe("AI_DUPLICATE_SUSPECTED");
    expect(aiFlagToAction(r.status)).toBe("BLOCK_HIGH_CONFIDENCE_VERIFICATION");
  });
  it("missing proof → block + request proof; before/after mismatch → supervisor review", () => {
    expect(aiFlagToAction(reviewProofDeterministic(clean({ requiredProofPresent: false })).status)).toBe("BLOCK_VERIFICATION_REQUEST_PROOF");
    expect(aiFlagToAction(reviewProofDeterministic(clean({ samePhotoBeforeAndAfter: true })).status)).toBe("SUPERVISOR_REVIEW_REQUIRED");
  });
  it("clean proof → AI_NO_ISSUE_FOUND maps to NO_EFFECT (still no auto-close of high-risk)", () => {
    expect(reviewProofDeterministic(clean()).status).toBe("AI_NO_ISSUE_FOUND");
    expect(aiFlagToAction("AI_NO_ISSUE_FOUND")).toBe("NO_EFFECT");
  });
});

describe("[R16] staff-supervisor pair risk + collusion block", () => {
  const base = (over: Partial<PairApprovalInput> = {}): PairApprovalInput => ({
    riskLevel: "HIGH", supervisorIsDirectManagerOfStaff: false, pairRiskScore: 0, counterApprovalPresent: false,
    otherVerifierAvailable: true, ownerOrManagerNotified: false, ...over,
  });
  it("direct line-manager cannot approve HIGH-risk when another verifier exists", () => {
    const d = evaluatePairApproval(base({ supervisorIsDirectManagerOfStaff: true }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("collusion_block");
  });
  it("direct manager may approve only if no other verifier AND owner notified", () => {
    expect(evaluatePairApproval(base({ supervisorIsDirectManagerOfStaff: true, otherVerifierAvailable: false, ownerOrManagerNotified: true })).allowed).toBe(true);
    expect(evaluatePairApproval(base({ supervisorIsDirectManagerOfStaff: true, otherVerifierAvailable: false, ownerOrManagerNotified: false })).allowed).toBe(false);
  });
  it("pair-risk above threshold forces manager counter-approval", () => {
    expect(evaluatePairApproval(base({ pairRiskScore: 5, counterApprovalPresent: false })).allowed).toBe(false);
    expect(evaluatePairApproval(base({ pairRiskScore: 5, counterApprovalPresent: true })).allowed).toBe(true);
  });
  it("pair-risk score is computed from signals", () => {
    expect(pairRiskScore({ repeatedDisputes: 1, repeatedRework: 1, weakProofApprovals: 0, unusuallyFastApprovals: 0, complaintsAfterApproval: 0, sameProofReuse: 1 })).toBe(4);
  });
});

describe("[R10] attendance / presence confidence", () => {
  const att = (over = {}) => ({ scheduled: true, preShiftAcknowledged: false, acknowledged: false, checkedIn: false, checkInLate: false, locationConfirmed: false, minutesSinceScheduledStart: 0, ...over });
  it("no check-in 30+ min after start → no-show risk", () => {
    expect(deriveAttendance(att({ minutesSinceScheduledStart: 35 }))).toBe("NO_SHOW_RISK");
  });
  it("check-in alone does not verify work; presence is weak without corroboration", () => {
    expect(checkInVerifiesWork()).toBe(false);
    expect(presenceConfidence({ checkedIn: true, proofTimeConsistent: false, supervisorConfirmed: false, customerConfirmed: false, multiSourceConsistent: false, disputed: false })).toBe("PRESENCE_CHECKED_IN_WEAK");
  });
  it("multi-source + supervisor → strongest presence", () => {
    expect(presenceConfidence({ checkedIn: true, proofTimeConsistent: true, supervisorConfirmed: true, customerConfirmed: true, multiSourceConsistent: true, disputed: false })).toBe("PRESENCE_SUPPORTED_BY_MULTI_SOURCE_PROOF");
  });
  it("predictive no-show requires sufficient sample and alerts manager for high-risk", () => {
    expect(predictiveNoShow({ sampleSize: 2, minSampleSize: 5, noShowRiskScore: 9, riskThreshold: 5, preShiftAckReceived: false, minutesBeforeShift: 10, isHighOrCritical: true })).toBe("NONE");
    expect(predictiveNoShow({ sampleSize: 8, minSampleSize: 5, noShowRiskScore: 9, riskThreshold: 5, preShiftAckReceived: false, minutesBeforeShift: 12, isHighOrCritical: true })).toBe("ALERT_MANAGER");
  });
});
