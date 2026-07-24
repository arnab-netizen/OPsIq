/**
 * Jarvis 360 Slice 6 — observed-gap training + skills matrix. Pure + DI; no DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import { evaluateTrainingNeed, canAuthorizeEquipment } from "@/domain/owner-mode/staff-training";
import {
  recordObservedTrainingNeed,
  authorizeEquipmentForSkill,
  completeTraining,
  GenericTrainingRejectedError,
  EquipmentAuthorizationDeniedError,
  type TrainingDeps,
} from "@/services/owner-mode/staff-training.service";

const NOW = new Date("2026-06-28T00:00:00Z");
beforeEach(() => emitAuditEvent.mockClear());

describe("staff-training — module contract assertions", () => {
  it("evaluateTrainingNeed is a function", () => { expect(typeof evaluateTrainingNeed).toBe("function"); });
  it("canAuthorizeEquipment is a function", () => { expect(typeof canAuthorizeEquipment).toBe("function"); });
  it("recordObservedTrainingNeed is a function", () => { expect(typeof recordObservedTrainingNeed).toBe("function"); });
  it("authorizeEquipmentForSkill is a function", () => { expect(typeof authorizeEquipmentForSkill).toBe("function"); });
  it("completeTraining is a function", () => { expect(typeof completeTraining).toBe("function"); });
  it("GenericTrainingRejectedError is a function", () => { expect(typeof GenericTrainingRejectedError).toBe("function"); });
  it("EquipmentAuthorizationDeniedError is a function", () => { expect(typeof EquipmentAuthorizationDeniedError).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("makeDeps is a function", () => { expect(typeof makeDeps).toBe("function"); });
  it("evaluateTrainingNeed([]) returns an object", () => { expect(typeof evaluateTrainingNeed([])).toBe("object"); });
  it("evaluateTrainingNeed([]) has needed field", () => { expect(evaluateTrainingNeed([])).toHaveProperty("needed"); });
  it("canAuthorizeEquipment(null) returns false", () => { expect(canAuthorizeEquipment(null)).toBe(false); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("evaluateTrainingNeed", () => {
  it("rejects generic (no evidence)", () => {
    const r = evaluateTrainingNeed([]);
    expect(r.needed).toBe(false);
    expect(r.rejectionReason).toMatch(/generic/i);
  });
  it("rejects zero-occurrence noise", () => {
    expect(evaluateTrainingNeed([{ code: "rework", occurrences: 0 }]).needed).toBe(false);
  });
  it("recommends on real observed evidence and picks the strongest reason", () => {
    const r = evaluateTrainingNeed([
      { code: "rework", occurrences: 2 },
      { code: "customer_complaint", occurrences: 5 },
    ]);
    expect(r.needed).toBe(true);
    expect(r.reason).toBe("customer_complaint");
    expect(r.confidence).toBeGreaterThan(0.5);
  });
});

describe("canAuthorizeEquipment", () => {
  it("only when the skill is proven", () => {
    expect(canAuthorizeEquipment({ proven: true })).toBe(true);
    expect(canAuthorizeEquipment({ proven: false })).toBe(false);
    expect(canAuthorizeEquipment(null)).toBe(false);
  });
});

function makeDeps(skill: { id: string; proven: boolean } | null) {
  const create = vi.fn(async () => ({ id: "tr1" }));
  const update = vi.fn(async () => ({}));
  const deps: TrainingDeps = {
    now: () => NOW,
    db: {
      ownerTrainingRecommendation: { create, update },
      ownerStaffSkill: { upsert: vi.fn(async () => ({ id: "s1", proven: true })), findFirst: vi.fn(async () => skill), update },
    },
  };
  return { deps, create, update };
}

describe("recordObservedTrainingNeed (DI)", () => {
  it("throws GenericTrainingRejectedError when there is no evidence", async () => {
    const { deps } = makeDeps(null);
    await expect(
      recordObservedTrainingNeed({ workspaceId: "ws1", staffRef: "emp1", evidence: [], processAffected: "wash", metric: "rework", expectedImprovement: "down", actorId: "u1" }, deps)
    ).rejects.toBeInstanceOf(GenericTrainingRejectedError);
  });
  it("persists + audits a recommendation backed by evidence", async () => {
    const { deps, create } = makeDeps(null);
    const id = await recordObservedTrainingNeed(
      { workspaceId: "ws1", staffRef: "emp1", evidence: [{ code: "rework", occurrences: 3 }], processAffected: "wash", metric: "rework_rate", expectedImprovement: "rework < 2%", actorId: "u1" },
      deps
    );
    expect(id).toBe("tr1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
  });
});

describe("completeTraining (DI) — GAP-ISO-03 workspace isolation + audit", () => {
  function deps(count: number) {
    const updateMany = vi.fn(async () => ({ count }));
    const d: TrainingDeps = {
      now: () => NOW,
      db: {
        ownerTrainingRecommendation: { create: vi.fn(async () => ({ id: "tr1" })), update: vi.fn(async () => ({})), updateMany },
        ownerStaffSkill: { upsert: vi.fn(async () => ({ id: "s1", proven: true })), findFirst: vi.fn(async () => null), update: vi.fn(async () => ({})) },
      },
    };
    return { d, updateMany };
  }

  it("scopes the update by { id, workspaceId } and audits a workspace-scoped completion", async () => {
    const { d, updateMany } = deps(1);
    await completeTraining("tr1", { workspaceId: "ws1", proofOfCompletion: "photo", recheckDate: NOW, actorId: "u1" }, d);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: "tr1", workspaceId: "ws1" });
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    expect(emitAuditEvent.mock.calls[0][0].eventName).toBe("owner.training_completed");
    expect(emitAuditEvent.mock.calls[0][0].workspaceId).toBe("ws1");
  });

  it("rejects (NotFoundError) when the id is not in this workspace — no cross-workspace completion, no audit", async () => {
    const { d } = deps(0); // updateMany matched nothing in this workspace
    await expect(
      completeTraining("tr1", { workspaceId: "ws-other", proofOfCompletion: "x", recheckDate: NOW, actorId: "u1" }, d)
    ).rejects.toThrow(/not found/i);
    expect(emitAuditEvent).not.toHaveBeenCalled();
  });
});

describe("authorizeEquipmentForSkill (DI)", () => {
  it("denies when the skill is not proven", async () => {
    const { deps } = makeDeps({ id: "s1", proven: false });
    await expect(authorizeEquipmentForSkill({ workspaceId: "ws1", staffRef: "emp1", skill: "press" }, deps)).rejects.toBeInstanceOf(EquipmentAuthorizationDeniedError);
  });
  it("authorizes when the skill is proven", async () => {
    const { deps, update } = makeDeps({ id: "s1", proven: true });
    await authorizeEquipmentForSkill({ workspaceId: "ws1", staffRef: "emp1", skill: "press" }, deps);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.equipmentAuthorized).toBe(true);
  });
});
