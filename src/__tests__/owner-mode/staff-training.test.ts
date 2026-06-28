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
  GenericTrainingRejectedError,
  EquipmentAuthorizationDeniedError,
  type TrainingDeps,
} from "@/services/owner-mode/staff-training.service";

const NOW = new Date("2026-06-28T00:00:00Z");
beforeEach(() => emitAuditEvent.mockClear());

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
