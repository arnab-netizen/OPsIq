/**
 * P1 remediation — a numeric survival risk below the bar is not proof that survival risk is low.
 * Investment advice needs a survival reading that is complete (Finance liquidity confirmed, Cashflow position
 * established from both components) and current (canonical staleDomains), and a target whose canonical intent is
 * to grow or execute. Built through the REAL finance diagnosis, profile, decision and advice-policy functions.
 * Does not touch score formulas, thresholds, growth comparability, or the Cashflow engine (P1-4).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures cast heterogeneous domain rows into the real functions under test */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { diagnoseFinanceSnapshot } from "@/domain/owner-finance/diagnosis";
import { planFinanceActionsFromDiagnosis } from "@/domain/owner-finance/actions";
import { domainActionToCandidate } from "@/services/owner-home/owner-decision-candidates";
import { financeCycleToDomainScore } from "@/services/owner-condition/business-condition.service";
import { buildBusinessConditionProfile } from "@/domain/owner-spine/contracts";
import { classifyOwnerFindingCode, resolveOwnerDecision, type OwnerDecisionCandidate } from "@/domain/owner-spine/owner-decision";
import { ownerTargetIntent } from "@/domain/owner-spine/owner-imperatives";
import { assessSurvivalEvidence } from "@/domain/owner-spine/survival-evidence";
import { LIQUIDITY_UNCONFIRMED_FINDING_CODE } from "@/domain/owner-finance/liquidity";
import { buildPortfolioView, assessPortfolioInvestmentEligibility, PORTFOLIO_THRESHOLDS } from "@/domain/owner-portfolio";
import type { PortfolioBusinessInput } from "@/domain/owner-portfolio";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const NOW = new Date("2026-10-05T00:00:00Z");
const WS = "W";
const base = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", revenue: 100000, costOfGoodsOrServices: 40000, fixedCosts: 20000, variableCosts: 5000, salaryPayroll: 10000, cashOnHand: 0, receivables: 5000, payables: 1000, loanEmiDebtPayments: 0, totalDebtOutstanding: 0, ownerWithdrawals: 0, orderCount: 100, customerCount: 50, discountAmount: 0, refundAmount: 0, cashSemantics: "PHYSICAL_ONLY" as const };

function cand(code: string, over: Partial<OwnerDecisionCandidate> = {}, biz = "A"): OwnerDecisionCandidate {
  return { candidateId: `domain_action:${code}:${biz}`, businessId: biz, workspaceId: WS, source: "domain_action", domain: "sales", sourceId: code, priorityClass: classifyOwnerFindingCode(code), findingCode: code, findingId: null, title: code, explanation: "", severity: "low", priorityScore: 60, expectedImpactScore: 60, confidence: 0.8, effortScore: 30, status: "proposed", ownerActionRequired: true, blocking: false, evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: new Date("2026-09-30"), stale: false, exclusion: null, targetRoute: "/owner/sales", ...over } as OwnerDecisionCandidate;
}
const growth = (biz = "A") => cand("SALES_OPP_WINBACK", {}, biz);
function dec(cands: OwnerDecisionCandidate[], biz = "A", staleDomains: string[] = [], sufficiency: "sufficient" | "caution" | "insufficient" = "sufficient") {
  return resolveOwnerDecision({ businessId: biz, workspaceId: WS, candidates: cands, diagnosedDomains: ["finance", "sales"], dataSufficiency: { status: sufficiency, lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: sufficiency === "insufficient" ? ["x"] : [] }, staleDomains, strategy: null, reassessment: { days: 30, reason: "x" }, changeFacts: NO_CHANGE_FACTS, now: NOW } as never);
}
const dsc = (domain: string, risk: number, opp: number): any => ({ domain, healthScore: 80, riskScore: risk, opportunityScore: opp, dataConfidenceScore: 90, topFindingCodes: [], topActionCodes: [], generatedAt: NOW });

