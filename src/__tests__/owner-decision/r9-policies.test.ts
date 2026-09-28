/**
 * Round 9 — pure regressions for the remaining implementation-consistency defects (each fails against the
 * frozen 8c1d5762 tree and passes now):
 *   - terminal continuity: completed held work suppresses its newer duplicate proposal until newer evidence;
 *   - an out-of-date second source never decides the Owner gate at full confidence;
 *   - Now View parity on amended SAFE/WATCH and amended INSOLVENT Finance; no gate → never growth ready;
 *   - margin / capacity / do-not-repeat blocker confidence from their own evidence;
 *   - do-not-repeat exact-rule propagation (target → annotation) and the danger issue kept;
 *   - every blocker named for planning; do-not-repeat review never outranks critical missing evidence;
 *   - plan softening leaves factual prose alone;
 *   - Home: a profit-driven in-progress Finance reading tightens the FINANCIAL card, never the cash card.
 */
import { describe, it, expect } from "vitest";
import {
  canonicalEligibility,
  classifyOwnerFindingCode,
  ownerDnrRuleRoute,
  ownerGateHoldsText,
  resolveOwnerDecision,
  type OwnerDecisionCandidate,
  type ResolveOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision";
import {
  capacityConstraint,
  evaluateOwnerActionGate,
  NO_OWNER_GATE_CONSTRAINTS,
  type OwnerGateConstraints,
  type OwnerGateDoNotRepeatRule,
} from "@/domain/owner-mode/owner-action-gate-policy";
import { marginConfidence } from "@/services/owner-mode/owner-action-gate.service";
import { currentCashFinanceReading, UNVERIFIED_GATE_CONFIDENCE } from "@/services/owner-spine/current-cash-finance-reading";
import { neutralizePlanImperatives } from "@/domain/owner-spine/owner-imperatives";
import { ownerDnrAnnotationFromGate } from "@/services/owner-mode/do-not-repeat.service";
import { continuityKey, evidencePostdatesCompletion, readTimeContinuity } from "@/domain/founder-recovery/action-continuity";
import { buildOwnerHomeSummary } from "@/domain/owner-home/summary";
import { assembleGuidanceContext, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";
import { NO_CHANGE_FACTS } from "./change-facts-fixture";

const BIZ = "biz-1";
const WS = "ws-1";
const NOW = new Date("2026-09-27T12:00:00Z");
const DAY = 86_400_000;

function cand(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string; domain: OwnerDecisionCandidate["domain"] }): OwnerDecisionCandidate {
  const sourceId = p.sourceId ?? `${p.findingCode}-${p.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    candidateId: p.candidateId ?? `${p.source ?? "domain_action"}:${sourceId}`,
    businessId: BIZ, workspaceId: WS, source: p.source ?? "domain_action", domain: p.domain, sourceId,
    priorityClass: p.priorityClass ?? classifyOwnerFindingCode(p.findingCode), findingCode: p.findingCode, findingId: p.findingId ?? null,
    title: p.title, explanation: p.explanation ?? "", severity: p.severity === undefined ? "high" : p.severity, priorityScore: p.priorityScore ?? 60,
    expectedImpactScore: 50, confidence: p.confidence ?? 0.9, effortScore: 40, status: p.status ?? "proposed", ownerActionRequired: true, blocking: false,
    evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: false, exclusion: null, targetRoute: `/owner/${p.domain}`,
    ...(p.issueTitle !== undefined ? { issueTitle: p.issueTitle } : {}),
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
const broad = (domain: string, id = `00000000-0000-4000-8000-00000000000${domain.length % 10}`): OwnerGateDoNotRepeatRule =>
  ({ id, domain, match: "broad", findingId: null, memoryKey: `scope:${domain}`, summary: "Paid ads burst", reason: "Lost money last time" });
const exact = (domain: string, findingId: string, id = "11111111-1111-4111-8111-111111111111"): OwnerGateDoNotRepeatRule =>
  ({ id, domain, match: "exact", findingId, memoryKey: `scope:${domain}:finding:${findingId}`, summary: "Chasing via the agency failed", reason: "Did not work" });
const snap = (daysAgo: number, extra: Record<string, unknown> = {}) => ({ periodStart: new Date(NOW.getTime() - (daysAgo + 30) * DAY), periodEnd: new Date(NOW.getTime() - daysAgo * DAY), ...extra });

// ─── P1-1: terminal continuity ────────────────────────────────────────────────────────────────────────────
describe("P1-1 — completed held work never disappears and reappears as duplicate work", () => {
  type Row = { id: string; cycleId: string; status: string; completedAt?: Date | null; findingCode: string; recommendationCode: string };
  const key = (a: Row) => continuityKey({ findingCode: a.findingCode, recommendationCode: a.recommendationCode });
  const code = (a: Row) => a.findingCode;
  // September's cycle (period ended 27 days ago) was diagnosed 14 days BEFORE its period ended — while in
  // progress — so its proposal X' predates the owner's completion of X (on August's cycle) 20 days ago.
  const sept = { id: "c-sep", createdAt: new Date(NOW.getTime() - 41 * DAY), periodEnd: new Date(NOW.getTime() - 27 * DAY), raisedCodes: new Set(["CF_OVERDUE", "CF_OTHER"]) };
  const X: Row = { id: "x", cycleId: "c-aug", status: "completed", completedAt: new Date(NOW.getTime() - 35 * DAY), findingCode: "CF_OVERDUE", recommendationCode: "CHASE" };
  const Xdup: Row = { id: "x2", cycleId: "c-sep", status: "proposed", findingCode: "CF_OVERDUE", recommendationCode: "CHASE" };
  const other: Row = { id: "o", cycleId: "c-sep", status: "proposed", findingCode: "CF_OTHER", recommendationCode: "OTHER" };

  it("1 — old held action completed → the newer duplicate proposal is not live work; the completion stays in view", () => {
    const r = readTimeContinuity(sept, [Xdup, other], [X], key, code);
    expect(r.own.map((a) => a.id)).toEqual(["o"]);
    expect(r.completedEarlier.map((a) => a.id)).toEqual(["x"]);
  });

  it("2 — genuinely newer evidence (diagnosed after the completion, period ending after it) re-raises it", () => {
    const newer = { ...sept, createdAt: new Date(NOW.getTime() - 2 * DAY), periodEnd: new Date(NOW.getTime() - 3 * DAY) };
    expect(evidencePostdatesCompletion(newer, X.completedAt)).toBe(true);
    const r = readTimeContinuity(newer, [Xdup, other], [X], key, code);
    expect(r.own.map((a) => a.id).sort()).toEqual(["o", "x2"]);
    expect(r.completedEarlier).toEqual([]);
  });

  it("3 — completed UNRELATED work suppresses nothing", () => {
    const unrelated: Row = { ...X, id: "u", findingCode: "CF_UNRELATED", recommendationCode: "U" };
    const r = readTimeContinuity(sept, [Xdup, other], [unrelated], key, code);
    expect(r.own.map((a) => a.id).sort()).toEqual(["o", "x2"]);
  });

  it("4 — a CANCELLED action is not completion: it never suppresses a proposal", () => {
    const cancelled: Row = { ...X, id: "c", status: "cancelled", completedAt: null };
    const r = readTimeContinuity(sept, [Xdup, other], [cancelled], key, code);
    expect(r.own.map((a) => a.id).sort()).toEqual(["o", "x2"]);
    expect(r.completedEarlier).toEqual([]);
  });

  it("engaged work still follows (and replaces the never-engaged copy); a proposal the owner engaged on stays", () => {
    const engaged: Row = { ...X, id: "e", status: "in_progress", completedAt: null };
    expect(readTimeContinuity(sept, [Xdup, other], [engaged], key, code).own.map((a) => a.id)).toEqual(["o"]);
    const engagedDup: Row = { ...Xdup, status: "assigned" };
    expect(readTimeContinuity(sept, [engagedDup, other], [X], key, code).own.map((a) => a.id).sort()).toEqual(["o", "x2"]);
  });
});

// ─── P1-3: an out-of-date second source ───────────────────────────────────────────────────────────────────
describe("P1-3 — an out-of-date second source never decides the Owner gate at full confidence", () => {
  const now = NOW.getTime();
  it("current SAFE cash + a 200-day-old CRITICAL profit-driven Finance → unverified, Finance refresh, ≤ 0.4 — never a 0.95 profit target", () => {
    const r = currentCashFinanceReading(
      { state: "SAFE", snapshot: snap(5), confidence: 0.9 },
      { state: "CRITICAL", snapshot: snap(200), driver: "profit", confidence: 0.95 },
      now
    );
    expect(r.gateState).toBe("CRITICAL"); // the fail-safe keeps the last-known danger
    expect(r.gateDriver).toBe("unverified");
    expect(r.gateSource).toBe("finance");
    expect(r.gateConfidence).toBeLessThanOrEqual(UNVERIFIED_GATE_CONFIDENCE);
    expect(r.financeCurrent).toBe(false);
    expect(r.cashCurrent).toBe(true);
  });
  it("a 200-day-old CRITICAL cash + current AT_RISK Finance → unverified, Cash flow refresh, ≤ 0.4", () => {
    const r = currentCashFinanceReading({ state: "CRITICAL", snapshot: snap(200), confidence: 0.95 }, { state: "AT_RISK", snapshot: snap(5), driver: "cash", confidence: 0.8 }, now);
    expect(r).toMatchObject({ gateState: "CRITICAL", gateDriver: "unverified", gateSource: "cashflow" });
    expect(r.gateConfidence).toBeLessThanOrEqual(UNVERIFIED_GATE_CONFIDENCE);
  });
  it("when a CURRENT source supports the enforced state, it decides — at its own confidence", () => {
    const r = currentCashFinanceReading({ state: "CRITICAL", snapshot: snap(5), confidence: 0.8 }, { state: "CRITICAL", snapshot: snap(200), driver: "cash", confidence: 0.95 }, now);
    expect(r).toMatchObject({ gateState: "CRITICAL", gateDriver: "cash", gateSource: "cashflow", gateConfidence: 0.8 });
  });
  it("the gate names it as figures to confirm (routed to the stale source), never a cash/profit fix", () => {
    const scale = cand({ domain: "marketing", findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign" });
    const r = currentCashFinanceReading({ state: "SAFE", snapshot: snap(5), confidence: 0.9 }, { state: "CRITICAL", snapshot: snap(200), driver: "profit", confidence: 0.95 }, now);
    const d = resolveOwnerDecision(input([scale], gate({ cash: { gateState: r.gateState as never, basis: "", driver: r.gateDriver, confidence: r.gateConfidence, source: r.gateSource } })));
    expect(d.primaryTarget).toMatchObject({ findingCode: "GATE_CASH_UNVERIFIED", domain: "finance" });
    expect(d.confidence.score).toBeLessThanOrEqual(40);
  });
});

// ─── P1-4 + amended INSOLVENT + mandatory gate: Now View parity ───────────────────────────────────────────
const CLOCK = 1_900_000_000_000;
type CycleRow = { state: string; periodEndDaysAgo: number; superseded?: boolean };
function nowViewDeps(rows: { cash?: CycleRow[]; fin?: CycleRow[] }, withGate: OwnerGateConstraints | null = null): GuidanceDeps {
  type Q = { where?: { snapshot?: { periodStart?: { lte?: Date }; periodEnd?: { lte?: Date; gt?: Date } } } };
  const pick = (list: CycleRow[] | undefined, a: Q) => {
    const sn = a?.where?.snapshot ?? {};
    return (list ?? []).find((r) => {
      const end = CLOCK - r.periodEndDaysAgo * DAY;
      if (sn.periodStart?.lte && sn.periodEnd?.gt) return end > CLOCK;
      if (sn.periodEnd?.lte) return end <= CLOCK;
      return true;
    }) ?? null;
  };
  const snapOf = (r: CycleRow) => ({ periodStart: new Date(CLOCK - (r.periodEndDaysAgo + 30) * DAY), periodEnd: new Date(CLOCK - r.periodEndDaysAgo * DAY), supersededById: r.superseded ? "newer" : null });
  return {
    uuid: () => "00000000-0000-0000-0000-000000000001",
    now: () => CLOCK,
    ...(withGate ? { ownerGate: async () => withGate } : {}),
    db: {
      ownerCashflowCycle: { findFirst: async (a: Q) => { const r = pick(rows.cash, a); return r ? { cashflowState: r.state, dataConfidenceScore: 90, snapshot: snapOf(r) } : null; } },
      ownerFinanceCycle: { findFirst: async (a: Q) => { const r = pick(rows.fin, a); return r ? { survivalState: r.state, dataConfidenceScore: 90, snapshot: snapOf(r), findings: [] } : null; } },
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

describe("P1-4 — Now View matches the gate on amended Finance; a missing gate is never 'growth ready'", () => {
  it("amended SAFE Finance, no current cash check → a stated unverified danger (never OK), growth not ready, low confidence", async () => {
    const { ctx, state } = await assembleGuidanceContext("ws", "biz", nowViewDeps({ fin: [{ state: "SAFE", periodEndDaysAgo: 5, superseded: true }] }, gate({})));
    const issue = ctx.issues.find((i) => i.id === "finance_amended")!;
    expect(issue.category).toBe("CASH_DANGER");
    expect(issue.headline).toMatch(/amended/);
    expect(issue.headline).toMatch(/cannot treat cash as safe/);
    expect(ctx.cashSafe).toBe(false);
    expect(state.growthReadinessTier).toBe("STABILIZE_FIRST");
    expect(ctx.dataConfidence).not.toBe("HIGH");
  });
  it("amended SAFE Finance + an out-of-date SAFE cash check → still a stated danger (the gate is AT_RISK, unverified)", async () => {
    const { ctx } = await assembleGuidanceContext("ws", "biz", nowViewDeps({ cash: [{ state: "SAFE", periodEndDaysAgo: 120 }], fin: [{ state: "SAFE", periodEndDaysAgo: 5, superseded: true }] }, gate({})));
    expect(ctx.issues.some((i) => i.category === "CASH_DANGER")).toBe(true);
    expect(ctx.cashSafe).toBe(false);
  });
  it("amended INSOLVENT_RISK Finance: last known unsafe, current state not proven either way, re-diagnose — growth not ready", async () => {
    const { ctx, state } = await assembleGuidanceContext("ws", "biz", nowViewDeps({ fin: [{ state: "INSOLVENT_RISK", periodEndDaysAgo: 5, superseded: true }] }, gate({})));
    const issue = ctx.issues.find((i) => i.id === "finance_amended")!;
    expect(issue.headline).toMatch(/The last Finance diagnosis showed financial survival INSOLVENT_RISK/);
    expect(issue.headline).toMatch(/not proven either way/);
    expect(issue.headline).toMatch(/re-run the Finance diagnosis/);
    expect(state.growthReadinessTier).toBe("STABILIZE_FIRST");
  });
  it("an out-of-date CRITICAL cash reading is named as LAST KNOWN, never as current", async () => {
    const { ctx } = await assembleGuidanceContext("ws", "biz", nowViewDeps({ cash: [{ state: "CRITICAL", periodEndDaysAgo: 200 }], fin: [{ state: "SAFE", periodEndDaysAgo: 5 }] }, gate({})));
    const issue = ctx.issues.find((i) => i.id === "cash_unverified")!;
    expect(issue.headline).toMatch(/Last known \(out of date\): the last cash check showed CRITICAL/);
    expect(ctx.issues.some((i) => /Cash survival \(cash check\) is CRITICAL/.test(i.headline))).toBe(false);
  });
  it("without the gate (not passed, no loader) a business is never 'growth ready'; with it, current SAFE/SAFE is", async () => {
    const rows = { cash: [{ state: "SAFE", periodEndDaysAgo: 5 }], fin: [{ state: "SAFE", periodEndDaysAgo: 5 }] };
    expect((await assembleGuidanceContext("ws", "biz", nowViewDeps(rows))).state.growthReadinessTier).toBe("STABILIZE_FIRST");
    expect((await assembleGuidanceContext("ws", "biz", nowViewDeps(rows, gate({})))).state.growthReadinessTier).toBe("GROWTH_READY");
    expect((await assembleGuidanceContext("ws", "biz", nowViewDeps(rows), gate({})))).toMatchObject({ state: { growthReadinessTier: "GROWTH_READY" } });
    expect((await assembleGuidanceContext("ws", "biz", nowViewDeps(rows, gate({ grossMarginPct: 5 })))).state.growthReadinessTier).toBe("STABILIZE_FIRST");
  });
});

// ─── Confidence ─────────────────────────────────────────────────────────────────────────────────────────────
describe("blocker confidence comes from the evidence actually used", () => {
  it("margin: out-of-date (or undated) figures are capped at 0.4; current figures keep their own confidence", () => {
    expect(marginConfidence({ dataConfidenceScore: 90, periodEnd: new Date(NOW.getTime() - 180 * DAY) }, NOW)).toBe(0.4);
    expect(marginConfidence({ dataConfidenceScore: 90, periodEnd: null }, NOW)).toBe(0.4);
    expect(marginConfidence({ dataConfidenceScore: 90, periodEnd: new Date(NOW.getTime() - 10 * DAY) }, NOW)).toBe(0.9);
    expect(marginConfidence({ dataConfidenceScore: 20, periodEnd: new Date(NOW.getTime() - 180 * DAY) }, NOW)).toBe(0.2);
  });
  it("capacity: a dated maintenance fact 1, a fresh recorded state 0.9, an old or undated one 0.4 — never unconditionally 1", () => {
    const base = { name: "Oven", utilization: 0.97, downtimeState: "up", maintenanceDueAt: null, status: "operational" };
    expect(capacityConstraint([{ ...base, updatedAt: new Date(NOW.getTime() - 3 * DAY) }], NOW).confidence).toBe(0.9);
    expect(capacityConstraint([{ ...base, updatedAt: new Date(NOW.getTime() - 200 * DAY) }], NOW).confidence).toBe(0.4);
    expect(capacityConstraint([{ ...base }], NOW).confidence).toBe(0.4);
    expect(capacityConstraint([{ ...base, utilization: 0.5, maintenanceDueAt: new Date(NOW.getTime() - DAY) }], NOW).confidence).toBe(1);
    const scale = cand({ domain: "operations", findingCode: "OPS_OPP_USE_CAPACITY_HEADROOM", title: "Take on more orders" });
    const d = resolveOwnerDecision(input([scale], gate({ capacity: capacityConstraint([{ ...base }], NOW) }), {
      dataSufficiency: { status: "insufficient", lowestDataConfidenceScore: 20, lowConfidenceDomains: [], missingCriticalData: [] },
    }));
    expect(d.primaryTarget!.findingCode).toBe("GATE_CAPACITY_UNSAFE");
    expect(d.confidence.score).toBeLessThanOrEqual(40);
  });
  it("do-not-repeat: the rule is a recorded fact, but a held DANGER keeps its own evidence confidence (never 1)", () => {
    const runway = cand({ domain: "cashflow", findingCode: "CF_LOW_RUNWAY", title: "Chase overdue invoices", findingId: "f1", severity: "critical", confidence: 0.3 });
    const r = canonicalEligibility([runway], { businessId: BIZ, workspaceId: WS, gate: gate({ doNotRepeat: [exact("cashflow", "f1")] }) });
    const target = r.ranked.find((c) => c.source === "safety_gate")!;
    expect(target.priorityClass).toBe("SURVIVAL_CASH");
    expect(target.confidence).toBe(0.3);
    const growth = cand({ domain: "marketing", findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winner", findingId: "f2", confidence: 0.5 });
    const g = canonicalEligibility([growth], { businessId: BIZ, workspaceId: WS, gate: gate({ doNotRepeat: [exact("marketing", "f2")] }) });
    expect(g.ranked.find((c) => c.source === "safety_gate")!.confidence).toBe(1);
  });
});

// ─── Do-not-repeat: exact rule propagation; danger kept ──────────────────────────────────────────────────
describe("do-not-repeat: the EXACT blocking rule is carried end to end; the danger issue is never erased", () => {
  const exactRule = exact("cashflow", "f1");
  const broadRule = broad("cashflow", "22222222-2222-4222-8222-222222222222");
  const g = gate({ doNotRepeat: [broadRule, exactRule] });

  it("hold → blocker target → annotation → panel link all name rule X (never the broad rule sharing its domain)", () => {
    const chase = cand({ domain: "cashflow", findingCode: "CF_LOW_RUNWAY", title: "Chase overdue invoices", findingId: "f1", severity: "critical" });
    const d = resolveOwnerDecision(input([chase], g));
    const t = d.primaryTarget!;
    expect(t).toMatchObject({ findingCode: "GATE_DO_NOT_REPEAT_REVIEW", ruleId: exactRule.id, findingId: "f1", targetRoute: ownerDnrRuleRoute(exactRule.id) });
    const ann = ownerDnrAnnotationFromGate(g, { source: t.source, domain: t.domain, findingId: t.findingId, findingCode: t.findingCode, intent: null, ruleId: t.ruleId })!;
    expect(ann.ruleId).toBe(exactRule.id);
    expect(ann.areaOnly).toBe(false);
    expect(ann.priorActionSummary).toBe(exactRule.summary);
  });

  it("a held danger stays the ISSUE: its title names the problem, quoting the step as the one marked do-not-repeat", () => {
    const chase = cand({ domain: "cashflow", findingCode: "CF_LOW_RUNWAY", title: "Chase overdue invoices", findingId: "f1", severity: "critical" });
    const t = resolveOwnerDecision(input([chase], g)).primaryTarget!;
    expect(t.priorityClass).toBe("SURVIVAL_CASH");
    expect(t.title).toMatch(/is still open, and its planned step "Chase overdue invoices" is marked do-not-repeat/);
    expect(t.explanation).toMatch(/The problem is still open/);
  });

  it("a survival ISSUE whose earlier step an exact rule forbids stays #1 under its OWN wording, naming the rule", () => {
    const issue = cand({
      source: "survival_reading", domain: "cashflow", findingCode: "CF_LOW_RUNWAY", title: "Chase overdue invoices", issueTitle: "Deal with: Runway under 30 days",
      findingId: "f1", severity: "critical", status: "completed", explanation: "\"Chase overdue invoices\" was marked done, but your figures still show it.",
    });
    const complaints = cand({ domain: "sales", findingCode: "SALES_HIGH_COMPLAINT_RATIO", title: "Fix complaints" });
    const d = resolveOwnerDecision(input([issue, complaints], g));
    expect(d.primaryTarget).toMatchObject({ source: "survival_reading", title: "Deal with: Runway under 30 days", ruleId: exactRule.id, priorityClass: "SURVIVAL_CASH" });
    expect(d.primaryTarget!.explanation).toMatch(/marked do-not-repeat/);
    const ann = ownerDnrAnnotationFromGate(g, { ...d.primaryTarget!, intent: null })!;
    expect(ann).toMatchObject({ ruleId: exactRule.id, issueStaysOpen: true, holdsBackTarget: false });
  });

  it("a step the gate allows is never claimed held; its area rule is history only", () => {
    const repair = cand({ domain: "cashflow", findingCode: "CF_HIGH_PAYABLES", title: "Renegotiate payables", findingId: "f9" });
    const ann = ownerDnrAnnotationFromGate(g, { source: "domain_action", domain: "cashflow", findingId: "f9", findingCode: repair.findingCode, intent: "STABILISE" })!;
    expect(ann).toMatchObject({ holdsBackTarget: false, areaOnly: true, ruleId: broadRule.id });
  });
});

// ─── Every blocker named; DNR vs missing evidence ─────────────────────────────────────────────────────────
describe("all blockers for planning; do-not-repeat review vs critical missing evidence", () => {
  it("capacity + cash + compliance → one target each, and the held step's text names every one of them", () => {
    const scale = cand({ domain: "operations", findingCode: "OPS_OPP_USE_CAPACITY_HEADROOM", title: "Take on more orders" });
    const g = gate({
      capacity: { status: "blocked", reason: "Oven down", bottlenecks: ["Oven"], confidence: 1 },
      cash: { gateState: "CRITICAL", basis: "", driver: "cash", confidence: 0.8 },
      expiredCompliance: { name: "Trade licence", kind: "licence" },
    });
    const d = resolveOwnerDecision(input([scale], g));
    const codes = d.attention.map((t) => t.findingCode);
    expect(codes).toEqual(expect.arrayContaining(["GATE_CAPACITY_UNSAFE", "GATE_CASH_UNSAFE", "GATE_COMPLIANCE_EXPIRED"]));
    const verdict = evaluateOwnerActionGate(g, { domain: "operations", intent: "GROW", findingId: null, findingCode: scale.findingCode });
    expect(verdict.allowed).toBe(false);
    const text = ownerGateHoldsText((verdict as { blocks: Array<{ code: never }> }).blocks, g);
    expect(text).toMatch(/capacity limit/);
    expect(text).toMatch(/cash safety limit/);
    expect(text).toMatch(/Trade licence/);
  });
  it("a do-not-repeat review of a growth step (broad or exact) never outranks critical missing evidence", () => {
    for (const rule of [broad("marketing"), exact("marketing", "f-g")]) {
      const scale = cand({ domain: "marketing", findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", findingId: "f-g" });
      const missing = cand({ domain: "finance", findingCode: "FIN_MISSING_CRITICAL_DATA", title: "Enter the missing Finance figures", severity: "critical" });
      const d = resolveOwnerDecision(input([scale, missing], gate({ doNotRepeat: [rule] })));
      expect(d.primaryTarget!.findingCode).toBe("FIN_MISSING_CRITICAL_DATA");
    }
  });
});

// ─── Plan softening ─────────────────────────────────────────────────────────────────────────────────────────
describe("plan softening rewrites only whole-business imperatives, never factual prose", () => {
  it.each([
    "No more stock-outs were recorded this month.",
    "Why it failed: never followed up with the supplier.",
    "Supplier status: never reviewed since 2024.",
    "Customers said: no more delays.",
    "Last campaign: avoid rate was 12%.",
    "Spend fell first, then revenue.",
    "Use of the oven peaked first; then it fell.",
    "The loan is repaid first.",
    "No more than two campaigns ran.",
  ])("fact unchanged: %s", (t) => {
    expect(neutralizePlanImperatives(t)).toEqual({ text: t, heldBack: false });
  });
  it.each([
    ["Next: collect receivables.", "Collect receivables."],
    ["First: collect overdue invoices.", "Collect overdue invoices."],
    ["Protect cash first: stop discretionary spend.", "Protect cash: the plan analysis holds back discretionary spend."],
    ["Never discount below cost.", "the plan analysis holds back discount below cost."],
    ["No more discounting.", "the plan analysis holds back discounting."],
  ])("imperative softened: %s", (from, to) => {
    expect(neutralizePlanImperatives(from).text).toBe(to);
  });
});

// ─── Home provenance ───────────────────────────────────────────────────────────────────────────────────────
describe("Home: an in-progress profit-driven Finance reading is financial danger, never cash danger", () => {
  const base = { domainScores: [], findings: [], verifications: [], now: NOW } as unknown as Parameters<typeof buildOwnerHomeSummary>[0];
  it("provisionalFinancial tightens the FINANCIAL card (labelled in progress, no completed date); the cash card is untouched", () => {
    const s = buildOwnerHomeSummary({ ...base, provisionalFinancial: { state: "CRITICAL" } });
    expect(s.financialDanger).toMatchObject({ status: "in_progress", level: "high", evidenceAsOf: null });
    expect(s.financialDanger.drivenBy).toMatch(/driven by profit and margin/);
    expect(s.cashDanger.status).not.toBe("in_progress");
  });
  it("a cash-driven in-progress reading tightens the CASH card", () => {
    const s = buildOwnerHomeSummary({ ...base, provisionalCash: { state: "CRITICAL", source: "cashflow" } });
    expect(s.cashDanger).toMatchObject({ status: "in_progress", level: "high", evidenceAsOf: null });
  });
});
