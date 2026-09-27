/**
 * Domain pages' local "next step within this area" uses the SAME eligibility contract as the owner
 * decision: the canonical eligible candidates (built by the one shared builder Home uses —
 * owner-candidate-builder.ts) filtered to the domain. Cross-surface invariant, for every domain: a
 * candidate the canonical decision excludes (completed, cancelled, verified, stale-replaced, superseded)
 * is never a domain page's next step, and the local step is exactly the first item of that domain in the
 * canonical attention order.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildOwnerSpineCandidates, presentDomainLocalStep, selectStrategyLocalStep, type OwnerSpineEvidence } from "@/services/owner-home/owner-candidate-builder";
import { domainLocalCanonicalStep, resolveOwnerDecision, type OwnerDecisionCandidate } from "@/domain/owner-spine/owner-decision";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const NOW = new Date("2026-09-27T10:00:00Z");
const SCOPE = { businessId: "b1", workspaceId: "w1", now: NOW };
const FRESH = { id: "snap-fresh", createdAt: new Date("2026-09-20T00:00:00Z"), periodEnd: new Date("2026-09-15T00:00:00Z") };
const STALE = { id: "snap-old", createdAt: new Date("2026-05-01T00:00:00Z"), periodEnd: new Date("2026-04-30T00:00:00Z") };

type SpineKey = "finance" | "cashflow" | "sales" | "operations" | "sop" | "marketing" | "strategy";

/**
 * Two real, NON-survival codes per domain (a survival finding also raises an issue candidate of its own,
 * which survival-reading-candidate.test.ts covers).
 */
const CODES: Record<SpineKey, [string, string]> = {
  finance: ["FIN_HIGH_PAYROLL_BURDEN", "FIN_HIGH_RECEIVABLES"],
  cashflow: ["CF_SLOW_COLLECTIONS", "CF_HIGH_OVERDUE_RECEIVABLES"],
  sales: ["SALES_HIGH_COMPLAINT_RATIO", "SALES_LOW_CONVERSION"],
  operations: ["OPS_HIGH_REWORK", "OPS_HIGH_DELAY"],
  sop: ["SOP_HIGH_OVERDUE", "SOP_LOW_COMPLETION"],
  marketing: ["MKT_WASTED_SPEND", "MKT_NO_FOLLOWUP"],
  strategy: ["STR_LONG_PAYBACK", "STR_MISSING_CASH"],
};

const row = (id: string, findingCode: string, over: Record<string, unknown> = {}) => ({
  id, findingCode, findingId: `f-${findingCode}`, title: `${id} (${findingCode})`, status: "proposed", priorityScore: 100,
  expectedImpactScore: 90, confidence: 0.9, effortScore: 30, verifications: [], ...over,
});

const reached = (at: string) => ({ status: "verified_improved", targetDirection: "up", afterValue: 90, targetValue: 60, createdAt: at, verifiedAt: at });

function cycle(domain: SpineKey, snapshot: typeof FRESH, actions: unknown[]) {
  const [a, b] = CODES[domain];
  return {
    id: `c-${domain}`, snapshot, generatedAt: snapshot.createdAt, createdAt: snapshot.createdAt,
    overallHealthScore: 50, survivalRiskScore: 50, growthOpportunityScore: 10, healthScore: 50, riskScore: 50, dangerScore: 50,
    opportunityScore: 10, dataConfidenceScore: 90, survivalState: "WATCH", cashflowState: "WATCH",
    findings: [a, b].map((code) => ({ id: `f-${code}`, code, title: code, severity: "high", confidence: 0.9, findingType: "risk", impactScore: 50, urgencyScore: 50, evidence: [], missingData: [] })),
    actions,
  };
}

function evidence(over: Partial<Record<SpineKey, unknown>>, vers: Partial<Record<SpineKey, unknown[]>> = {}): OwnerSpineEvidence {
  return {
    finance: null, recovery: null, cashflow: null, sales: null, operations: null, sop: null, marketing: null, strategy: null,
    futureDomains: [],
    ...over,
    verifications: { finance: [], sales: [], operations: [], sop: [], strategy: [], cashflow: [], marketing: [], recovery: [], ...vers },
  } as OwnerSpineEvidence;
}

function decisionAndLocal(ev: OwnerSpineEvidence, domain: OwnerDecisionCandidate["domain"]) {
  const { candidates } = buildOwnerSpineCandidates(ev, SCOPE);
  const decision = resolveOwnerDecision({
    businessId: "b1", workspaceId: "w1", candidates, diagnosedDomains: [domain as never],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 7, reason: "r" }, changeFacts: NO_CHANGE_FACTS, now: NOW,
  });
  return { decision, local: domainLocalCanonicalStep(candidates, SCOPE, domain) };
}

