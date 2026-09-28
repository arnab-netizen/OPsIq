/**
 * Round-8 policy regressions (pure):
 *   - Decision 1: evidence periods — completed / provisional (in progress) / future; provisional evidence only
 *     tightens (effective = worse(completed, provisional)), never relaxes, never proves safety alone;
 *   - Decision 2: EXECUTE is released from capacity by default (unless its lever consumes capacity), never
 *     from cash (domain spend sensitivity) or from a known below-floor margin on pricing-sensitive work;
 *     REPAIR / STABILISE in the same domains stay executable;
 *   - Decision 4: a safety-gate target's confidence is source-derived (never an unconditional 1), capped for
 *     unverified/provisional figures, high only for recorded facts, never high when unknown — and a low
 *     confidence never lowers its priority class;
 *   - every simultaneous blocker of a held step is surfaced; a do-not-repeat hold keeps the held issue visible
 *     at its own class (a survival danger never drops below customer work; a growth step never rises above
 *     missing evidence);
 *   - the Finance driver comes from the most severe findings; Finance decides when strictly worse;
 *   - an unverified reading caused by an amended Finance snapshot routes its refresh to Finance;
 *   - the Cockpit do-not-repeat annotation is derived from the gate's own constraints;
 *   - action requests: exact replay is a no-op, terminal records are locked;
 *   - continuity: a cycle on in-progress/future/amended figures never takes over engaged work;
 *   - plan-analysis softening: "first:", "next:", "no more …", and more imperative verbs;
 *   - Now View uses the gate's enforced state (stale, amended, in-progress) and its growth limits.
 */
