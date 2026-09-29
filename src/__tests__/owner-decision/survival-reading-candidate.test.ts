/**
 * Business issue state vs action lifecycle (survival). A survival-class finding raised by the cash /
 * finance evidence OpsIQ holds is an open issue until newer evidence says otherwise; an action is only
 * how the owner responds. Scenarios A–F from the consolidation brief, each through the real candidate
 * builder and the canonical resolver.
 */
import { describe, it, expect } from "vitest";
import { classifyOwnerFindingCode, describeOwnerChanges, resolveOwnerDecision, type OwnerChangeFacts, type OwnerDecisionCandidate, type ResolveOwnerDecisionInput } from "@/domain/owner-spine/owner-decision";
import { domainActionToCandidate, issueVerificationFact, survivalIssueCandidates, verificationResolvesIssue, type IssueVerificationFact, type SurvivalEvidenceReading } from "@/services/owner-home/owner-decision-candidates";
import { buildOwnerSpineCandidates } from "@/services/owner-home/owner-candidate-builder";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const CTX = { businessId: "biz-1", workspaceId: "ws-1" };
const PERIOD = new Date("2026-09-15T00:00:00.000Z");

function action(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string }): OwnerDecisionCandidate {
  const domain = p.domain ?? "finance";
  return {
    candidateId: p.candidateId ?? `domain_action:${domain}:${p.findingCode}`, ...CTX, source: p.source ?? "domain_action", domain, sourceId: p.sourceId ?? p.findingCode,
    priorityClass: p.priorityClass ?? classifyOwnerFindingCode(p.findingCode), findingCode: p.findingCode, findingId: null, title: p.title, explanation: "",
    severity: p.severity === undefined ? "high" : p.severity, priorityScore: p.priorityScore ?? 50, expectedImpactScore: 50, confidence: 0.9, effortScore: 30,
    status: p.status ?? "proposed", ownerActionRequired: true, blocking: false, evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: PERIOD,
    stale: p.stale ?? false, exclusion: p.exclusion ?? null, targetRoute: `/owner/${domain}`,
  };
}

const INSOLVENCY = { id: "f-ins", code: "FIN_INSOLVENT_RUNWAY", title: "Cash runs out within days", summary: "At the current burn, cash is nearly exhausted.", severity: "critical", confidence: 0.9, sourceMetric: "cashRunwayDays", evidence: ["cashRunwayDays = 4 < 7"] };
const PAYABLES = { id: "f-pay", code: "FIN_HIGH_PAYABLES", title: "Supplier payables are high", summary: "", severity: "medium", confidence: 0.9, evidence: [] };
const BREAK_EVEN = { id: "f-be", code: "FIN_BELOW_BREAK_EVEN", title: "Below break-even", summary: "", severity: "critical", confidence: 0.9, evidence: [] };

const EVIDENCE_AT = new Date("2026-09-16T09:00:00.000Z");
const reading = (over: Partial<SurvivalEvidenceReading> = {}): SurvivalEvidenceReading => ({
  domain: "finance", periodEnd: PERIOD, evidenceAt: EVIDENCE_AT, stale: false, superseded: false, dataConfidenceScore: 80, findings: [INSOLVENCY, PAYABLES], verifications: [], ...over,
});

function input(candidates: OwnerDecisionCandidate[], over: Partial<ResolveOwnerDecisionInput> = {}): ResolveOwnerDecisionInput {
  return {
    ...CTX, candidates, diagnosedDomains: ["finance", "marketing"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 7, reason: "r" }, changeFacts: NO_CHANGE_FACTS, now: new Date("2026-09-27T10:00:00.000Z"), ...over,
  };
}

/** The candidates Home would pass: the domain actions plus the survival issues derived from the evidence. */
function withIssues(actions: OwnerDecisionCandidate[], readings: SurvivalEvidenceReading[]): OwnerDecisionCandidate[] {
  return [...actions, ...survivalIssueCandidates(readings, actions, CTX)];
}