/** One business assembled exactly as Owner Home does: the survival evidence comes from the canonical assessment. */
function business(id: string, domains: any[], decision: any, o: { stale?: string[]; liquidityUnconfirmed?: boolean; cashflowPosition?: { cashInHand?: number | null; bankBalance?: number | null } | null; missingCritical?: string[] } = {}): PortfolioBusinessInput {
  const profile = buildBusinessConditionProfile({ businessId: id, workspaceId: WS, domainScores: domains, missingCriticalData: o.missingCritical ?? [], now: NOW });
  const stale = o.stale ?? [];
  return {
    businessId: id, name: `Biz ${id}`, profile, ownerDecision: decision, staleDomains: stale,
    survivalEvidence: assessSurvivalEvidence({ domainsPresent: domains.map((d) => d.domain), staleDomains: stale, financeLiquidityUnconfirmed: o.liquidityUnconfirmed ?? false, cashflowPosition: o.cashflowPosition ?? null }),
  };
}
const reasonOf = (i: PortfolioBusinessInput) => { const r = assessPortfolioInvestmentEligibility(i, PORTFOLIO_THRESHOLDS); return r.eligible ? "ELIGIBLE" : r.reason; };

/** Finance through the real diagnosis → profile → decision, plus a fresh Sales growth target (opportunity 70). */
function financeBusiness(input: Record<string, unknown>, id = "A") {
  const d = diagnoseFinanceSnapshot(input as never, { now: NOW });
  const plan = planFinanceActionsFromDiagnosis(d);
  const findings = d.findings.map((f: any, i: number) => ({ ...f, id: `f${i}` }));
  const ds = financeCycleToDomainScore({ overallHealthScore: d.metrics.financialHealthScore, survivalRiskScore: d.metrics.financialRiskScore, growthOpportunityScore: d.metrics.financialOpportunityScore, dataConfidenceScore: d.metrics.dataConfidenceScore, generatedAt: NOW, findings, actions: [] } as never);
  const cands = plan.actions.map((a: any, i: number) => domainActionToCandidate({ ...a, id: `a${i}`, findingId: findings.find((x: any) => x.code === a.findingCode)?.id, status: "proposed" } as never, { businessId: id, workspaceId: WS, domain: "finance", findingsById: new Map(findings.map((x: any) => [x.id, x])), evidenceAsOf: new Date("2026-09-30"), stale: false, verifiedFixes: new Map() } as never));
  cands.push(growth(id));
  const sales = dsc("sales", 10, 70);
  const profileForSufficiency = buildBusinessConditionProfile({ businessId: id, workspaceId: WS, domainScores: [ds, sales], missingCriticalData: d.missingCriticalData, now: NOW });
  const decision = resolveOwnerDecision({ businessId: id, workspaceId: WS, candidates: cands, diagnosedDomains: ["finance", "sales"], dataSufficiency: { status: profileForSufficiency.dataSufficiencyStatus!, lowestDataConfidenceScore: profileForSufficiency.lowestDataConfidenceScore!, lowConfidenceDomains: profileForSufficiency.lowConfidenceDomains as never, missingCriticalData: profileForSufficiency.missingCriticalData }, staleDomains: [], strategy: null, reassessment: { days: 30, reason: "x" }, changeFacts: NO_CHANGE_FACTS, now: NOW } as never);
  const b = business(id, [ds, sales], decision, { liquidityUnconfirmed: d.findings.some((f: any) => f.code === LIQUIDITY_UNCONFIRMED_FINDING_CODE), missingCritical: d.missingCriticalData });
  return { d, b, decision, profile: b.profile! };
}

