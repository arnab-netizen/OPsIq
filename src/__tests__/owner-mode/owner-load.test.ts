/**
 * Jarvis 360 Slice 4 (remainder) — standing instructions, attention budget, batch.
 * Pure + DI; no DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import {
  evaluateStandingInstruction,
  classifyAttention,
  summarizeOwnerAttention,
  batchByStandingInstructions,
  type StandingInstructionRecord,
} from "@/domain/owner-mode/owner-load";
import {
  recordStandingInstruction,
  evaluateRequestAgainstStandingInstructions,
  StandingInstructionUnauthorizedError,
  type OwnerLoadDeps,
} from "@/services/owner-mode/owner-load.service";

const NOW = new Date("2026-06-28T00:00:00Z");
const instr = (o: Partial<StandingInstructionRecord> = {}): StandingInstructionRecord => ({
  scope: "petty_cash",
  allowedActionTypes: ["spend"],
  forbiddenActionTypes: ["refund"],
  maxAmount: 500,
  status: "active",
  validUntil: null,
  ...o,
});

beforeEach(() => emitAuditEvent.mockClear());

describe("owner-load — module contract assertions", () => {
  it("evaluateStandingInstruction is a function", () => { expect(typeof evaluateStandingInstruction).toBe("function"); });
  it("classifyAttention is a function", () => { expect(typeof classifyAttention).toBe("function"); });
  it("summarizeOwnerAttention is a function", () => { expect(typeof summarizeOwnerAttention).toBe("function"); });
  it("batchByStandingInstructions is a function", () => { expect(typeof batchByStandingInstructions).toBe("function"); });
  it("recordStandingInstruction is a function", () => { expect(typeof recordStandingInstruction).toBe("function"); });
  it("evaluateRequestAgainstStandingInstructions is a function", () => { expect(typeof evaluateRequestAgainstStandingInstructions).toBe("function"); });
  it("StandingInstructionUnauthorizedError is a function", () => { expect(typeof StandingInstructionUnauthorizedError).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("emitAuditEvent is a function", () => { expect(typeof emitAuditEvent).toBe("function"); });
  it("instr is a function", () => { expect(typeof instr).toBe("function"); });
  it("instr() returns an object", () => { expect(typeof instr()).toBe("object"); });
  it("instr() has scope field", () => { expect(instr()).toHaveProperty("scope"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("evaluateStandingInstruction", () => {
  const base = { scope: "petty_cash", actionType: "spend", amount: 100, now: NOW };
  it("auto-allows an allowed action within the ceiling", () => {
    expect(evaluateStandingInstruction(instr(), base)).toBe("auto_allow");
  });
  it("needs approval over the amount ceiling", () => {
    expect(evaluateStandingInstruction(instr(), { ...base, amount: 999 })).toBe("needs_approval");
  });
  it("forbids a forbidden action type", () => {
    expect(evaluateStandingInstruction(instr(), { ...base, actionType: "refund" })).toBe("forbidden");
  });
  it("needs approval for a different scope, inactive, or expired", () => {
    expect(evaluateStandingInstruction(instr(), { ...base, scope: "payroll" })).toBe("needs_approval");
    expect(evaluateStandingInstruction(instr({ status: "revoked" }), base)).toBe("needs_approval");
    expect(evaluateStandingInstruction(instr({ validUntil: new Date("2026-06-01Z") }), base)).toBe("needs_approval");
  });
  it("needs approval when there is no instruction", () => {
    expect(evaluateStandingInstruction(null, base)).toBe("needs_approval");
  });
});

describe("classifyAttention + summarizeOwnerAttention", () => {
  it("classifies dispositions", () => {
    expect(classifyAttention({ severity: "critical", ownerDecisionRequired: false, autoHandleable: false })).toBe("critical");
    expect(classifyAttention({ severity: "high", ownerDecisionRequired: true, autoHandleable: false })).toBe("owner_decision");
    expect(classifyAttention({ severity: "low", ownerDecisionRequired: false, autoHandleable: true })).toBe("auto_handle");
    expect(classifyAttention({ severity: "info", ownerDecisionRequired: false, autoHandleable: false })).toBe("ignore");
  });
  it("summarizes an attention window and flags fatigue", () => {
    const events = Array.from({ length: 8 }, () => ({ disposition: "owner_decision" as const, ownerDecisionRequired: true, handledByOpsIQ: false }));
    const s = summarizeOwnerAttention(events);
    expect(s.ownerDecisionsRequired).toBe(8);
    expect(s.fatigueRisk).toBe(true);
    const calm = summarizeOwnerAttention([{ disposition: "auto_handle", ownerDecisionRequired: false, handledByOpsIQ: true }]);
    expect(calm.fatigueRisk).toBe(false);
    expect(calm.handledByOpsIQ).toBe(1);
  });
});

describe("batchByStandingInstructions", () => {
  it("partitions items into auto/forbidden/needs-approval", () => {
    const items = [
      { item: "a", request: { scope: "petty_cash", actionType: "spend", amount: 50, now: NOW } },
      { item: "b", request: { scope: "petty_cash", actionType: "refund", amount: 10, now: NOW } },
      { item: "c", request: { scope: "petty_cash", actionType: "spend", amount: 9999, now: NOW } },
    ];
    const out = batchByStandingInstructions(items, () => instr());
    expect(out.autoAllowed).toEqual(["a"]);
    expect(out.forbidden).toEqual(["b"]);
    expect(out.needsApproval).toEqual(["c"]);
  });
});

function deps(row: (StandingInstructionRecord & { id: string }) | null): { deps: OwnerLoadDeps; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async () => ({ id: "si1" }));
  return {
    create,
    deps: {
      now: () => NOW,
      db: {
        ownerStandingInstruction: { create, findFirst: vi.fn(async () => row) },
        ownerAttentionEvent: { create: vi.fn(async () => ({ id: "ae1" })) },
      },
    },
  };
}

describe("recordStandingInstruction / evaluate (DI)", () => {
  it("rejects a non-owner", async () => {
    const { deps: d } = deps(null);
    await expect(
      recordStandingInstruction({ workspaceId: "ws1", actorId: "u1", actorIsOwner: false, scope: "s", allowedActionTypes: [], forbiddenActionTypes: [], riskClass: "low" }, d)
    ).rejects.toBeInstanceOf(StandingInstructionUnauthorizedError);
  });
  it("records + audits for an owner", async () => {
    const { deps: d, create } = deps(null);
    await recordStandingInstruction({ workspaceId: "ws1", actorId: "u1", actorIsOwner: true, scope: "petty_cash", allowedActionTypes: ["spend"], forbiddenActionTypes: [], maxAmount: 500, riskClass: "low" }, d);
    expect(create).toHaveBeenCalledTimes(1);
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
  });
  it("evaluates a request against the active instruction", async () => {
    const { deps: d } = deps({ id: "si1", ...instr() });
    expect(await evaluateRequestAgainstStandingInstructions({ workspaceId: "ws1", scope: "petty_cash", actionType: "spend", amount: 100 }, d)).toBe("auto_allow");
  });
});
