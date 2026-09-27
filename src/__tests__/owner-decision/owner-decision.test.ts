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
  parseOwnerDecisionMemory,
  rankOwnerCandidates,
  resolveOwnerDecision,
  strategyCandidatePriorityClass,
  type OwnerDecisionCandidate,
  type ResolveOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision";

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
    previous: null,
    events: [],
    domainsDiagnosedSince: [],
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
    expect(d.whatNotToDo.join(" ")).toMatch(/Finance scores/);
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

describe("what changed", () => {
  it("reports a main-target change, a new critical issue, completions and confidence moves since the last check", () => {
    const first = resolveOwnerDecision(input(
      [cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "Tighten discounting", confidence: 0.9 })],
      { strategy: { code: "NOT_YET", headline: "Not yet", headlineDetail: null, optionName: null, fundingGap: 50000, currency: "INR" } }
    ));
    const memory = parseOwnerDecisionMemory(JSON.parse(JSON.stringify(first.memory)));
    expect(memory).not.toBeNull();
    const later = resolveOwnerDecision(input(
      [
        cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "Tighten discounting", status: "completed", exclusion: "completed" }),
        cand({ findingCode: "CF_INSOLVENT_RUNWAY", title: "Cash runs out in 20 days", domain: "cashflow", severity: "critical", confidence: 0.5 }),
      ],
      {
        previous: memory,
        now: new Date("2026-09-28T10:00:00.000Z"),
        events: [{ kind: "ACTION_COMPLETED", title: "Tighten discounting", at: new Date("2026-09-27T12:00:00.000Z") }],
        strategy: { code: "NOT_YET", headline: "Not yet", headlineDetail: null, optionName: null, fundingGap: 20000, currency: "INR" },
        domainsDiagnosedSince: ["cashflow"],
      }
    ));
    const kinds = later.whatChanged.map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining([
      "MAIN_TARGET_CHANGED", "CRITICAL_ISSUE_APPEARED", "ACTION_COMPLETED", "EVIDENCE_UPDATED", "FUNDING_GAP_CHANGED", "CONFIDENCE_CHANGED",
    ]));
    expect(later.whatChanged.find((c) => c.kind === "FUNDING_GAP_CHANGED")?.message).toMatch(/₹50,000 to ₹20,000/);
  });

  it("first check (no memory) reports nothing rather than inventing changes", () => {
    expect(resolveOwnerDecision(input([cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "x" })])).whatChanged).toEqual([]);
  });

  it("ignores a malformed persisted memory", () => {
    expect(parseOwnerDecisionMemory({ generatedAt: "not a date" })).toBeNull();
    expect(parseOwnerDecisionMemory(null)).toBeNull();
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

  it("two different compliance breaches are two issues: switching between them is a main-target change", () => {
    const breach = (id: string, title: string) =>
      cand({ findingCode: "COMPLIANCE_BREACH", title, domain: "compliance", source: "compliance_item", candidateId: `compliance_item:${id}`, severity: "critical" });
    const first = resolveOwnerDecision(input([breach("a", "Fire certificate expired")]));
    const later = resolveOwnerDecision(input([breach("b", "VAT filing breached")], { previous: first.memory, now: new Date("2026-09-28T10:00:00.000Z") }));
    const kinds = later.whatChanged.map((c) => c.kind);
    expect(kinds).toContain("MAIN_TARGET_CHANGED");
    expect(kinds).toContain("CRITICAL_ISSUE_APPEARED");
    expect(kinds).toContain("CRITICAL_ISSUE_RESOLVED");
  });

  it("a confidence move within the same level never reads 'from high to high'", () => {
    const first = resolveOwnerDecision(input([cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "x", confidence: 1 })]));
    const later = resolveOwnerDecision(input([cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "x", confidence: 0.8 })], { previous: first.memory }));
    const c = later.whatChanged.find((w) => w.kind === "CONFIDENCE_CHANGED");
    expect(c?.message).toMatch(/moved from 100 to 80/);
    expect(c?.message).not.toMatch(/from high to high/);
  });

  it("a rounding-only funding gap difference is not reported as a change", () => {
    const strategy = (gap: number) => ({ code: "NOT_YET" as const, headline: "Not yet", headlineDetail: null, optionName: null, fundingGap: gap, currency: "INR" });
    const first = resolveOwnerDecision(input([cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "x" })], { strategy: strategy(50000.2) }));
    const later = resolveOwnerDecision(input([cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "x" })], { strategy: strategy(50000.4), previous: first.memory }));
    expect(later.whatChanged.map((c) => c.kind)).not.toContain("FUNDING_GAP_CHANGED");
  });

  it("a recorded compliance breach is not capped by unrelated missing finance data", () => {
    const d = resolveOwnerDecision(input(
      [cand({ findingCode: "COMPLIANCE_BREACH", title: "Licence breached", domain: "compliance", source: "compliance_item", severity: "critical", confidence: 1 })],
      { dataSufficiency: { status: "insufficient", lowestDataConfidenceScore: 0, lowConfidenceDomains: ["finance"], missingCriticalData: ["cashOnHand"] } }
    ));
    expect(d.confidence.capped).toBe(false);
    expect(d.confidence.level).toBe("high");
  });

  it("a memory without a confidence score is ignored rather than inventing a confidence change", () => {
    expect(parseOwnerDecisionMemory({ generatedAt: "2026-09-27T10:00:00.000Z", primaryKey: "finance:X" })).toBeNull();
  });
});
