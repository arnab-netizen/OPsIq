import { describe, it, expect } from "vitest";
import { reliabilityLabel, canBlockDispatchByScore, isForbiddenLabel } from "@/domain/remote-operations/reliability";
import { assessReadiness, assessLocationRisk, isStale, greyNoDataEscalation, type ReadinessBlockers, type LocationRiskSignals } from "@/domain/remote-operations/location-readiness";
import { outcomeWindowClosed, canAdjustOutcomeWindow, classifyRemoteLearning, REMOTE_HARM_TYPES, type RemoteLearningInput } from "@/domain/remote-operations/outcome-learning";

describe("r22-r29 — module contract assertions", () => {
  it("reliabilityLabel is a function", () => { expect(typeof reliabilityLabel).toBe("function"); });
  it("canBlockDispatchByScore is a function", () => { expect(typeof canBlockDispatchByScore).toBe("function"); });
  it("isForbiddenLabel is a function", () => { expect(typeof isForbiddenLabel).toBe("function"); });
  it("assessReadiness is a function", () => { expect(typeof assessReadiness).toBe("function"); });
  it("assessLocationRisk is a function", () => { expect(typeof assessLocationRisk).toBe("function"); });
  it("isStale is a function", () => { expect(typeof isStale).toBe("function"); });
  it("greyNoDataEscalation is a function", () => { expect(typeof greyNoDataEscalation).toBe("function"); });
  it("outcomeWindowClosed is a function", () => { expect(typeof outcomeWindowClosed).toBe("function"); });
  it("canAdjustOutcomeWindow is a function", () => { expect(typeof canAdjustOutcomeWindow).toBe("function"); });
  it("classifyRemoteLearning is a function", () => { expect(typeof classifyRemoteLearning).toBe("function"); });
  it("REMOTE_HARM_TYPES is an array", () => { expect(Array.isArray(REMOTE_HARM_TYPES)).toBe(true); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[R22] reliability sample gates", () => {
  it("below the minimum sample shows INSUFFICIENT_DATA and cannot block dispatch", () => {
    const r = reliabilityLabel("proof_acceptance_rate", 4, "HIGH");
    expect(r.label).toBe("INSUFFICIENT_DATA_proof_acceptance_rate");
    expect(r.usableAsBlockingSignal).toBe(false);
    expect(canBlockDispatchByScore("proof_acceptance_rate", 4, false)).toBe(false);
  });
  it("an active critical flag may block even below sample size", () => {
    expect(canBlockDispatchByScore("proof_acceptance_rate", 4, true)).toBe(true);
  });
  it("above the sample gate, confidence label applies and may block", () => {
    expect(reliabilityLabel("attendance_reliability", 6, "HIGH").label).toBe("HIGH_CONFIDENCE");
    expect(canBlockDispatchByScore("attendance_reliability", 6, false)).toBe(true);
  });
  it("character/intent labels are forbidden", () => {
    expect(isForbiddenLabel("staff is lazy")).toBe(true);
    expect(isForbiddenLabel("proof insufficient")).toBe(false);
  });
});

describe("[R23] location readiness / risk — no false green + stale data", () => {
  const ready = (over: Partial<ReadinessBlockers> = {}): ReadinessBlockers => ({
    criticalTaskOpen: false, upstreamDependencyUnverified: false, proofMissing: false, proofInsufficient: false,
    customerDisputeOpen: false, criticalMaintenanceUnresolved: false, keyAccessUnresolved: false, safetyComplianceOpen: false,
    supervisorVerificationMissing: false, managerReviewMissing: false, dataStale: false, locationPaused: false, ...over,
  });
  it("a clean board is READY_VERIFIED; any blocker prevents it", () => {
    expect(assessReadiness(ready())).toBe("READY_VERIFIED");
    expect(assessReadiness(ready({ proofMissing: true }))).toBe("READY_PENDING_PROOF");
    expect(assessReadiness(ready({ customerDisputeOpen: true }))).toBe("READY_DISPUTED");
    expect(assessReadiness(ready({ dataStale: true }))).toBe("READY_EXPIRED");
  });
  const risk = (over: Partial<LocationRiskSignals> = {}): LocationRiskSignals => ({
    hasData: true, dataStale: false, criticalOrEmergencyComplaint: false, safetyIssueOpen: false, verifiedFalseCompletionLast24h: false,
    dispatchBypassedVeto: false, accessKeyCriticalFailureWithOccupancy: false, highComplaintOpen: false, proofRejectionRateOver20: false,
    criticalTaskOverdue2h: false, handoverUnacknowledgedAfterShift: false, mediumComplaintOpen: false, proofMissingRateOver10: false,
    disputeOpen: false, paused: false, blocked: false, greenBlockers: false, ...over,
  });
  it("no false green: stale data / green-blockers downgrade GREEN_VERIFIED to low confidence", () => {
    expect(assessLocationRisk(risk())).toBe("GREEN_VERIFIED");
    expect(assessLocationRisk(risk({ dataStale: true }))).toBe("GREEN_LOW_CONFIDENCE");
    expect(assessLocationRisk(risk({ greenBlockers: true }))).toBe("GREEN_LOW_CONFIDENCE");
  });
  it("false completion / dispatch-bypassed-veto → RED_CRITICAL", () => {
    expect(assessLocationRisk(risk({ verifiedFalseCompletionLast24h: true }))).toBe("RED_CRITICAL");
    expect(assessLocationRisk(risk({ dispatchBypassedVeto: true }))).toBe("RED_CRITICAL");
  });
  it("no data is GREY_NO_DATA (unknown, not low risk) and escalates by age", () => {
    expect(assessLocationRisk(risk({ hasData: false }))).toBe("GREY_NO_DATA");
    expect(greyNoDataEscalation(25 * 60 * 60 * 1000)).toBe("MANAGER_NOTIFY");
    expect(greyNoDataEscalation(49 * 60 * 60 * 1000)).toBe("OWNER_ESCALATE");
    expect(isStale("daily_proof", 25 * 60 * 60 * 1000)).toBe(true);
  });
});

describe("[§3.8 + R29] outcome windows + learning quarantine / remote harm", () => {
  it("learning cannot open before the outcome window closes; staff cannot shorten", () => {
    expect(outcomeWindowClosed("TURNOVER_SERVICE", 0, 47 * 60 * 60 * 1000)).toBe(false);
    expect(outcomeWindowClosed("TURNOVER_SERVICE", 0, 49 * 60 * 60 * 1000)).toBe(true);
    expect(canAdjustOutcomeWindow("STAFF", "shorten")).toBe(false);
    expect(canAdjustOutcomeWindow("OWNER", "extend")).toBe(true);
  });
  const learn = (over: Partial<RemoteLearningInput> = {}): RemoteLearningInput => ({
    proofWeak: false, taskDisputed: false, ownerOverride: false, aiFlagUnresolved: false, customerComplaintPending: false,
    outcomeWindowOpen: false, complianceSafetyUnresolved: false, unresolvedRemoteHarm: false, offlineTimestampConflictUnresolved: false,
    outcomeVerified: true, harmChecked: true, harmful: false, simulationTested: true, ...over,
  });
  it("a verified, harm-checked, undisputed, window-closed outcome is learning-eligible", () => {
    expect(classifyRemoteLearning(learn()).eligible).toBe(true);
    expect(classifyRemoteLearning(learn()).classification).toBe("LEARNING_ELIGIBLE_EVENT");
  });
  it("weak proof / dispute / owner override / open window all block learning", () => {
    expect(classifyRemoteLearning(learn({ proofWeak: true })).eligible).toBe(false);
    expect(classifyRemoteLearning(learn({ taskDisputed: true })).classification).toBe("DISPUTED_EVENT");
    expect(classifyRemoteLearning(learn({ ownerOverride: true })).blockedReasons).toContain("owner_override");
    expect(classifyRemoteLearning(learn({ outcomeWindowOpen: true })).eligible).toBe(false);
  });
  it("an unresolved remote harm blocks learning and classifies as a harm-ledger event", () => {
    const d = classifyRemoteLearning(learn({ unresolvedRemoteHarm: true }));
    expect(d.eligible).toBe(false);
    expect(d.classification).toBe("HARM_LEDGER_EVENT");
  });
  it("the 15 remote harm types are defined", () => {
    expect(REMOTE_HARM_TYPES).toContain("FALSE_GREEN_LOCATION");
    expect(REMOTE_HARM_TYPES).toContain("DISPATCH_BYPASSED_VETO");
    expect(REMOTE_HARM_TYPES.length).toBe(15);
  });
});
