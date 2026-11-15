/**
 * P1-4 amendment — downstream consumers must not read an INCOMPLETE Cashflow cash position as proof of safety (state and
 * evidence sufficiency are separate facts), and a persisted pre-fix partial-total cycle must not make false CURRENT claims.
 * Pure: the REAL engine, projection, shared reading, action-gate policy, canonical decision, consulting gate, change detection.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { computeCashflowMetrics } from "@/domain/owner-cashflow";
import { diagnoseCashflowSnapshot } from "@/domain/owner-cashflow/diagnosis";
import { cashPositionEvidence, projectCashflowCycleRow } from "@/domain/owner-cashflow/cycle-projection";
import { cashFlowEvidenceGaps, currentCashFinanceReading, financeEvidenceGaps } from "@/services/owner-spine/current-cash-finance-reading";
import { evaluateOwnerActionGate, NO_OWNER_GATE_CONSTRAINTS, type OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";
import { classifyOwnerFindingCode, resolveOwnerDecision, ownerGateHoldText, type OwnerDecisionCandidate } from "@/domain/owner-spine/owner-decision";
import { detectChanges, type BusinessStateSnapshot } from "@/domain/owner-guidance/change-detection";
import { consultingBusinessEvidenceState } from "@/services/owner-finance/recommendation-cash-safety.service";
import { assertCashSafetyForPromotion } from "@/domain/owner-finance/cash-safety-gate";
import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const NOW = new Date("2026-06-05T00:00:00Z");
const DAY = 86_400_000;
const periodEnd = new Date(NOW.getTime() - 5 * DAY);
const burn = { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", dailyCollections: 3000, receivables: 5000, receivablesOverdue: 0, payables: 20000, upcomingEmi: 10000, rentDue: 30000, salaryDue: 60000, vendorDue: 20000 };
const watchComplete = { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", cashInHand: 50000, bankBalance: 50000, dailyCollections: 5000, receivables: 5000, receivablesOverdue: 0, payables: 80000, rentDue: 10000, salaryDue: 20000 };
const healthyComplete = { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", cashInHand: 50000, bankBalance: 150000, dailyCollections: 8000, receivables: 5000, receivablesOverdue: 0, payables: 20000, upcomingEmi: 10000, rentDue: 15000, salaryDue: 40000, vendorDue: 10000, taxDue: 5000, ownerWithdrawal: 20000 };

/** A persisted cycle row as the OLD engine could have written it for a PARTIAL snapshot (cash 0, bank unknown). */
function legacyRow(snapshot: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return {
    cashflowState: "INSOLVENT_RISK", healthScore: 12, dangerScore: 70, opportunityScore: 0, dataConfidenceScore: 100, generatedAt: NOW,
    snapshot,
    findings: [{ code: "CF_INSOLVENT_RUNWAY", severity: "critical" }, { code: "CF_URGENT_PAYMENT_RISK", severity: "critical" }],
    actions: [{ id: "a1", findingCode: "CF_INSOLVENT_RUNWAY", title: "Raise cash now" }],
    ...over,
  };
}