const DOMAINS: SpineKey[] = ["finance", "cashflow", "sales", "operations", "sop", "marketing", "strategy"];

describe("cross-surface invariant: a domain page's next step is the canonical decision's first eligible item of that domain", () => {
  for (const domain of DOMAINS) {
    const [codeA, codeB] = CODES[domain];

    it(`${domain}: completed, cancelled and causally verified actions never appear; the local step is the canonical one`, () => {
      const ev = evidence({
        [domain]: cycle(domain, FRESH, [
          row("done", codeA, { status: "completed", completedAt: "2026-09-22" }),
          row("cancelled", codeA, { status: "cancelled" }),
          row("verified", codeA, { verifications: [reached("2026-09-25T00:00:00Z")] }),
          row("open", codeB),
        ]),
      });
      const { decision, local } = decisionAndLocal(ev, domain);
      const excluded = new Set(decision.excluded.map((e) => e.candidateId));
      // Parity: the local step IS the canonical first item of this domain (or both are absent).
      expect(local?.candidateId ?? null).toBe(decision.attention.find((t) => t.domain === domain)?.candidateId ?? null);
      if (local) expect(excluded.has(local.candidateId)).toBe(false);
      expect(local?.title ?? "").not.toMatch(/^(done|cancelled|verified) /);
      // Strategy additionally keeps only steps coherent with its current decision (superseded otherwise).
      if (domain !== "strategy") expect(local?.title).toMatch(/^open /);
    });

    it(`${domain}: a fix verified after this evidence keeps a re-proposed action out locally too (never resurrected)`, () => {
      const ev = evidence(
        { [domain]: cycle(domain, FRESH, [row("reproposed", codeA)]) },
        { [domain]: [{ ...reached("2026-09-25T00:00:00Z"), action: { title: "earlier", findingCode: codeA } }] }
      );
      const { decision, local } = decisionAndLocal(ev, domain);
      expect(decision.excluded.find((e) => e.title.startsWith("reproposed"))).toBeDefined();
      if (domain !== "strategy") expect(decision.excluded.find((e) => e.title.startsWith("reproposed"))?.reason).toBe("verified_fix_awaiting_new_evidence");
      expect(local?.candidateId ?? null).toBe(decision.attention.find((t) => t.domain === domain)?.candidateId ?? null);
      expect(local?.title ?? "").not.toMatch(/^reproposed/);
    });

    it(`${domain}: stale evidence replaces the action by the SAME refresh target the decision elects`, () => {
      const ev = evidence({ [domain]: cycle(domain, STALE, [row("old-open", codeB)]) });
      const { decision, local } = decisionAndLocal(ev, domain);
      expect(local?.candidateId ?? null).toBe(decision.attention.find((t) => t.domain === domain)?.candidateId ?? null);
      expect(local?.title ?? "").not.toMatch(/^old-open/);
      if (domain !== "strategy") {
        expect(local?.source).toBe("evidence_refresh");
        expect(decision.excluded.find((e) => e.title.startsWith("old-open"))?.reason).toBe("stale_evidence");
      }
    });
  }

  it("a carried-forward verification from BEFORE newer evidence does not close the action against it", () => {
    const ev = evidence({
      sales: cycle("sales", FRESH, [row("carried", "SALES_LOW_CONVERSION", { status: "in_progress", verifications: [reached("2026-08-01T00:00:00Z")] })]),
    });
    const { decision, local } = decisionAndLocal(ev, "sales");
    expect(local?.title).toMatch(/^carried/);
    expect(decision.excluded).toEqual([]);
  });

  it("cash/finance supersession applies locally: a superseded survival action is never a Cash flow page's next step", () => {
    const newer = { id: "fin-new", createdAt: new Date("2026-09-25T00:00:00Z"), periodEnd: new Date("2026-09-24T00:00:00Z") };
    const older = { id: "cf-old", createdAt: new Date("2026-09-10T00:00:00Z"), periodEnd: new Date("2026-09-05T00:00:00Z") };
    const cash = { ...cycle("cashflow", older, [row("cash-danger", "CF_LOW_RUNWAY")]), cashflowState: "CRITICAL", findings: [] };
    const fin = { ...cycle("finance", newer, []), survivalState: "SAFE", findings: [] };
    const ev = evidence({ cashflow: cash, finance: fin });
    const { decision, local } = decisionAndLocal(ev, "cashflow");
    expect(decision.excluded.find((e) => e.title.startsWith("cash-danger"))?.reason).toBe("superseded");
    expect(local?.title ?? "").not.toMatch(/^cash-danger/);
  });
});

