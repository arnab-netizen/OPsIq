/**
 * Owner Home & Mobile Usability (Module 12 Slice 1) — Owner Home Summary engine.
 * Pure, deterministic unit tests for the §19 owner-home payload. No DB.
 */
import { describe, it, expect } from "vitest";
import {
  buildOwnerHomeSummary,
  dangerLevel,
  type OwnerHomeVerificationInput,
} from "@/domain/owner-home";
import { OPEN_OWNER_ACTION_STATUSES, domainActionToCandidate } from "@/services/owner-home/owner-decision-candidates";
import { resolveOwnerDecision } from "@/domain/owner-spine/owner-decision";
import type { DomainScore, OwnerAction, OwnerFinding, OwnerDomain } from "@/domain/owner-spine/contracts";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const NOW = new Date("2026-06-14T00:00:00.000Z");

function score(domain: OwnerDomain, over: Partial<DomainScore> = {}): DomainScore {
  return {
    domain,
    healthScore: 50,
    riskScore: 50,
    opportunityScore: 50,
    dataConfidenceScore: 80,
    topFindingCodes: [],
    topActionCodes: [],
    generatedAt: NOW,
    ...over,
  };
}

function finding(over: Partial<OwnerFinding> = {}): OwnerFinding {
  return {
    domain: "finance",
    code: "F_CODE",
    title: "Finding",
    summary: "A finding.",
    sourceMetric: "metric",
    sourceValue: 1,
    threshold: 2,
    severity: "medium",
    confidence: 0.5,
    impactScore: 50,
    urgencyScore: 50,
    findingType: "risk",
    evidence: [],
    missingData: [],
    ...over,
  };
}

function action(over: Partial<OwnerAction> = {}): OwnerAction {
  return {
    domain: "finance",
    findingCode: "F_CODE",
    title: "Action",
    description: "Do the thing.",
    ownerRole: "owner",
    priorityScore: 50,
    effortScore: 40,
    expectedImpactScore: 50,
    urgencyScore: 0,
    confidence: 0.6,
    status: "proposed",
    verificationMetric: "metric",
    verificationMethod: "Compare before/after.",
    expectedTimeframeDays: 14,
    ...over,
  };
}

function verification(over: Partial<OwnerHomeVerificationInput> = {}): OwnerHomeVerificationInput {
  return {
    domain: "finance",
    actionTitle: "Action",
    metric: "metric",
    beforeValue: 10,
    afterValue: 8,
    status: "verified_improved",
    verifiedAt: NOW,
    ...over,
  };
}

describe("owner-home summary — module contract assertions", () => {
  it("buildOwnerHomeSummary is a function", () => { expect(typeof buildOwnerHomeSummary).toBe("function"); });
  it("dangerLevel is a function", () => { expect(typeof dangerLevel).toBe("function"); });
  it("OPEN_OWNER_ACTION_STATUSES is an array", () => { expect(Array.isArray(OPEN_OWNER_ACTION_STATUSES)).toBe(true); });
  it("OPEN_OWNER_ACTION_STATUSES excludes terminal statuses", () => {
    expect(OPEN_OWNER_ACTION_STATUSES).not.toContain("completed");
    expect(OPEN_OWNER_ACTION_STATUSES).not.toContain("cancelled");
  });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("score is a function", () => { expect(typeof score).toBe("function"); });
  it("finding is a function", () => { expect(typeof finding).toBe("function"); });
  it("action is a function", () => { expect(typeof action).toBe("function"); });
  it("verification is a function", () => { expect(typeof verification).toBe("function"); });
  it("dangerLevel(null) is 'unknown'", () => { expect(dangerLevel(null)).toBe("unknown"); });
  it("dangerLevel(0) is 'none'", () => { expect(dangerLevel(0)).toBe("none"); });
  it("dangerLevel(80) is 'critical'", () => { expect(dangerLevel(80)).toBe("critical"); });
  it("score('finance') returns an object with domain field", () => { expect(score("finance")).toHaveProperty("domain"); });
});

describe("dangerLevel banding", () => {
  it("bands risk into none/low/elevated/high/critical and unknown for null", () => {
    expect(dangerLevel(null)).toBe("unknown");
    expect(dangerLevel(0)).toBe("none");
    expect(dangerLevel(19)).toBe("none");
    expect(dangerLevel(20)).toBe("low");
    expect(dangerLevel(39)).toBe("low");
    expect(dangerLevel(40)).toBe("elevated");
    expect(dangerLevel(59)).toBe("elevated");
    expect(dangerLevel(60)).toBe("high");
    expect(dangerLevel(79)).toBe("high");
    expect(dangerLevel(80)).toBe("critical");
    expect(dangerLevel(100)).toBe("critical");
  });
});