describe("read-time projection of a persisted cycle (cycle-projection.ts)", () => {
  it("a COMPLETE position is returned untouched (persisted conclusions stand; known 0+0 included)", () => {
    for (const snap of [{ ...burn, cashInHand: 5000, bankBalance: 0 }, { ...burn, cashInHand: 0, bankBalance: 0 }]) {
      const row = legacyRow(snap);
      const p = projectCashflowCycleRow(row);
      expect(p.cashPosition).toEqual({ judged: true, complete: true, missing: [] });
      expect(p.cashflowState).toBe("INSOLVENT_RISK");
      expect(p.findings).toEqual(row.findings);
      expect(p.actions).toEqual(row.actions);
    }
  });
  it("M: a legacy PARTIAL cycle (old INSOLVENT_RISK from cash 0 + unknown bank) is re-evaluated: WATCH, no false cash finding/action, gap named", () => {
    const p = projectCashflowCycleRow(legacyRow({ ...burn, cashInHand: 0, bankBalance: null }));
    expect(p.cashPosition).toEqual({ judged: true, complete: false, missing: ["bankBalance"] });
    expect(p.cashflowState).toBe("WATCH");
    expect(p.dangerScore).toBe(0);
    expect(p.healthScore).toBeLessThanOrEqual(50);
    expect(p.findings).toEqual([]);
    expect(p.actions).toEqual([]);
  });
  it("O: a legacy partial cycle keeps an independently measured risk (overdue receivables) and drops only what rested on the partial total", () => {
    const snap = { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", cashInHand: 0, bankBalance: null, dailyCollections: 100000, receivables: 100000, receivablesOverdue: 80000, rentDue: 1000 };
    const row = legacyRow(snap, {
      findings: [{ code: "CF_INSOLVENT_RUNWAY", severity: "critical" }, { code: "CF_HIGH_OVERDUE_RECEIVABLES", severity: "high" }],
      actions: [{ id: "a1", findingCode: "CF_INSOLVENT_RUNWAY" }, { id: "a2", findingCode: "CF_HIGH_OVERDUE_RECEIVABLES" }],
    });
    const p = projectCashflowCycleRow(row);
    expect(p.findings.map((f: { code: string }) => f.code)).toEqual(["CF_HIGH_OVERDUE_RECEIVABLES"]);
    expect(p.actions.map((a: { id: string }) => a.id)).toEqual(["a2"]);
    expect(p.cashflowState).toBe("AT_RISK"); // the genuine independent risk is not erased
  });
  it("is pure and does not mutate; rows read without cash columns are not judged (no signal, untouched)", () => {
    const row = legacyRow({ ...burn, cashInHand: 0, bankBalance: null });
    const before = JSON.stringify(row);
    projectCashflowCycleRow(row);
    expect(JSON.stringify(row)).toBe(before);
    const bare = projectCashflowCycleRow({ cashflowState: "SAFE", snapshot: { periodEnd } });
    expect(bare.cashPosition.judged).toBe(false);
    expect(bare.cashflowState).toBe("SAFE");
    expect(cashPositionEvidence(null).judged).toBe(false);
  });
  it("a projection built from the CURRENT engine equals what the current engine would persist for a new partial snapshot", () => {
    const snap = { ...burn, cashInHand: 0, bankBalance: null };
    const dx = diagnoseCashflowSnapshot({ ...burn, cashInHand: 0 } as never, { now: NOW });
    const p = projectCashflowCycleRow(legacyRow(snap, { findings: dx.findings, actions: [] }));
    expect(p.cashflowState).toBe(dx.metrics.cashflowState);
    expect(p.findings.map((f: { code: string }) => f.code).sort()).toEqual(dx.findings.map((f) => f.code).sort());
  });
});

describe("the shared reading: STATE and EVIDENCE are separate", () => {
  const nowMs = NOW.getTime();
  const snap = { periodEnd };
  const cashGap = [{ reason: "CASH_POSITION_INCOMPLETE" as const, missing: ["bankBalance"] }];
  const read = (cashState: string | null, cashGaps: typeof cashGap | [], finState: string | null = null, finGaps: ReturnType<typeof financeEvidenceGaps> = []) =>
    currentCashFinanceReading(
      cashState ? { state: cashState, snapshot: snap, evidenceGaps: cashGaps } : null,
      finState ? { state: finState, snapshot: snap, evidenceGaps: finGaps } : null,
      nowMs
    );
  it("B/I: an incomplete Cashflow WATCH stays WATCH (not raised to AT_RISK) but is insufficient evidence", () => {
    const r = read("WATCH", cashGap);
    expect(r.gateState).toBe("WATCH");
    expect(r.gateEvidenceSufficient).toBe(false);
    expect(r.gateEvidenceGaps).toEqual([{ source: "cashflow", reason: "CASH_POSITION_INCOMPLETE", missing: ["bankBalance"] }]);
  });
  it("H/G: a COMPLETE measured WATCH (and SAFE) keeps existing behaviour — sufficient", () => {
    expect(read("WATCH", []).gateEvidenceSufficient).toBe(true);
    expect(read("SAFE", []).gateEvidenceSufficient).toBe(true);
  });
  it("J: incomplete Cashflow WATCH + Finance SAFE — the incomplete half is not affirmative proof", () => {
    const r = read("WATCH", cashGap, "SAFE");
    expect(r.gateState).toBe("SAFE"); // the existing arbitration of two safe-ish readings is untouched…
    expect(r.gateEvidenceSufficient).toBe(false); // …but the incomplete half cannot count as proof
  });
  it("K: Finance SAFE carrying the liquidity-unconfirmed finding is insufficient evidence", () => {
    const gaps = financeEvidenceGaps([{ code: "FIN_LIQUIDITY_UNCONFIRMED" }]);
    expect(gaps).toEqual([{ reason: "LIQUIDITY_UNCONFIRMED", missing: ["bankBalance"] }]);
    const r = read(null, [], "SAFE", gaps);
    expect(r.gateState).toBe("SAFE");
    expect(r.gateEvidenceSufficient).toBe(false);
    expect(financeEvidenceGaps([{ code: "FIN_LOW_RUNWAY" }])).toEqual([]);
  });
  it("L: a real independent risk still decides the state at its own severity (evidence gap never lowers or masks it)", () => {
    const r = read("AT_RISK", cashGap);
    expect(r.gateState).toBe("AT_RISK");
    expect(r.gateEvidenceSufficient).toBe(false);
  });
  it("a stale incomplete reading is not a gap (it is already unverified) and a superseded one does not veto the newer source", () => {
    const stale = currentCashFinanceReading({ state: "WATCH", snapshot: { periodEnd: new Date(nowMs - 90 * DAY) }, evidenceGaps: cashGap }, null, nowMs);
    expect(stale.gateEvidenceSufficient).toBe(true);
    expect(stale.gateState).toBe("AT_RISK"); // unverified: the existing rule, unchanged
  });
  it("no reading at all is not an evidence gap", () => {
    expect(read(null, []).gateEvidenceSufficient).toBe(true);
  });
  it("cashFlowEvidenceGaps reads the projection's single completeness fact", () => {
    expect(cashFlowEvidenceGaps(projectCashflowCycleRow(legacyRow({ ...burn, cashInHand: 0, bankBalance: null })))).toEqual(cashGap);
    expect(cashFlowEvidenceGaps(projectCashflowCycleRow(legacyRow({ ...burn, cashInHand: 0, bankBalance: 0 })))).toEqual([]);
  });
});

describe("the owner action gate", () => {
  const gate = (over: Partial<OwnerGateConstraints["cash"]>): OwnerGateConstraints => ({
    ...NO_OWNER_GATE_CONSTRAINTS,
    cash: { ...NO_OWNER_GATE_CONSTRAINTS.cash, gateState: "WATCH", driver: "cash", ...over },
  });
  const incomplete = gate({ evidenceSufficient: false, evidenceGaps: [{ source: "cashflow", reason: "CASH_POSITION_INCOMPLETE", missing: ["bankBalance"] }] });
  const verdict = (c: OwnerGateConstraints, domain: string, intent: Parameters<typeof evaluateOwnerActionGate>[1]["intent"], findingCode: string | null = null) =>
    evaluateOwnerActionGate(c, { domain, intent, findingId: null, findingCode });
  it("B: a GROW action is held when total cash is not confirmed — with an owner-facing 'not confirmed' reason (no danger claim)", () => {
    const v = verdict(incomplete, "sales", "GROW", "SALES_OPP_WINBACK");
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.code).toBe("CASH_SAFETY_BLOCKED");
      expect(v.reason).toMatch(/Total cash is not confirmed yet; enter the missing bank balance figure/);
      expect(v.reason).not.toMatch(/at risk|critical|insolven|unsafe|runs out/i);
    }
  });
  it("C: protective intents (EVIDENCE / SAFETY / STABILISE / REPAIR) stay executable; EXECUTE is not stopped", () => {
    for (const intent of ["EVIDENCE", "SAFETY", "STABILISE", "REPAIR", "EXECUTE"] as const) {
      expect(verdict(incomplete, "cashflow", intent, "CF_MISSING_CRITICAL_DATA").allowed, intent).toBe(true);
    }
    expect(verdict(incomplete, "sales", "EXECUTE", "SALES_OPP_TIGHTEN_DISCOUNT").allowed).toBe(true);
  });
  it("legacy / null-intent: fails closed for a growth-sensitive domain, not for general-sensitivity domains", () => {
    expect(verdict(incomplete, "sales", null).allowed).toBe(false);
    expect(verdict(incomplete, "marketing", null).allowed).toBe(false);
    expect(verdict(incomplete, "sop", null).allowed).toBe(true);
  });
  it("A: a COMPLETE measured WATCH is unchanged — growth allowed; a sufficient reading never blocks", () => {
    expect(verdict(gate({ evidenceSufficient: true }), "sales", "GROW", "SALES_OPP_WINBACK").allowed).toBe(true);
    expect(verdict(gate({}), "sales", "GROW", "SALES_OPP_WINBACK").allowed).toBe(true); // fixtures that predate the field
  });
  it("an unsafe state still blocks at its real severity (the evidence rule only adds a hold)", () => {
    const v = verdict(gate({ gateState: "AT_RISK", evidenceSufficient: false, evidenceGaps: [] }), "sales", "GROW", "SALES_OPP_WINBACK");
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toMatch(/Cash survival is at risk|AT_RISK|at risk/i);
  });
});

