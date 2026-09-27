/**
 * Regressions for the second hostile audit (owner-directed items 1, 3, 4). Written BEFORE the fixes
 * to reproduce each defect; they must fail on the WIP checkpoint (2f005b73) and pass after.
 */
import { describe, it, expect } from "vitest";
import {
  classifyOwnerFindingCode,
  resolveOwnerDecision,
  strategyCandidatePriorityClass,
  type OwnerDecisionCandidate,
  type ResolveOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision";
import { complianceItemToCandidate } from "@/services/owner-home/owner-decision-candidates";

const BIZ = "biz-1";
const WS = "ws-1";

function cand(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string }): OwnerDecisionCandidate {
  return {
    candidateId: p.candidateId ?? `domain_action:${p.domain ?? "finance"}:${p.findingCode}`, businessId: BIZ, workspaceId: WS,
    source: p.source ?? "domain_action", domain: p.domain ?? "finance", sourceId: p.findingCode,
    priorityClass: p.priorityClass ?? classifyOwnerFindingCode(p.findingCode), findingCode: p.findingCode, findingId: null,
    title: p.title, explanation: "", severity: p.severity === undefined ? "medium" : p.severity, priorityScore: p.priorityScore ?? 50,
    expectedImpactScore: p.expectedImpactScore ?? 50, confidence: p.confidence ?? 0.9, effortScore: p.effortScore ?? 30, status: "proposed", ownerActionRequired: true, blocking: false,
    evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: p.stale ?? false, exclusion: null,
    targetRoute: `/owner/${p.domain ?? "finance"}`,
  };
}

function input(candidates: OwnerDecisionCandidate[], over: Partial<ResolveOwnerDecisionInput> = {}): ResolveOwnerDecisionInput {
  return {
    businessId: BIZ, workspaceId: WS, candidates, diagnosedDomains: ["cashflow", "finance"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 14, reason: "r" }, previous: null, events: [],
    now: new Date("2026-09-27T10:00:00.000Z"),
    ...over,
  };
}

describe("item 1 — a stale diagnosis is never an authoritative 'do this now'", () => {
  it("a stale high-class action never becomes 'do this now': it is replaced by an explicit refresh target that keeps its urgency", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", domain: "cashflow", severity: "critical", stale: true }),
      cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "Tighten discounting", severity: "medium" }),
    ]));
    // The stale action itself is neither the target nor in the order.
    expect(d.attention.map((t) => t.title)).not.toContain("Protect runway");
    expect(d.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Protect runway", reason: "stale_evidence" })]));
    // What leads is CONFIRMING the out-of-date survival danger — never acting on it blind, and never
    // demoted behind fresh minor work (hostile review B/C: an insolvency warning must not vanish by ageing).
    const refresh = d.primaryTarget!;
    expect(refresh.source).toBe("evidence_refresh");
    expect(refresh.domain).toBe("cashflow");
    expect(refresh.title).toMatch(/^Update the figures in Cash flow before acting on them$/);
    expect(refresh.priorityClass).toBe("SURVIVAL_CASH");
    expect(refresh.severity).toBe("critical");
    expect(refresh.explanation).toMatch(/Protect runway/);
    expect(d.attention[1].title).toBe("Tighten discounting");
  });

  it("P1 (final review C): a FRESH danger beats a stale refresh target of the SAME class and severity", () => {
    // Exact reviewer case: Finance is 46+ days old with FIN_LOW_RUNWAY (critical, priority 100,
    // impact 90); Cash flow is fresh with CF_LOW_RUNWAY (critical, priority 100, impact 85, confidence 0.8).
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "FIN_LOW_RUNWAY", title: "Extend your runway", severity: "critical", priorityScore: 100, expectedImpactScore: 90, confidence: 0.9, stale: true }),
      cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect this month's cash", domain: "cashflow", severity: "critical", priorityScore: 100, expectedImpactScore: 85, confidence: 0.8 }),
    ], { staleDomains: ["finance"] }));
    expect(d.primaryTarget?.title).toBe("Protect this month's cash");
    expect(d.primaryTarget?.source).toBe("domain_action");
    const refresh = d.attention.find((t) => t.source === "evidence_refresh")!;
    expect(refresh.priorityClass).toBe("SURVIVAL_CASH");
    expect(d.attention.indexOf(refresh)).toBe(1);
    // Decided by freshness, stated truthfully — never "bigger difference" / "stronger evidence".
    expect(d.whyThisWins.join(" ")).toMatch(/based on current figures, so it comes before "Update the figures in Finance before acting on them" in Finance, which rests on out-of-date figures/);
    expect(d.whyThisWins.join(" ")).not.toMatch(/bigger difference|evidence behind it is stronger/);
  });

  it("a refresh target never claims more confidence than out-of-date figures allow (capped at 40), and never invents certainty", () => {
    const high = resolveOwnerDecision(input([
      cand({ findingCode: "FIN_LOW_RUNWAY", title: "Extend your runway", severity: "critical", confidence: 0.55, effortScore: 70, stale: true }),
    ], { staleDomains: ["finance"] }));
    expect(high.primaryTarget?.source).toBe("evidence_refresh");
    expect(high.confidence.score).toBe(40);
    const low = resolveOwnerDecision(input([
      cand({ findingCode: "FIN_LOW_RUNWAY", title: "Extend your runway", severity: "critical", confidence: 0.25, stale: true }),
    ], { staleDomains: ["finance"] }));
    expect(low.confidence.score).toBe(25);
  });

  it("a refresh target takes class AND severity from the SAME stood-in item (never a worse severity from another class)", () => {
    // Stale Finance: a medium survival item (the refresh's class) and a critical PROFIT item. The refresh
    // must read survival/medium — borrowing "critical" from the profit item would let it outrank a fresh
    // high survival danger it has no right to beat.
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "FIN_HIGH_PAYABLES", title: "Pay down overdue suppliers", severity: "medium", stale: true }),
      cand({ findingCode: "FIN_BELOW_BREAK_EVEN", title: "Get back above break-even", severity: "critical", stale: true }),
      cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", domain: "cashflow", severity: "high" }),
    ], { staleDomains: ["finance"] }));
    expect(d.primaryTarget?.title).toBe("Protect runway");
    const refresh = d.attention.find((t) => t.source === "evidence_refresh");
    expect(refresh?.priorityClass).toBe("SURVIVAL_CASH");
    expect(refresh?.severity).toBe("medium");
  });

  it("a stale LOWER-class item never jumps ahead of fresh higher-class work", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "SALES_OPP_WINBACK", title: "Win back lapsed customers", domain: "sales", severity: "low", stale: true }),
      cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", domain: "cashflow", severity: "high" }),
    ]));
    expect(d.primaryTarget?.title).toBe("Protect runway");
    expect(d.attention.find((t) => t.source === "evidence_refresh")?.priorityClass).toBe("GROWTH_OPPORTUNITY");
  });

  it("with only stale evidence, the main target is to refresh it (evidence is not silently dropped)", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", domain: "cashflow", severity: "critical", stale: true })]));
    expect(d.state).toBe("TARGET");
    expect(d.primaryTarget?.source).toBe("evidence_refresh");
  });

  it("current hard compliance handling is unaffected by staleness elsewhere", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", domain: "cashflow", severity: "critical", stale: true }),
      cand({ findingCode: "COMPLIANCE_BREACH", title: "Licence breached", domain: "compliance", source: "compliance_item", severity: "critical" }),
    ]));
    expect(d.primaryTarget?.title).toBe("Licence breached");
  });
});