const payablesAction = action({ findingCode: "FIN_HIGH_PAYABLES", title: "Call suppliers about overdue bills", severity: "medium", priorityScore: 40 });
const growth = action({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", domain: "marketing", severity: "high", priorityScore: 90 });

describe("survival issues are separate from their actions' lifecycle", () => {
  it("A. critical insolvency + an open MEDIUM payables action: insolvency stays visible and wins", () => {
    const insolvencyCancelled = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", status: "cancelled", exclusion: "cancelled", sourceId: "a-ins" });
    const d = resolveOwnerDecision(input(withIssues([insolvencyCancelled, payablesAction, growth], [reading()])));
    expect(d.primaryTarget?.findingCode).toBe("FIN_INSOLVENT_RUNWAY");
    expect(d.primaryTarget?.severity).toBe("critical");
    expect(d.attention.map((t) => t.findingCode)).toContain("FIN_HIGH_PAYABLES");
    expect(d.primaryTarget?.title).not.toBe(payablesAction.title);
  });

  it("A (no action ever proposed): an unrelated survival action never covers a different survival issue", () => {
    const issues = survivalIssueCandidates([reading()], [payablesAction], CTX);
    expect(issues.map((c) => c.findingCode)).toEqual(["FIN_INSOLVENT_RUNWAY"]);
  });

  it("B. an OPEN action for the same insolvency finding represents the issue: one issue, never a duplicate", () => {
    const open = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical" });
    const cands = withIssues([open, payablesAction], [reading()]);
    expect(cands.filter((c) => c.findingCode === "FIN_INSOLVENT_RUNWAY")).toHaveLength(1);
    const d = resolveOwnerDecision(input(cands));
    expect(d.attention.filter((t) => t.findingCode === "FIN_INSOLVENT_RUNWAY")).toHaveLength(1);
    expect(d.primaryTarget?.candidateId).toBe(open.candidateId);
  });

  it("C. action COMPLETED but the same unsafe evidence remains: the issue stays open (and is not 'resolved')", () => {
    const done = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", status: "completed", exclusion: "completed" });
    const after = resolveOwnerDecision(input(withIssues([done], [reading({ findings: [INSOLVENCY] })])));
    expect(after.primaryTarget?.source).toBe("survival_reading");
    expect(after.primaryTarget?.findingCode).toBe("FIN_INSOLVENT_RUNWAY");
    expect(after.primaryTarget?.explanation).toMatch(/was marked done, but your Finance figures .* still show "Cash runs out within days"/);
    expect(after.whatChanged.map((c) => c.kind)).not.toContain("CRITICAL_ISSUE_RESOLVED");
  });

  it("D. action CANCELLED but the same unsafe evidence remains: the issue stays open and nothing is reported resolved", () => {
    const cancelled = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", status: "cancelled", exclusion: "cancelled" });
    const after = resolveOwnerDecision(input(withIssues([cancelled, growth], [reading({ findings: [INSOLVENCY] })])));
    expect(after.primaryTarget?.findingCode).toBe("FIN_INSOLVENT_RUNWAY");
    expect(after.primaryTarget?.priorityClass).toBe("SURVIVAL_CASH");
    expect(after.whatChanged.map((c) => c.kind)).not.toContain("CRITICAL_ISSUE_RESOLVED");
  });

  it("E. NEWER evidence that no longer raises it clears the issue (and only then is it reported resolved)", () => {
    const cancelled = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", status: "cancelled", exclusion: "cancelled" });
    const cands = withIssues([cancelled, growth], [reading({ findings: [] })]);
    expect(cands.some((c) => c.source === "survival_reading")).toBe(false);
    const facts: OwnerChangeFacts = {
      ...NO_CHANGE_FACTS, since: new Date("2026-09-13T10:00:00.000Z"),
      transitions: [{
        domain: "finance", previousEvidenceId: "snap-1", currentEvidenceId: "snap-2", newerEvidence: true, at: new Date("2026-09-26T10:00:00.000Z"),
        previousIssues: { "finance:FIN_INSOLVENT_RUNWAY": { severity: "critical", title: "Cash runs out within days" } }, currentIssues: {},
      }],
    };
    const after = resolveOwnerDecision(input(cands, { changeFacts: facts }));
    expect(after.primaryTarget?.findingCode).toBe("MKT_OPP_SCALE_WINNER");
    expect(after.whatChanged.map((c) => c.kind)).toContain("CRITICAL_ISSUE_RESOLVED");
  });

  it("F. STALE unsafe evidence with no current replacement: an explicit refresh target, never high-confidence growth", () => {
    const cancelled = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", status: "cancelled", exclusion: "cancelled", stale: true });
    const d = resolveOwnerDecision(input(withIssues([cancelled, growth], [reading({ stale: true, findings: [INSOLVENCY] })]), { staleDomains: ["finance"] }));
    expect(d.primaryTarget?.source).toBe("evidence_refresh");
    expect(d.primaryTarget?.domain).toBe("finance");
    expect(d.primaryTarget?.priorityClass).toBe("SURVIVAL_CASH");
    expect(d.confidence.level).not.toBe("high");
    expect(d.primaryTarget?.findingCode).not.toBe("MKT_OPP_SCALE_WINNER");
  });

  it("a survival state driven only by NON-survival findings (e.g. below break-even) never becomes a survival issue", () => {
    expect(survivalIssueCandidates([reading({ findings: [BREAK_EVEN] })], [], CTX)).toEqual([]);
  });

  it("a VERIFIED action closes only the action: its issue stays open while the same evidence still raises it", () => {
    const verified = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", exclusion: "verified_complete" });
    const awaiting = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", exclusion: "verified_fix_awaiting_new_evidence", sourceId: "a-2", candidateId: "domain_action:finance:a-2" });
    for (const closed of [verified, awaiting]) {
      const [issue] = survivalIssueCandidates([reading({ findings: [INSOLVENCY] })], [closed], CTX);
      expect(issue.source).toBe("survival_reading");
      expect(issue.explanation).toMatch(/was verified as reaching its target, but your Finance figures .* still show "Cash runs out within days".* add refreshed Finance figures/);
    }
  });

  it("a reading superseded by a newer disagreeing reading of the other source raises nothing", () => {
    expect(survivalIssueCandidates([reading({ superseded: true })], [], CTX)).toEqual([]);
  });

  it("the issue's wording comes from its own finding — never a generic 'cash position' claim", () => {
    const [c] = survivalIssueCandidates([reading({ findings: [PAYABLES] })], [], CTX);
    expect(c.explanation).toMatch(/Supplier payables are high/);
    expect(c.explanation).not.toMatch(/cash position/);
    expect(c.title).toBe("Deal with: Supplier payables are high");
  });
});

/**
 * P1 — issue resolution requires CAUSALLY NEW evidence. Action lifecycle is not issue lifecycle: an issue
 * stops competing only when newer trusted evidence no longer raises it, or when a verification directly
 * MEASURED the issue's own metric after the issue's evidence time (and the domain records measured after
 * values — no current domain does: every verification's after value is owner-reported).
 */
describe("P1 — survival issue resolution is causal", () => {
  const fact = (over: Partial<IssueVerificationFact> = {}): IssueVerificationFact => ({
    findingCode: "FIN_INSOLVENT_RUNWAY", metric: "cashRunwayDays", reachedTarget: true, at: new Date("2026-09-20T00:00:00.000Z"), afterValueSource: "OWNER_REPORTED", ...over,
  });

  it("1. an OLD verification (before newer critical evidence) cannot clear the newly raised issue", () => {
    const old = fact({ at: new Date("2026-08-01T00:00:00.000Z"), afterValueSource: "MEASURED" });
    const verified = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", exclusion: "verified_complete" });
    const issues = survivalIssueCandidates([reading({ findings: [INSOLVENCY], verifications: [old] })], [verified], CTX);
    expect(issues.map((c) => c.findingCode)).toEqual(["FIN_INSOLVENT_RUNWAY"]);
    expect(resolveOwnerDecision(input([verified, growth, ...issues])).primaryTarget?.findingCode).toBe("FIN_INSOLVENT_RUNWAY");
  });

  it("2. the SAME snapshot still raises the issue after a verification: it remains (owner-reported after value is not new evidence)", () => {
    const sameSnapshot = fact({ at: new Date("2026-09-20T00:00:00.000Z") }); // after the evidence, but owner-reported
    const verified = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", exclusion: "verified_fix_awaiting_new_evidence" });
    const issues = survivalIssueCandidates([reading({ findings: [INSOLVENCY], verifications: [sameSnapshot] })], [verified], CTX);
    expect(issues).toHaveLength(1);
  });

  it("3. a NEWER snapshot that no longer raises it resolves it", () => {
    const verified = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", exclusion: "verified_complete" });
    expect(survivalIssueCandidates([reading({ findings: [], evidenceAt: new Date("2026-09-26T00:00:00.000Z") })], [verified], CTX)).toEqual([]);
  });

  it("4. a direct MEASUREMENT of the same metric after the evidence resolves it — only where the domain supports it", () => {
    const issue = { findingCode: "FIN_INSOLVENT_RUNWAY", sourceMetric: "cashRunwayDays", evidenceAt: EVIDENCE_AT };
    expect(verificationResolvesIssue(fact({ afterValueSource: "MEASURED" }), issue)).toBe(true);
    // Owner-reported (every current domain), a different metric, before the evidence, target not reached, unknown evidence time: no.
    expect(verificationResolvesIssue(fact(), issue)).toBe(false);
    expect(verificationResolvesIssue(fact({ afterValueSource: "MEASURED", metric: "cashOnHand" }), issue)).toBe(false);
    expect(verificationResolvesIssue(fact({ afterValueSource: "MEASURED", at: new Date("2026-09-10T00:00:00.000Z") }), issue)).toBe(false);
    expect(verificationResolvesIssue(fact({ afterValueSource: "MEASURED", reachedTarget: false }), issue)).toBe(false);
    expect(verificationResolvesIssue(fact({ afterValueSource: "MEASURED" }), { ...issue, evidenceAt: null })).toBe(false);
    const measured = survivalIssueCandidates([reading({ findings: [INSOLVENCY], verifications: [fact({ afterValueSource: "MEASURED" })] })], [], CTX);
    expect(measured.map((c) => c.findingCode)).toEqual([]);
  });

  it("5. a completed or cancelled action with unchanged unsafe evidence: the issue remains and nothing claims resolution", () => {
    for (const status of ["completed", "cancelled"] as const) {
      const closed = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", status, exclusion: status });
      const d = resolveOwnerDecision(input(withIssues([closed, growth], [reading({ findings: [INSOLVENCY] })])));
      expect(d.primaryTarget?.findingCode).toBe("FIN_INSOLVENT_RUNWAY");
      expect(d.reassessmentTrigger).toMatch(/^Check again when new Finance figures are added/);
      expect(d.reassessmentTrigger).not.toMatch(/Preserve cash immediately" is done/);
    }
    // Same issue + a re-diagnosis of the SAME figures: no transition is reported at all.
    expect(describeOwnerChanges({
      ...NO_CHANGE_FACTS, since: new Date("2026-09-13T00:00:00.000Z"),
      transitions: [{ domain: "finance", previousEvidenceId: "snap-1", currentEvidenceId: "snap-1", newerEvidence: false, at: new Date("2026-09-20T00:00:00.000Z"),
        previousIssues: { "finance:FIN_INSOLVENT_RUNWAY": { severity: "critical", title: "x" } }, currentIssues: {} }],
    })).toEqual([]);
  });
});

describe("P1 — through the REAL builder: verification rows, action exclusion and the survival issue", () => {
  const SNAP = { id: "snap-1", createdAt: new Date("2026-09-16T09:00:00.000Z"), periodEnd: PERIOD };
  const financeCycle = (actions: unknown[]) => ({
    id: "c1", snapshot: SNAP, generatedAt: SNAP.createdAt, overallHealthScore: 30, survivalRiskScore: 85, growthOpportunityScore: 0, dataConfidenceScore: 80,
    survivalState: "CRITICAL", findings: [{ ...INSOLVENCY, findingType: "risk", impactScore: 90, urgencyScore: 90, missingData: [] }], actions,
  });
  const action = (verifiedAt: string | null) => ({
    id: "a1", findingCode: "FIN_INSOLVENT_RUNWAY", findingId: "f-ins", title: "Preserve cash immediately", status: "in_progress",
    priorityScore: 90, expectedImpactScore: 90, confidence: 0.9, effortScore: 30,
    verifications: verifiedAt ? [{ status: "verified_improved", targetDirection: "up", afterValue: 30, targetValue: 14, baselineSource: "MEASURED", verificationMetric: "cashRunwayDays", createdAt: verifiedAt, verifiedAt }] : [],
  });
  const evidence = (a: ReturnType<typeof action>) => ({
    finance: financeCycle([a]), recovery: null, cashflow: null, sales: null, operations: null, sop: null, marketing: null, strategy: null,
    futureDomains: [],
    provisionalDomains: [],
    verifications: { finance: a.verifications.map((v) => ({ ...v, action: { title: a.title, findingCode: a.findingCode } })), sales: [], operations: [], sop: [], strategy: [], cashflow: [], marketing: [], recovery: [] },
  });

  it("S1 — verified AFTER the evidence: the action closes (verified_complete) but the survival issue stays and wins", () => {
    const { candidates } = buildOwnerSpineCandidates(evidence(action("2026-09-20T00:00:00.000Z")) as never, { ...CTX, now: new Date("2026-09-27T10:00:00.000Z") });
    expect(candidates.find((c) => c.source === "domain_action")?.exclusion).toBe("verified_complete");
    const d = resolveOwnerDecision(input(candidates));
    expect(d.primaryTarget?.source).toBe("survival_reading");
    expect(d.primaryTarget?.findingCode).toBe("FIN_INSOLVENT_RUNWAY");
  });

  it("S2 — a verification from BEFORE the evidence (carried forward): the action stays open, exactly one candidate for the issue", () => {
    const { candidates } = buildOwnerSpineCandidates(evidence(action("2026-08-01T00:00:00.000Z")) as never, { ...CTX, now: new Date("2026-09-27T10:00:00.000Z") });
    const forIssue = candidates.filter((c) => c.findingCode === "FIN_INSOLVENT_RUNWAY");
    expect(forIssue).toHaveLength(1);
    expect(forIssue[0]).toMatchObject({ source: "domain_action", exclusion: null });
  });

  it("an owner-entered after value is OWNER_REPORTED even when the BASELINE was measured (the only guard against owner claims clearing issues)", () => {
    const fact = issueVerificationFact({ status: "verified_improved", targetDirection: "up", afterValue: 30, targetValue: 14, baselineSource: "MEASURED", verificationMetric: "cashRunwayDays", createdAt: "2026-09-20T00:00:00.000Z" }, "FIN_INSOLVENT_RUNWAY");
    expect(fact).toMatchObject({ afterValueSource: "OWNER_REPORTED", reachedTarget: true, metric: "cashRunwayDays" });
    expect(verificationResolvesIssue(fact, { findingCode: "FIN_INSOLVENT_RUNWAY", sourceMetric: "cashRunwayDays", evidenceAt: EVIDENCE_AT })).toBe(false);
  });

  it("unknown evidence time never lets a verification close an action (fail safe)", () => {
    const a = action("2020-01-01T00:00:00.000Z");
    const c = domainActionToCandidate(a, { ...CTX, domain: "finance", findingsById: new Map(), evidenceAsOf: null, stale: false, verifiedFixes: new Map() });
    expect(c.exclusion).toBeNull();
  });
});