describe("P1-1 — incomplete Finance liquidity never clears investment", () => {
  it("A/D: cash 0 + bank unknown + numeric survival 0 + fresh growth → HELD with a bank-balance next step", () => {
    const r = financeBusiness(base);
    expect(r.d.metrics.liquidityStatus).toBe("BANK_UNKNOWN");
    expect(r.profile.survivalRiskScore).toBe(0); // the number is untouched: unknown is not turned into danger
    const v = buildPortfolioView([r.b], { now: NOW });
    expect(v.investmentRecommendation).toBeNull();
    expect(v.investmentAssessment.status).toBe("HELD");
    const h = v.investmentAssessment.held[0];
    expect(reasonOf(r.b)).toBe("SURVIVAL_LIQUIDITY_UNCONFIRMED");
    expect(h.ownerStatement).toMatch(/bank balance is not confirmed/);
    expect(h.nextStep).toMatch(/bank balance/);
    expect(h.nextStep).toMatch(/reassess/);
    expect(`${h.ownerStatement} ${h.nextStep}`).not.toMatch(/unsafe|insolven|danger|[A-Z]{3,}_[A-Z_]+/);
  });
  it("B: bank KNOWN 0 is a real zero fact — not 'unknown' (liquidity COMPLETE), handled by the canonical decision", () => {
    const r = financeBusiness({ ...base, bankBalance: 0 });
    expect(r.d.metrics.liquidityStatus).toBe("COMPLETE");
    expect(r.b.survivalEvidence?.financeLiquidityUnconfirmed).toBe(false);
    expect(reasonOf(r.b)).not.toBe("SURVIVAL_LIQUIDITY_UNCONFIRMED");
    expect(buildPortfolioView([r.b], { now: NOW }).investmentRecommendation).toBeNull(); // canonical low-cash target holds it
  });
  it("C: bank known positive → may qualify when every other gate passes", () => {
    const r = financeBusiness({ ...base, bankBalance: 500000 });
    expect(r.b.survivalEvidence?.sufficient).toBe(true);
    expect(buildPortfolioView([r.b], { now: NOW }).investmentRecommendation?.businessId).toBe("A");
  });
  it("the finding the gate reads is the canonical one Finance emits", () => {
    expect(financeBusiness(base).d.findings.map((f: any) => f.code)).toContain(LIQUIDITY_UNCONFIRMED_FINDING_CODE);
    expect(financeBusiness({ ...base, bankBalance: 0 }).d.findings.map((f: any) => f.code)).not.toContain(LIQUIDITY_UNCONFIRMED_FINDING_CODE);
  });
  it("a numeric survival risk below the bar alone is insufficient: missing context fails closed", () => {
    const r = financeBusiness({ ...base, bankBalance: 500000 });
    expect(reasonOf({ ...r.b, survivalEvidence: undefined })).toBe("SURVIVAL_EVIDENCE_UNVERIFIABLE");
    expect(buildPortfolioView([{ ...r.b, survivalEvidence: undefined }], { now: NOW }).investmentRecommendation).toBeNull();
  });
  it("a context that does not cover the profile's survival domains fails closed (cannot be borrowed from another read)", () => {
    const r = financeBusiness({ ...base, bankBalance: 500000 });
    const narrow = assessSurvivalEvidence({ domainsPresent: ["sales"], staleDomains: [], financeLiquidityUnconfirmed: false, cashflowPosition: null });
    expect(reasonOf({ ...r.b, survivalEvidence: narrow })).toBe("SURVIVAL_EVIDENCE_UNVERIFIABLE");
  });
});