describe("buildOwnerHomeSummary", () => {
  it("reports a missing domain as unknown danger (never 0)", () => {
    const summary = buildOwnerHomeSummary({
      domainScores: [score("finance", { riskScore: 70 })],
      findings: [],
      actions: [],
      verifications: [],
      now: NOW,
    });
    expect(summary.cashDanger).toEqual({
      key: "cashflow", sourceDomains: [], drivenBy: null, evidenceAsOf: null, status: "unknown", riskScore: null, level: "unknown", lastFlagged: false, updateDataLabel: null,
    });
    expect(summary.salesDanger.level).toBe("unknown");
    expect(summary.operationsDanger.level).toBe("unknown");
    expect(summary.executionDanger.level).toBe("unknown");
  });

  it("computes per-domain dangers and business health from real scores", () => {
    const summary = buildOwnerHomeSummary({
      domainScores: [
        score("cashflow", { riskScore: 85, healthScore: 20 }),
        score("sales", { riskScore: 45, healthScore: 60 }),
        score("operations", { riskScore: 30, healthScore: 70 }),
        score("sop", { riskScore: 65, healthScore: 40 }),
      ],
      findings: [],
      actions: [],
      verifications: [],
      now: NOW,
    });
    const pick = (d: { key: string; riskScore: number | null; level: string; status: string }) => ({ key: d.key, riskScore: d.riskScore, level: d.level, status: d.status });
    expect(pick(summary.cashDanger)).toEqual({ key: "cashflow", riskScore: 85, level: "critical", status: "current" });
    expect(pick(summary.salesDanger)).toEqual({ key: "sales", riskScore: 45, level: "elevated", status: "current" });
    expect(pick(summary.operationsDanger)).toEqual({ key: "operations", riskScore: 30, level: "low", status: "current" });
    // execution = max(operations 30, sop 65) = 65 → high
    expect(pick(summary.executionDanger)).toEqual({ key: "execution", riskScore: 65, level: "high", status: "current" });
    // The source is the domain that DRIVES the level (sop at 65), not every execution domain.
    expect(summary.executionDanger.sourceDomains).toEqual(["sop"]);
    expect(summary.businessHealthScore).toBe(Math.round((20 + 60 + 70 + 40) / 4));
  });

  it("surfaces only the top 3 risks worst-first (severity → impact → confidence)", () => {
    const findings: OwnerFinding[] = [
      finding({ code: "R1", severity: "low", impactScore: 90, findingType: "risk" }),
      finding({ code: "R2", severity: "critical", impactScore: 10, findingType: "risk" }),
      finding({ code: "R3", severity: "high", impactScore: 80, findingType: "risk" }),
      finding({ code: "R4", severity: "high", impactScore: 80, confidence: 0.9, findingType: "risk" }),
      finding({ code: "O1", findingType: "opportunity", impactScore: 99 }),
    ];
    const summary = buildOwnerHomeSummary({ domainScores: [score("finance")], findings, actions: [], verifications: [], now: NOW });
    expect(summary.top3Risks.map((r) => r.code)).toEqual(["R2", "R4", "R3"]);
    // opportunity finding never appears among risks
    expect(summary.top3Risks.some((r) => r.code === "O1")).toBe(false);
  });

  it("orders top risks with the canonical spine tie-break (severity → impact → urgency → confidence), reversed input", () => {
    // Least severe first; the two highs tie on impact and differ on urgency only
    // (the lower-urgency one has the higher confidence, so skipping urgency flips them).
    const findings: OwnerFinding[] = [
      finding({ code: "R_LOW", severity: "low", impactScore: 99, findingType: "risk" }),
      finding({ code: "R_MED", severity: "medium", impactScore: 90, findingType: "risk" }),
      finding({ code: "R_HIGH_SLOW", severity: "high", impactScore: 60, urgencyScore: 20, confidence: 0.95, findingType: "risk" }),
      finding({ code: "R_HIGH_URGENT", severity: "high", impactScore: 60, urgencyScore: 90, confidence: 0.4, findingType: "risk" }),
      finding({ code: "R_CRIT", severity: "critical", impactScore: 5, findingType: "risk" }),
    ];
    const summary = buildOwnerHomeSummary({ domainScores: [score("finance")], findings, actions: [], verifications: [], now: NOW });
    expect(summary.top3Risks.map((r) => r.code)).toEqual(["R_CRIT", "R_HIGH_URGENT", "R_HIGH_SLOW"]);
  });

  it("ranks an unknown stored severity below low instead of corrupting the sort", () => {
    const findings: OwnerFinding[] = [
      finding({ code: "R_BOGUS", severity: "severe" as OwnerFinding["severity"], impactScore: 99, findingType: "risk" }),
      finding({ code: "R_LOW", severity: "low", impactScore: 10, findingType: "risk" }),
      finding({ code: "R_CRIT", severity: "critical", impactScore: 10, findingType: "risk" }),
      finding({ code: "R_MED", severity: "medium", impactScore: 10, findingType: "risk" }),
    ];
    const summary = buildOwnerHomeSummary({ domainScores: [score("finance")], findings, actions: [], verifications: [], now: NOW });
    expect(summary.top3Risks.map((r) => r.code)).toEqual(["R_CRIT", "R_MED", "R_LOW"]);
  });

  it("surfaces only the top 3 opportunities best-first (impact → confidence)", () => {
    const findings: OwnerFinding[] = [
      finding({ code: "O1", findingType: "opportunity", impactScore: 40 }),
      finding({ code: "O2", findingType: "opportunity", impactScore: 90 }),
      finding({ code: "O3", findingType: "opportunity", impactScore: 70, confidence: 0.3 }),
      finding({ code: "O4", findingType: "opportunity", impactScore: 70, confidence: 0.9 }),
      finding({ code: "R1", findingType: "risk", impactScore: 99 }),
    ];
    const summary = buildOwnerHomeSummary({ domainScores: [score("finance")], findings, actions: [], verifications: [], now: NOW });
    expect(summary.top3Opportunities.map((o) => o.code)).toEqual(["O2", "O4", "O3"]);
    expect(summary.top3Opportunities.some((o) => o.code === "R1")).toBe(false);
  });

  it("today's open work is the canonical decision's attention order: open only, ranked, nothing dropped", () => {
    // The Home summary no longer builds its own required-actions list; the ONE canonical owner
    // decision owns "what to do, in what order" (home.service → resolveOwnerDecision).
    const rows = [
      { id: "done", findingCode: "A_DONE", status: "completed", priorityScore: 99 },
      { id: "cancelled", findingCode: "A_CANCELLED", status: "cancelled", priorityScore: 98 },
      { id: "a1", findingCode: "A1", status: "proposed", priorityScore: 30 },
      { id: "a2", findingCode: "A2", status: "in_progress", priorityScore: 90 },
      { id: "a3", findingCode: "A3", status: "assigned", priorityScore: 60 },
      { id: "a4", findingCode: "A4", status: "blocked", priorityScore: 70 },
      { id: "a5", findingCode: "A5", status: "proposed", priorityScore: 50 },
      { id: "a6", findingCode: "A6", status: "proposed", priorityScore: 80 },
    ].map((r) => ({ ...r, title: r.findingCode, expectedImpactScore: 50, effortScore: 30, confidence: 0.8 }));
    const ctx = { businessId: "b", workspaceId: "w", domain: "finance" as const, findingsById: new Map(), evidenceAsOf: NOW, stale: false, verifiedFixes: new Map() };
    const summary = buildOwnerHomeSummary({ domainScores: [score("finance")], findings: [], verifications: [], now: NOW });
    const decision = resolveOwnerDecision({
      businessId: "b", workspaceId: "w", candidates: rows.map((r) => domainActionToCandidate(r, ctx)),
      diagnosedDomains: ["finance"], dataSufficiency: summary.dataSufficiency, staleDomains: [], strategy: null,
      reassessment: { days: 7, reason: "weekly" }, changeFacts: NO_CHANGE_FACTS, now: NOW,
    });
    expect(decision.attention.map((a) => a.findingCode)).toEqual(["A2", "A6", "A4", "A3", "A5", "A1"]);
    expect(decision.attention.every((a) => OPEN_OWNER_ACTION_STATUSES.includes(a.status))).toBe(true);
    expect(decision.excluded.map((e) => e.reason).sort()).toEqual(["cancelled", "completed"]);
    expect(summary).not.toHaveProperty("requiredActions");
  });

  it("returns the most recent verified improvement, or null when none", () => {
    const none = buildOwnerHomeSummary({
      domainScores: [score("finance")],
      findings: [],
      actions: [],
      verifications: [
        verification({ status: "verified_not_improved", verifiedAt: new Date("2026-06-13T00:00:00Z") }),
        verification({ status: "inconclusive", verifiedAt: new Date("2026-06-12T00:00:00Z") }),
      ],
      now: NOW,
    });
    expect(none.lastVerifiedImprovement).toBeNull();

    const withImprovement = buildOwnerHomeSummary({
      domainScores: [score("finance")],
      findings: [],
      actions: [],
      verifications: [
        verification({ domain: "sales", actionTitle: "Older win", verifiedAt: new Date("2026-06-10T00:00:00Z") }),
        verification({ domain: "cashflow", actionTitle: "Newest win", metric: "dso", beforeValue: 60, afterValue: 40, verifiedAt: new Date("2026-06-13T00:00:00Z") }),
        verification({ status: "disputed", verifiedAt: new Date("2026-06-14T00:00:00Z") }),
      ],
      now: NOW,
    });
    expect(withImprovement.lastVerifiedImprovement).toEqual({
      domain: "cashflow",
      actionTitle: "Newest win",
      metric: "dso",
      beforeValue: 60,
      afterValue: 40,
      verifiedAt: new Date("2026-06-13T00:00:00Z"),
    });
  });

  it("is deterministic and never invents values for an empty business", () => {
    const empty = buildOwnerHomeSummary({ domainScores: [], findings: [], actions: [], verifications: [], now: NOW });
    expect(empty).toEqual(
      buildOwnerHomeSummary({ domainScores: [], findings: [], actions: [], verifications: [], now: NOW })
    );
    expect(empty.businessHealthScore).toBe(0);
    expect(empty.top3Risks).toEqual([]);
    expect(empty.top3Opportunities).toEqual([]);
    expect(empty).not.toHaveProperty("requiredActions");
    expect(empty.lastVerifiedImprovement).toBeNull();
    expect(empty.cashDanger.level).toBe("unknown");
  });
});