describe("canonical decision parity (Phase 6)", () => {
  const cand = (code: string, domain: OwnerDecisionCandidate["domain"], over: Partial<OwnerDecisionCandidate> = {}): OwnerDecisionCandidate => ({
    candidateId: `domain_action:${code}`, businessId: "A", workspaceId: "W", source: "domain_action", domain, sourceId: code,
    priorityClass: classifyOwnerFindingCode(code), findingCode: code, findingId: null, title: code, explanation: "", severity: "low",
    priorityScore: 60, expectedImpactScore: 60, confidence: 0.8, effortScore: 30, status: "proposed", ownerActionRequired: true,
    blocking: false, evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: false, exclusion: null, targetRoute: `/owner/${domain}`, ...over,
  } as OwnerDecisionCandidate);
  const gate = (evidenceSufficient: boolean): OwnerGateConstraints => ({
    ...NO_OWNER_GATE_CONSTRAINTS,
    cash: { ...NO_OWNER_GATE_CONSTRAINTS.cash, gateState: "WATCH", driver: "cash", source: "cashflow", evidenceSufficient, evidenceGaps: evidenceSufficient ? [] : [{ source: "cashflow", reason: "CASH_POSITION_INCOMPLETE", missing: ["bankBalance"] }] },
  });
  const decide = (g: OwnerGateConstraints, candidates: OwnerDecisionCandidate[]) =>
    resolveOwnerDecision({ businessId: "A", workspaceId: "W", candidates, diagnosedDomains: ["cashflow", "sales"], dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] }, staleDomains: [], strategy: null, reassessment: { days: 30, reason: "x" }, changeFacts: NO_CHANGE_FACTS, gate: g, now: NOW } as never);
  it("N: a GROW candidate the mutation-time gate would hold for incomplete cash is NOT elected as executable growth; the data request is", () => {
    const d = decide(gate(false), [cand("SALES_OPP_WINBACK", "sales")]);
    expect(d.primaryTarget?.findingCode).toBe("GATE_CASH_UNCONFIRMED");
    expect(d.primaryTarget?.priorityClass).toBe("MISSING_CRITICAL_EVIDENCE");
    expect(d.primaryTarget?.findingCode).not.toBe("SALES_OPP_WINBACK");
    expect(d.advicePolicy.mode).toBe("EVIDENCE_REQUIRED");
    const text = `${d.primaryTarget?.title} ${d.primaryTarget?.explanation}`;
    expect(text).toMatch(/not confirmed/i);
    expect(text).not.toMatch(/Stabilise cash|cash safety limit|survival/i);
  });
  it("with sufficient evidence the same GROW candidate is elected (existing behaviour)", () => {
    expect(decide(gate(true), [cand("SALES_OPP_WINBACK", "sales")]).primaryTarget?.findingCode).toBe("SALES_OPP_WINBACK");
  });
  it("an existing request for the missing figure addresses the blocker (no second target is synthesized)", () => {
    const d = decide(gate(false), [cand("SALES_OPP_WINBACK", "sales"), cand("CF_MISSING_CRITICAL_DATA", "cashflow", { source: "domain_action" })]);
    expect(d.primaryTarget?.findingCode).toBe("CF_MISSING_CRITICAL_DATA");
  });
  it("the hold text names total cash, never a cash danger", () => {
    expect(ownerGateHoldText("CASH_SAFETY_BLOCKED", gate(false))).toMatch(/total cash not being confirmed yet/);
  });
});