describe("P1 — Strategy's local step is the first canonically eligible item; its decision step is current only when it IS that item (selectStrategyLocalStep)", () => {
  const cand = (over: Partial<OwnerDecisionCandidate>): OwnerDecisionCandidate => ({
    candidateId: "c", businessId: "b1", workspaceId: "w1", source: "domain_action", domain: "strategy", sourceId: "x", priorityClass: "PLAN_COMMITMENT_RISK",
    findingCode: "STR_UNAFFORDABLE", findingId: null, title: "t", explanation: "e", severity: "high", priorityScore: 60, expectedImpactScore: 50, confidence: 0.8,
    effortScore: 30, status: "proposed", ownerActionRequired: true, blocking: false, evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null,
    stale: false, exclusion: null, targetRoute: "/owner/strategy", ...over,
  });
  // Rows as the dashboard passes them: arbitrated (a completed/cancelled row is "closed", never "primary").
  const rows = [
    { id: "p1", decisionFit: "primary", status: "proposed", title: "Close the funding gap", step: true },
    { id: "s1", decisionFit: "supporting", status: "in_progress", title: "Get a quote", step: false },
  ];
  const isStep = (r: { step: boolean }) => r.step;

  it("the decision's step row is the first eligible item → it IS the next step (state current)", () => {
    const r = selectStrategyLocalStep(true, rows, [cand({ candidateId: "domain_action:strategy:p1", sourceId: "p1" })], isStep);
    expect(r.decisionStep).toEqual({ state: "current", replacedBecause: null });
    expect(r.recommended).toMatchObject({ id: "p1", localStepSource: "domain_action" });
  });

  it("the decision's step row is eligible but another Strategy item ranks first → the local step is that item (canonical order), and the decision step says so", () => {
    const eligible = [cand({ candidateId: "domain_action:strategy:s1", sourceId: "s1", title: "Get a quote" }), cand({ candidateId: "domain_action:strategy:p1", sourceId: "p1" })];
    const r = selectStrategyLocalStep(true, rows, eligible, isStep);
    expect(r.recommended).toMatchObject({ id: "s1" });
    expect(r.decisionStep).toEqual({ state: "replaced", replacedBecause: 'Another open Strategy step, "Get a quote", comes first in OpsIQ\'s order.' });
  });

  it("stale Strategy figures → the refresh target is the next step; the decision's step is replaced (also when no row carries it yet)", () => {
    const refresh = cand({ candidateId: "evidence_refresh:strategy", source: "evidence_refresh", sourceId: "strategy", title: "Update the figures in Strategy before acting on them", findingCode: "EVIDENCE_REFRESH" });
    for (const rs of [rows, [rows[1]]]) {
      const r = selectStrategyLocalStep(true, rs, [refresh], isStep);
      expect(r.decisionStep.state).toBe("replaced");
      expect(r.decisionStep.replacedBecause).toMatch(/out of date/);
      expect(r.recommended).toMatchObject({ id: "evidence_refresh:strategy", localStepSource: "evidence_refresh" });
    }
  });

  it("a COMPLETED decision-step row (arbitrated as closed) → replaced 'already done', never shown as the next step or as not listed", () => {
    const done = [{ ...rows[0], decisionFit: "closed", status: "completed" }, rows[1]];
    const r = selectStrategyLocalStep(true, done, [cand({ candidateId: "domain_action:strategy:s1", sourceId: "s1" })], isStep);
    expect(r.decisionStep).toEqual({ state: "replaced", replacedBecause: "It is already done." });
    expect(r.recommended).toMatchObject({ id: "s1" });
    const cancelled = [{ ...rows[0], decisionFit: "closed", status: "cancelled" }, rows[1]];
    expect(selectStrategyLocalStep(true, cancelled, [], isStep).decisionStep).toEqual({ state: "replaced", replacedBecause: "It was cancelled." });
  });

  it("an open decision-step row that is not eligible (verified/superseded) → replaced with that reason", () => {
    const r = selectStrategyLocalStep(true, rows, [cand({ candidateId: "domain_action:strategy:s1", sourceId: "s1" })], isStep);
    expect(r.decisionStep).toEqual({ state: "replaced", replacedBecause: "It is already verified or no longer part of the current plan." });
  });

  it("an open decision-step row the owner action gate holds back → HELD (by what, and what clears it) — never 'already verified' or superseded", () => {
    const heldText = "This step is currently held by the cash safety limit. Stabilise cash before proceeding.";
    const r = selectStrategyLocalStep(true, rows, [cand({ candidateId: "domain_action:strategy:s1", sourceId: "s1" })], isStep, { rows: new Map([["p1", heldText]]), unlistedStep: null });
    expect(r.decisionStep).toEqual({ state: "held", replacedBecause: heldText });
    expect(r.decisionStep.replacedBecause).not.toMatch(/verified|no longer part/);
    expect(r.recommended).toMatchObject({ id: "s1" });
  });

  it("no row carries the decision's step and the gate would hold it → HELD, never 'add it to your action list'", () => {
    const heldText = "This step is currently held by the capacity limit. Clear the capacity bottleneck before proceeding.";
    const r = selectStrategyLocalStep(true, [rows[1]], [cand({ candidateId: "domain_action:strategy:s1", sourceId: "s1" })], isStep, { rows: new Map(), unlistedStep: heldText });
    expect(r.decisionStep).toEqual({ state: "held", replacedBecause: heldText });
  });

  it("not_listed shows an open step 'in your action list' only when it IS an action row (never a refresh target or survival issue)", () => {
    const listed = selectStrategyLocalStep(true, [rows[1]], [cand({ candidateId: "domain_action:strategy:s1", sourceId: "s1", title: "Get a quote" })], isStep);
    expect(listed.decisionStep.openStep).toMatchObject({ title: "Get a quote" });
    const refresh = cand({ candidateId: "evidence_refresh:strategy", source: "evidence_refresh", sourceId: "strategy", title: "Update the figures", findingCode: "EVIDENCE_REFRESH" });
    const issue = cand({ candidateId: "survival_reading:strategy", source: "survival_reading", sourceId: "x", title: "A survival issue" });
    // A refresh target makes the decision step "replaced" (figures out of date); a non-action item is never an openStep.
    expect(selectStrategyLocalStep(true, [rows[1]], [refresh], isStep).decisionStep.state).toBe("replaced");
    expect(selectStrategyLocalStep(true, [rows[1]], [issue], isStep).decisionStep).toEqual({ state: "not_listed", replacedBecause: null, openStep: null });
  });

  it("no row carries the decision's step yet → not_listed; without a decision, the first eligible item", () => {
    expect(selectStrategyLocalStep(true, [rows[1]], [cand({ candidateId: "domain_action:strategy:s1", sourceId: "s1" })], isStep).decisionStep.state).toBe("not_listed");
    const none = selectStrategyLocalStep(false, rows, [cand({ candidateId: "domain_action:strategy:s1", sourceId: "s1" })], isStep);
    expect(none.decisionStep.state).toBe("not_listed");
    expect(none.recommended).toMatchObject({ id: "s1" });
  });
});