describe("item 3 — Strategy precedence follows the resolved five-state decision and its blocker", () => {
  it("GO / GO_WITH_CONDITIONS / NEED_INFO and positive upside stay growth decisions", () => {
    expect(strategyCandidatePriorityClass("GO", "STR_OPP_STRONG_RETURN")).toBe("GROWTH_OPPORTUNITY");
    expect(strategyCandidatePriorityClass("GO_WITH_CONDITIONS", "STR_LOW_CASH_RESERVE")).toBe("GROWTH_OPPORTUNITY");
    expect(strategyCandidatePriorityClass("NEED_INFO", "STR_MISSING_CASH")).toBe("GROWTH_OPPORTUNITY");
  });
  it("NOT_YET because unaffordable / DONT_AS_PLANNED on bad economics or execution risk: the actual blocker makes it a plan-commitment risk", () => {
    for (const [decision, code] of [
      ["NOT_YET", "STR_UNAFFORDABLE"], ["NOT_YET", "STR_LOW_CASH_RESERVE"], ["DONT_AS_PLANNED", "STR_NEGATIVE_BASE_CASE"],
      ["DONT_AS_PLANNED", "STR_NEGATIVE_ROI"], ["DONT_AS_PLANNED", "STR_LONG_PAYBACK"], ["DONT_AS_PLANNED", "STR_HIGH_EXECUTION_RISK"],
      ["NOT_YET", "STR_HIGH_EXECUTION_RISK"],
    ] as const) {
      expect(strategyCandidatePriorityClass(decision, code)).toBe("PLAN_COMMITMENT_RISK");
    }
    // The same finding under a GO decision is a condition of an upside, not a danger.
    expect(strategyCandidatePriorityClass("GO", "STR_UNAFFORDABLE")).toBe("GROWTH_OPPORTUNITY");
    // Positive upside is never a risk class, whatever the decision.
    expect(strategyCandidatePriorityClass("NOT_YET", "STR_OPP_STRONG_RETURN")).toBe("GROWTH_OPPORTUNITY");
  });
  it("cross-domain: a plan guard outranks optional growth and data requests, but every PRESENT problem (cash, customers, measured losses, blocked work) outranks it", () => {
    const strat = (code: string, title: string) => cand({ findingCode: code, title, domain: "strategy", severity: "critical", priorityClass: strategyCandidatePriorityClass(code === "STR_UNAFFORDABLE" ? "NOT_YET" : "DONT_AS_PLANNED", code) });
    const a = resolveOwnerDecision(input([
      strat("STR_UNAFFORDABLE", "Close the ₹50,000 funding gap"),
      cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", domain: "marketing", severity: "low", priorityScore: 100 }),
      cand({ findingCode: "SALES_MISSING_CRITICAL_DATA", title: "Enter your sales numbers", domain: "sales", severity: "high" }),
    ]));
    expect(a.primaryTarget?.title).toBe("Close the ₹50,000 funding gap");
    for (const present of [
      cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", domain: "cashflow", severity: "high" }),
      cand({ findingCode: "OPS_DELIVERY_FAILURE", title: "Stop failed deliveries", domain: "operations", severity: "medium" }),
      // Hostile review C P1-1: a business below break-even must not be told to raise money for an optional plan first.
      cand({ findingCode: "FIN_BELOW_BREAK_EVEN", title: "Get back above break-even", severity: "high" }),
      cand({ findingCode: "SOP_REPEATED_FAILURES", title: "Stop repeated action failures", domain: "sop", severity: "medium" }),
    ]) {
      const d = resolveOwnerDecision(input([strat("STR_UNAFFORDABLE", "Close the ₹5,00,000 funding gap"), present]));
      expect(d.primaryTarget?.title).toBe(present.title);
      expect(d.whatNotToDo.join(" ")).not.toMatch(new RegExp(present.title));
    }
  });
});

