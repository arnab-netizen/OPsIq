/**
 * Policy 1 — the canonical owner decision models the action gate's safety constraints.
 *
 * Invariant: canonical executable primary/supporting steps are gate-compatible at the state used to
 * resolve them (canonicalEligibility evaluates each domain action with the SAME pure policy the
 * server-side gate enforces). A step the gate would refuse is excluded ("held_by_safety_gate") and the
 * blocker itself is elected as work, unless an eligible item already addresses it. The gate remains the
 * final enforcement at mutation time (TOCTOU: the state can change after the decision is resolved).
 */
import { describe, it, expect } from "vitest";
import {
  canonicalEligibility,
  classifyOwnerFindingCode,
  resolveOwnerDecision,
  type OwnerDecisionCandidate,
  type ResolveOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision";
import { ownerTargetIntent } from "@/domain/owner-spine/owner-imperatives";
import {
  evaluateOwnerActionGate,
  NO_OWNER_GATE_CONSTRAINTS,
  type OwnerGateConstraints,
} from "@/domain/owner-mode/owner-action-gate-policy";
import { NO_CHANGE_FACTS } from "./change-facts-fixture";

const BIZ = "biz-1";
const WS = "ws-1";

function cand(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string; domain: OwnerDecisionCandidate["domain"] }): OwnerDecisionCandidate {
  const sourceId = p.sourceId ?? `${p.findingCode}-${p.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    candidateId: p.candidateId ?? `domain_action:${sourceId}`,
    businessId: BIZ,
    workspaceId: WS,
    source: p.source ?? "domain_action",
    domain: p.domain,
    sourceId,
    priorityClass: p.priorityClass ?? classifyOwnerFindingCode(p.findingCode),
    findingCode: p.findingCode,
    findingId: p.findingId ?? null,
    title: p.title,
    explanation: "",
    severity: p.severity === undefined ? "high" : p.severity,
    priorityScore: p.priorityScore ?? 60,
    expectedImpactScore: 50,
    confidence: 0.9,
    effortScore: 40,
    status: "proposed",
    ownerActionRequired: true,
    blocking: p.blocking ?? false,
    evidence: [],
    missingData: [],
    verificationMetric: null,
    evidenceAsOf: null,
    stale: false,
    exclusion: null,
    targetRoute: `/owner/${p.domain}`,
  };
}

function input(candidates: OwnerDecisionCandidate[], gate: OwnerGateConstraints | null): ResolveOwnerDecisionInput {
  return {
    businessId: BIZ,
    workspaceId: WS,
    candidates,
    diagnosedDomains: ["finance", "marketing", "sales", "operations", "cashflow"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [],
    strategy: null,
    reassessment: { days: 14, reason: "test" },
    changeFacts: NO_CHANGE_FACTS,
    gate,
    now: new Date("2026-09-27T00:00:00Z"),
  };
}

const gate = (over: Partial<OwnerGateConstraints>): OwnerGateConstraints => ({ ...NO_OWNER_GATE_CONSTRAINTS, ...over });
const CAPACITY_DOWN = gate({ capacity: { status: "blocked", reason: "Oven: down", bottlenecks: ["Oven"] } });
const CASH_AT_RISK = gate({ cash: { gateState: "AT_RISK", basis: "" } });
const MARGIN_LOW = gate({ grossMarginPct: 5 });

const scaleWinner = cand({ domain: "marketing", findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign" });
const winback = cand({ domain: "sales", findingCode: "SALES_OPP_WINBACK", title: "Win back lost customers", priorityScore: 50 });

/** Every executable canonical step (primary + supporting domain actions) passes the gate at `g`. */
function assertGateCompatible(d: ReturnType<typeof resolveOwnerDecision>, all: OwnerDecisionCandidate[], g: OwnerGateConstraints) {
  for (const t of [d.primaryTarget, ...d.supportingSteps].filter((x) => x && x.source === "domain_action")) {
    const c = all.find((x) => x.candidateId === t!.candidateId)!;
    const v = evaluateOwnerActionGate(g, { domain: c.domain, intent: ownerTargetIntent(c), findingId: c.findingId });
    expect(v.allowed, `${c.title} must be gate-compatible`).toBe(true);
  }
}

describe("Policy 1 — the canonical decision never instructs what the gate would refuse", () => {
  it("a winning GROW target held by unsafe capacity: the blocker is elected; the growth step is held (never canonical)", () => {
    const d = resolveOwnerDecision(input([scaleWinner], CAPACITY_DOWN));
    expect(d.primaryTarget?.source).toBe("safety_gate");
    expect(d.primaryTarget?.title).toMatch(/Clear the capacity bottleneck \(Oven\)/);
    expect(d.primaryTarget?.priorityClass).toBe("OVERLOAD_BLOCKING");
    expect(d.attention.map((t) => t.candidateId)).not.toContain(scaleWinner.candidateId);
    expect(d.excluded).toContainEqual({ candidateId: scaleWinner.candidateId, title: scaleWinner.title, reason: "held_by_safety_gate" });
    expect(d.whatNotToDo.join(" ")).toMatch(/Don't start "Scale the winning campaign" yet — Capacity is unsafe/);
    // Mutation check: without the constraints the same GROW step would have been the main target.
    expect(resolveOwnerDecision(input([scaleWinner], null)).primaryTarget?.candidateId).toBe(scaleWinner.candidateId);
  });

  it("a GROW target held by AT_RISK cash: an existing survival item is elected (no synthetic duplicate)", () => {
    const runway = cand({ domain: "cashflow", findingCode: "CF_LOW_RUNWAY", title: "Extend runway" });
    const d = resolveOwnerDecision(input([scaleWinner, runway], CASH_AT_RISK));
    expect(d.primaryTarget?.candidateId).toBe(runway.candidateId);
    expect(d.attention.some((t) => t.source === "safety_gate")).toBe(false);
    expect(d.attention.map((t) => t.candidateId)).not.toContain(scaleWinner.candidateId);
  });

  it("a GROW target held by a known margin below the floor: 'restore margin' is elected when no margin repair is listed", () => {
    const d = resolveOwnerDecision(input([scaleWinner], MARGIN_LOW));
    expect(d.primaryTarget).toMatchObject({ source: "safety_gate", findingCode: "GATE_MARGIN_BELOW_FLOOR", priorityClass: "PROFIT_LOSS" });
  });

  it("protective steps are never held by the danger they respond to (SAFETY / STABILISE / REPAIR / EVIDENCE)", () => {
    const repair = cand({ domain: "sales", findingCode: "SALES_DISCOUNT_DEPENDENCE", title: "Cap discounting" });
    const evidence = cand({ domain: "marketing", findingCode: "MKT_OPP_DATA_QUALITY", title: "Record campaign figures" });
    const stabilise = cand({ domain: "operations", findingCode: "OPS_CAPACITY_BOTTLENECK", title: "Relieve the bottleneck" });
    for (const g of [CAPACITY_DOWN, CASH_AT_RISK, MARGIN_LOW]) {
      const { holds } = canonicalEligibility([repair, evidence, stabilise], { businessId: BIZ, workspaceId: WS, gate: g });
      expect(holds).toEqual([]);
    }
  });

  it("EXECUTE is not treated as GROW: constraints apply by what it consumes (SOP work consumes no capacity/cash-growth/margin)", () => {
    const sop = cand({ domain: "sop", findingCode: "SOP_HIGH_OVERDUE", title: "Clear overdue SOP tasks" });
    const { holds } = canonicalEligibility([sop], { businessId: BIZ, workspaceId: WS, gate: gate({ capacity: CAPACITY_DOWN.capacity, cash: { gateState: "AT_RISK", basis: "" }, grossMarginPct: 5 }) });
    expect(holds).toEqual([]);
    // An EXECUTE step in a capacity-consuming domain is held while capacity is unsafe.
    const ops = cand({ domain: "operations", findingCode: "OPS_OPP_CLOSE_SOP_GAP", title: "Close the SOP gap on the line" });
    expect(canonicalEligibility([ops], { businessId: BIZ, workspaceId: WS, gate: CAPACITY_DOWN }).holds.map((h) => h.code)).toEqual(["CAPACITY_BLOCKED"]);
  });

  it("an expired attributed compliance obligation holds every action; the compliance item itself is the target (no duplicate)", () => {
    const expired = gate({ expiredCompliance: { name: "Trade licence", kind: "licence" } });
    const comp = cand({ source: "compliance_item", domain: "compliance", findingCode: "COMPLIANCE_BREACH", title: 'Renew "Trade licence"', blocking: true, candidateId: "compliance_item:c1", priorityClass: "SAFETY_COMPLIANCE" });
    const runway = cand({ domain: "cashflow", findingCode: "CF_LOW_RUNWAY", title: "Extend runway" });
    const d = resolveOwnerDecision(input([comp, runway, winback], expired));
    expect(d.primaryTarget?.candidateId).toBe("compliance_item:c1");
    expect(d.attention.some((t) => t.source === "safety_gate")).toBe(false);
    expect(d.excluded.filter((e) => e.reason === "held_by_safety_gate").map((e) => e.candidateId).sort()).toEqual([runway.candidateId, winback.candidateId].sort());
  });

  it("a broad do-not-repeat area rule holds a GROW step (and elects reviewing it), never a protective step", () => {
    const g = gate({ doNotRepeat: [{ domain: "sales", match: "broad", findingId: null }] });
    const repair = cand({ domain: "sales", findingCode: "SALES_POOR_FOLLOW_UP", title: "Fix follow-up" });
    const { holds, ranked } = canonicalEligibility([winback, repair], { businessId: BIZ, workspaceId: WS, gate: g });
    expect(holds.map((h) => h.candidateId)).toEqual([winback.candidateId]);
    expect(ranked.map((c) => c.candidateId)).toContain(repair.candidateId);
    expect(ranked.find((c) => c.source === "safety_gate")).toMatchObject({ findingCode: "GATE_DO_NOT_REPEAT_REVIEW", domain: "sales" });
  });

  it("an opted-out owner: nothing is held (the gate enforces nothing either)", () => {
    const g = gate({ ...CAPACITY_DOWN, optedOut: true });
    expect(canonicalEligibility([scaleWinner], { businessId: BIZ, workspaceId: WS, gate: g }).holds).toEqual([]);
  });

  it("invariant over a grid of states × candidate mixes: every canonical executable step is gate-compatible", () => {
    const pool = [
      scaleWinner, winback,
      cand({ domain: "sales", findingCode: "SALES_DISCOUNT_DEPENDENCE", title: "Cap discounting" }),
      cand({ domain: "operations", findingCode: "OPS_OPP_USE_CAPACITY_HEADROOM", title: "Take more orders" }),
      cand({ domain: "operations", findingCode: "OPS_HIGH_DELAY", title: "Fix delays" }),
      cand({ domain: "finance", findingCode: "FIN_OPP_REVENUE_QUALITY", title: "Improve revenue quality" }),
      cand({ domain: "cashflow", findingCode: "CF_OPP_COLLECT_OVERDUE", title: "Collect overdue" }),
      cand({ domain: "marketing", findingCode: "MKT_OPP_BUILD_ORGANIC", title: "Build organic" }),
      cand({ domain: "sop", findingCode: "SOP_LOW_COMPLETION", title: "Raise completion" }),
    ];
    const states: OwnerGateConstraints[] = [
      NO_OWNER_GATE_CONSTRAINTS, CAPACITY_DOWN, CASH_AT_RISK, MARGIN_LOW,
      gate({ cash: { gateState: "CRITICAL", basis: "" } }),
      gate({ cash: { gateState: "INSOLVENT_RISK", basis: "" }, grossMarginPct: 1, capacity: CAPACITY_DOWN.capacity }),
      gate({ doNotRepeat: [{ domain: "marketing", match: "broad", findingId: null }, { domain: "operations", match: "broad", findingId: null }] }),
      gate({ expiredCompliance: { name: "Permit", kind: "permit" } }),
    ];
    let checked = 0;
    for (const g of states) {
      for (let mask = 1; mask < 1 << pool.length; mask += 7) {
        const mix = pool.filter((_, i) => mask & (1 << i));
        const d = resolveOwnerDecision(input(mix, g));
        assertGateCompatible(d, mix, g);
        // Nothing eligible is silently lost: every candidate is ranked, held (with a reason) or otherwise excluded.
        for (const c of mix) {
          const inAttention = d.attention.some((t) => t.candidateId === c.candidateId);
          const excluded = d.excluded.some((e) => e.candidateId === c.candidateId);
          expect(inAttention || excluded, c.title).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
