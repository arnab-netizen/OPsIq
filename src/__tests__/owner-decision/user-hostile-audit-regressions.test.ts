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
    expectedImpactScore: 50, confidence: 0.9, effortScore: 30, status: "proposed", ownerActionRequired: true, blocking: false,
    evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: p.stale ?? false, exclusion: null,
    targetRoute: `/owner/${p.domain ?? "finance"}`,
  };
}

function input(candidates: OwnerDecisionCandidate[]): ResolveOwnerDecisionInput {
  return {
    businessId: BIZ, workspaceId: WS, candidates, diagnosedDomains: ["cashflow", "finance"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 14, reason: "r" }, previous: null, events: [], domainsDiagnosedSince: [],
    now: new Date("2026-09-27T10:00:00.000Z"),
  };
}

describe("item 1 — a stale diagnosis is never an authoritative 'do this now'", () => {
  it("a stale high-class action does not beat a fresh lower-class action; it becomes an explicit refresh target", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", domain: "cashflow", severity: "critical", stale: true }),
      cand({ findingCode: "FIN_DISCOUNT_LEAKAGE", title: "Tighten discounting", severity: "medium" }),
    ]));
    expect(d.primaryTarget?.title).toBe("Tighten discounting");
    expect(d.attention.map((t) => t.title)).not.toContain("Protect runway");
    const refresh = d.attention.find((t) => t.source === "evidence_refresh");
    expect(refresh?.domain).toBe("cashflow");
    expect(refresh?.priorityClass).toBe("MISSING_CRITICAL_EVIDENCE");
    expect(refresh?.severity).toBe("critical");
    expect(refresh?.explanation).toMatch(/Protect runway/);
    expect(d.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Protect runway", reason: "stale_evidence" })]));
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
  it("NOT_YET because unaffordable / DONT_AS_PLANNED on bad economics guard money the plan would put at risk; execution risk is execution", () => {
    // Prospective (only if the owner commits) — so it ranks with money at risk, never above a PRESENT
    // cash-survival danger or customer failure, which Finance/Cashflow/Operations report directly.
    expect(strategyCandidatePriorityClass("NOT_YET", "STR_UNAFFORDABLE")).toBe("PROFIT_LOSS");
    expect(strategyCandidatePriorityClass("NOT_YET", "STR_LOW_CASH_RESERVE")).toBe("PROFIT_LOSS");
    expect(strategyCandidatePriorityClass("DONT_AS_PLANNED", "STR_NEGATIVE_BASE_CASE")).toBe("PROFIT_LOSS");
    expect(strategyCandidatePriorityClass("DONT_AS_PLANNED", "STR_NEGATIVE_ROI")).toBe("PROFIT_LOSS");
    expect(strategyCandidatePriorityClass("DONT_AS_PLANNED", "STR_LONG_PAYBACK")).toBe("PROFIT_LOSS");
    expect(strategyCandidatePriorityClass("DONT_AS_PLANNED", "STR_HIGH_EXECUTION_RISK")).toBe("BLOCKED_EXECUTION");
    // The same finding under a GO decision is a condition of an upside, not a danger.
    expect(strategyCandidatePriorityClass("GO", "STR_UNAFFORDABLE")).toBe("GROWTH_OPPORTUNITY");
  });
  it("cross-domain: an unaffordable NOT_YET outranks optional growth and missing evidence; present cash danger and customer failure still outrank bad plan economics", () => {
    const strat = (code: string, title: string) => cand({ findingCode: code, title, domain: "strategy", severity: "high", priorityClass: strategyCandidatePriorityClass(code === "STR_UNAFFORDABLE" ? "NOT_YET" : "DONT_AS_PLANNED", code) });
    const a = resolveOwnerDecision(input([
      strat("STR_UNAFFORDABLE", "Close the ₹50,000 funding gap"),
      cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", domain: "marketing", severity: "low", priorityScore: 100 }),
      cand({ findingCode: "SALES_MISSING_CRITICAL_DATA", title: "Enter your sales numbers", domain: "sales", severity: "high" }),
    ]));
    expect(a.primaryTarget?.title).toBe("Close the ₹50,000 funding gap");
    const cash = resolveOwnerDecision(input([
      strat("STR_UNAFFORDABLE", "Close the ₹50,000 funding gap"),
      cand({ findingCode: "CF_LOW_RUNWAY", title: "Protect runway", domain: "cashflow", severity: "high" }),
    ]));
    expect(cash.primaryTarget?.title).toBe("Protect runway");
    const b = resolveOwnerDecision(input([
      strat("STR_NEGATIVE_BASE_CASE", "Rework the plan"),
      cand({ findingCode: "OPS_DELIVERY_FAILURE", title: "Stop failed deliveries", domain: "operations", severity: "critical" }),
    ]));
    expect(b.primaryTarget?.title).toBe("Stop failed deliveries");
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
  it("confidence comes from recorded provenance, not a constant", () => {
    const owner = complianceItemToCandidate({ id: "c4", name: "x", status: "breached", provenanceSource: "owner_input", businessId: BIZ }, ctx)!;
    const doc = complianceItemToCandidate({ id: "c5", name: "x", status: "breached", provenanceSource: "authoritative_document", businessId: BIZ }, ctx)!;
    expect(owner.confidence).toBeLessThan(doc.confidence);
  });
});