describe("Now View runway claim (change detection)", () => {
  const snap = (over: Partial<BusinessStateSnapshot> = {}): BusinessStateSnapshot => ({ cashRunwayDays: 120, netMarginPct: 10, complaintsCount: 0, reworkCount: 0, capacityUtilizationPct: 0, staffOverloadPct: 0, ownerLoadPct: 0, churnRiskScore: 0, supplierInventoryRiskScore: 0, overdueProofCount: 0, outcomeChecksDue: 0, growthReadinessTier: "STABILIZE_FIRST", ...over });
  it("F: no 'Cash runway … 45 days' message is built when the cash position is incomplete (either side)", () => {
    expect(detectChanges(snap(), snap({ cashRunwayDays: 45, cashRunwayMeasured: false })).map((c) => c.reason)).toEqual([]);
    expect(detectChanges(snap({ cashRunwayDays: 45, cashRunwayMeasured: false }), snap()).map((c) => c.reason)).toEqual([]);
  });
  it("a measured runway change is still reported (unchanged behaviour, including history without the flag)", () => {
    expect(detectChanges(snap(), snap({ cashRunwayDays: 45 })).map((c) => c.reason)).toContain("Cash runway fell from 120 to 45 days.");
    expect(detectChanges(snap({ cashRunwayMeasured: true }), snap({ cashRunwayDays: 18, cashRunwayMeasured: true })).length).toBe(1);
  });
});

