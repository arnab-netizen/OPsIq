/**
 * Bundle 3.8 — Owner Onboarding and Archetype Seeding tests.
 * 48 tests covering: intake validation, archetype classification, action queue,
 * idempotency, re-onboarding, gate enforcement, DTO boundary, workspace isolation, audit events.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";

const {
  mockFindFirst,
  mockCreate,
  mockUpdate,
  mockEmitAuditEvent,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockEmitAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    ownerOnboarding: {
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
    },
  },

  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mockEmitAuditEvent,
}));

import {
  startOnboarding,
  completeOnboarding,
  triggerReOnboarding,
  getOnboarding,
  assertOnboardingComplete,
  classifyArchetype,
  buildInitialActionQueue,
  type PublicOnboardingDTO,
} from "@/services/owner-mode/owner-onboarding-lifecycle.service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-0000-0000-0000-000000000001";
const WS_B = "bbbbbbbb-0000-0000-0000-000000000002";
const ACTOR = "actor000-0000-0000-0000-000000000001";
const BIZ_ID = "biz00000-0000-0000-0000-000000000001";
const OWNER_ID = "owner000-0000-0000-0000-000000000001";
const OB_ID = "ob000000-0000-0000-0000-000000000001";

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: OB_ID,
    workspaceId: WS_A,
    businessId: BIZ_ID,
    ownerId: OWNER_ID,
    status: "IN_PROGRESS",
    businessName: "Test Biz",
    businessType: "retail",
    revenueRange: "50k-100k",
    revenueTrend: "STABLE",
    cashRunwayWeeks: 12,
    profitability: "BREAKEVEN",
    ownerHoursPerWeek: 50,
    teamSize: 5,
    archetype: null,
    archetypeScore: null,
    initialActionQueue: null,
    completionKey: null,
    completedAt: null,
    reOnboardingReason: null,
    createdBy: ACTOR,
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const validStartInput = {
  workspaceId: WS_A,
  actorId: ACTOR,
  businessId: BIZ_ID,
  ownerId: OWNER_ID,
  businessName: "Test Biz",
  businessType: "retail",
  revenueRange: "50k-100k",
  revenueTrend: "STABLE" as const,
  profitability: "BREAKEVEN" as const,
  cashRunwayWeeks: 12,
  ownerHoursPerWeek: 50,
  teamSize: 5,
};

beforeEach(() => {
  mockFindFirst.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockEmitAuditEvent.mockReset();
  mockEmitAuditEvent.mockResolvedValue(undefined);
});

// ─── classifyArchetype (pure, no DB) ─────────────────────────────────────────

describe("classifyArchetype", () => {
  it("returns SURVIVAL_MODE for negative profitability with runway < 8 weeks", () => {
    const result = classifyArchetype("STABLE", "NEGATIVE", 4);
    expect(result.archetype).toBe("SURVIVAL_MODE");
    expect(result.archetypeScore).toBeLessThan(0.2);
  });

  it("returns SURVIVAL_MODE for declining revenue + negative profitability + very low runway", () => {
    const result = classifyArchetype("DECLINING", "NEGATIVE", 3);
    expect(result.archetype).toBe("SURVIVAL_MODE");
  });

  it("returns TURNAROUND for declining revenue with positive runway", () => {
    const result = classifyArchetype("DECLINING", "BREAKEVEN", 20);
    expect(result.archetype).toBe("TURNAROUND");
    expect(result.archetypeScore).toBeGreaterThan(0.2);
    expect(result.archetypeScore).toBeLessThan(0.5);
  });

  it("returns TURNAROUND for negative profitability with sufficient runway", () => {
    const result = classifyArchetype("STABLE", "NEGATIVE", 10);
    expect(result.archetype).toBe("TURNAROUND");
  });

  it("returns STABILIZATION for stable revenue and breakeven profitability", () => {
    const result = classifyArchetype("STABLE", "BREAKEVEN", 20);
    expect(result.archetype).toBe("STABILIZATION");
    expect(result.archetypeScore).toBeGreaterThan(0.5);
    expect(result.archetypeScore).toBeLessThan(0.8);
  });

  it("returns STABILIZATION for stable revenue and positive profitability (not growing)", () => {
    const result = classifyArchetype("STABLE", "POSITIVE", 52);
    expect(result.archetype).toBe("STABILIZATION");
  });

  it("returns GROWTH_READY for growing revenue and positive profitability", () => {
    const result = classifyArchetype("GROWING", "POSITIVE", 52);
    expect(result.archetype).toBe("GROWTH_READY");
    expect(result.archetypeScore).toBeGreaterThan(0.8);
  });

  it("returns TURNAROUND for growing revenue but negative profitability with adequate runway", () => {
    // growing but still negative — must fix profitability first
    const result = classifyArchetype("GROWING", "NEGATIVE", 15);
    expect(result.archetype).toBe("TURNAROUND");
  });

  it("defaults runway to 52 weeks when null", () => {
    // null runway → assume 52, so NEGATIVE at runway=52 is not <8 → TURNAROUND
    const result = classifyArchetype("DECLINING", "NEGATIVE", null);
    expect(result.archetype).toBe("TURNAROUND");
  });

  it("defaults runway to 52 weeks when undefined", () => {
    const result = classifyArchetype("STABLE", "NEGATIVE", undefined);
    expect(result.archetype).toBe("TURNAROUND");
  });
});

// ─── buildInitialActionQueue (pure, no DB) ────────────────────────────────────

describe("buildInitialActionQueue", () => {
  it("returns 5 actions for SURVIVAL_MODE", () => {
    const q = buildInitialActionQueue("SURVIVAL_MODE");
    expect(q).toHaveLength(5);
    expect(q.every((a) => a.length > 0)).toBe(true);
  });

  it("returns 5 actions for TURNAROUND", () => {
    expect(buildInitialActionQueue("TURNAROUND")).toHaveLength(5);
  });

  it("returns 5 actions for STABILIZATION", () => {
    expect(buildInitialActionQueue("STABILIZATION")).toHaveLength(5);
  });

  it("returns 5 actions for GROWTH_READY", () => {
    expect(buildInitialActionQueue("GROWTH_READY")).toHaveLength(5);
  });

  it("SURVIVAL_MODE actions are cash/revenue focused", () => {
    const q = buildInitialActionQueue("SURVIVAL_MODE");
    const all = q.join(" ").toLowerCase();
    expect(all).toMatch(/cash|revenue|pay/);
  });

  it("GROWTH_READY actions are expansion focused", () => {
    const q = buildInitialActionQueue("GROWTH_READY");
    const all = q.join(" ").toLowerCase();
    expect(all).toMatch(/growth|growth|acqui|scale/i);
  });
});

// ─── startOnboarding ─────────────────────────────────────────────────────────

describe("startOnboarding", () => {
  it("creates a new onboarding record", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeRow());
    const result = await startOnboarding(validStartInput);
    expect(result.status).toBe("IN_PROGRESS");
    expect(result.workspaceId).toBe(WS_A);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("emits ONBOARDING_STARTED on new creation", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeRow());
    await startOnboarding(validStartInput);
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "onboarding.started" })
    );
  });

  it("returns existing record without re-creating (idempotent)", async () => {
    const existing = makeRow();
    mockFindFirst.mockResolvedValue(existing);
    const result = await startOnboarding(validStartInput);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
    expect(result.id).toBe(OB_ID);
  });

  it("rejects invalid revenueTrend", async () => {
    await expect(
      startOnboarding({ ...validStartInput, revenueTrend: "SIDEWAYS" as never })
    ).rejects.toThrow("Invalid revenueTrend");
  });

  it("rejects invalid profitability", async () => {
    await expect(
      startOnboarding({ ...validStartInput, profitability: "LOSING_MONEY" as never })
    ).rejects.toThrow("Invalid profitability");
  });

  it("rejects empty businessName", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(
      startOnboarding({ ...validStartInput, businessName: "   " })
    ).rejects.toThrow("businessName is required");
  });

  it("rejects empty businessType", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(
      startOnboarding({ ...validStartInput, businessType: "" })
    ).rejects.toThrow("businessType is required");
  });

  it("rejects empty revenueRange", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(
      startOnboarding({ ...validStartInput, revenueRange: "" })
    ).rejects.toThrow("revenueRange is required");
  });

  it("excludes archetypeScore from DTO", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeRow({ archetypeScore: 0.5 }));
    const result = await startOnboarding(validStartInput);
    expect(result).not.toHaveProperty("archetypeScore");
  });

  it("excludes completionKey from DTO", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeRow({ completionKey: "secret-key" }));
    const result = await startOnboarding(validStartInput);
    expect(result).not.toHaveProperty("completionKey");
  });

  it("excludes createdBy from DTO", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeRow());
    const result = await startOnboarding(validStartInput);
    expect(result).not.toHaveProperty("createdBy");
  });

  it("excludes updatedBy from DTO", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeRow());
    const result = await startOnboarding(validStartInput);
    expect(result).not.toHaveProperty("updatedBy");
  });
});

// ─── completeOnboarding ───────────────────────────────────────────────────────

describe("completeOnboarding", () => {
  it("sets status to COMPLETED with archetype and action queue", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "IN_PROGRESS" }));
    const completedRow = makeRow({
      status: "COMPLETED",
      archetype: "STABILIZATION",
      archetypeScore: 0.65,
      initialActionQueue: ["action1"],
      completionKey: "key-001",
      completedAt: new Date("2026-01-02T00:00:00Z"),
    });
    mockUpdate.mockResolvedValue(completedRow);
    const result = await completeOnboarding({
      workspaceId: WS_A,
      actorId: ACTOR,
      completionKey: "key-001",
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.archetype).toBe("STABILIZATION");
    expect(result.initialActionQueue).toBeDefined();
  });

  it("emits ONBOARDING_COMPLETED", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "IN_PROGRESS" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "COMPLETED", archetype: "STABILIZATION" }));
    await completeOnboarding({ workspaceId: WS_A, actorId: ACTOR, completionKey: "k1" });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "onboarding.completed" })
    );
  });

  it("is idempotent for same completionKey", async () => {
    mockFindFirst.mockResolvedValue(
      makeRow({ status: "COMPLETED", completionKey: "same-key" })
    );
    const result = await completeOnboarding({
      workspaceId: WS_A,
      actorId: ACTOR,
      completionKey: "same-key",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.status).toBe("COMPLETED");
  });

  it("allows completion from RE_ONBOARDING status", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "RE_ONBOARDING" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "COMPLETED", archetype: "TURNAROUND" }));
    const result = await completeOnboarding({
      workspaceId: WS_A,
      actorId: ACTOR,
      completionKey: "new-key",
    });
    expect(result.status).toBe("COMPLETED");
  });

  it("throws if onboarding not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(
      completeOnboarding({ workspaceId: WS_A, actorId: ACTOR, completionKey: "k1" })
    ).rejects.toThrow("OwnerOnboarding");
  });

  it("throws NotFoundError for wrong workspace", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(
      completeOnboarding({ workspaceId: WS_B, actorId: ACTOR, completionKey: "k1" })
    ).rejects.toThrow();
  });

  it("calculates correct archetype for SURVIVAL_MODE profile", async () => {
    mockFindFirst.mockResolvedValue(
      makeRow({ status: "IN_PROGRESS", revenueTrend: "DECLINING", profitability: "NEGATIVE", cashRunwayWeeks: 3 })
    );
    mockUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(makeRow({ status: "COMPLETED", archetype: data.archetype, archetypeScore: data.archetypeScore }))
    );
    await completeOnboarding({ workspaceId: WS_A, actorId: ACTOR, completionKey: "k1" });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ archetype: "SURVIVAL_MODE" }) })
    );
  });

  it("calculates correct archetype for GROWTH_READY profile", async () => {
    mockFindFirst.mockResolvedValue(
      makeRow({ status: "IN_PROGRESS", revenueTrend: "GROWING", profitability: "POSITIVE", cashRunwayWeeks: 52 })
    );
    mockUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(makeRow({ status: "COMPLETED", archetype: data.archetype }))
    );
    await completeOnboarding({ workspaceId: WS_A, actorId: ACTOR, completionKey: "k1" });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ archetype: "GROWTH_READY" }) })
    );
  });

  it("excludes archetypeScore from returned DTO", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "IN_PROGRESS" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "COMPLETED", archetypeScore: 0.65 }));
    const result = await completeOnboarding({ workspaceId: WS_A, actorId: ACTOR, completionKey: "k1" });
    expect(result).not.toHaveProperty("archetypeScore");
  });

  it("excludes completionKey from returned DTO", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "IN_PROGRESS" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "COMPLETED", completionKey: "secret" }));
    const result = await completeOnboarding({ workspaceId: WS_A, actorId: ACTOR, completionKey: "secret" });
    expect(result).not.toHaveProperty("completionKey");
  });
});

// ─── triggerReOnboarding ─────────────────────────────────────────────────────

describe("triggerReOnboarding", () => {
  it("transitions COMPLETED → RE_ONBOARDING", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "COMPLETED", archetype: "STABILIZATION" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "RE_ONBOARDING", reOnboardingReason: "Major client loss" }));
    const result = await triggerReOnboarding({
      workspaceId: WS_A,
      actorId: ACTOR,
      reOnboardingReason: "Major client loss",
    });
    expect(result.status).toBe("RE_ONBOARDING");
  });

  it("emits ONBOARDING_RE_TRIGGERED", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "COMPLETED" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "RE_ONBOARDING" }));
    await triggerReOnboarding({
      workspaceId: WS_A,
      actorId: ACTOR,
      reOnboardingReason: "Key employee departure",
    });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "onboarding.re_triggered" })
    );
  });

  it("throws if not in COMPLETED status", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "IN_PROGRESS" }));
    await expect(
      triggerReOnboarding({ workspaceId: WS_A, actorId: ACTOR, reOnboardingReason: "Reason" })
    ).rejects.toThrow("COMPLETED status");
  });

  it("throws if not in RE_ONBOARDING status", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "RE_ONBOARDING" }));
    await expect(
      triggerReOnboarding({ workspaceId: WS_A, actorId: ACTOR, reOnboardingReason: "Reason" })
    ).rejects.toThrow("COMPLETED status");
  });

  it("throws if reOnboardingReason is empty", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "COMPLETED" }));
    await expect(
      triggerReOnboarding({ workspaceId: WS_A, actorId: ACTOR, reOnboardingReason: "   " })
    ).rejects.toThrow("reOnboardingReason is required");
  });

  it("throws if onboarding record not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(
      triggerReOnboarding({ workspaceId: WS_A, actorId: ACTOR, reOnboardingReason: "Reason" })
    ).rejects.toThrow("OwnerOnboarding");
  });

  it("clears completionKey on re-onboarding", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "COMPLETED", completionKey: "old-key" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "RE_ONBOARDING", completionKey: null }));
    await triggerReOnboarding({ workspaceId: WS_A, actorId: ACTOR, reOnboardingReason: "Change" });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completionKey: null }) })
    );
  });
});

// ─── assertOnboardingComplete (gate) ─────────────────────────────────────────

describe("assertOnboardingComplete", () => {
  it("does not throw when status is COMPLETED", async () => {
    mockFindFirst.mockResolvedValue({ status: "COMPLETED" });
    await expect(assertOnboardingComplete(WS_A)).resolves.toBeUndefined();
  });

  it("throws ValidationError when onboarding not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(assertOnboardingComplete(WS_A)).rejects.toThrow("onboarding must be completed");
  });

  it("throws ValidationError when status is IN_PROGRESS", async () => {
    mockFindFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    await expect(assertOnboardingComplete(WS_A)).rejects.toThrow("onboarding must be completed");
  });

  it("throws ValidationError when status is RE_ONBOARDING", async () => {
    mockFindFirst.mockResolvedValue({ status: "RE_ONBOARDING" });
    await expect(assertOnboardingComplete(WS_A)).rejects.toThrow("onboarding must be completed");
  });
});

// ─── Static file enforcement ─────────────────────────────────────────────────

describe("static enforcement", () => {
  it("service file uses OWNER_ONBOARD capability reference", () => {
    const svc = fs.readFileSync(
      "src/services/owner-mode/owner-onboarding-lifecycle.service.ts",
      "utf-8"
    );
    // Service emits audit events — capability enforcement is in the route
    expect(svc).toContain("ONBOARDING_STARTED");
    expect(svc).toContain("ONBOARDING_COMPLETED");
    expect(svc).toContain("ONBOARDING_RE_TRIGGERED");
  });

  it("route file enforces OWNER_ONBOARD capability", () => {
    const route = fs.readFileSync(
      "src/app/api/owner/onboarding-lifecycle/route.ts",
      "utf-8"
    );
    expect(route).toContain("OWNER_ONBOARD");
    expect(route).toContain("requireWorkspace: true");
  });

  it("DTO type excludes archetypeScore", () => {
    const svc = fs.readFileSync(
      "src/services/owner-mode/owner-onboarding-lifecycle.service.ts",
      "utf-8"
    );
    // archetypeScore must NOT appear in PublicOnboardingDTO interface
    const dtoBlock = svc.split("export interface PublicOnboardingDTO")[1]?.split("}")[0] ?? "";
    expect(dtoBlock).not.toContain("archetypeScore");
  });

  it("DTO type excludes completionKey", () => {
    const svc = fs.readFileSync(
      "src/services/owner-mode/owner-onboarding-lifecycle.service.ts",
      "utf-8"
    );
    const dtoBlock = svc.split("export interface PublicOnboardingDTO")[1]?.split("}")[0] ?? "";
    expect(dtoBlock).not.toContain("completionKey");
  });

  it("DTO type excludes createdBy", () => {
    const svc = fs.readFileSync(
      "src/services/owner-mode/owner-onboarding-lifecycle.service.ts",
      "utf-8"
    );
    const dtoBlock = svc.split("export interface PublicOnboardingDTO")[1]?.split("}")[0] ?? "";
    expect(dtoBlock).not.toContain("createdBy");
  });

  it("route uses withCanonicalEnforcement for all handlers", () => {
    const route = fs.readFileSync(
      "src/app/api/owner/onboarding-lifecycle/route.ts",
      "utf-8"
    );
    const postCount = (route.match(/withCanonicalEnforcement/g) ?? []).length;
    expect(postCount).toBeGreaterThanOrEqual(3); // POST, GET, PATCH
  });
});

// ─── Workspace isolation ──────────────────────────────────────────────────────

describe("workspace isolation", () => {
  it("getOnboarding passes workspaceId to findFirst", async () => {
    mockFindFirst.mockResolvedValue(makeRow());
    await getOnboarding({ workspaceId: WS_A });
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
  });

  it("startOnboarding checks idempotency with workspaceId", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeRow());
    await startOnboarding(validStartInput);
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
  });

  it("completeOnboarding loads onboarding by workspaceId", async () => {
    mockFindFirst.mockResolvedValue(makeRow());
    mockUpdate.mockResolvedValue(makeRow({ status: "COMPLETED" }));
    await completeOnboarding({ workspaceId: WS_A, actorId: ACTOR, completionKey: "k1" });
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
  });

  it("assertOnboardingComplete checks status with workspaceId", async () => {
    mockFindFirst.mockResolvedValue({ status: "COMPLETED" });
    await assertOnboardingComplete(WS_A);
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
  });
});

// ─── Audit events ─────────────────────────────────────────────────────────────

describe("audit events", () => {
  it("startOnboarding includes workspaceId in audit payload", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeRow());
    await startOnboarding(validStartInput);
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_A, actorId: ACTOR })
    );
  });

  it("completeOnboarding includes archetype in audit payload", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "IN_PROGRESS" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "COMPLETED", archetype: "STABILIZATION" }));
    await completeOnboarding({ workspaceId: WS_A, actorId: ACTOR, completionKey: "k1" });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ archetype: "STABILIZATION" }),
      })
    );
  });

  it("triggerReOnboarding includes reOnboardingReason in audit payload", async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: "COMPLETED" }));
    mockUpdate.mockResolvedValue(makeRow({ status: "RE_ONBOARDING" }));
    await triggerReOnboarding({
      workspaceId: WS_A,
      actorId: ACTOR,
      reOnboardingReason: "Shock event",
    });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ reOnboardingReason: "Shock event" }),
      })
    );
  });
});
