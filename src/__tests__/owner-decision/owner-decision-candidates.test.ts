/**
 * Candidate normalization — lifecycle eligibility and control-record mapping (pure).
 */
import { describe, it, expect } from "vitest";
import {
  businessRiskToCandidate,
  complianceItemToCandidate,
  domainActionToCandidate,
  recoveryActionToCandidate,
} from "@/services/owner-home/owner-decision-candidates";

const base = { businessId: "b1", workspaceId: "w1", findingsById: new Map<string, unknown>(), evidenceAsOf: new Date("2026-09-01T00:00:00Z"), stale: false, verifiedFixes: new Map<string, Date>() };
const action = (over: Record<string, unknown> = {}) => ({
  id: "a1", findingCode: "FIN_DISCOUNT_LEAKAGE", title: "Tighten discounting", description: "", status: "proposed",
  priorityScore: 50, effortScore: 30, expectedImpactScore: 50, confidence: 0.8, verificationMetric: "discountRate", verifications: [], ...over,
});
const reached = { status: "verified_improved", afterValue: 8, targetValue: 10, targetDirection: "down", verifiedAt: new Date("2026-09-10T00:00:00Z") };

describe("domain action eligibility", () => {
  it("completed / cancelled / unknown statuses are excluded", () => {
    expect(domainActionToCandidate(action({ status: "completed" }), { ...base, domain: "finance" }).exclusion).toBe("completed");
    expect(domainActionToCandidate(action({ status: "cancelled" }), { ...base, domain: "finance" }).exclusion).toBe("cancelled");
    expect(domainActionToCandidate(action({ status: "archived" }), { ...base, domain: "finance" }).exclusion).toBe("superseded");
  });

  it("an open action whose own verification reached its target is excluded", () => {
    expect(domainActionToCandidate(action({ status: "in_progress", verifications: [reached] }), { ...base, domain: "finance" }).exclusion).toBe("verified_complete");
  });

  it("a later inconclusive row does not reopen verified work; a later not-improved verification does", () => {
    const inconclusive = { status: "inconclusive", afterValue: null, targetValue: 10, targetDirection: "down", createdAt: new Date("2026-09-20T00:00:00Z") };
    expect(domainActionToCandidate(action({ status: "in_progress", verifications: [reached, inconclusive] }), { ...base, domain: "finance" }).exclusion).toBe("verified_complete");
    const regressed = { status: "verified_not_improved", afterValue: 14, targetValue: 10, targetDirection: "down", verifiedAt: new Date("2026-09-20T00:00:00Z") };
    expect(domainActionToCandidate(action({ status: "in_progress", verifications: [reached, regressed] }), { ...base, domain: "finance" }).exclusion).toBeNull();
  });

  it("a re-proposal from evidence captured before the fix was verified waits for new evidence", () => {
    const ctx = { ...base, domain: "cashflow" as const, verifiedFixes: new Map([["FIN_DISCOUNT_LEAKAGE", new Date("2026-09-10T00:00:00Z")]]) };
    expect(domainActionToCandidate(action(), ctx).exclusion).toBe("verified_fix_awaiting_new_evidence");
    expect(domainActionToCandidate(action(), { ...ctx, evidenceAsOf: new Date("2026-09-15T00:00:00Z") }).exclusion).toBeNull();
  });

  it("severity comes from the linked finding; unknown severity is null, never invented", () => {
    const ctx = { ...base, domain: "finance" as const, findingsById: new Map<string, unknown>([["f1", { severity: "critical", evidence: ["e"], missingData: ["costs"] }]]) };
    const c = domainActionToCandidate(action({ findingId: "f1" }), ctx);
    expect(c.severity).toBe("critical");
    expect(c.missingData).toEqual(["costs"]);
    expect(domainActionToCandidate(action(), { ...base, domain: "finance" }).severity).toBeNull();
  });
});