describe("Formal Consulting recommendation gate", () => {
  const half = (state: string, evidenceGap = false) => ({ state, snapshot: null, evidenceGap });
  const allowed = (st: ReturnType<typeof consultingBusinessEvidenceState>) => {
    try { assertCashSafetyForPromotion(st!, st!, RecommendationSensitivity.GROWTH_SENSITIVE, "r"); return true; } catch { return false; }
  };
  it("P: incomplete Cashflow WATCH + Finance SAFE does not clear a GROWTH_SENSITIVE recommendation", () => {
    const st = consultingBusinessEvidenceState(half("WATCH", true), half("SAFE"), null, NOW.getTime());
    expect(st).toBe("AT_RISK");
    expect(allowed(st)).toBe(false);
  });
  it("Finance SAFE with liquidity unconfirmed + Cashflow SAFE does not clear it either", () => {
    expect(allowed(consultingBusinessEvidenceState(half("SAFE"), half("SAFE", true), null, NOW.getTime()))).toBe(false);
  });
  it("Q: complete WATCH + complete SAFE keeps existing behaviour", () => {
    const st = consultingBusinessEvidenceState(half("WATCH"), half("SAFE"), null, NOW.getTime());
    expect(st).toBe("WATCH");
    expect(allowed(st)).toBe(true);
  });
  it("an unsafe half with a gap keeps its own state (the gap never relaxes it)", () => {
    expect(consultingBusinessEvidenceState(half("CRITICAL", true), half("SAFE"), null, NOW.getTime())).toBe("CRITICAL");
  });
});

