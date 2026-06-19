import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  setRolloutFlag,
  getRolloutFlag,
  listRolloutFlagsForWorkspace,
} from "@/services/controlled-learning-rollout.service";
import {
  recordRollbackEvent,
  listRollbackEventsForCandidate,
  listRollbackEventsForWorkspace,
  hasBeenRolledBack,
} from "@/services/controlled-learning-rollback.service";

const mockPrisma = {
  controlledLearningRolloutFlag: { upsert: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  controlledLearningRollbackEvent: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  controlledLearningCandidate: { findFirst: vi.fn() },
  controlledLearningRegressionResult: { findFirst: vi.fn() },
  controlledLearningHarmEvent: { findFirst: vi.fn() },
  controlledLearningCandidateAuditEntry: { create: vi.fn().mockResolvedValue({}) },
} as unknown as PrismaClient;

const WS = "ws-001";
const OTHER_WS = "ws-002";
const CAND = "cand-001";
const NOW = new Date("2026-06-19T10:00:00Z");

const mockCandidate = { id: CAND, workspaceId: WS };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: passing regression exists and no critical harm — allows rollout to proceed in happy-path tests.
  // Individual blocking tests override these.
  (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue({ id: "reg-1" });
  (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
});

// ── Rollout Flag: valid stages ──────────────────────────────────────────────

describe("setRolloutFlag — valid stages", () => {
  it("accepts SHADOW stage", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "flag-1", rolloutStage: "SHADOW" });
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "SHADOW", rolloutPct: 0, enabledBy: "u1", enabledAt: NOW, flagNotes: "shadow test" });
    expect(r.set).toBe(true);
    expect(r.violations).toHaveLength(0);
    expect((r.flag as any).rolloutStage).toBe("SHADOW");
  });

  it("accepts CANARY stage", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "flag-2", rolloutStage: "CANARY" });
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY", rolloutPct: 5, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(true);
    expect((r.flag as any).rolloutStage).toBe("CANARY");
  });

  it("accepts PARTIAL stage", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "flag-3", rolloutStage: "PARTIAL" });
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "PARTIAL", rolloutPct: 25, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(true);
    expect((r.flag as any).rolloutStage).toBe("PARTIAL");
  });

  it("accepts FULL stage", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "flag-4", rolloutStage: "FULL" });
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "FULL", rolloutPct: 100, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(true);
    expect((r.flag as any).rolloutStage).toBe("FULL");
  });

  it("accepts PAUSED stage", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "flag-5", rolloutStage: "PAUSED" });
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "PAUSED", rolloutPct: 0, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(true);
    expect((r.flag as any).rolloutStage).toBe("PAUSED");
  });
});

// ── Rollout Flag: invalid stage ─────────────────────────────────────────────

describe("setRolloutFlag — validation", () => {
  it("rejects invalid rolloutStage", async () => {
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "YOLO" as any, rolloutPct: 50, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(false);
    expect(r.violations.some(v => v.includes("rolloutStage"))).toBe(true);
    expect((mockPrisma as any).controlledLearningCandidate.findFirst).not.toHaveBeenCalled();
  });

  it("rejects rolloutPct above 100", async () => {
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY", rolloutPct: 101, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(false);
    expect(r.violations.some(v => v.includes("rolloutPct"))).toBe(true);
  });

  it("rejects rolloutPct below 0", async () => {
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY", rolloutPct: -1, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(false);
    expect(r.violations.some(v => v.includes("rolloutPct"))).toBe(true);
  });

  it("accepts rolloutPct of exactly 0", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "f", rolloutPct: 0 });
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "SHADOW", rolloutPct: 0, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(true);
  });

  it("accepts rolloutPct of exactly 100", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "f", rolloutPct: 100 });
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "FULL", rolloutPct: 100, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(true);
  });

  it("rejects empty workspaceId with security throw", async () => {
    await expect(
      setRolloutFlag(mockPrisma, { workspaceId: "", candidateId: CAND, rolloutStage: "FULL", rolloutPct: 100, enabledBy: "u1", enabledAt: NOW, flagNotes: "" })
    ).rejects.toThrow(/SEC-007\/008/);
  });

  it("rejects candidate not found in workspace", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "FULL", rolloutPct: 100, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });
    expect(r.set).toBe(false);
    expect(r.violations[0]).toMatch(/not found/);
  });

  it("upserts when flag already exists (updates)", async () => {
    const existing = { id: "flag-existing", rolloutStage: "SHADOW", rolloutPct: 0 };
    const updated = { id: "flag-existing", rolloutStage: "FULL", rolloutPct: 100 };
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue(updated);
    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "FULL", rolloutPct: 100, enabledBy: "u2", enabledAt: NOW, flagNotes: "upgrade" });
    expect(r.set).toBe(true);
    expect((r.flag as any).rolloutStage).toBe("FULL");
    expect((mockPrisma as any).controlledLearningRolloutFlag.upsert).toHaveBeenCalledTimes(1);
  });
});

