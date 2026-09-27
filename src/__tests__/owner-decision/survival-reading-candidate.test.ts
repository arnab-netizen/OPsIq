/**
 * Business issue state vs action lifecycle (survival). A survival-class finding raised by the cash /
 * finance evidence OpsIQ holds is an open issue until newer evidence says otherwise; an action is only
 * how the owner responds. Scenarios A–F from the consolidation brief, each through the real candidate
 * builder and the canonical resolver.
 */
import { describe, it, expect } from "vitest";
import { classifyOwnerFindingCode, parseOwnerDecisionMemory, resolveOwnerDecision, type OwnerDecisionCandidate, type ResolveOwnerDecisionInput } from "@/domain/owner-spine/owner-decision";
import { survivalIssueCandidates, type SurvivalEvidenceReading } from "@/services/owner-home/owner-decision-candidates";

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

const INSOLVENCY = { id: "f-ins", code: "FIN_INSOLVENT_RUNWAY", title: "Cash runs out within days", summary: "At the current burn, cash is nearly exhausted.", severity: "critical", confidence: 0.9, evidence: ["cashRunwayDays = 4 < 7"] };
const PAYABLES = { id: "f-pay", code: "FIN_HIGH_PAYABLES", title: "Supplier payables are high", summary: "", severity: "medium", confidence: 0.9, evidence: [] };
const BREAK_EVEN = { id: "f-be", code: "FIN_BELOW_BREAK_EVEN", title: "Below break-even", summary: "", severity: "critical", confidence: 0.9, evidence: [] };

const reading = (over: Partial<SurvivalEvidenceReading> = {}): SurvivalEvidenceReading => ({
  domain: "finance", periodEnd: PERIOD, stale: false, superseded: false, dataConfidenceScore: 80, findings: [INSOLVENCY, PAYABLES], ...over,
});

function input(candidates: OwnerDecisionCandidate[], over: Partial<ResolveOwnerDecisionInput> = {}): ResolveOwnerDecisionInput {
  return {
    ...CTX, candidates, diagnosedDomains: ["finance", "marketing"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 7, reason: "r" }, previous: null, events: [], now: new Date("2026-09-27T10:00:00.000Z"), ...over,
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
    const open = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical" });
    const before = resolveOwnerDecision(input([open], { evidenceIds: { finance: "snap-1" } }));
    const done = { ...open, status: "completed", exclusion: "completed" as const };
    const cands = withIssues([done], [reading({ findings: [INSOLVENCY] })]);
    const after = resolveOwnerDecision(input(cands, { evidenceIds: { finance: "snap-1" }, previous: parseOwnerDecisionMemory(JSON.parse(JSON.stringify(before.memory))) }));
    expect(after.primaryTarget?.source).toBe("survival_reading");
    expect(after.primaryTarget?.findingCode).toBe("FIN_INSOLVENT_RUNWAY");
    expect(after.primaryTarget?.explanation).toMatch(/was marked done, but your Finance figures .* still show "Cash runs out within days"/);
  });

  it("D. action CANCELLED but the same unsafe evidence remains: the issue stays open and nothing is reported resolved", () => {
    const open = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical" });
    const before = resolveOwnerDecision(input([open], { evidenceIds: { finance: "snap-1" } }));
    const cancelled = { ...open, status: "cancelled", exclusion: "cancelled" as const };
    const after = resolveOwnerDecision(input(withIssues([cancelled, growth], [reading({ findings: [INSOLVENCY] })]), {
      evidenceIds: { finance: "snap-1" }, previous: parseOwnerDecisionMemory(JSON.parse(JSON.stringify(before.memory))), now: new Date("2026-09-28T10:00:00.000Z"),
    }));
    expect(after.primaryTarget?.findingCode).toBe("FIN_INSOLVENT_RUNWAY");
    expect(after.primaryTarget?.priorityClass).toBe("SURVIVAL_CASH");
    expect(after.whatChanged.map((c) => c.kind)).not.toContain("CRITICAL_ISSUE_RESOLVED");
  });

  it("E. NEWER evidence that is safe clears the issue (and it may then be reported resolved)", () => {
    const open = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical" });
    const before = resolveOwnerDecision(input([open], { evidenceIds: { finance: "snap-1" } }));
    // New snapshot, new diagnosis: no survival finding raised any more; the old action is closed.
    const cancelled = { ...open, status: "cancelled", exclusion: "cancelled" as const };
    const cands = withIssues([cancelled, growth], [reading({ findings: [] })]);
    expect(cands.some((c) => c.source === "survival_reading")).toBe(false);
    const after = resolveOwnerDecision(input(cands, { evidenceIds: { finance: "snap-2" }, previous: parseOwnerDecisionMemory(JSON.parse(JSON.stringify(before.memory))), now: new Date("2026-09-28T10:00:00.000Z") }));
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

  it("a verification that measured the target as reached after the evidence is newer evidence: not re-raised", () => {
    const verified = action({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", severity: "critical", exclusion: "verified_complete" });
    expect(survivalIssueCandidates([reading({ findings: [INSOLVENCY] })], [verified], CTX)).toEqual([]);
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