describe("T: known 0 + 0 stays a genuine measured zero through the projection", () => {
  it("is complete, untouched, and severe with real burn", () => {
    const row = legacyRow({ ...burn, cashInHand: 0, bankBalance: 0 });
    const p = projectCashflowCycleRow(row);
    expect(p.cashPosition.complete).toBe(true);
    expect(computeCashflowMetrics({ ...burn, cashInHand: 0, bankBalance: 0 } as never, { now: NOW }).cashflowState).toBe("INSOLVENT_RISK");
  });
  it("fixtures: a complete WATCH really is WATCH and a complete healthy position SAFE", () => {
    expect(computeCashflowMetrics(watchComplete as never, { now: NOW }).cashflowState).toBe("WATCH");
    expect(computeCashflowMetrics(healthyComplete as never, { now: NOW }).cashflowState).toBe("SAFE");
  });
});

describe("recurrence protection — every current Cashflow reader goes through the projection", () => {
  const root = path.resolve(__dirname, "../..");
  const src = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
  const READERS = [
    "services/owner-home/owner-candidate-builder.ts",
    "services/owner-home/owner-change-facts.ts",
    "services/owner-mode/owner-action-gate.service.ts",
    "services/owner-guidance/owner-now-view.service.ts",
    "services/owner-finance/recommendation-cash-safety.service.ts",
    "services/owner-condition/business-condition.service.ts",
    "services/owner-cashflow/dashboard.service.ts",
    "services/owner-spine/provisional-cash-finance.ts",
    "app/api/owner/dashboard/route.ts",
  ];
  it("each production reader of a current Cashflow cycle calls projectCashflowCycleRow", () => {
    expect(READERS.length).toBeGreaterThan(5);
    for (const f of READERS) {
      const s = src(f);
      expect(s, f).toMatch(/ownerCashflowCycle/);
      expect(s, f).toMatch(/projectCashflowCycleRow\(/);
    }
  });
  it("no OTHER production file reads a Cashflow cycle's state unprojected (the list above is the whole inventory)", () => {
    const walk = (d: string): string[] => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".ts") || e.name.endsWith(".tsx") ? [path.join(d, e.name)] : []));
    const ALLOWED_OTHER = new Set(["services/owner-cashflow/diagnosis.service.ts", "services/owner-trust/trust.service.ts", "domain/owner-cashflow/cycle-projection.ts"]);
    const hits = walk("services").concat(walk("app/api")).filter((f) => !f.includes("__tests__") && /ownerCashflowCycle\.(findFirst|findMany)/.test(src(f)));
    const unexpected = hits.filter((f) => !READERS.includes(f.replace(/\\/g, "/")) && !ALLOWED_OTHER.has(f.replace(/\\/g, "/")));
    expect(unexpected).toEqual([]);
  });
  it("the action-gate loader carries evidence sufficiency into the constraints (the single enforcement point)", () => {
    expect(src("services/owner-mode/owner-action-gate.service.ts")).toMatch(/evidenceSufficient:\s*reading\.gateEvidenceSufficient/);
  });
  it("the Now View never derives cash safety from state alone", () => {
    expect(src("services/owner-guidance/owner-now-view.service.ts")).toMatch(/enforcedSafe && cashFinanceResolution\.gateEvidenceSufficient/);
  });
});