describe("Home presentation provenance (stale severity, reconciled cash danger)", () => {
  const base = { verifications: [] as OwnerHomeVerificationInput[], now: NOW };

  it("a finding from out-of-date figures is marked last flagged, never shown as a current severity", () => {
    const s = buildOwnerHomeSummary({
      ...base,
      domainScores: [score("finance"), score("sales")],
      findings: [finding({ domain: "finance", code: "FIN_LOW_RUNWAY", severity: "high" }), finding({ domain: "sales", code: "S", severity: "medium" })],
      staleDomains: ["finance"],
    });
    expect(s.top3Risks.find((r) => r.domain === "finance")?.lastFlagged).toBe(true);
    expect(s.top3Risks.find((r) => r.domain === "sales")?.lastFlagged).toBe(false);
  });

  it("P2 — margin-driven Finance risk is never presented as cash danger: it is Financial danger with its provenance", () => {
    const margin = finding({ domain: "finance", code: "FIN_LOW_GROSS_MARGIN", title: "Gross margin is below target", severity: "critical", findingType: "risk" });
    const s = buildOwnerHomeSummary({ ...base, domainScores: [score("finance", { riskScore: 85 })], findings: [margin] });
    // No cash-flow reading and no Finance CASH finding: the cash card does not borrow Finance's margin-driven score.
    expect(s.cashDanger.status).toBe("unknown");
    expect(s.cashDanger.riskScore).toBeNull();
    expect(s.financialDanger).toMatchObject({ key: "financial", sourceDomains: ["finance"], status: "current", riskScore: 85, level: "critical", drivenBy: "Driven by: Gross margin is below target" });
  });

  it("the cash card uses Finance's own CASH-survival finding (severity only, no borrowed score) when Cash flow has no current reading", () => {
    const s = buildOwnerHomeSummary({
      ...base, domainScores: [score("finance", { riskScore: 85 })], findings: [],
      financeCashSignal: { severity: "critical", title: "Cash runs out within days", current: true },
    });
    expect(s.cashDanger).toMatchObject({ key: "cashflow", sourceDomains: ["finance"], status: "current", riskScore: null, level: "critical", drivenBy: "From your Finance figures: Cash runs out within days" });
  });

  it("a cash-danger reading from stale evidence is last-known: no score, names the data to update", () => {
    const s = buildOwnerHomeSummary({ ...base, domainScores: [score("cashflow", { riskScore: 70 })], findings: [], staleDomains: ["cashflow"] });
    expect(s.cashDanger).toMatchObject({ status: "last_known", lastFlagged: true, riskScore: null, level: "high", updateDataLabel: "Cash flow" });
  });

  it("D-P2-2 — an incomparable Cash flow / Finance disagreement is shown as a CONFLICT on the cash card, never resolved by picking Cash flow", () => {
    const s = buildOwnerHomeSummary({
      ...base, domainScores: [score("cashflow", { riskScore: 10 }), score("finance", { riskScore: 90 })], findings: [],
      cashFinanceConflict: { cashState: "SAFE", financeState: "CRITICAL" },
    });
    // No side picked, no fabricated combined level or score.
    expect(s.cashDanger).toMatchObject({ key: "cashflow", status: "conflicting", riskScore: null, level: "unknown", sourceDomains: ["cashflow", "finance"], lastFlagged: false });
    expect(s.cashDanger.drivenBy).toBe("Cash and Finance signals currently disagree (Cash flow: SAFE, Finance: CRITICAL). Confirm the latest figures before relying on the survival assessment.");
  });

  it("a Cash flow reading superseded by newer Finance figures is never shown as a current score", () => {
    const s = buildOwnerHomeSummary({ ...base, domainScores: [score("cashflow", { riskScore: 90 }), score("finance", { riskScore: 10 })], findings: [], cashflowSuperseded: true });
    expect(s.cashDanger).toMatchObject({ status: "last_known", riskScore: null, drivenBy: "Superseded by newer Finance figures" });
  });

  it("P2 — a STALE Finance cash-survival reading with no Cash flow diagnosis is last known on the cash card — never 'no data'", () => {
    const s = buildOwnerHomeSummary({
      ...base, domainScores: [score("finance", { riskScore: 85 })], findings: [], staleDomains: ["finance"],
      financeCashSignal: { severity: "critical", title: "Cash runs out within days", current: false },
    });
    expect(s.cashDanger).toMatchObject({ status: "last_known", lastFlagged: true, riskScore: null, level: "critical", updateDataLabel: "Finance", sourceDomains: ["finance"] });
  });

  it("P2 — a Finance reading superseded by newer Cash flow figures is never shown as a current Financial danger", () => {
    const s = buildOwnerHomeSummary({ ...base, domainScores: [score("cashflow", { riskScore: 10 }), score("finance", { riskScore: 85 })], findings: [], financeSuperseded: true });
    expect(s.financialDanger).toMatchObject({ status: "last_known", riskScore: null, drivenBy: "Superseded by newer Cash flow figures" });
    expect(s.cashDanger).toMatchObject({ status: "current", riskScore: 10 });
  });

  it("P2 — execution rollup follows the domain that drives it: a CURRENT worse reading stays current beside a milder stale one", () => {
    const s = buildOwnerHomeSummary({
      ...base, domainScores: [score("operations", { riskScore: 90 }), score("sop", { riskScore: 20 })], findings: [], staleDomains: ["sop"],
      evidenceAsOf: { operations: new Date("2026-09-20T00:00:00Z"), sop: new Date("2026-05-01T00:00:00Z") },
    });
    expect(s.executionDanger).toMatchObject({ status: "current", riskScore: 90, level: "critical", sourceDomains: ["operations"], updateDataLabel: null, evidenceAsOf: new Date("2026-09-20T00:00:00Z") });
  });

  it("P2 — stale Execution card: last-known level only, never a current score, and it names the data to update", () => {
    const asOf = new Date("2026-05-01T00:00:00Z");
    const s = buildOwnerHomeSummary({
      ...base,
      domainScores: [score("operations", { riskScore: 30 }), score("sop", { riskScore: 70 })],
      findings: [],
      staleDomains: ["sop"],
      evidenceAsOf: { operations: new Date("2026-09-01T00:00:00Z"), sop: asOf },
    });
    expect(s.executionDanger).toMatchObject({ key: "execution", status: "last_known", lastFlagged: true, riskScore: null, level: "high", updateDataLabel: "Execution", evidenceAsOf: asOf });
    // A current single-domain card keeps its score.
    expect(s.operationsDanger).toMatchObject({ status: "current", riskScore: 30 });
  });
});
