import { describe, it, expect } from "vitest";
import { validateOwnerDecisionItem, buildDailyBriefing, detectTrendDeterioration, weeklyReviewRejectsVanity, weeklyReviewAllowsSuccessClaim, type OwnerDecisionItem, type TrendMetric } from "@/domain/remote-operations/owner-queue";
import { findCrossLocationBackup, slaStatus, validateCommNote, checkVendorDispatchable, type BackupCandidate, type CommNote, type VendorRecord } from "@/domain/remote-operations/hardening";

const item = (over: Partial<OwnerDecisionItem> = {}): OwnerDecisionItem => ({
  decisionType: "approve_repair", locationId: "locA", severity: "HIGH", deadlineMs: 1000, context: "leak", evidence: ["photo"], missingData: [],
  recommendedOption: "approve", alternatives: ["defer"], risk: "water damage", whatIfNoDecision: "damage spreads", proofRequiredAfter: "invoice",
  verificationPlan: "tenant confirms", ownerModeConflicts: [], ...over,
});

describe("[R20] owner decision queue + daily briefing + trends", () => {
  it("an owner decision item requires the governed fields", () => {
    expect(validateOwnerDecisionItem(item())).toEqual([]);
    expect(validateOwnerDecisionItem(item({ whatIfNoDecision: "" }))).toContain("missing_what_if_no_decision");
    expect(validateOwnerDecisionItem(item({ recommendedOption: "" }))).toContain("missing_recommended_option");
  });
  it("the daily briefing caps decisions, surfaces critical + grey + trends + vetoes", () => {
    const items = [item({ severity: "LOW" }), item({ severity: "CRITICAL" }), item({ severity: "HIGH" }), item({ severity: "EMERGENCY" }), item({ severity: "MEDIUM" }), item({ severity: "LOW" })];
    const b = buildDailyBriefing(items, [{ name: "complaints", direction: "rising", worsening: true }], ["locZ"], ["OWNER_MODE_VETO_ACTIVE"], 5);
    expect(b.decisions.length).toBe(5);
    expect(b.overflow).toBe(1);
    expect(b.decisions[0].severity).toBe("EMERGENCY"); // ranked by severity
    expect(b.criticalNow.length).toBe(2);
    expect(b.greyNoDataLocations).toContain("locZ");
    expect(b.worseningTrends.length).toBe(1);
    expect(b.activeOwnerModeVetoes).toContain("OWNER_MODE_VETO_ACTIVE");
  });
  it("trend deterioration captures worsening non-flat metrics", () => {
    const m: TrendMetric[] = [{ name: "proof rejection", direction: "rising", worsening: true }, { name: "margin", direction: "flat", worsening: true }];
    expect(detectTrendDeterioration(m).length).toBe(1);
  });
  it("weekly review rejects vanity metrics and unverified success", () => {
    expect(weeklyReviewRejectsVanity("instagram likes")).toBe(true);
    expect(weeklyReviewRejectsVanity("verified completion rate")).toBe(false);
    expect(weeklyReviewAllowsSuccessClaim(true, false)).toBe(true);
    expect(weeklyReviewAllowsSuccessClaim(true, true)).toBe(false);
  });
});

describe("[R30] cross-location pooling + SLA + comms log + vendor prequalification", () => {
  it("cross-location backup is presented as an option, not auto-dispatched unless pre-approved", () => {
    const cands: BackupCandidate[] = [{ staffId: "x", locationId: "locB", qualifiedForTaskType: true, available: true, travelMinutes: 20 }, { staffId: "y", locationId: "locC", qualifiedForTaskType: false, available: true, travelMinutes: 5 }];
    expect(findCrossLocationBackup(cands, false).autoDispatch).toBe(false);
    expect(findCrossLocationBackup(cands, false).candidates.length).toBe(1);
    expect(findCrossLocationBackup(cands, true).autoDispatch).toBe(true);
  });
  it("SLA alerts before breach, not only after", () => {
    expect(slaStatus(10_000, 0, 11_000, 1_000)).toBe("WILL_MISS");
    expect(slaStatus(10_000, 0, 9_500, 1_000)).toBe("AT_RISK");
    expect(slaStatus(10_000, 0, 5_000, 1_000)).toBe("ON_TRACK");
    expect(slaStatus(10_000, 11_000, 9_000, 1_000)).toBe("BREACHED");
  });
  it("a communication note requires author/linked-object/timestamp", () => {
    const n: CommNote = { author: "u1", role: "SITE_SUPERVISOR", timestampMs: 5, linkedObjectId: "task1", message: "hi", visibilityScope: "MANAGER" };
    expect(validateCommNote(n)).toEqual([]);
    expect(validateCommNote({ ...n, linkedObjectId: "" })).toContain("missing_linked_object");
  });
  it("an unqualified / expired vendor cannot be dispatched and triggers a notify", () => {
    const v: VendorRecord = { vendorId: "v1", approvedTaskTypes: ["MAINTENANCE"], licencesValid: true, insuranceValid: true, documentExpiryMs: 100, status: "APPROVED" };
    expect(checkVendorDispatchable(v, "MAINTENANCE", 50).dispatchable).toBe(true);
    const expired = checkVendorDispatchable(v, "MAINTENANCE", 200);
    expect(expired.dispatchable).toBe(false);
    expect(expired.expiredDocsNotify).toBe(true);
    expect(checkVendorDispatchable(v, "EMERGENCY", 50).reasons).toContain("task_type_not_approved");
  });
});