// ── getRolloutFlag ──────────────────────────────────────────────────────────

describe("getRolloutFlag", () => {
  it("returns existing flag", async () => {
    const flag = { id: "f1", workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY" };
    (mockPrisma as any).controlledLearningRolloutFlag.findFirst.mockResolvedValue(flag);
    const result = await getRolloutFlag(mockPrisma, WS, CAND);
    expect(result).toEqual(flag);
  });

  it("returns null if no flag exists", async () => {
    (mockPrisma as any).controlledLearningRolloutFlag.findFirst.mockResolvedValue(null);
    const result = await getRolloutFlag(mockPrisma, WS, CAND);
    expect(result).toBeNull();
  });

  it("scopes query to workspaceId", async () => {
    (mockPrisma as any).controlledLearningRolloutFlag.findFirst.mockResolvedValue(null);
    await getRolloutFlag(mockPrisma, OTHER_WS, CAND);
    expect((mockPrisma as any).controlledLearningRolloutFlag.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: OTHER_WS }) })
    );
  });
});

// ── listRolloutFlagsForWorkspace ────────────────────────────────────────────

describe("listRolloutFlagsForWorkspace", () => {
  it("returns all flags for workspace", async () => {
    const flags = [{ id: "f1" }, { id: "f2" }];
    (mockPrisma as any).controlledLearningRolloutFlag.findMany.mockResolvedValue(flags);
    const result = await listRolloutFlagsForWorkspace(mockPrisma, WS);
    expect(result).toHaveLength(2);
  });

  it("scopes to workspaceId only", async () => {
    (mockPrisma as any).controlledLearningRolloutFlag.findMany.mockResolvedValue([]);
    await listRolloutFlagsForWorkspace(mockPrisma, WS);
    expect((mockPrisma as any).controlledLearningRolloutFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS } })
    );
  });
});

// ── recordRollbackEvent: valid codes ────────────────────────────────────────

describe("recordRollbackEvent — valid codes", () => {
  it("accepts REGRESSION_DETECTED", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRollbackEvent.create.mockResolvedValue({ id: "rb-1", rollbackCode: "REGRESSION_DETECTED" });
    const r = await recordRollbackEvent(mockPrisma, { workspaceId: WS, candidateId: CAND, rolledBackBy: "u1", rolledBackAt: NOW, rollbackReason: "Scores dropped", rollbackCode: "REGRESSION_DETECTED" });
    expect(r.recorded).toBe(true);
    expect((r.event as any).rollbackCode).toBe("REGRESSION_DETECTED");
  });

  it("accepts HARM_DETECTED", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRollbackEvent.create.mockResolvedValue({ id: "rb-2", rollbackCode: "HARM_DETECTED" });
    const r = await recordRollbackEvent(mockPrisma, { workspaceId: WS, candidateId: CAND, rolledBackBy: "u1", rolledBackAt: NOW, rollbackReason: "Harm detected", rollbackCode: "HARM_DETECTED" });
    expect(r.recorded).toBe(true);
    expect((r.event as any).rollbackCode).toBe("HARM_DETECTED");
  });

  it("accepts MANUAL_OVERRIDE", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRollbackEvent.create.mockResolvedValue({ id: "rb-3", rollbackCode: "MANUAL_OVERRIDE" });
    const r = await recordRollbackEvent(mockPrisma, { workspaceId: WS, candidateId: CAND, rolledBackBy: "u1", rolledBackAt: NOW, rollbackReason: "Manual", rollbackCode: "MANUAL_OVERRIDE" });
    expect(r.recorded).toBe(true);
  });

  it("accepts POLICY_VIOLATION", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRollbackEvent.create.mockResolvedValue({ id: "rb-4", rollbackCode: "POLICY_VIOLATION" });
    const r = await recordRollbackEvent(mockPrisma, { workspaceId: WS, candidateId: CAND, rolledBackBy: "u1", rolledBackAt: NOW, rollbackReason: "Violated policy", rollbackCode: "POLICY_VIOLATION" });
    expect(r.recorded).toBe(true);
  });
});