describe("presentDomainLocalStep — what every domain page renders as its local step", () => {
  const base = (over: Partial<OwnerDecisionCandidate>): OwnerDecisionCandidate => ({
    candidateId: "c", businessId: "b1", workspaceId: "w1", source: "domain_action", domain: "finance", sourceId: "a1", priorityClass: "SURVIVAL_CASH",
    findingCode: "FIN_LOW_RUNWAY", findingId: null, title: "t", explanation: "e", severity: "critical", priorityScore: 0, expectedImpactScore: 0, confidence: 0.8,
    effortScore: 50, status: "no_action", ownerActionRequired: true, blocking: false, evidence: ["x"], missingData: [], verificationMetric: null, evidenceAsOf: null,
    stale: false, exclusion: null, targetRoute: "/owner/finance", ...over,
  });

  it("a domain action → the page's own persisted row", () => {
    expect(presentDomainLocalStep(base({ sourceId: "a1" }), [{ id: "a1", title: "row" }])).toEqual({ id: "a1", title: "row", localStepSource: "domain_action" });
  });

  it("a survival issue / refresh target → the canonical item itself, flagged so pages show no action-only scores", () => {
    const v = presentDomainLocalStep(base({ source: "survival_reading", candidateId: "survival_reading:finance:FIN_LOW_RUNWAY", title: "Deal with: runway" }), [{ id: "a1" }]);
    expect(v).toMatchObject({ id: "survival_reading:finance:FIN_LOW_RUNWAY", localStepSource: "survival_reading", title: "Deal with: runway", description: "e" });
    expect(presentDomainLocalStep(null, [])).toBeNull();
  });

  it("every domain page renders the action-only score line only for a domain action", () => {
    for (const page of ["finance", "cashflow", "sales", "operations", "execution", "marketing", "strategy"]) {
      const src = readFileSync(join(process.cwd(), `src/app/(authenticated)/owner/${page}/page.tsx`), "utf8");
      expect(src, page).toMatch(/recommended\.localStepSource === "domain_action" && \(/);
    }
  });
});