describe("item 4 — compliance precedence is never fabricated", () => {
  const ctx = { businessId: BIZ, workspaceId: WS, now: new Date("2026-09-27T00:00:00Z") };
  it("a recorded breach is a hard block with the compliance service's own critical severity; priority/impact are not invented", () => {
    const c = complianceItemToCandidate({ id: "c1", name: "Fire cert", status: "breached", businessId: BIZ }, ctx)!;
    expect(c.priorityClass).toBe("SAFETY_COMPLIANCE");
    expect(c.severity).toBe("critical");
    expect(c.priorityScore).toBe(0);
    expect(c.expectedImpactScore).toBe(0);
  });
  it("an ACTIVE expired item is the action gate's professional-review hard stop (severity not invented)", () => {
    const c = complianceItemToCandidate({ id: "c2", name: "Licence", status: "active", expiresAt: new Date("2026-09-01T00:00:00Z"), businessId: BIZ }, ctx)!;
    expect(c.priorityClass).toBe("SAFETY_COMPLIANCE");
    expect(c.severity).toBeNull();
  });
  it("an expired item already in evidence/review is routine and does not outrank genuine cash danger", () => {
    const c = complianceItemToCandidate({ id: "c3", name: "Insurance", status: "review_pending", expiresAt: new Date("2026-09-01T00:00:00Z"), businessId: BIZ }, ctx)!;
    expect(c.priorityClass).not.toBe("SAFETY_COMPLIANCE");
    const d = resolveOwnerDecision(input([c, cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", domain: "cashflow", severity: "high" })]));
    expect(d.primaryTarget?.title).toBe("Protect runway");
  });
  it("a RECORDED hard block precedes an owner-estimated critical compliance risk, and no 0/null is presented as a rating", () => {
    const expired = complianceItemToCandidate({ id: "c6", name: "Trade licence", status: "active", expiresAt: new Date("2026-09-01T00:00:00Z"), businessId: BIZ }, ctx)!;
    const estimatedRisk = cand({
      candidateId: "business_risk:r1", source: "business_risk", domain: "risk", findingCode: "RISK_COMPLIANCE",
      title: "Possible inspection failure", priorityClass: "SAFETY_COMPLIANCE", severity: "critical", priorityScore: 80,
    });
    const d = resolveOwnerDecision(input([estimatedRisk, expired]));
    expect(d.primaryTarget?.candidateId).toBe("compliance_item:c6");
    const why = d.whyThisWins.join(" ");
    expect(why).toMatch(/recorded compliance problem, not an estimate/);
    expect(why).not.toMatch(/\b0\b|unrated/);
  });
  it("wording only claims the action gate for the gate's own hard stop", () => {
    const breach = complianceItemToCandidate({ id: "c7", name: "Fire cert", status: "breached", businessId: BIZ }, ctx)!;
    const expired = complianceItemToCandidate({ id: "c8", name: "Licence", status: "active", expiresAt: new Date("2026-09-01T00:00:00Z"), businessId: BIZ }, ctx)!;
    expect(breach.explanation).not.toMatch(/holds material actions/);
    expect(expired.explanation).toMatch(/holds material actions/);
  });
  it("confidence comes from recorded provenance, not a constant", () => {
    const owner = complianceItemToCandidate({ id: "c4", name: "x", status: "breached", provenanceSource: "owner_input", businessId: BIZ }, ctx)!;
    const doc = complianceItemToCandidate({ id: "c5", name: "x", status: "breached", provenanceSource: "authoritative_document", businessId: BIZ }, ctx)!;
    expect(owner.confidence).toBeLessThan(doc.confidence);
  });
});
