/**
 * Survival-reading target (growth-vs-cash reproduction, final review B/C/F): a CURRENT unsafe cash
 * reading whose own diagnosis found a cash-survival finding that no eligible survival action addresses
 * stays an explicit current target. It is never fabricated from a survival state driven only by
 * profit findings, never presented as out-of-date, and keeps the finding's identity so closing the
 * action without new figures is never reported as "resolved".
 */
import { describe, it, expect } from "vitest";
import { classifyOwnerFindingCode, parseOwnerDecisionMemory, resolveOwnerDecision, type OwnerDecisionCandidate, type ResolveOwnerDecisionInput } from "@/domain/owner-spine/owner-decision";
import { survivalConfirmationCandidate, worstSurvivalFinding, type CurrentSurvivalReading } from "@/services/owner-home/owner-decision-candidates";

const CTX = { businessId: "biz-1", workspaceId: "ws-1" };
const PERIOD = new Date("2026-09-15T00:00:00.000Z");

function cand(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string }): OwnerDecisionCandidate {
  const domain = p.domain ?? "cashflow";
  return {
    candidateId: p.candidateId ?? `domain_action:${domain}:${p.findingCode}`, ...CTX, source: p.source ?? "domain_action", domain, sourceId: p.findingCode,
    priorityClass: p.priorityClass ?? classifyOwnerFindingCode(p.findingCode), findingCode: p.findingCode, findingId: null, title: p.title, explanation: "",
    severity: p.severity === undefined ? "high" : p.severity, priorityScore: 50, expectedImpactScore: 50, confidence: 0.9, effortScore: 30, status: "proposed",
    ownerActionRequired: true, blocking: false, evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: p.stale ?? false,
    exclusion: p.exclusion ?? null, targetRoute: `/owner/${domain}`,
  };
}

const reading = (over: Partial<CurrentSurvivalReading> = {}): CurrentSurvivalReading => ({
  domain: "cashflow", state: "CRITICAL", periodEnd: PERIOD, dataConfidenceScore: 80,
  survivalFinding: { code: "CF_LOW_RUNWAY", title: "Runway under 30 days", severity: "critical" }, ...over,
});

function input(candidates: OwnerDecisionCandidate[], over: Partial<ResolveOwnerDecisionInput> = {}): ResolveOwnerDecisionInput {
  return {
    ...CTX, candidates, diagnosedDomains: ["cashflow", "finance"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 7, reason: "r" }, previous: null, events: [], now: new Date("2026-09-27T10:00:00.000Z"), ...over,
  };
}

describe("worstSurvivalFinding", () => {
  it("picks the most severe SURVIVAL_CASH finding and ignores other classes", () => {
    expect(worstSurvivalFinding([
      { code: "FIN_BELOW_BREAK_EVEN", title: "Below break-even", severity: "critical" },
      { code: "FIN_HIGH_PAYABLES", title: "Payables high", severity: "medium" },
      { code: "FIN_LOW_RUNWAY", title: "Low runway", severity: "high" },
    ])).toEqual({ code: "FIN_LOW_RUNWAY", title: "Low runway", severity: "high" });
    expect(worstSurvivalFinding([{ code: "FIN_BELOW_BREAK_EVEN", title: "x", severity: "critical" }])).toBeNull();
    expect(worstSurvivalFinding(null)).toBeNull();
  });
});

describe("survivalConfirmationCandidate", () => {
  it("an unsafe reading with a survival finding and no open survival action is a CURRENT survival target with the finding's identity", () => {
    const c = survivalConfirmationCandidate([reading()], [], CTX);
    expect(c).not.toBeNull();
    expect(c!.source).toBe("survival_reading");
    expect(c!.priorityClass).toBe("SURVIVAL_CASH");
    expect(c!.findingCode).toBe("CF_LOW_RUNWAY");
    expect(c!.severity).toBe("critical");
    expect(c!.stale).toBe(false);
    expect(c!.explanation).toMatch(/Runway under 30 days/);
  });

  it("an unsafe state driven only by non-survival findings is never turned into a survival target (no fabrication)", () => {
    expect(survivalConfirmationCandidate([reading({ domain: "finance", survivalFinding: null })], [], CTX)).toBeNull();
  });

  it("a safe reading produces nothing", () => {
    expect(survivalConfirmationCandidate([reading({ state: "SAFE" })], [], CTX)).toBeNull();
  });

  it("covered only by an eligible, current survival ACTION — an owner-recorded risk or a stale action does not cover it", () => {
    expect(survivalConfirmationCandidate([reading()], [cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway" })], CTX)).toBeNull();
    expect(survivalConfirmationCandidate([reading()], [cand({ findingCode: "CF_LOW_RUNWAY", title: "Risk", source: "business_risk", candidateId: "business_risk:r1" })], CTX)).not.toBeNull();
    expect(survivalConfirmationCandidate([reading()], [cand({ findingCode: "CF_LOW_RUNWAY", title: "Old", stale: true })], CTX)).not.toBeNull();
    expect(survivalConfirmationCandidate([reading()], [cand({ findingCode: "CF_LOW_RUNWAY", title: "Done", exclusion: "cancelled" })], CTX)).not.toBeNull();
  });

  it("wins over growth and is presented as current (never 'out of date' / 'last flagged')", () => {
    const s = survivalConfirmationCandidate([reading()], [], CTX)!;
    const d = resolveOwnerDecision(input([s, cand({ findingCode: "MKT_LOW_REFERRAL", title: "Add a referral ask", domain: "marketing", severity: "high" })]));
    expect(d.primaryTarget?.source).toBe("survival_reading");
    expect(d.primaryConcernClass).toBe("SURVIVAL_CASH");
    expect(d.whyThisWins[0]).toMatch(/shown by your current Cash flow figures, and no open action addresses it/);
    expect(d.whyThisWins.join(" ")).not.toMatch(/out of date/);
  });

  it("closing the survival action while the same evidence still reads unsafe is NOT 'resolved' (stable issue key)", () => {
    const before = resolveOwnerDecision(input([cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", severity: "critical" })], { evidenceIds: { cashflow: "snap-1" } }));
    const prev = parseOwnerDecisionMemory(JSON.parse(JSON.stringify(before.memory)));
    const s = survivalConfirmationCandidate([reading()], [], CTX)!;
    const after = resolveOwnerDecision(input([s], { previous: prev, evidenceIds: { cashflow: "snap-1" }, now: new Date("2026-09-28T10:00:00.000Z") }));
    const kinds = after.whatChanged.map((c) => c.kind);
    expect(kinds).not.toContain("CRITICAL_ISSUE_RESOLVED");
    expect(kinds).not.toContain("EVIDENCE_UPDATED");
  });
});