describe("P1-2 — evidence-request targets inside PROCESS_OPTIMISATION never clear investment (canonical intent)", () => {
  const evidenceCodes = ["FIN_LIQUIDITY_UNCONFIRMED", "FIN_OPP_DATA_QUALITY", "CF_OPP_DATA_QUALITY", "SOP_OPP_DATA_QUALITY", "FIN_NOTABLE_OUTSTANDING_DEBT", "SALES_OPP_DATA_QUALITY", "OPS_OPP_DATA_QUALITY", "MKT_OPP_DATA_QUALITY"];
  const domains = () => [dsc("sales", 10, 70), dsc("finance", 10, 0)];
  it.each(evidenceCodes)("E–I: primary %s is HELD because its canonical intent is EVIDENCE", (code) => {
    const c = cand(code, { domain: "finance", missingData: ["m"], severity: "medium" });
    const d = dec([c]);
    expect(d.primaryTarget?.priorityClass).toBe("PROCESS_OPTIMISATION");
    expect(ownerTargetIntent(d.primaryTarget!)).toBe("EVIDENCE");
    const b = business("A", domains(), d);
    expect(b.survivalEvidence?.sufficient).toBe(true); // the survival side is fine: only the intent holds it
    expect(reasonOf(b)).toBe("EVIDENCE_REQUEST_COMES_FIRST");
    expect(buildPortfolioView([b], { now: NOW }).investmentAssessment.status).toBe("HELD");
  });
  it("J: genuine process optimisation with EXECUTE intent may qualify", () => {
    const d = dec([cand("OPS_OPP_CUT_REWORK", { domain: "operations" })]);
    expect(d.primaryTarget?.priorityClass).toBe("PROCESS_OPTIMISATION");
    expect(ownerTargetIntent(d.primaryTarget!)).toBe("EXECUTE");
    expect(reasonOf(business("A", domains(), d))).toBe("ELIGIBLE");
  });
  it("K: GROWTH_OPPORTUNITY with GROW intent may qualify", () => {
    const d = dec([growth()]);
    expect(ownerTargetIntent(d.primaryTarget!)).toBe("GROW");
    expect(reasonOf(business("A", domains(), d))).toBe("ELIGIBLE");
  });
  it("L: BLOCKED_EXECUTION with EXECUTE intent is still HELD by the existing class gate (not widened)", () => {
    const d = dec([cand("SOP_OVERDUE_CRITICAL_TASKS", { domain: "sop", priorityClass: "BLOCKED_EXECUTION" })]);
    expect(d.primaryTarget?.priorityClass).toBe("BLOCKED_EXECUTION");
    expect(ownerTargetIntent(d.primaryTarget!)).toBe("EXECUTE");
    expect(reasonOf(business("A", domains(), d))).toBe("PRIMARY_CONCERN_COMES_FIRST");
  });
  it("SAFETY / STABILISE / REPAIR intents are never admitted", () => {
    for (const cls of ["SAFETY_COMPLIANCE", "SURVIVAL_CASH", "PROFIT_LOSS", "CUSTOMER_SERVICE_FAILURE"] as const) {
      const d = dec([cand("X_CODE", { priorityClass: cls, severity: "high" })]);
      expect(reasonOf(business("A", domains(), d))).toBe("PRIMARY_CONCERN_COMES_FIRST");
    }
  });
});

describe("P1-3 — a stale survival-family domain never clears investment", () => {
  const sales = () => dsc("sales", 10, 70);
  it.each(["finance", "cashflow", "recovery"])("M/N/O: stale %s + fresh Sales growth → HELD; the old low score is not replaced", (dom) => {
    const old = dsc(dom, 20, 0);
    const d = dec([growth()], "A", [dom]);
    const b = business("A", [old, sales()], d, { stale: [dom] });
    expect(b.profile!.survivalRiskScore).toBe(20);
    expect(reasonOf(b)).toBe("SURVIVAL_EVIDENCE_OUT_OF_DATE");
    const v = buildPortfolioView([b], { now: NOW });
    expect(v.investmentRecommendation).toBeNull();
    expect(v.investmentAssessment.held[0].nextStep).toMatch(/re-run their diagnosis/);
    expect(v.investmentAssessment.held[0].nextStep).toMatch(/reassess/);
  });
  it("P: stale Marketing only does not trigger the survival-evidence hold", () => {
    const b = business("A", [dsc("finance", 20, 0), sales(), dsc("marketing", 10, 5)], dec([growth()], "A", ["marketing"]), { stale: ["marketing"] });
    expect(reasonOf(b)).toBe("ELIGIBLE");
  });
  it("Q: stale Sales supplying the max growth signal keeps the existing growth-freshness hold", () => {
    const b = business("A", [dsc("finance", 20, 0), sales()], dec([growth()], "A", ["sales"]), { stale: ["sales"] });
    expect(reasonOf(b)).toBe("GROWTH_SIGNAL_OUT_OF_DATE");
  });
  it("R: current Finance and no Cashflow ever diagnosed → no invented requirement", () => {
    const b = business("A", [dsc("finance", 20, 0), sales()], dec([growth()]), { cashflowPosition: null });
    expect(b.survivalEvidence?.cashflowPositionIncomplete).toBe(false);
    expect(reasonOf(b)).toBe("ELIGIBLE");
  });
  it("S: a current Cashflow position that is incomplete never clears (either component missing); both known (incl. 0) is fine", () => {
    const mk = (pos: { cashInHand?: number | null; bankBalance?: number | null }) => business("A", [dsc("cashflow", 20, 0), sales()], dec([growth()]), { cashflowPosition: pos });
    expect(reasonOf(mk({ cashInHand: 0, bankBalance: null }))).toBe("SURVIVAL_CASHFLOW_POSITION_INCOMPLETE");
    expect(reasonOf(mk({ cashInHand: null, bankBalance: 600000 }))).toBe("SURVIVAL_CASHFLOW_POSITION_INCOMPLETE");
    expect(reasonOf(mk({}))).toBe("SURVIVAL_CASHFLOW_POSITION_INCOMPLETE");
    expect(reasonOf(mk({ cashInHand: 0, bankBalance: 0 }))).toBe("ELIGIBLE"); // a known zero is a fact
    expect(reasonOf(mk({ cashInHand: 5000, bankBalance: 600000 }))).toBe("ELIGIBLE");
  });
});