describe("recovery", () => {
  it("severity follows the finding (or the action priority), class follows the finding code", () => {
    const c = recoveryActionToCandidate({ id: "r1", priority: "high", effort: "low", confidence: 0.8, status: "proposed", title: "Fix quality", finding: { code: "QUALITY_FAILURE", severity: "critical" }, verifications: [] }, { ...base, domain: "recovery" });
    expect(c.severity).toBe("critical");
    expect(c.priorityClass).toBe("CUSTOMER_SERVICE_FAILURE");
  });
});

describe("control records", () => {
  it("compliance: a breach or the gate's active-and-expired hard stop competes as safety; compliant/waived/upcoming do not", () => {
    const now = new Date("2026-09-27T00:00:00Z");
    expect(complianceItemToCandidate({ id: "c1", name: "Fire cert", status: "breached", businessId: "b1" }, { businessId: "b1", workspaceId: "w1", now })?.priorityClass).toBe("SAFETY_COMPLIANCE");
    const expiredActive = complianceItemToCandidate({ id: "c2", name: "Licence", status: "active", expiresAt: new Date("2026-09-01T00:00:00Z"), businessId: "b1" }, { businessId: "b1", workspaceId: "w1", now });
    expect(expiredActive?.priorityClass).toBe("SAFETY_COMPLIANCE");
    expect(expiredActive?.severity).toBeNull(); // the model records no severity for an expiry
    expect(complianceItemToCandidate({ id: "c3", name: "x", status: "compliant", expiresAt: new Date("2026-01-01T00:00:00Z") }, { businessId: "b1", workspaceId: "w1", now })).toBeNull();
    expect(complianceItemToCandidate({ id: "c4", name: "x", status: "active", expiresAt: new Date("2026-12-01T00:00:00Z") }, { businessId: "b1", workspaceId: "w1", now })).toBeNull();
  });

  it("compliance keeps the row's own business (a mis-scoped row cannot be re-stamped)", () => {
    const c = complianceItemToCandidate({ id: "c1", name: "x", status: "breached", businessId: "OTHER" }, { businessId: "b1", workspaceId: "w1", now: new Date() });
    expect(c?.businessId).toBe("OTHER");
  });

  it("risks: only critical open non-fixture risks compete; mitigated risks use residual risk; likelihood is not evidence confidence", () => {
    const risk = (over: Record<string, unknown>) => ({ id: "k1", title: "Competitor entry", category: "MARKET", likelihood: 90, impact: 90, severity: 81, status: "IDENTIFIED", isFixtureRecord: false, ...over });
    const c = businessRiskToCandidate(risk({}), { businessId: "b1", workspaceId: "w1" });
    expect(c?.priorityClass).toBe("PROFIT_LOSS");
    expect(c?.confidence).toBeLessThan(0.75);
    expect(businessRiskToCandidate(risk({ status: "MITIGATING", residualRisk: 10 }), { businessId: "b1", workspaceId: "w1" })).toBeNull();
    expect(businessRiskToCandidate(risk({ isFixtureRecord: true }), { businessId: "b1", workspaceId: "w1" })).toBeNull();
    expect(businessRiskToCandidate(risk({ severity: 60 }), { businessId: "b1", workspaceId: "w1" })).toBeNull();
    expect(businessRiskToCandidate(risk({ status: "ACCEPTED" }), { businessId: "b1", workspaceId: "w1" })).toBeNull();
  });
});

describe("Home cash/finance supersession never trusts an out-of-date reading (confirmation review P2-a)", () => {
  it("returns the evidence period only for current, un-amended evidence", async () => {
    const { currentEvidenceTime } = await import("@/services/owner-home/home.service");
    const cutoff = Date.parse("2026-08-13T00:00:00Z");
    const fresh = new Date("2026-09-20T00:00:00Z");
    expect(currentEvidenceTime({ periodEnd: fresh }, cutoff)).toEqual(fresh);
    expect(currentEvidenceTime({ periodEnd: fresh, supersededById: "newer-version" }, cutoff)).toBeNull();
    expect(currentEvidenceTime({ periodEnd: new Date("2026-07-01T00:00:00Z") }, cutoff)).toBeNull();
    expect(currentEvidenceTime(null, cutoff)).toBeNull();
  });
});