import { describe, it, expect } from "vitest";
import {
  canonicalEligibility,
  classifyOwnerFindingCode,
  financeSurvivalDriver,
  resolveOwnerDecision,
  type OwnerDecisionCandidate,
  type ResolveOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision";
import {
  evaluateOwnerActionGate,
  NO_OWNER_GATE_CONSTRAINTS,
  type OwnerGateConstraints,
  type OwnerGateDoNotRepeatRule,
} from "@/domain/owner-mode/owner-action-gate-policy";
import { currentCashFinanceReading, UNVERIFIED_GATE_CONFIDENCE } from "@/services/owner-spine/current-cash-finance-reading";
import { evidencePeriodState } from "@/services/owner-spine/current-diagnosis-cycle";
import { neutralizePlanImperatives } from "@/domain/owner-spine/owner-imperatives";
import { ownerDnrAnnotationFromGate } from "@/services/owner-mode/do-not-repeat.service";
import { classifyActionRequest, requestMatchesRow } from "@/services/owner-mode/owner-action-transition";
import { completedEvidencePeriod, planWithContinuity } from "@/domain/founder-recovery/action-continuity";
import { ValidationError } from "@/infra/errors";
import { NO_CHANGE_FACTS } from "./change-facts-fixture";
import { assembleGuidanceContext, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";

const BIZ = "biz-1";
const WS = "ws-1";
const NOW = new Date("2026-09-27T12:00:00Z");
const DAY = 86_400_000;

function cand(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string; domain: OwnerDecisionCandidate["domain"] }): OwnerDecisionCandidate {
  const sourceId = p.sourceId ?? `${p.findingCode}-${p.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    candidateId: p.candidateId ?? `domain_action:${sourceId}`,
    businessId: BIZ, workspaceId: WS, source: p.source ?? "domain_action", domain: p.domain, sourceId,
    priorityClass: p.priorityClass ?? classifyOwnerFindingCode(p.findingCode), findingCode: p.findingCode, findingId: p.findingId ?? null,
    title: p.title, explanation: "", severity: p.severity === undefined ? "high" : p.severity, priorityScore: p.priorityScore ?? 60,
    expectedImpactScore: 50, confidence: p.confidence ?? 0.9, effortScore: 40, status: "proposed", ownerActionRequired: true, blocking: false,
    evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: false, exclusion: null, targetRoute: `/owner/${p.domain}`,
  };
}
function input(candidates: OwnerDecisionCandidate[], gate: OwnerGateConstraints | null, over: Partial<ResolveOwnerDecisionInput> = {}): ResolveOwnerDecisionInput {
  return {
    businessId: BIZ, workspaceId: WS, candidates, diagnosedDomains: ["finance", "marketing", "sales", "cashflow", "operations"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 14, reason: "test" }, changeFacts: NO_CHANGE_FACTS, gate, now: NOW, ...over,
  };
}
const gate = (over: Partial<OwnerGateConstraints>): OwnerGateConstraints => ({ ...NO_OWNER_GATE_CONSTRAINTS, ...over });
const blockedCapacity = { status: "blocked" as const, reason: "Oven at 100%", bottlenecks: ["Oven"] };
const snap = (daysAgo: number, extra: Record<string, unknown> = {}) => ({ periodStart: new Date(NOW.getTime() - (daysAgo + 30) * DAY), periodEnd: new Date(NOW.getTime() - daysAgo * DAY), ...extra });
const inProgress = { periodStart: new Date(NOW.getTime() - 10 * DAY), periodEnd: new Date(NOW.getTime() + 3 * DAY) };

describe("Decision 1 — evidence periods: completed, provisional (in progress), future", () => {
  it("classifies a period by where it sits relative to now", () => {
    expect(evidencePeriodState(snap(5), NOW)).toBe("completed");
    expect(evidencePeriodState({ periodStart: NOW, periodEnd: NOW }, NOW)).toBe("completed");
    expect(evidencePeriodState(inProgress, NOW)).toBe("provisional");
    expect(evidencePeriodState({ periodStart: new Date(NOW.getTime() + DAY), periodEnd: new Date(NOW.getTime() + 30 * DAY) }, NOW)).toBe("future");
    expect(evidencePeriodState(null, NOW)).toBeNull();
  });

  const cash = (state: string, s = snap(5)) => ({ state, snapshot: s, confidence: 0.9 });
  const fin = (state: string, extra: Record<string, unknown> = {}) => ({ state, snapshot: snap(5, extra), confidence: 0.8 });
  const prov = (c: string | null, f: string | null = null) => ({
    cash: c ? { state: c, snapshot: inProgress, confidence: 0.9 } : null,
    finance: f ? { state: f, snapshot: inProgress, confidence: 0.9 } : null,
  });

  it("an unsafe provisional reading tightens a completed SAFE reading, labelled provisional, confidence capped", () => {
    const r = currentCashFinanceReading(cash("SAFE"), fin("SAFE"), NOW.getTime(), prov("CRITICAL"));
    expect(r.gateState).toBe("CRITICAL");
    expect(r.provisional).toBe(true);
    expect(r.gateDriver).toBe("cash");
    expect(r.gateConfidence).toBeLessThanOrEqual(UNVERIFIED_GATE_CONFIDENCE);
  });

  it("a provisional SAFE/WATCH never clears or relaxes a stricter completed reading (its later period end never supersedes it)", () => {
    const r = currentCashFinanceReading(cash("CRITICAL"), fin("CRITICAL"), NOW.getTime(), prov("SAFE", "SAFE"));
    expect(r.gateState).toBe("CRITICAL");
    expect(r.provisional).toBe(false);
    const w = currentCashFinanceReading(cash("AT_RISK"), null, NOW.getTime(), prov("WATCH"));
    expect(w.gateState).toBe("AT_RISK");
  });

  it("provisional SAFE alone never claims safety (AT_RISK, unverified); provisional unsafe alone applies", () => {
    const safeOnly = currentCashFinanceReading(null, null, NOW.getTime(), prov("SAFE", "SAFE"));
    expect(safeOnly.gateState).toBe("AT_RISK");
    expect(safeOnly.gateDriver).toBe("unverified");
    expect(safeOnly.provisional).toBe(true);
    const unsafeOnly = currentCashFinanceReading(null, null, NOW.getTime(), prov(null, "INSOLVENT_RISK"));
    expect(unsafeOnly.gateState).toBe("INSOLVENT_RISK");
    expect(unsafeOnly.gateSource).toBe("finance");
  });

  it("a completed reading's confidence is its own source's; stale figures are capped", () => {
    expect(currentCashFinanceReading(cash("CRITICAL"), fin("SAFE"), NOW.getTime()).gateConfidence).toBeCloseTo(0.9);
    const stale = currentCashFinanceReading(cash("SAFE", snap(200)), null, NOW.getTime());
    expect(stale.gateState).toBe("AT_RISK");
    expect(stale.gateConfidence).toBeLessThanOrEqual(UNVERIFIED_GATE_CONFIDENCE);
  });

  it("an amended unsafe Finance reading is unverified and routes to Finance; Finance decides when strictly worse", () => {
    const amended = currentCashFinanceReading(cash("SAFE"), fin("INSOLVENT_RISK", { supersededById: "x" }), NOW.getTime());
    expect(amended.gateState).toBe("INSOLVENT_RISK");
    expect(amended.gateDriver).toBe("unverified");
    expect(amended.gateSource).toBe("finance");
    // Both current, Finance CRITICAL profit-driven, Cash flow AT_RISK: Finance decides → finance_profit.
    const worse = currentCashFinanceReading(cash("AT_RISK"), { ...fin("CRITICAL"), driver: "profit" }, NOW.getTime());
    expect(worse.gateState).toBe("CRITICAL");
    expect(worse.gateDriver).toBe("finance_profit");
    expect(worse.gateSource).toBe("finance");
  });
});

describe("the Finance driver comes from the finding(s) responsible for the state", () => {
  it("a medium payables finding next to a high negative-margin finding is profit-driven", () => {
    expect(financeSurvivalDriver([{ code: "FIN_NEGATIVE_NET_MARGIN", severity: "high" }, { code: "FIN_HIGH_PAYABLES", severity: "medium" }])).toBe("profit");
  });
  it("a critical runway finding makes it cash-driven; equally severe cash and profit findings count as cash", () => {
    expect(financeSurvivalDriver([{ code: "FIN_NEGATIVE_NET_MARGIN", severity: "high" }, { code: "FIN_LOW_RUNWAY", severity: "critical" }])).toBe("cash");
    expect(financeSurvivalDriver([{ code: "FIN_NEGATIVE_NET_MARGIN", severity: "high" }, { code: "FIN_LOW_RUNWAY", severity: "high" }])).toBe("cash");
    expect(financeSurvivalDriver([])).toBeNull();
  });
});

describe("Decision 2 — EXECUTE: released from capacity by default, never from cash or margin", () => {
  const verdict = (c: OwnerGateConstraints, domain: string, intent: "EXECUTE" | "REPAIR" | "STABILISE", findingCode: string | null) =>
    evaluateOwnerActionGate(c, { domain, intent, findingId: null, findingCode });

  it("EXECUTE + unsafe capacity only → not blocked unless its lever consumes capacity", () => {
    const c = gate({ capacity: blockedCapacity });
    expect(verdict(c, "operations", "EXECUTE", "OPS_SOP_NONCOMPLIANCE").allowed).toBe(true);
    expect(verdict(c, "sop", "EXECUTE", "SOP_HIGH_OVERDUE").allowed).toBe(true);
    const consuming = verdict(c, "operations", "EXECUTE", "OPS_OPP_RECOVER_DELAYS");
    expect(consuming).toMatchObject({ allowed: false, code: "CAPACITY_BLOCKED" });
  });

  it("EXECUTE + cash-sensitive spend at unsafe cash → blocked (the domain's normal spend sensitivity, never forced GENERAL)", () => {
    const c = gate({ cash: { gateState: "AT_RISK", basis: "", driver: "cash" } });
    expect(verdict(c, "operations", "EXECUTE", "OPS_SOP_NONCOMPLIANCE")).toMatchObject({ allowed: false, code: "CASH_SAFETY_BLOCKED" });
  });

  it("EXECUTE + genuinely pricing-sensitive work below the margin floor → blocked; non-pricing EXECUTE in a sales domain is not", () => {
    const c = gate({ grossMarginPct: 5 });
    expect(verdict(c, "sales", "EXECUTE", "SALES_OPP_WINBACK")).toMatchObject({ allowed: false, code: "MARGIN_SAFETY_BLOCKED" });
    expect(verdict(c, "sales", "EXECUTE", "OPS_SOP_NONCOMPLIANCE").allowed).toBe(true);
  });

  it("REPAIR / STABILISE in the same domains stay executable under every growth limit", () => {
    const c = gate({ capacity: blockedCapacity, cash: { gateState: "CRITICAL", basis: "", driver: "cash" }, grossMarginPct: 5 });
    expect(verdict(c, "sales", "REPAIR", "SALES_OPP_TIGHTEN_DISCOUNT").allowed).toBe(true);
    expect(verdict(c, "operations", "STABILISE", "OPS_CAPACITY_BOTTLENECK").allowed).toBe(true);
    expect(verdict(c, "finance", "REPAIR", "FIN_NEGATIVE_NET_MARGIN").allowed).toBe(true);
  });

  it("a blocked verdict lists every failing check, the first one naming it", () => {
    const c = gate({ capacity: blockedCapacity, cash: { gateState: "AT_RISK", basis: "", driver: "unverified" }, grossMarginPct: 5, expiredCompliance: { name: "Trade licence", kind: "licence" } });
    const v = evaluateOwnerActionGate(c, { domain: "marketing", intent: "GROW", findingId: null, findingCode: "MKT_OPP_SCALE_WINNER" });
    expect(v.allowed).toBe(false);
    if (v.allowed) return;
    expect(v.code).toBe("CAPACITY_BLOCKED");
    expect(v.blocks.map((b) => b.code)).toEqual(["CAPACITY_BLOCKED", "CASH_SAFETY_BLOCKED", "MARGIN_SAFETY_BLOCKED", "COMPLIANCE_BLOCKED"]);
  });
});

const broad = (domain: string, id = `rule-${domain}`): OwnerGateDoNotRepeatRule => ({ id, domain, match: "broad", findingId: null, memoryKey: `scope:${domain}`, summary: "Paid ads burst", reason: "Lost money last time" });
const exact = (domain: string, findingId: string, id = `rule-exact-${domain}`): OwnerGateDoNotRepeatRule => ({ id, domain, match: "exact", findingId, memoryKey: `scope:${domain}:finding:${findingId}`, summary: "Same fix failed", reason: "Did not work" });

describe("canonical decision: every simultaneous blocker surfaced; a do-not-repeat hold never hides the issue", () => {
  it("a growth step held by a do-not-repeat rule AND unverified cash → both blockers are targets", () => {
    const scale = cand({ domain: "marketing", findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign" });
    const d = resolveOwnerDecision(input([scale], gate({ doNotRepeat: [broad("marketing")], cash: { gateState: "AT_RISK", basis: "", driver: "unverified", confidence: 0.3 } })));
    const codes = d.attention.map((t) => t.findingCode);
    expect(codes).toContain("GATE_DO_NOT_REPEAT_REVIEW");
    expect(codes).toContain("GATE_CASH_UNVERIFIED");
  });

  it("an exact do-not-repeat rule on a cash-survival step keeps the cash danger first (never below customer work)", () => {
    const runway = cand({ domain: "cashflow", findingCode: "CF_LOW_RUNWAY", title: "Extend the cash runway", findingId: "f-runway", severity: "critical" });
    const complaints = cand({ domain: "sales", findingCode: "SALES_HIGH_COMPLAINT_RATIO", title: "Fix the complaint spike" });
    const d = resolveOwnerDecision(input([runway, complaints], gate({ doNotRepeat: [exact("cashflow", "f-runway")] })));
    expect(d.primaryTarget).toMatchObject({ source: "safety_gate", findingCode: "GATE_DO_NOT_REPEAT_REVIEW", priorityClass: "SURVIVAL_CASH", severity: "critical" });
    // Round 9: the target names the ISSUE (its class), quoting the held step as the one marked do-not-repeat.
    expect(d.primaryTarget!.title).toMatch(/is still open, and its planned step "Extend the cash runway" is marked do-not-repeat/);
    expect(d.primaryTarget!.explanation).toMatch(/The problem is still open/);
  });

  it("a do-not-repeat rule holding a growth step never lifts it above missing evidence", () => {
    const scale = cand({ domain: "marketing", findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign" });
    const missing = cand({ domain: "finance", findingCode: "FIN_MISSING_CRITICAL_DATA", title: "Enter the missing Finance figures" });
    const d = resolveOwnerDecision(input([scale, missing], gate({ doNotRepeat: [broad("marketing")] })));
    expect(d.primaryTarget!.findingCode).toBe("FIN_MISSING_CRITICAL_DATA");
    const review = d.attention.find((t) => t.findingCode === "GATE_DO_NOT_REPEAT_REVIEW")!;
    expect(review.priorityClass).toBe("GROWTH_OPPORTUNITY");
  });

  it("an unverified reading caused by an amended Finance snapshot routes its refresh to Finance", () => {
    const scale = cand({ domain: "marketing", findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign" });
    const d = resolveOwnerDecision(input([scale], gate({ cash: { gateState: "CRITICAL", basis: "", driver: "unverified", source: "finance", confidence: 0.3 } })));
    expect(d.primaryTarget).toMatchObject({ findingCode: "GATE_CASH_UNVERIFIED", domain: "finance", targetRoute: "/owner/finance" });
  });
});

describe("Decision 4 — a safety-gate target's confidence reflects its evidence", () => {
  const scale = cand({ domain: "marketing", findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", confidence: 0.85 });
  const target = (g: OwnerGateConstraints, over: Partial<ResolveOwnerDecisionInput> = {}) => resolveOwnerDecision(input([scale], g, over));

  it("a snapshot-driven cash blocker carries the reading's own confidence (never 1)", () => {
    const d = target(gate({ cash: { gateState: "CRITICAL", basis: "", driver: "cash", confidence: 0.62 } }));
    expect(d.primaryTarget!.findingCode).toBe("GATE_CASH_UNSAFE");
    expect(d.confidence.score).toBe(62);
  });

  it("stale / unverified / provisional figures are capped at 0.4 — the class stays SURVIVAL / evidence (never lowered)", () => {
    const prov = target(gate({ cash: { gateState: "CRITICAL", basis: "", driver: "cash", confidence: 0.4, provisional: true } }));
    expect(prov.primaryTarget!.priorityClass).toBe("SURVIVAL_CASH");
    expect(prov.confidence.score).toBeLessThanOrEqual(40);
    expect(prov.confidence.reasons.join(" ")).toMatch(/in-progress figures/);
  });

  it("unknown evidence is never high confidence; a known margin reading carries its snapshot's confidence", () => {
    expect(target(gate({ cash: { gateState: "CRITICAL", basis: "", driver: "cash" } })).confidence.score).toBeLessThanOrEqual(40);
    const margin = target(gate({ grossMarginPct: 5, grossMarginConfidence: 0.7 }));
    expect(margin.primaryTarget!.findingCode).toBe("GATE_MARGIN_BELOW_FLOOR");
    expect(margin.confidence.score).toBe(70);
  });

  it("a data-derived blocker is capped by business-wide data sufficiency; a recorded fact (expired obligation) is not", () => {
    const insufficient = { dataSufficiency: { status: "insufficient" as const, lowestDataConfidenceScore: 20, lowConfidenceDomains: [], missingCriticalData: [] } };
    expect(target(gate({ grossMarginPct: 5, grossMarginConfidence: 0.9 }), insufficient).confidence.score).toBe(40);
    const compliance = target(gate({ expiredCompliance: { name: "Trade licence", kind: "licence" } }), insufficient);
    expect(compliance.primaryTarget!.findingCode).toBe("GATE_COMPLIANCE_EXPIRED");
    expect(compliance.confidence.score).toBe(100);
  });

  it("an exact recorded do-not-repeat rule is a recorded fact (high) — but a held DANGER keeps its own evidence confidence (Round 9); a broad rule carries the held work's confidence", () => {
    const fix = cand({ domain: "operations", findingCode: "OPS_HIGH_REWORK", title: "Cut rework", findingId: "f-rw", confidence: 0.55 });
    const exactD = canonicalEligibility([fix], { businessId: BIZ, workspaceId: WS, gate: gate({ doNotRepeat: [exact("operations", "f-rw")] }) });
    expect(exactD.ranked.find((c) => c.source === "safety_gate")!.confidence).toBe(0.55);
    const growth = cand({ domain: "marketing", findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale", findingId: "f-g", confidence: 0.55 });
    const exactGrowth = canonicalEligibility([growth], { businessId: BIZ, workspaceId: WS, gate: gate({ doNotRepeat: [exact("marketing", "f-g")] }) });
    expect(exactGrowth.ranked.find((c) => c.source === "safety_gate")!.confidence).toBe(1);
    const broadD = canonicalEligibility([scale], { businessId: BIZ, workspaceId: WS, gate: gate({ doNotRepeat: [broad("marketing")] }) });
    expect(broadD.ranked.find((c) => c.source === "safety_gate")!.confidence).toBe(0.85);
  });
});

describe("the Cockpit do-not-repeat annotation comes from the gate's own constraints", () => {
  const t = (over: Partial<{ source: string; domain: string; findingId: string | null; findingCode: string; intent: "GROW" | "REPAIR" | "EVIDENCE" | null }>) => ({
    source: "domain_action", domain: "marketing", findingId: null, findingCode: "MKT_OPP_SCALE_WINNER", intent: "GROW" as const, ...over,
  });
  it("opted out, or no rule in force for the target's domain → no annotation", () => {
    expect(ownerDnrAnnotationFromGate(gate({ optedOut: true, doNotRepeat: [broad("marketing")] }), t({}))).toBeNull();
    expect(ownerDnrAnnotationFromGate(gate({ doNotRepeat: [broad("sales")] }), t({}))).toBeNull();
    expect(ownerDnrAnnotationFromGate(null, t({}))).toBeNull();
  });
  it("a step the gate allows is never claimed to be held (an area rule is history only)", () => {
    const a = ownerDnrAnnotationFromGate(gate({ doNotRepeat: [broad("marketing")] }), t({ findingCode: "MKT_POOR_CONVERSION", intent: "REPAIR" }));
    expect(a).toMatchObject({ blocked: true, areaOnly: true, holdsBackTarget: false });
  });
  it("the review target of a rule holding work says it holds it back — the rule it carries (Round 9: never a guess)", () => {
    const a = ownerDnrAnnotationFromGate(gate({ doNotRepeat: [broad("marketing")] }), { ...t({ source: "safety_gate", findingCode: "GATE_DO_NOT_REPEAT_REVIEW", intent: "EVIDENCE" }), ruleId: "rule-marketing" });
    expect(a).toMatchObject({ holdsBackTarget: true, priorActionSummary: "Paid ads burst", matchedScope: "scope:marketing", ruleId: "rule-marketing" });
    // A review target that names no rule is annotated with none (no rule of the area is substituted).
    expect(ownerDnrAnnotationFromGate(gate({ doNotRepeat: [broad("marketing")] }), t({ source: "safety_gate", findingCode: "GATE_DO_NOT_REPEAT_REVIEW", intent: "EVIDENCE" }))).toBeNull();
  });
});

describe("action requests: exact replay is a no-op; completed and cancelled records are locked", () => {
  const completed = { status: "completed", completionNotes: "Done", completionEvidence: ["receipt.pdf"], assignedTo: "u1" };
  it("an exact replay of the recorded state is a replay; a different payload on a completed action is refused", () => {
    expect(classifyActionRequest(completed, { status: "completed", completionNotes: "Done", completionEvidence: ["receipt.pdf"] })).toBe("replay");
    expect(() => classifyActionRequest(completed, { completionEvidence: ["other.pdf"] })).toThrow(ValidationError);
    expect(() => classifyActionRequest(completed, { status: "completed", completionNotes: "Changed" })).toThrow(ValidationError);
    expect(() => classifyActionRequest({ ...completed, status: "cancelled" }, { assignedTo: "u2" })).toThrow(ValidationError);
  });
  it("a non-terminal action applies; payload comparison is exact (arrays, nulls, dates)", () => {
    expect(classifyActionRequest({ status: "assigned" }, { status: "in_progress" })).toBe("apply");
    expect(requestMatchesRow({ a: [1, 2], d: new Date("2026-01-01T00:00:00Z") }, { a: [1, 2], d: "2026-01-01T00:00:00.000Z" })).toBe(true);
    expect(requestMatchesRow({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});

describe("continuity: a cycle on in-progress, future or amended figures never takes over engaged work", () => {
  const planned = [{ findingCode: "CF_LOW_RUNWAY", recommendationCode: "R1" }];
  const engaged = [{ id: "a1", findingCode: "CF_LOW_RUNWAY", recommendationCode: "R1", periodEnd: new Date(NOW.getTime() - 5 * DAY) }];
  it("completed evidence is a period that has ended and was not amended", () => {
    expect(completedEvidencePeriod({ periodEnd: new Date(NOW.getTime() - DAY) }, NOW)).toBe(true);
    expect(completedEvidencePeriod({ periodEnd: new Date(NOW.getTime() + DAY) }, NOW)).toBe(false);
    expect(completedEvidencePeriod({ periodEnd: new Date(NOW.getTime() - DAY), supersededById: "x" }, NOW)).toBe(false);
  });
  it("not completed → every match held on its cycle; the new cycle gets its own fresh proposals", () => {
    const r = planWithContinuity(planned, engaged, { current: new Date(NOW.getTime() + 3 * DAY), currentCompleted: false, of: (p) => p.periodEnd });
    expect(r.carried).toEqual([]);
    expect(r.held.map((h) => h.prior.id)).toEqual(["a1"]);
    expect(r.toCreate).toEqual(planned);
  });
  it("completed and newer → carried; completed and older (back-fill) → held, not duplicated", () => {
    expect(planWithContinuity(planned, engaged, { current: NOW, currentCompleted: true, of: (p) => p.periodEnd }).carried).toHaveLength(1);
    const back = planWithContinuity(planned, engaged, { current: new Date(NOW.getTime() - 40 * DAY), currentCompleted: true, of: (p) => p.periodEnd });
    expect(back.held).toHaveLength(1);
    expect(back.toCreate).toEqual([]);
  });
});

describe("plan-analysis softening", () => {
  it.each([
    ["Protect cash first: stop discretionary spend.", "Protect cash: the plan analysis holds back discretionary spend."],
    ["Stabilise cash and margin first: compute the reserve.", "Stabilise cash and margin: compute the reserve."],
    ["Do the cash-survival action next: stabilize cash before anything else.", "Do the cash-survival action: stabilize cash."],
    ["Start collecting overdue invoices immediately.", "Start collecting overdue invoices."],
    ["Hold growth; stabilise the gates first.", "Hold growth; stabilise the gates."],
    ["No more new campaigns until cash is safe.", "the plan analysis holds back new campaigns until cash is safe."],
    ["Do not hire this quarter.", "the plan analysis holds back hire this quarter."],
  ])("%s", (from, to) => {
    expect(neutralizePlanImperatives(from).text).toBe(to);
  });
  it.each(["No more than two hires this quarter.", "Revenue dropped immediately after the price rise.", "The loan is repaid first."])("facts are left as written: %s", (t) => {
    expect(neutralizePlanImperatives(t).text).toBe(t);
  });
});

// ─── Now View parity with the gate (Decision 1, P1 "Now View parity") ───────────────────────────────────


const CLOCK = 1_900_000_000_000;
type CycleRow = { state: string; periodEndDaysAgo: number; periodStartDaysAgo?: number; superseded?: boolean; findings?: Array<{ code: string; severity: string }> };
/** Mock cycle delegates that apply the period filter as Postgres would (completed vs in-progress reads). */
function nowViewDeps(rows: { cash?: CycleRow[]; fin?: CycleRow[] }): GuidanceDeps {
  type CycleQuery = { where?: { snapshot?: { periodStart?: { lte?: Date }; periodEnd?: { lte?: Date; gt?: Date } } } };
  const pick = (list: CycleRow[] | undefined, args: CycleQuery) => {
    const sn = args?.where?.snapshot ?? {};
    const now = CLOCK;
    const rowsIn = (list ?? []).filter((r) => {
      const end = now - r.periodEndDaysAgo * DAY;
      const start = now - (r.periodStartDaysAgo ?? r.periodEndDaysAgo + 30) * DAY;
      if (sn.periodStart?.lte && sn.periodEnd?.gt) return start <= now && end > now;
      if (sn.periodEnd?.lte) return end <= now;
      return true;
    });
    return rowsIn[0] ?? null;
  };
  const snap = (r: CycleRow) => ({
    periodStart: new Date(CLOCK - (r.periodStartDaysAgo ?? r.periodEndDaysAgo + 30) * DAY),
    periodEnd: new Date(CLOCK - r.periodEndDaysAgo * DAY),
    supersededById: r.superseded ? "newer" : null,
  });
  return {
    uuid: () => "00000000-0000-0000-0000-000000000001",
    now: () => CLOCK,
    db: {
      ownerCashflowCycle: { findFirst: async (a: CycleQuery) => { const r = pick(rows.cash, a); return r ? { cashflowState: r.state, dataConfidenceScore: 90, snapshot: snap(r) } : null; } },
      ownerFinanceCycle: { findFirst: async (a: CycleQuery) => { const r = pick(rows.fin, a); return r ? { survivalState: r.state, dataConfidenceScore: 90, snapshot: snap(r), findings: r.findings ?? [] } : null; } },
      ownerEmployeeWorkloadSnapshot: { findFirst: async () => null },
      ownerWorkloadSnapshot: { findFirst: async () => null },
      ownerCapacitySnapshot: { findFirst: async () => ({ growthSafe: true, expansionTriggered: false, bottleneckUtilization: 0.4 }) },
      ownerMetricSnapshot: { findFirst: async () => ({ complaintCount: 0, rewashCount: 0, refundAmount: 0, newCustomers: 10, repeatCustomers: 30, revenue: 100000 }) },
      ownerSupplierInventorySnapshot: { findFirst: async () => ({ worstStockoutRisk: "NONE", riskScore: 0, supplyCutoffRisk: false, belowReorderCount: 0 }) },
      ownerBusiness: { findFirst: async () => ({ businessType: "laundry_local_service" }) },
      proof: { count: async () => 0 },
      ownerActionOutcome: { count: async () => 0 },
      ownerReassessmentEvent: { count: async () => 0 },
      ownerGuidanceSnapshot: { findFirst: async () => null as never, create: async (a: { data: Record<string, unknown> }) => a.data },
    },
  } as unknown as GuidanceDeps;
}

describe("Now View uses the gate's enforced state: never safer than the gate, never 'growth ready' while it holds growth", () => {
  it("current SAFE/SAFE → growth ready (the baseline, with the gate's constraints — Round 9: never without them)", async () => {
    const { ctx, state } = await assembleGuidanceContext("ws", "biz", nowViewDeps({ cash: [{ state: "SAFE", periodEndDaysAgo: 5 }], fin: [{ state: "SAFE", periodEndDaysAgo: 5 }] }), gate({}));
    expect(ctx.cashSafe).toBe(true);
    expect(state.growthReadinessTier).toBe("GROWTH_READY");
  });

  it("out-of-date SAFE/SAFE → not safe, a stated cash issue and a missing-data request (the gate enforces AT_RISK)", async () => {
    const { ctx, state } = await assembleGuidanceContext("ws", "biz", nowViewDeps({ cash: [{ state: "SAFE", periodEndDaysAgo: 100 }], fin: [{ state: "SAFE", periodEndDaysAgo: 100 }] }));
    expect(ctx.cashSafe).toBe(false);
    expect(state.growthReadinessTier).toBe("STABILIZE_FIRST");
    expect(ctx.issues.some((i) => i.id === "cash_unverified")).toBe(true);
    expect(ctx.missingCriticalData.join(" ")).toMatch(/out of date/);
  });

  it("cash SAFE + an amended INSOLVENT_RISK Finance reading → a stated danger, never safe", async () => {
    const { ctx, state, cashFinanceEffectiveState } = await assembleGuidanceContext("ws", "biz", nowViewDeps({ cash: [{ state: "SAFE", periodEndDaysAgo: 5 }], fin: [{ state: "INSOLVENT_RISK", periodEndDaysAgo: 5, superseded: true }] }));
    expect(ctx.cashSafe).toBe(false);
    expect(state.growthReadinessTier).toBe("STABILIZE_FIRST");
    expect(ctx.issues.find((i) => i.id === "finance_amended")).toMatchObject({ severity: "CRITICAL" });
    expect(cashFinanceEffectiveState).toBe("INSOLVENT_RISK");
  });

  it("an in-progress CRITICAL cash reading over completed SAFE → tightened, labelled in progress; an in-progress SAFE never relaxes a completed CRITICAL", async () => {
    const tight = await assembleGuidanceContext("ws", "biz", nowViewDeps({
      cash: [{ state: "CRITICAL", periodEndDaysAgo: -5, periodStartDaysAgo: 10 }, { state: "SAFE", periodEndDaysAgo: 5 }],
      fin: [{ state: "SAFE", periodEndDaysAgo: 5 }],
    }));
    expect(tight.ctx.cashSafe).toBe(false);
    expect(tight.ctx.issues.find((i) => i.id === "cash_in_progress")!.headline).toMatch(/in progress/);
    const loose = await assembleGuidanceContext("ws", "biz", nowViewDeps({
      cash: [{ state: "SAFE", periodEndDaysAgo: -5, periodStartDaysAgo: 10 }, { state: "CRITICAL", periodEndDaysAgo: 5 }],
      fin: [{ state: "CRITICAL", periodEndDaysAgo: 5 }],
    }));
    expect(loose.ctx.cashSafe).toBe(false);
    expect(loose.cashFinanceEffectiveState).toBe("CRITICAL");
  });

  it("the gate's own growth limits (here a known below-floor margin) keep Now View from 'growth ready'", async () => {
    const deps = nowViewDeps({ cash: [{ state: "SAFE", periodEndDaysAgo: 5 }], fin: [{ state: "SAFE", periodEndDaysAgo: 5 }] });
    const held = await assembleGuidanceContext("ws", "biz", deps, gate({ grossMarginPct: 5 }));
    expect(held.state.growthReadinessTier).toBe("STABILIZE_FIRST");
    const free = await assembleGuidanceContext("ws", "biz", deps, gate({}));
    expect(free.state.growthReadinessTier).toBe("GROWTH_READY");
  });
});