// ── recordRollbackEvent: validation ────────────────────────────────────────

describe("recordRollbackEvent — validation", () => {
  it("rejects invalid rollbackCode", async () => {
    const r = await recordRollbackEvent(mockPrisma, { workspaceId: WS, candidateId: CAND, rolledBackBy: "u1", rolledBackAt: NOW, rollbackReason: "x", rollbackCode: "UNKNOWN" as any });
    expect(r.recorded).toBe(false);
    expect(r.violations.some(v => v.includes("rollbackCode"))).toBe(true);
    expect((mockPrisma as any).controlledLearningCandidate.findFirst).not.toHaveBeenCalled();
  });

  it("rejects missing rolledBackBy", async () => {
    const r = await recordRollbackEvent(mockPrisma, { workspaceId: WS, candidateId: CAND, rolledBackBy: "", rolledBackAt: NOW, rollbackReason: "x", rollbackCode: "MANUAL_OVERRIDE" });
    expect(r.recorded).toBe(false);
    expect(r.violations.some(v => v.includes("rolledBackBy"))).toBe(true);
  });

  it("rejects missing rollbackReason", async () => {
    const r = await recordRollbackEvent(mockPrisma, { workspaceId: WS, candidateId: CAND, rolledBackBy: "u1", rolledBackAt: NOW, rollbackReason: "", rollbackCode: "MANUAL_OVERRIDE" });
    expect(r.recorded).toBe(false);
    expect(r.violations.some(v => v.includes("rollbackReason"))).toBe(true);
  });

  it("rejects candidate not in workspace", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);
    const r = await recordRollbackEvent(mockPrisma, { workspaceId: WS, candidateId: CAND, rolledBackBy: "u1", rolledBackAt: NOW, rollbackReason: "x", rollbackCode: "REGRESSION_DETECTED" });
    expect(r.recorded).toBe(false);
    expect(r.violations[0]).toMatch(/not found/);
  });

  it("allows multiple rollback events for same candidate", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRollbackEvent.create
      .mockResolvedValueOnce({ id: "rb-a" })
      .mockResolvedValueOnce({ id: "rb-b" });
    const r1 = await recordRollbackEvent(mockPrisma, { workspaceId: WS, candidateId: CAND, rolledBackBy: "u1", rolledBackAt: NOW, rollbackReason: "first", rollbackCode: "REGRESSION_DETECTED" });
    const r2 = await recordRollbackEvent(mockPrisma, { workspaceId: WS, candidateId: CAND, rolledBackBy: "u2", rolledBackAt: NOW, rollbackReason: "second", rollbackCode: "HARM_DETECTED" });
    expect(r1.recorded).toBe(true);
    expect(r2.recorded).toBe(true);
    expect((mockPrisma as any).controlledLearningRollbackEvent.create).toHaveBeenCalledTimes(2);
  });
});

// ── listRollbackEventsForCandidate ──────────────────────────────────────────

describe("listRollbackEventsForCandidate", () => {
  it("returns events scoped to candidate and workspace", async () => {
    const events = [{ id: "e1" }, { id: "e2" }];
    (mockPrisma as any).controlledLearningRollbackEvent.findMany.mockResolvedValue(events);
    const result = await listRollbackEventsForCandidate(mockPrisma, WS, CAND);
    expect(result).toHaveLength(2);
    expect((mockPrisma as any).controlledLearningRollbackEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS, candidateId: CAND } })
    );
  });

  it("returns empty if no events", async () => {
    (mockPrisma as any).controlledLearningRollbackEvent.findMany.mockResolvedValue([]);
    const result = await listRollbackEventsForCandidate(mockPrisma, WS, CAND);
    expect(result).toHaveLength(0);
  });
});

// ── listRollbackEventsForWorkspace ──────────────────────────────────────────