describe("isolation and fallback", () => {
  it("U: Business A's incomplete survival evidence cannot hold Business B", () => {
    const a = business("A", [dsc("finance", 0, 0), dsc("sales", 10, 95)], dec([growth("A")], "A"), { liquidityUnconfirmed: true });
    const b = business("B", [dsc("finance", 10, 0), dsc("sales", 10, 80)], dec([growth("B")], "B"));
    const solo = buildPortfolioView([b], { now: NOW }).investmentRecommendation;
    const both = buildPortfolioView([a, b], { now: NOW });
    expect(both.investmentRecommendation).toEqual(solo);
    expect(both.investmentAssessment.held.map((h) => h.businessId)).toEqual(["A"]);
  });
  it("W: a blocked top-growth candidate does not suppress an eligible runner-up (ranking unchanged)", () => {
    const a = business("A", [dsc("finance", 0, 0), dsc("sales", 10, 95)], dec([growth("A")], "A", ["finance"]), { stale: ["finance"] });
    const b = business("B", [dsc("finance", 10, 0), dsc("sales", 10, 80)], dec([growth("B")], "B"));
    const v = buildPortfolioView([a, b], { now: NOW });
    expect(v.ranking.bestGrowthCandidateBusinessId).toBe("A");
    expect(v.investmentRecommendation?.businessId).toBe("B");
  });
  it("NO_OPEN_ACTIONS + SUPPORTED stays eligible with complete, current survival evidence (commitment flag false, guard null)", () => {
    const d = dec([]);
    expect(d.state).toBe("NO_OPEN_ACTIONS");
    expect(d.advicePolicy.mode).toBe("SUPPORTED");
    expect(d.advicePolicy.canMakeMaterialCommitment).toBe(false);
    expect(reasonOf(business("A", [dsc("finance", 10, 0), dsc("sales", 10, 70)], d))).toBe("ELIGIBLE");
  });
  it("NO_OPEN_ACTIONS with incomplete liquidity is held", () => {
    expect(reasonOf(business("A", [dsc("finance", 10, 0), dsc("sales", 10, 70)], dec([]), { liquidityUnconfirmed: true }))).toBe("SURVIVAL_LIQUIDITY_UNCONFIRMED");
  });
});

