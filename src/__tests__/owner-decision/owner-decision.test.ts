/**
 * Canonical owner decision (Owner Intelligence Spine arbiter) — pure behaviour.
 *
 * Covers the mission's adversarial cases A–H, saturated-score ties, terminal/verified exclusion
 * (the production defect where an already-verified Minor Finance item outranked an active
 * Strategy funding gap), missing-evidence confidence caps and "what changed".
 */
import { describe, it, expect } from "vitest";
import {
  classifyOwnerFindingCode,
  describeOwnerChanges,
  rankOwnerCandidates,
  resolveOwnerDecision,
  strategyCandidatePriorityClass,
  type OwnerChangeFacts,
  type OwnerDecisionCandidate,
  type OwnerEvidenceTransition,
  type ResolveOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const WS = "ws-1";
const BIZ = "biz-1";
const NOW = new Date("2026-09-27T10:00:00.000Z");

function cand(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string }): OwnerDecisionCandidate {
  const sourceId = p.sourceId ?? `${p.findingCode}-${p.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    candidateId: p.candidateId ?? `domain_action:${sourceId}`,
    businessId: p.businessId ?? BIZ,
    workspaceId: p.workspaceId ?? WS,
    source: p.source ?? "domain_action",
    domain: p.domain ?? "finance",
    sourceId,
    priorityClass: p.priorityClass ?? classifyOwnerFindingCode(p.findingCode),
    findingCode: p.findingCode,
    findingId: p.findingId ?? null,
    title: p.title,
    explanation: p.explanation ?? "",
    severity: p.severity === undefined ? "medium" : p.severity,
    priorityScore: p.priorityScore ?? 50,
    expectedImpactScore: p.expectedImpactScore ?? 50,
    confidence: p.confidence ?? 0.9,
    effortScore: p.effortScore ?? 40,
    status: p.status ?? "proposed",
    ownerActionRequired: true,
    blocking: false,
    evidence: p.evidence ?? [],
    missingData: p.missingData ?? [],
    verificationMetric: p.verificationMetric ?? null,
    evidenceAsOf: null,
    stale: p.stale ?? false,
    exclusion: p.exclusion ?? null,
    targetRoute: p.targetRoute ?? "/owner/finance",
  };
}

function input(candidates: OwnerDecisionCandidate[], over: Partial<ResolveOwnerDecisionInput> = {}): ResolveOwnerDecisionInput {
  return {
    businessId: BIZ,
    workspaceId: WS,
    candidates,
    diagnosedDomains: ["finance", "strategy"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [],
    strategy: null,
    reassessment: { days: 14, reason: "Elevated risk — fortnightly review while the condition recovers." },
    changeFacts: NO_CHANGE_FACTS,
    now: NOW,
    ...over,
  };
}

describe("resolveOwnerDecision — exactly one primary target", () => {
  it("elects exactly one primary and lists it first in the attention order", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "Tighten discounting" }),
      cand({ findingCode: "STR_UNAFFORDABLE", title: "Close the ₹50,000 funding gap", domain: "strategy", priorityScore: 70 }),
    ]));
    expect(d.state).toBe("TARGET");
    expect(d.primaryTarget).not.toBeNull();
    expect(d.attention[0].candidateId).toBe(d.primaryCandidateId);
    expect(d.attention.filter((t) => t.candidateId === d.primaryCandidateId)).toHaveLength(1);
  });

  it("is deterministic regardless of input order", () => {
    const cs = [
      cand({ findingCode: "SALES_LOW_CONVERSION", title: "Raise conversion", domain: "sales", priorityScore: 100 }),
      cand({ findingCode: "MKT_POOR_CONVERSION", title: "Fix the offer", domain: "marketing", priorityScore: 100 }),
      cand({ findingCode: "OPS_HIGH_DELAY", title: "Clear delays", domain: "operations", priorityScore: 60 }),
    ];
    const a = resolveOwnerDecision(input(cs)).attention.map((t) => t.candidateId);
    const b = resolveOwnerDecision(input([...cs].reverse())).attention.map((t) => t.candidateId);
    expect(a).toEqual(b);
  });
});

describe("adversarial cases", () => {
  it("A — cash danger beats a growth opportunity even when growth scores higher", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "STR_OPP_STRONG_RETURN", title: "Open the second outlet", domain: "strategy", priorityScore: 100, severity: "low" }),
      cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect cash runway", domain: "cashflow", priorityScore: 55, severity: "high" }),
    ]));
    expect(d.primaryTarget?.title).toBe("Protect cash runway");
    expect(d.whyThisWins.join(" ")).toMatch(/cash-survival danger/);
  });

  it("B — a critical service failure beats a marketing opportunity", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", domain: "marketing", priorityScore: 100 }),
      cand({ findingCode: "OPS_DELIVERY_FAILURE", title: "Stop failed deliveries", domain: "operations", priorityScore: 60, severity: "critical" }),
    ]));
    expect(d.primaryTarget?.title).toBe("Stop failed deliveries");
  });

  it("C — a compliance breach beats revenue work and even cash danger", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "SALES_OPP_CONVERT_PIPELINE", title: "Convert the pipeline", domain: "sales", priorityScore: 100 }),
      cand({ findingCode: "CF_INSOLVENT_RUNWAY", title: "Cash runs out in 20 days", domain: "cashflow", priorityScore: 100, severity: "critical" }),
      cand({ findingCode: "COMPLIANCE_BREACH", title: "Fire safety certificate expired", domain: "compliance", source: "compliance_item", priorityScore: 0, severity: "critical" }),
    ]));
    expect(d.primaryTarget?.title).toBe("Fire safety certificate expired");
    expect(d.attention.map((t) => t.title)).toEqual(["Fire safety certificate expired", "Cash runs out in 20 days", "Convert the pipeline"]);
  });

  it("D — missing critical evidence outranks a speculative high-score recommendation and is reported as missing information", () => {
    const d = resolveOwnerDecision(input(
      [
        cand({ findingCode: "STR_UNAFFORDABLE", title: "Close the ₹50,000 funding gap", domain: "strategy", priorityScore: 100, severity: "critical" }),
        cand({ findingCode: "FIN_MISSING_CRITICAL_DATA", title: "Enter your costs and cash", priorityScore: 51, severity: "high", confidence: 1, missingData: ["costs", "cashOnHand"] }),
      ],
      { dataSufficiency: { status: "insufficient", lowestDataConfidenceScore: 0, lowConfidenceDomains: ["finance"], missingCriticalData: ["costs", "cashOnHand"] } }
    ));
    expect(d.primaryTarget?.title).toBe("Enter your costs and cash");
    expect(d.missingInformation).toEqual(expect.arrayContaining(["costs", "cashOnHand"]));
    expect(d.whyThisWins.join(" ")).toMatch(/Close the ₹50,000 funding gap/);
  });

  it("D — a non-data primary on insufficient evidence is never presented with high confidence", () => {
    const d = resolveOwnerDecision(input(
      [cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "Tighten discounting", confidence: 0.95 })],
      { dataSufficiency: { status: "insufficient", lowestDataConfidenceScore: 10, lowConfidenceDomains: ["finance"], missingCriticalData: ["cashOnHand"] } }
    ));
    expect(d.confidence.capped).toBe(true);
    expect(d.confidence.score).toBeLessThanOrEqual(40);
    expect(d.confidence.level).not.toBe("high");
    // The main target's own domain is never told "don't rely on it": the issue needs attention, only its
    // numerical score is provisional (a condition, not a prohibition).
    expect(d.whatNotToDo.join(" ")).not.toMatch(/Finance/);
    expect(d.conditions).toEqual(["The Finance issue needs attention now, but its Finance score is provisional until cash on hand is supplied."]);
  });

  it("E — two actions saturated at 100 are ordered by business class, not by code or title", () => {
    // Alphabetically "FIN_…" < "STR_…" and "A…" < "Z…" — the old tie-break would pick the growth item.
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "FIN_OPP_MARGIN_IMPROVEMENT", title: "A margin idea", priorityScore: 100, expectedImpactScore: 100, confidence: 1, severity: "high" }),
      cand({ findingCode: "OPS_HIGH_COMPLAINT_RATE", title: "Z complaints", domain: "operations", priorityScore: 100, expectedImpactScore: 60, confidence: 0.8, severity: "high" }),
    ]));
    expect(d.primaryTarget?.title).toBe("Z complaints");
  });

  it("E — saturated ties within one class are decided by severity before any identifier", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "FIN_BELOW_BREAK_EVEN", title: "A below break-even", priorityScore: 100, severity: "high" }),
      cand({ findingCode: "FIN_NEGATIVE_NET_MARGIN", title: "Z losing money", priorityScore: 100, severity: "critical" }),
    ]));
    expect(d.primaryTarget?.title).toBe("Z losing money");
    expect(d.whyThisWins.join(" ")).toMatch(/rated critical/);
  });

  it("F — a completed top action disappears and the next candidate becomes #1", () => {
    const cs = [
      cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", domain: "cashflow", severity: "critical" }),
      cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "Tighten discounting" }),
    ];
    expect(resolveOwnerDecision(input(cs)).primaryTarget?.title).toBe("Protect runway");
    cs[0] = { ...cs[0], status: "completed", exclusion: "completed" };
    const after = resolveOwnerDecision(input(cs));
    expect(after.primaryTarget?.title).toBe("Tighten discounting");
    expect(after.attention.map((t) => t.title)).not.toContain("Protect runway");
    expect(after.excluded).toEqual([expect.objectContaining({ title: "Protect runway", reason: "completed" })]);
  });

  it("G — candidates from another business or workspace can never be elected", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "CF_INSOLVENT_RUNWAY", title: "Other business cash", domain: "cashflow", severity: "critical", businessId: "biz-2" }),
      cand({ findingCode: "CF_INSOLVENT_RUNWAY", title: "Other workspace cash", domain: "cashflow", severity: "critical", workspaceId: "ws-2" }),
      cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "This business discounting" }),
    ]));
    expect(d.primaryTarget?.title).toBe("This business discounting");
    expect(d.attention).toHaveLength(1);
  });

  it("H — no evidence: honest missing-data guidance and no fabricated target", () => {
    const d = resolveOwnerDecision(input([], { diagnosedDomains: [], dataSufficiency: { status: "insufficient", lowestDataConfidenceScore: 0, lowConfidenceDomains: [], missingCriticalData: [] } }));
    expect(d.state).toBe("NO_EVIDENCE");
    expect(d.primaryTarget).toBeNull();
    expect(d.primaryCandidateId).toBeNull();
    expect(d.attention).toEqual([]);
    expect(d.missingInformation[0]).toMatch(/Add your business numbers/);
    expect(d.confidence.level).toBe("insufficient");
  });

  it("diagnosed but nothing open: NO_OPEN_ACTIONS, not a fabricated target", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "Done", status: "completed", exclusion: "completed" })]));
    expect(d.state).toBe("NO_OPEN_ACTIONS");
    expect(d.primaryTarget).toBeNull();
  });
});

describe("production defect — verified Minor Finance item vs active Strategy funding gap", () => {
  it("an already-verified (target reached) Finance item cannot win; the conflict is resolved explicitly", () => {
    const cs = [
      // The verified item still sits open (in_progress, re-attached to the re-diagnosed cycle).
      cand({ findingCode: "FIN_OPP_DATA_QUALITY", title: "Improve data completeness", status: "in_progress", priorityScore: 28, exclusion: "verified_complete" }),
      cand({ findingCode: "STR_UNAFFORDABLE", title: "Close the ₹50,000 funding gap", domain: "strategy", priorityScore: 70, severity: "high", targetRoute: "/owner/strategy", priorityClass: strategyCandidatePriorityClass("NOT_YET", "STR_UNAFFORDABLE") }),
      cand({ findingCode: "FIN_OPP_REVENUE_QUALITY", title: "Improve revenue quality", priorityScore: 3, severity: "low" }),
    ];
    const d = resolveOwnerDecision(input(cs, {
      strategy: { code: "NOT_YET", headline: "Not yet", headlineDetail: "You're ₹50,000 short.", optionName: "New van", fundingGap: 50000, currency: "INR" },
    }));
    expect(d.primaryTarget?.title).toBe("Close the ₹50,000 funding gap");
    expect(d.attention.map((t) => t.title)).not.toContain("Improve data completeness");
    expect(d.excluded).toEqual([expect.objectContaining({ title: "Improve data completeness", reason: "verified_complete" })]);
    expect(d.whatCanWait.map((t) => t.title)).toContain("Improve revenue quality");
    // The main target IS the Strategy step, so the gate reads as its precondition (not a contradiction).
    expect(d.whatNotToDo.join(" ")).toMatch(/Don't commit to "New van" until "Close the ₹50,000 funding gap" is done — Strategy says "Not yet"/);
  });

  it("with a non-Strategy main target, the Strategy gate stays a plain 'not yet'", () => {
    const d = resolveOwnerDecision(input([
      cand({ domain: "cashflow", findingCode: "CF_LOW_RUNWAY", title: "Protect your cash runway", priorityScore: 60, severity: "high" }),
    ], {
      strategy: { code: "NOT_YET", headline: "Not yet", headlineDetail: "You're ₹50,000 short.", optionName: "New van", fundingGap: 50000, currency: "INR" },
    }));
    expect(d.primaryTarget?.domain).toBe("cashflow");
    expect(d.whatNotToDo.join(" ")).toMatch(/Don't commit to "New van" yet — Strategy says "Not yet": You're ₹50,000 short\./);
  });

  it("a verified fix re-proposed from the same unchanged evidence stays out until new data arrives", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "Tighten discounting", priorityScore: 90, exclusion: "verified_fix_awaiting_new_evidence" }),
      cand({ findingCode: "STR_UNAFFORDABLE", title: "Close the funding gap", domain: "strategy", priorityScore: 40 }),
    ]));
    expect(d.primaryTarget?.title).toBe("Close the funding gap");
  });
});

describe("domain-local steps cannot override the canonical primary", () => {
  it("supporting steps come from the primary's own domain; other domains' next steps only wait", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", domain: "cashflow", severity: "high" }),
      cand({ findingCode: "CF_SLOW_COLLECTIONS", title: "Chase collections", domain: "cashflow" }),
      cand({ findingCode: "SALES_OPP_WINBACK", title: "Win back customers", domain: "sales", priorityScore: 100 }),
    ]));
    expect(d.primaryTarget?.title).toBe("Protect runway");
    expect(d.supportingSteps.map((t) => t.title)).toEqual(["Chase collections"]);
    expect(d.whatCanWait.map((t) => t.title)).toEqual(["Win back customers"]);
  });
});

const SINCE = new Date("2026-09-13T10:00:00.000Z");
const facts = (over: Partial<OwnerChangeFacts> = {}): OwnerChangeFacts => ({ ...NO_CHANGE_FACTS, since: SINCE, ...over });
const issue = (title: string, severity: "critical" | "high" | "medium" | "low") => ({ severity, title });
const transition = (over: Partial<OwnerEvidenceTransition> = {}): OwnerEvidenceTransition => ({
  domain: "finance", previousEvidenceId: "snap-1", currentEvidenceId: "snap-2", newerEvidence: true, at: new Date("2026-09-26T10:00:00.000Z"),
  previousIssues: {}, currentIssues: {}, ...over,
});

describe("what changed — only persisted mutation facts, never read-time memory", () => {
  it("first check / nothing persisted in the window: reports nothing rather than inventing changes", () => {
    expect(resolveOwnerDecision(input([cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "x" })])).whatChanged).toEqual([]);
    expect(describeOwnerChanges(facts())).toEqual([]);
  });

  it("never reports 'main target changed', a confidence move or a funding-gap move (not reconstructible from persisted facts)", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "x" })], {
      strategy: { code: "NOT_YET", headline: "Not yet", headlineDetail: null, optionName: null, fundingGap: 20000, currency: "INR" },
      changeFacts: facts({ events: [{ kind: "ACTION_COMPLETED", title: "Tighten discounting", at: new Date("2026-09-20T12:00:00.000Z") }] }),
    }));
    expect(d.whatChanged).toEqual([{ kind: "ACTION_COMPLETED", message: 'Completed: "Tighten discounting".' }]);
    expect(d.whatChangedWindowDays).toBe(14);
  });

  it("completions and verifications are reported only inside the window", () => {
    const ch = describeOwnerChanges(facts({ events: [
      { kind: "ACTION_COMPLETED", title: "Old", at: new Date("2026-08-01T00:00:00.000Z") },
      { kind: "ACTION_VERIFIED", title: "Chase invoices", at: new Date("2026-09-20T00:00:00.000Z") },
    ] }));
    expect(ch).toEqual([{ kind: "ACTION_VERIFIED", message: 'Verified: "Chase invoices" reached its target.' }]);
  });

  it("a re-diagnosis of the SAME snapshot is a new calculation, not new data (no EVIDENCE_UPDATED, no transitions)", () => {
    const same = transition({ currentEvidenceId: "snap-1", newerEvidence: false, previousIssues: { "finance:FIN_LOW_RUNWAY": issue("Protect runway", "critical") } });
    expect(describeOwnerChanges(facts({ transitions: [same] }))).toEqual([]);
  });

  it("new figures are reported as new evidence", () => {
    expect(describeOwnerChanges(facts({ transitions: [transition()] }))).toEqual([{ kind: "EVIDENCE_UPDATED", message: "New Finance figures were analysed." }]);
  });

  it("P2 — same issue + NEW evidence + still raised → EVIDENCE_UPDATED, never 'resolved'", () => {
    const t = transition({
      previousIssues: { "finance:FIN_LOW_RUNWAY": issue("Protect runway", "critical") },
      currentIssues: { "finance:FIN_LOW_RUNWAY": issue("Protect runway", "critical") },
    });
    const kinds = describeOwnerChanges(facts({ transitions: [t] })).map((c) => c.kind);
    expect(kinds).toEqual(["EVIDENCE_UPDATED"]);
  });

  describe("severity transitions use stable issue identity on newer evidence", () => {
    const key = "finance:FIN_LOW_RUNWAY";
    it("critical → high is an improvement, NOT a resolution", () => {
      const ch = describeOwnerChanges(facts({ transitions: [transition({ previousIssues: { [key]: issue("Protect your runway", "critical") }, currentIssues: { [key]: issue("Protect your runway", "high") } })] }));
      // Issue lines come before the generic "new figures" line.
      expect(ch.map((c) => c.kind)).toEqual(["SEVERITY_DECREASED", "EVIDENCE_UPDATED"]);
      expect(ch[0].message).toBe('"Protect your runway" in Finance improved in the new figures from critical to high; it is still open.');
    });
    it("high → critical is an escalation", () => {
      const ch = describeOwnerChanges(facts({ transitions: [transition({ previousIssues: { [key]: issue("Protect your runway", "high") }, currentIssues: { [key]: issue("Protect your runway", "critical") } })] }));
      expect(ch[0]).toEqual({ kind: "SEVERITY_INCREASED", message: '"Protect your runway" in Finance became more serious in the new figures: high → critical.' });
    });
    it("critical → absent on NEWER evidence is resolved", () => {
      const ch = describeOwnerChanges(facts({ transitions: [transition({ previousIssues: { [key]: issue("Protect your runway", "critical") } })] }));
      expect(ch.map((c) => c.kind)).toEqual(["CRITICAL_ISSUE_RESOLVED", "EVIDENCE_UPDATED"]);
    });
    it("a brand-new critical issue appears only on newer evidence", () => {
      const ch = describeOwnerChanges(facts({ transitions: [transition({ currentIssues: { [key]: issue("Protect your runway", "critical") } })] }));
      expect(ch.map((c) => c.kind)).toEqual(["CRITICAL_ISSUE_APPEARED", "EVIDENCE_UPDATED"]);
      // A first diagnosis (no previous evidence) claims nothing about what "appeared".
      expect(describeOwnerChanges(facts({ transitions: [transition({ previousEvidenceId: null, currentIssues: { [key]: issue("x", "critical") } })] })).map((c) => c.kind)).toEqual(["EVIDENCE_UPDATED"]);
    });
    it("transitions older than the window are not reported", () => {
      expect(describeOwnerChanges(facts({ transitions: [transition({ at: new Date("2026-08-01T00:00:00.000Z"), previousIssues: { [key]: issue("x", "critical") } })] }))).toEqual([]);
    });
  });

  it("record lifecycle facts: appeared / closed / no longer critical — from the record's own trail", () => {
    const at = new Date("2026-09-20T00:00:00.000Z");
    const ch = describeOwnerChanges(facts({ recordIssues: [
      { key: "compliance:COMPLIANCE_BREACH:compliance_item:b", title: "VAT filing", change: "appeared", at },
      { key: "compliance:COMPLIANCE_BREACH:compliance_item:a", title: "Fire certificate", change: "closed", at },
      { key: "risk:RISK:business_risk:r1", title: "Main customer may leave", change: "no_longer_critical", at },
    ] }));
    expect(ch).toEqual([
      { kind: "CRITICAL_ISSUE_APPEARED", message: 'New critical issue recorded: "VAT filing".' },
      { kind: "CRITICAL_ISSUE_RESOLVED", message: '"Fire certificate" was closed in its record.' },
      { kind: "SEVERITY_DECREASED", message: '"Main customer may leave" is no longer rated critical; its record is still open.' },
    ]);
  });

  it("P2 — attribution loss: a second business makes workspace risks unattributable — ATTRIBUTION_CHANGED, never resolved/open", () => {
    const ch = describeOwnerChanges(facts({ attribution: { change: "lost", at: new Date("2026-09-20T00:00:00.000Z"), openCriticalCount: 1 } }));
    expect(ch).toHaveLength(1);
    expect(ch[0].kind).toBe("ATTRIBUTION_CHANGED");
    expect(ch[0].message).toMatch(/can no longer attribute workspace-wide risks and compliance items specifically to this business/);
    expect(ch.map((c) => c.kind)).not.toContain("CRITICAL_ISSUE_RESOLVED");
    // Nothing critical was affected: nothing to say.
    expect(describeOwnerChanges(facts({ attribution: { change: "lost", at: new Date("2026-09-20T00:00:00.000Z"), openCriticalCount: 0 } }))).toEqual([]);
  });

  it("P2 — re-attribution: back to one business → ATTRIBUTION_CHANGED, never a 'new critical issue'", () => {
    const ch = describeOwnerChanges(facts({ attribution: { change: "regained", at: new Date("2026-09-20T00:00:00.000Z"), openCriticalCount: 2 } }));
    expect(ch.map((c) => c.kind)).toEqual(["ATTRIBUTION_CHANGED"]);
    expect(ch.map((c) => c.kind)).not.toContain("CRITICAL_ISSUE_APPEARED");
  });

  it("a critical issue that merely went STALE is not reported as resolved; the owner is told the figures are out of date", () => {
    const insolvent = { findingCode: "FIN_INSOLVENT_RUNWAY", title: "Cash runs out in 20 days", severity: "critical" as const };
    const later = resolveOwnerDecision(input([cand({ ...insolvent, stale: true })], {
      staleDomains: ["finance"],
      changeFacts: facts({ newlyStaleDomains: ["finance"] }),
      now: new Date("2026-11-20T10:00:00.000Z"),
    }));
    const kinds = later.whatChanged.map((c) => c.kind);
    expect(kinds).toEqual(["EVIDENCE_OUT_OF_DATE"]);
    expect(later.whatChanged[0].message).toMatch(/figures in Finance are now out of date/);
    // The refresh target keeps the survival urgency of what it stands in for.
    expect(later.primaryTarget?.source).toBe("evidence_refresh");
    expect(later.primaryTarget?.priorityClass).toBe("SURVIVAL_CASH");
  });

  it("a refresh target never claims the old problem is current; confidence explains it is out-of-date information", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Cash runs out in 20 days", severity: "critical", stale: true })], { staleDomains: ["finance"] }));
    expect(d.primaryTarget?.source).toBe("evidence_refresh");
    expect(d.whyThisWins[0]).toMatch(/^Your Finance figures are out of date, and they last showed a cash-survival danger \(critical\); confirming them comes before acting/);
    expect(d.whyThisWins[0]).not.toMatch(/^This is/);
    expect(d.confidence.reasons).toContain("These figures are out of date, so what they showed is not proven now; confirm them before acting on it.");
    expect(d.missingInformation).toContain("Current figures for Finance — the latest ones are out of date, so what they showed cannot be relied on yet.");
    expect(d.evidence.join(" ")).toMatch(/^Out-of-date finding: /);
    expect(d.reassessmentTrigger).toMatch(/^Check again after you update the Finance figures and re-run its diagnosis/);
  });
});

describe("P2 — the reassessment trigger refers to the CURRENT step, never a dead action", () => {
  it("a live action: completion wording", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "Tighten discounting", verificationMetric: "discountRate" })]));
    expect(d.reassessmentTrigger).toMatch(/^Check again when "Tighten discounting" is done or your .* changes/);
  });
  it("an open issue whose action is closed: only new figures can change it", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "FIN_INSOLVENT_RUNWAY", title: "Preserve cash immediately", source: "survival_reading", candidateId: "survival_reading:finance:FIN_INSOLVENT_RUNWAY", severity: "critical", status: "cancelled" })]));
    expect(d.reassessmentTrigger).toMatch(/^Check again when new Finance figures are added \(only new figures can show this has gone\)/);
    expect(d.reassessmentTrigger).not.toMatch(/"Preserve cash immediately" is done/);
  });
  it("a recorded control fact: when its record is updated", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "COMPLIANCE_BREACH", title: "Licence breached", domain: "compliance", source: "compliance_item", severity: "critical" })]));
    expect(d.reassessmentTrigger).toMatch(/^Check again when the Compliance record for this is updated/);
  });
});

describe("rankOwnerCandidates", () => {
  it("unknown severity never outranks a known severity in the same class", () => {
    const r = rankOwnerCandidates([
      cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "unknown sev", severity: null, priorityScore: 100 }),
      cand({ findingCode: "FIN_HIGH_PAYABLES", title: "low sev", severity: "low", priorityScore: 10 }),
    ]);
    expect(r[0].title).toBe("low sev");
  });
});

describe("hostile-review regressions", () => {
  it("supporting steps never let a same-domain lower item jump ahead of a more urgent item from another domain", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "FIN_LOW_RUNWAY", title: "Protect runway", severity: "critical" }),
      cand({ findingCode: "CF_URGENT_PAYMENT_RISK", title: "Urgent payment due", domain: "cashflow", severity: "critical", priorityScore: 40 }),
      cand({ findingCode: "FIN_OPP_DATA_QUALITY", title: "Improve data completeness", severity: "low" }),
    ]));
    expect(d.primaryTarget?.title).toBe("Protect runway");
    expect(d.supportingSteps).toEqual([]);
    expect(d.whatCanWait.map((t) => t.title)).toEqual(["Urgent payment due", "Improve data completeness"]);
  });

  it("a supporting step is never also named in 'what not to do'", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "FIN_LOW_RUNWAY", title: "Protect runway", severity: "critical" }),
      cand({ findingCode: "FIN_OPP_MARGIN_IMPROVEMENT", title: "Improve margin" }),
    ]));
    expect(d.supportingSteps.map((t) => t.title)).toEqual(["Improve margin"]);
    expect(d.whatNotToDo.join(" ")).not.toMatch(/Improve margin/);
  });

  it("refresh vs refresh tied on every business factor is said to be equivalent — never 'a more pressing problem'", () => {
    const stale = (domain: "finance" | "cashflow", code: string) => cand({ findingCode: code, title: `${domain} runway`, domain, severity: "critical", priorityScore: 100, stale: true });
    const d = resolveOwnerDecision(input([stale("finance", "FIN_LOW_RUNWAY"), stale("cashflow", "CF_LOW_RUNWAY")], { staleDomains: ["finance", "cashflow"] }));
    expect(d.primaryTarget?.source).toBe("evidence_refresh");
    const sentence = d.whyThisWins[1];
    expect(sentence).not.toMatch(/more pressing/);
    expect(sentence).toMatch(/equivalent on every known business factor/);
    expect(sentence).toMatch(/only so the order stays the same every time/);
  });

  it("a recorded compliance breach is not capped by unrelated missing finance data", () => {
    const d = resolveOwnerDecision(input(
      [cand({ findingCode: "COMPLIANCE_BREACH", title: "Licence breached", domain: "compliance", source: "compliance_item", severity: "critical", confidence: 1 })],
      { dataSufficiency: { status: "insufficient", lowestDataConfidenceScore: 0, lowConfidenceDomains: ["finance"], missingCriticalData: ["cashOnHand"] } }
    ));
    expect(d.confidence.capped).toBe(false);
    expect(d.confidence.level).toBe("high");
  });

});
