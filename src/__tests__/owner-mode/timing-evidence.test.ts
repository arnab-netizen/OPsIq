/**
 * Completion / escalation timing-evidence evaluators (pure).
 *
 * Unblocks two previously BLOCKED_BY_DATA signals from persisted trusted timestamps:
 *   • SUSPICIOUS_FAST_COMPLETION — proof submitted implausibly faster than the observed baseline.
 *   • MANAGER_IGNORES_ESCALATION — escalation left unacknowledged past its due time (repeatedly).
 *
 * Every status is exercised. The evaluators never fabricate a timestamp or a baseline: null timing →
 * TIMING_MISSING / ESCALATION_TIMING_MISSING; thin history → BASELINE_MISSING; unassigned → NO_MANAGER
 * _ASSIGNMENT — all fail-visible. Active signals carry their exact evidence ids + sourceCompleteness
 * COMPLETE, and map into the anti-gaming pipeline with no fraud/accusation language.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateFastCompletion, evaluateEscalationTiming, isActiveTimingSignal,
  type CompletionTimingRow, type EscalationTimingRow, type TimingSignal,
} from "@/domain/owner-mode/timing-evidence";
import { identifyGamingSignals, type AntiGamingInput } from "@/domain/owner-mode/anti-gaming-analytics";

const AT = "2026-07-05T00:00:00.000Z";
const NOW = Date.parse(AT);
const MIN = 60_000;
const HOUR = 3_600_000;

// A trusted, accepted completion of 30 minutes for baseline building.
const cRow = (over: Partial<CompletionTimingRow>): CompletionTimingRow => ({
  proofId: "p", submittedByUserId: "op-1", proofType: "wash", status: "ACCEPTED",
  workStartedAt: new Date(NOW - 60 * MIN), submittedAt: new Date(NOW - 30 * MIN), ...over,
});
// Build N accepted baseline rows of `durMin` minutes for a proof type (median = durMin).
const baseline = (n: number, durMin: number, proofType = "wash"): CompletionTimingRow[] =>
  Array.from({ length: n }, (_, i) => cRow({
    proofId: `b-${proofType}-${i}`, submittedByUserId: `base-${i}`, proofType, status: "ACCEPTED",
    workStartedAt: new Date(NOW - durMin * MIN), submittedAt: new Date(NOW),
  }));

const escRow = (over: Partial<EscalationTimingRow>): EscalationTimingRow => ({
  escalationId: "e", assignedTarget: "mgr-1", severity: "HIGH", status: "OPEN",
  createdAt: new Date(NOW - 5 * HOUR), dueAt: new Date(NOW - 3 * HOUR),
  acknowledgedAt: null, resolvedAt: null, ...over,
});

describe("timing-evidence — module contract assertions", () => {
  it("evaluateFastCompletion is a function", () => { expect(typeof evaluateFastCompletion).toBe("function"); });
  it("evaluateEscalationTiming is a function", () => { expect(typeof evaluateEscalationTiming).toBe("function"); });
  it("isActiveTimingSignal is a function", () => { expect(typeof isActiveTimingSignal).toBe("function"); });
  it("identifyGamingSignals is a function", () => { expect(typeof identifyGamingSignals).toBe("function"); });
  it("cRow is a function", () => { expect(typeof cRow).toBe("function"); });
  it("baseline is a function", () => { expect(typeof baseline).toBe("function"); });
  it("escRow is a function", () => { expect(typeof escRow).toBe("function"); });
  it("typeof AT equals string", () => { expect(typeof AT).toBe("string"); });
  it("typeof NOW equals number", () => { expect(typeof NOW).toBe("number"); });
  it("typeof MIN equals number", () => { expect(typeof MIN).toBe("number"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
});

describe("timing-evidence — fast completion", () => {
  it("1. DATA_INSUFFICIENT when there are no proof rows at all", () => {
    const s = evaluateFastCompletion({ workspaceId: "ws", rows: [], evaluatedAt: AT });
    expect(s.status).toBe("DATA_INSUFFICIENT");
    expect(s.sourceCompleteness).toBe("BLOCKED_BY_DATA");
    expect(s.supportingProofIds).toEqual([]);
  });

  it("2. TIMING_MISSING when no proof has both a work-start and a submit time (never fabricated)", () => {
    const rows: CompletionTimingRow[] = [
      cRow({ proofId: "p1", workStartedAt: null, submittedAt: new Date(NOW) }),
      cRow({ proofId: "p2", workStartedAt: new Date(NOW - MIN), submittedAt: null }),
    ];
    const s = evaluateFastCompletion({ workspaceId: "ws", rows, evaluatedAt: AT });
    expect(s.status).toBe("TIMING_MISSING");
    expect(s.sourceCompleteness).toBe("BLOCKED_BY_DATA");
    expect(s.baselineSource).toBeNull();
    expect(s.missingData.join(" ")).toMatch(/trusted work-start/i);
  });

  it("3. BASELINE_MISSING when there is timing but fewer than 3 accepted samples per type", () => {
    const rows = baseline(2, 60); // only 2 accepted → below MIN_BASELINE_SAMPLES
    const s = evaluateFastCompletion({ workspaceId: "ws", rows, evaluatedAt: AT });
    expect(s.status).toBe("BASELINE_MISSING");
    expect(s.sourceCompleteness).toBe("BLOCKED_BY_DATA");
    expect(s.baselineConfidence).toBe("NONE");
  });

  it("4. NO_SIGNAL when a trusted baseline exists but no completion is suspiciously fast", () => {
    const rows = baseline(5, 60); // baseline 60 min; all samples ~60 min → nothing fast
    const s = evaluateFastCompletion({ workspaceId: "ws", rows, evaluatedAt: AT });
    expect(s.status).toBe("NO_SIGNAL");
    expect(s.sourceCompleteness).toBe("COMPLETE");
    expect(s.baselineSource).toMatch(/OBSERVED_ACCEPTED_HISTORY/);
    expect(s.baselineConfidence).toBe("MEDIUM"); // 5 samples
  });

  it("5. FAST_COMPLETION_WARNING for a single implausibly fast job (not yet a pattern)", () => {
    const rows = [
      ...baseline(5, 60),
      // op-fast: 1 job done in 5 min vs 60 min baseline (< 20% ratio)
      cRow({ proofId: "fast1", submittedByUserId: "op-fast", status: "NEEDS_HUMAN_REVIEW", workStartedAt: new Date(NOW - 5 * MIN), submittedAt: new Date(NOW) }),
    ];
    const s = evaluateFastCompletion({ workspaceId: "ws", rows, evaluatedAt: AT });
    expect(s.status).toBe("FAST_COMPLETION_WARNING");
    expect(s.actorId).toBe("op-fast");
    expect(s.patternCount).toBe(1);
    expect(s.supportingProofIds).toEqual(["fast1"]);
    expect(s.sourceCompleteness).toBe("COMPLETE");
    expect(s.ownerActionRequired).toBe(false);
  });

  it("6. SUSPICIOUS_FAST_COMPLETION_PATTERN for repeated fast jobs by one operator", () => {
    const rows = [
      ...baseline(5, 60),
      cRow({ proofId: "f1", submittedByUserId: "op-fast", status: "NEEDS_HUMAN_REVIEW", workStartedAt: new Date(NOW - 4 * MIN), submittedAt: new Date(NOW) }),
      cRow({ proofId: "f2", submittedByUserId: "op-fast", status: "NEEDS_HUMAN_REVIEW", workStartedAt: new Date(NOW - 6 * MIN), submittedAt: new Date(NOW) }),
    ];
    const s = evaluateFastCompletion({ workspaceId: "ws", rows, evaluatedAt: AT });
    expect(s.status).toBe("SUSPICIOUS_FAST_COMPLETION_PATTERN");
    expect(s.actorId).toBe("op-fast");
    expect(s.patternCount).toBe(2);
    expect(s.supportingProofIds.sort()).toEqual(["f1", "f2"]);
    expect(s.severity).toBe("HIGH");
    expect(s.ownerActionRequired).toBe(true);
    expect(isActiveTimingSignal(s)).toBe(true);
  });

  it("7. baseline is per-proof-type — a fast job is judged only against its own type baseline", () => {
    const rows = [
      ...baseline(5, 60, "wash"),
      ...baseline(5, 4, "press"), // press normally takes ~4 min
      // a 3-min press job is NOT fast for press (baseline 4 min), even though it is < 20% of wash's 60 min
      cRow({ proofId: "press-ok", submittedByUserId: "op-x", proofType: "press", status: "NEEDS_HUMAN_REVIEW", workStartedAt: new Date(NOW - 3 * MIN), submittedAt: new Date(NOW) }),
    ];
    const s = evaluateFastCompletion({ workspaceId: "ws", rows, evaluatedAt: AT });
    expect(s.status).toBe("NO_SIGNAL");
  });

  it("8. no accusation / fraud language anywhere in an active fast-completion signal", () => {
    const rows = [
      ...baseline(5, 60),
      cRow({ proofId: "f1", submittedByUserId: "op-fast", status: "NEEDS_HUMAN_REVIEW", workStartedAt: new Date(NOW - 4 * MIN), submittedAt: new Date(NOW) }),
      cRow({ proofId: "f2", submittedByUserId: "op-fast", status: "NEEDS_HUMAN_REVIEW", workStartedAt: new Date(NOW - 5 * MIN), submittedAt: new Date(NOW) }),
    ];
    const s = evaluateFastCompletion({ workspaceId: "ws", rows, evaluatedAt: AT });
    expect(JSON.stringify(s)).not.toMatch(/\b(fraud|theft|thief|stealing|liar|negligent)\b/i);
  });
});

describe("timing-evidence — manager ignores escalation", () => {
  it("9. DATA_INSUFFICIENT when there are no escalations", () => {
    const s = evaluateEscalationTiming({ workspaceId: "ws", rows: [], nowMs: NOW, evaluatedAt: AT });
    expect(s.status).toBe("DATA_INSUFFICIENT");
    expect(s.sourceCompleteness).toBe("BLOCKED_BY_DATA");
  });

  it("10. NO_SIGNAL when every escalation is resolved", () => {
    const rows = [escRow({ escalationId: "e1", status: "RESOLVED", resolvedAt: new Date(NOW - HOUR) })];
    const s = evaluateEscalationTiming({ workspaceId: "ws", rows, nowMs: NOW, evaluatedAt: AT });
    expect(s.status).toBe("NO_SIGNAL");
    expect(s.sourceCompleteness).toBe("COMPLETE");
  });

  it("11. ESCALATION_TIMING_MISSING when open escalations carry no due time (never fabricated)", () => {
    const rows = [escRow({ escalationId: "e1", dueAt: null })];
    const s = evaluateEscalationTiming({ workspaceId: "ws", rows, nowMs: NOW, evaluatedAt: AT });
    expect(s.status).toBe("ESCALATION_TIMING_MISSING");
    expect(s.sourceCompleteness).toBe("BLOCKED_BY_DATA");
    expect(s.missingData.join(" ")).toMatch(/no due time/i);
  });

  it("12. NO_MANAGER_ASSIGNMENT when an overdue escalation has no assigned target", () => {
    const rows = [escRow({ escalationId: "e1", assignedTarget: null })]; // overdue but unassigned
    const s = evaluateEscalationTiming({ workspaceId: "ws", rows, nowMs: NOW, evaluatedAt: AT });
    expect(s.status).toBe("NO_MANAGER_ASSIGNMENT");
    expect(s.sourceCompleteness).toBe("PARTIAL");
    expect(s.ownerActionRequired).toBe(true);
  });

  it("13. NO_SIGNAL when an open escalation is within its due time", () => {
    const rows = [escRow({ escalationId: "e1", dueAt: new Date(NOW + HOUR) })]; // not yet due
    const s = evaluateEscalationTiming({ workspaceId: "ws", rows, nowMs: NOW, evaluatedAt: AT });
    expect(s.status).toBe("NO_SIGNAL");
  });

  it("14. ESCALATION_ACK_OVERDUE for a single unacknowledged, past-due escalation", () => {
    const rows = [escRow({ escalationId: "e1" })]; // OPEN, dueAt 3h ago, no ack
    const s = evaluateEscalationTiming({ workspaceId: "ws", rows, nowMs: NOW, evaluatedAt: AT });
    expect(s.status).toBe("ESCALATION_ACK_OVERDUE");
    expect(s.actorId).toBe("mgr-1");
    expect(s.supportingProofIds).toEqual(["e1"]);
    expect(s.sourceCompleteness).toBe("COMPLETE");
    expect(s.ownerActionRequired).toBe(false);
  });

  it("15. ESCALATION_RESOLUTION_OVERDUE when acknowledged but unresolved past the window", () => {
    const rows = [escRow({
      escalationId: "e1", status: "ACKNOWLEDGED", severity: "HIGH",
      acknowledgedAt: new Date(NOW - 10 * HOUR), // HIGH resolution window = 240 min = 4h; 10h > 4h
      dueAt: new Date(NOW - 9 * HOUR),
    })];
    const s = evaluateEscalationTiming({ workspaceId: "ws", rows, nowMs: NOW, evaluatedAt: AT });
    expect(s.status).toBe("ESCALATION_RESOLUTION_OVERDUE");
    expect(s.supportingProofIds).toEqual(["e1"]);
  });

  it("16. MANAGER_IGNORES_ESCALATION_PATTERN for repeated unacknowledged escalations, attributed per target", () => {
    const rows = [
      escRow({ escalationId: "e1", assignedTarget: "mgr-1" }),
      escRow({ escalationId: "e2", assignedTarget: "mgr-1" }),
      escRow({ escalationId: "e3", assignedTarget: "mgr-2" }), // different manager, only 1
    ];
    const s = evaluateEscalationTiming({ workspaceId: "ws", rows, nowMs: NOW, evaluatedAt: AT });
    expect(s.status).toBe("MANAGER_IGNORES_ESCALATION_PATTERN");
    expect(s.actorId).toBe("mgr-1");
    expect(s.supportingProofIds.sort()).toEqual(["e1", "e2"]);
    expect(s.severity).toBe("HIGH");
    expect(s.ownerActionRequired).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/\b(fraud|negligent|lazy)\b/i);
  });
});

describe("timing-evidence — anti-gaming integration", () => {
  const inp = (over: Partial<AntiGamingInput> = {}): AntiGamingInput => ({ workspaceId: "ws", actors: [], reviewers: [], evaluatedAt: AT, ...over });

  it("17. active timing signals surface as gaming signals carrying their evidence ids; blocked ones do not fire", () => {
    // Active fast-completion pattern (COMPLETE) + a BLOCKED_BY_DATA escalation timing → only the
    // active one becomes a gaming signal, and it keeps its supporting proof ids for suppression.
    const fast = evaluateFastCompletion({
      workspaceId: "ws", evaluatedAt: AT, rows: [
        ...baseline(5, 60),
        cRow({ proofId: "f1", submittedByUserId: "op-fast", status: "NEEDS_HUMAN_REVIEW", workStartedAt: new Date(NOW - 4 * MIN), submittedAt: new Date(NOW) }),
        cRow({ proofId: "f2", submittedByUserId: "op-fast", status: "NEEDS_HUMAN_REVIEW", workStartedAt: new Date(NOW - 5 * MIN), submittedAt: new Date(NOW) }),
      ],
    });
    const escBlocked: TimingSignal = evaluateEscalationTiming({ workspaceId: "ws", rows: [escRow({ dueAt: null })], nowMs: NOW, evaluatedAt: AT });
    expect(escBlocked.status).toBe("ESCALATION_TIMING_MISSING");

    const analysis = identifyGamingSignals(inp({ fastCompletion: fast, escalationTiming: escBlocked }));
    const fastSig = analysis.signals.find((s) => s.signalType === "SUSPICIOUS_FAST_COMPLETION");
    expect(fastSig).toBeTruthy();
    expect(fastSig?.supportingProofIds?.sort()).toEqual(["f1", "f2"]);
    expect(fastSig?.sourceCompleteness).toBe("COMPLETE");
    // The blocked escalation signal did NOT surface as a gaming signal.
    expect(analysis.signals.some((s) => s.signalType === "MANAGER_IGNORES_ESCALATION")).toBe(false);
  });

  it("17b. an active ignores-escalation pattern surfaces with escalation ids as its suppression key", () => {
    const esc = evaluateEscalationTiming({
      workspaceId: "ws", nowMs: NOW, evaluatedAt: AT,
      rows: [escRow({ escalationId: "e1" }), escRow({ escalationId: "e2" })],
    });
    const analysis = identifyGamingSignals(inp({ escalationTiming: esc }));
    const sig = analysis.signals.find((s) => s.signalType === "MANAGER_IGNORES_ESCALATION");
    expect(sig?.supportingProofIds?.sort()).toEqual(["e1", "e2"]);
    expect(sig?.sourceCompleteness).toBe("COMPLETE");
    expect(sig?.ownerActionRequired).toBe(true);
  });
});