describe("listRollbackEventsForWorkspace", () => {
  it("returns all events for workspace", async () => {
    const events = [{ id: "e1" }, { id: "e2" }, { id: "e3" }];
    (mockPrisma as any).controlledLearningRollbackEvent.findMany.mockResolvedValue(events);
    const result = await listRollbackEventsForWorkspace(mockPrisma, WS);
    expect(result).toHaveLength(3);
  });

  it("scopes to workspaceId only", async () => {
    (mockPrisma as any).controlledLearningRollbackEvent.findMany.mockResolvedValue([]);
    await listRollbackEventsForWorkspace(mockPrisma, OTHER_WS);
    expect((mockPrisma as any).controlledLearningRollbackEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: OTHER_WS } })
    );
  });
});

// ── hasBeenRolledBack ────────────────────────────────────────────────────────

describe("hasBeenRolledBack", () => {
  it("returns true when a rollback event exists", async () => {
    (mockPrisma as any).controlledLearningRollbackEvent.findFirst.mockResolvedValue({ id: "rb-1" });
    const result = await hasBeenRolledBack(mockPrisma, WS, CAND);
    expect(result).toBe(true);
  });

  it("returns false when no rollback event exists", async () => {
    (mockPrisma as any).controlledLearningRollbackEvent.findFirst.mockResolvedValue(null);
    const result = await hasBeenRolledBack(mockPrisma, WS, CAND);
    expect(result).toBe(false);
  });

  it("scopes check to workspaceId and candidateId", async () => {
    (mockPrisma as any).controlledLearningRollbackEvent.findFirst.mockResolvedValue(null);
    await hasBeenRolledBack(mockPrisma, OTHER_WS, CAND);
    expect((mockPrisma as any).controlledLearningRollbackEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: OTHER_WS, candidateId: CAND } })
    );
  });

  it("workspace isolation: different workspace returns false even if same candidateId has rollback in another ws", async () => {
    (mockPrisma as any).controlledLearningRollbackEvent.findFirst.mockResolvedValue(null);
    const result = await hasBeenRolledBack(mockPrisma, OTHER_WS, CAND);
    expect(result).toBe(false);
  });
});

// ── Cross-tenant isolation: setRolloutFlag ──────────────────────────────────

describe("setRolloutFlag — cross-tenant isolation", () => {
  it("denies flag when candidateId belongs to a different workspace", async () => {
    // Candidate exists in WS but query is for OTHER_WS — findFirst returns null (correct scoping)
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);
    const r = await setRolloutFlag(mockPrisma, {
      workspaceId: OTHER_WS,
      candidateId: CAND,
      rolloutStage: "FULL",
      rolloutPct: 100,
      enabledBy: "u1",
      enabledAt: NOW,
      flagNotes: "",
    });
    expect(r.set).toBe(false);
    expect(r.violations).toContain("Candidate not found in workspace");
  });

  it("scopes candidate lookup to requesting workspaceId", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(null);
    await setRolloutFlag(mockPrisma, {
      workspaceId: OTHER_WS,
      candidateId: CAND,
      rolloutStage: "CANARY",
      rolloutPct: 5,
      enabledBy: "u1",
      enabledAt: NOW,
      flagNotes: "",
    });
    expect((mockPrisma as any).controlledLearningCandidate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CAND, workspaceId: OTHER_WS } })
    );
  });

  it("throws on empty workspaceId before reaching DB", async () => {
    await expect(
      setRolloutFlag(mockPrisma, {
        workspaceId: "   ",
        candidateId: CAND,
        rolloutStage: "FULL",
        rolloutPct: 100,
        enabledBy: "u1",
        enabledAt: NOW,
        flagNotes: "",
      })
    ).rejects.toThrow(/SEC-007\/008/);
    expect((mockPrisma as any).controlledLearningCandidate.findFirst).not.toHaveBeenCalled();
  });
});

// ── HIGH-5: PASS regression prerequisite ────────────────────────────────────