describe("assessSurvivalEvidence — the one canonical assessment", () => {
  const f = (o: Partial<Parameters<typeof assessSurvivalEvidence>[0]> = {}) => assessSurvivalEvidence({ domainsPresent: ["finance", "sales"], staleDomains: [], financeLiquidityUnconfirmed: false, cashflowPosition: null, ...o });
  it("is sufficient when survival domains are current, liquidity confirmed and no cashflow position is incomplete", () => expect(f().sufficient).toBe(true));
  it("only survival-family domains count as stale", () => {
    expect(f({ staleDomains: ["sales", "marketing", "operations", "sop", "strategy"] }).sufficient).toBe(true);
    expect(f({ staleDomains: ["finance"] }).staleSurvivalDomains).toEqual(["finance"]);
    expect(f({ domainsPresent: ["finance"], staleDomains: ["cashflow"] }).sufficient).toBe(true); // not a contributing domain here
  });
  it("is pure and deterministic", () => {
    const facts = { domainsPresent: ["recovery", "finance"], staleDomains: ["recovery"], financeLiquidityUnconfirmed: false, cashflowPosition: null } as const;
    expect(assessSurvivalEvidence(facts)).toEqual(assessSurvivalEvidence(facts));
  });
});

describe("recurrence protection", () => {
  const root = path.resolve(__dirname, "../..");
  const src = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  it("Portfolio reuses the canonical guard, staleDomains and target intent", () => {
    const s = strip(src("domain/owner-portfolio/investment-eligibility.ts"));
    expect(s).toMatch(/ownerMaterialCommitmentGuard\(/);
    expect(s).toMatch(/input\.staleDomains/);
    expect(s).toMatch(/ownerTargetIntent\(/);
    expect(s).toMatch(/isSurvivalDomain\(/);
  });
  it("Portfolio carries no finding-code evidence list, no freshness constant, and no raw cash arithmetic", () => {
    const s = strip(src("domain/owner-portfolio/investment-eligibility.ts"));
    expect(s).not.toMatch(/FIN_[A-Z_]+|CF_[A-Z_]+|SOP_[A-Z_]+|_OPP_|DATA_QUALITY/);
    expect(s).not.toMatch(/STALE_[A-Z_]*|[A-Z_]*_DAYS\b|86_?400|\bdays?\b\s*[<>*]|cashInHand|bankBalance/);
  });
  it("the survival-evidence function reads cashflowTotalCash and SURVIVAL_DOMAINS rather than copying them", () => {
    const s = strip(src("domain/owner-spine/survival-evidence.ts"));
    expect(s).toMatch(/cashflowTotalCash\(/);
    expect(s).toMatch(/SURVIVAL_DOMAINS/);
    expect(s).not.toMatch(/["']finance["']|["']cashflow["']|["']recovery["']/);
    expect(s).not.toMatch(/cashInHand\s*(!==|===|!=|==)|bankBalance\s*(!==|===|!=|==)/);
  });
  it("the finding code is defined once and used by Finance's rule", () => {
    expect(src("domain/owner-finance/opportunity-rules.ts")).toContain("LIQUIDITY_UNCONFIRMED_FINDING_CODE");
    expect(src("domain/owner-finance/opportunity-rules.ts")).not.toMatch(/code:\s*"FIN_LIQUIDITY_UNCONFIRMED"/);
  });
  it("survivalRiskScore < bar alone cannot create a recommendation (behavioural: every missing/insufficient context holds)", () => {
    const r = financeBusiness({ ...base, bankBalance: 500000 });
    expect(r.profile.survivalRiskScore!).toBeLessThan(PORTFOLIO_THRESHOLDS.safeInvestmentSurvivalRiskBar);
    for (const bad of [undefined, assessSurvivalEvidence({ domainsPresent: ["finance"], staleDomains: ["finance"], financeLiquidityUnconfirmed: false, cashflowPosition: null }), assessSurvivalEvidence({ domainsPresent: ["finance"], staleDomains: [], financeLiquidityUnconfirmed: true, cashflowPosition: null })]) {
      expect(buildPortfolioView([{ ...r.b, survivalEvidence: bad }], { now: NOW }).investmentRecommendation).toBeNull();
    }
  });
});