describe("setRolloutFlag — HIGH-5: regression prerequisite", () => {
  it("blocks rollout when no regression result exists", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue(null);

    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY", rolloutPct: 5, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });

    expect(r.set).toBe(false);
    expect(r.violations[0]).toMatch(/passing regression/i);
    expect((mockPrisma as any).controlledLearningRolloutFlag.upsert).not.toHaveBeenCalled();
  });

  it("blocks rollout when only a FAIL regression result exists", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    // findFirst for PASS verdict returns null; simulate by returning null for the PASS query
    (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue(null);

    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "PARTIAL", rolloutPct: 25, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });

    expect(r.set).toBe(false);
    expect(r.violations[0]).toMatch(/passing regression/i);
  });

  it("writes ROLLOUT_BLOCKED_NO_PASSING_REGRESSION audit entry when blocked", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue(null);

    await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY", rolloutPct: 5, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });

    expect((mockPrisma as any).controlledLearningCandidateAuditEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ROLLOUT_BLOCKED_NO_PASSING_REGRESSION" }),
      })
    );
  });

  it("allows rollout when a PASS regression result exists", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue({ id: "reg-pass" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "flag-1", rolloutStage: "CANARY" });

    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY", rolloutPct: 5, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });

    expect(r.set).toBe(true);
    expect((mockPrisma as any).controlledLearningRolloutFlag.upsert).toHaveBeenCalledTimes(1);
  });

  it("regression query is scoped to workspaceId and candidateId", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue(null);

    await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY", rolloutPct: 5, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });

    expect((mockPrisma as any).controlledLearningRegressionResult.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ candidateId: CAND, workspaceId: WS, testVerdict: "PASS" }),
      })
    );
  });
});

// ── HIGH-4: unmitigated CRITICAL harm blocks rollout ─────────────────────────

describe("setRolloutFlag — HIGH-4: harm circuit breaker", () => {
  it("blocks rollout when an unmitigated CRITICAL harm event exists", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue({ id: "reg-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue({ id: "harm-1" });

    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY", rolloutPct: 5, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });

    expect(r.set).toBe(false);
    expect(r.violations[0]).toMatch(/CRITICAL harm/i);
    expect((mockPrisma as any).controlledLearningRolloutFlag.upsert).not.toHaveBeenCalled();
  });

  it("writes ROLLOUT_BLOCKED_CRITICAL_HARM audit entry when blocked", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue({ id: "reg-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue({ id: "harm-1" });

    await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY", rolloutPct: 5, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });

    expect((mockPrisma as any).controlledLearningCandidateAuditEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ROLLOUT_BLOCKED_CRITICAL_HARM" }),
      })
    );
  });

  it("allows rollout when CRITICAL harm is mitigated (findFirst returns null)", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue({ id: "reg-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "flag-1", rolloutStage: "CANARY" });

    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY", rolloutPct: 5, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });

    expect(r.set).toBe(true);
  });

  it("allows rollout when only HIGH/MEDIUM harm events exist (not CRITICAL)", async () => {
    // The harm query filters severity=CRITICAL — HIGH/MEDIUM events return null from that query
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue({ id: "reg-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "flag-1", rolloutStage: "PARTIAL" });

    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "PARTIAL", rolloutPct: 30, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });

    expect(r.set).toBe(true);
  });

  it("harm query is scoped to workspaceId, candidateId, severity=CRITICAL, mitigated=false", async () => {
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue({ id: "reg-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null);
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "flag-1" });

    await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "SHADOW", rolloutPct: 1, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });

    expect((mockPrisma as any).controlledLearningHarmEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ candidateId: CAND, workspaceId: WS, severity: "CRITICAL", mitigated: false }),
      })
    );
  });

  it("cross-workspace harm does not block unrelated workspace rollout", async () => {
    // Other workspace has CRITICAL harm; this workspace's query returns null
    (mockPrisma as any).controlledLearningCandidate.findFirst.mockResolvedValue(mockCandidate);
    (mockPrisma as any).controlledLearningRegressionResult.findFirst.mockResolvedValue({ id: "reg-1" });
    (mockPrisma as any).controlledLearningHarmEvent.findFirst.mockResolvedValue(null); // scoped to WS, not OTHER_WS
    (mockPrisma as any).controlledLearningRolloutFlag.upsert.mockResolvedValue({ id: "flag-1" });

    const r = await setRolloutFlag(mockPrisma, { workspaceId: WS, candidateId: CAND, rolloutStage: "CANARY", rolloutPct: 5, enabledBy: "u1", enabledAt: NOW, flagNotes: "" });

    expect(r.set).toBe(true);
  });
});
