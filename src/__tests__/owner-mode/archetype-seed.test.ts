/**
 * Jarvis 360 owner-flow closure (EH-22/EH-06) — runtime archetype seed (DI).
 * Proves the seed composes the real record* services with correctly-mapped data and is
 * production-guarded. (A [db] test exercises real persistence in CI.)
 */
import { describe, it, expect, vi } from "vitest";
import {
  seedLaundryArchetype,
  assertSeedAllowed,
  SeedNotAllowedError,
} from "@/services/owner-mode/archetype-seed.service";

function deps() {
  const createBusiness = vi.fn(async () => ({ id: "biz1" }));
  const recordEquipment = vi.fn(async () => "eq");
  const recordComplianceItem = vi.fn(async () => "cmp");
  const registerProcess = vi.fn(async () => "proc");
  const createSopDraft = vi.fn(async () => "sop");
  return {
    fns: { createBusiness, recordEquipment, recordComplianceItem, registerProcess, createSopDraft },
    deps: {
      createBusiness: createBusiness as never,
      recordEquipment: recordEquipment as never,
      recordComplianceItem: recordComplianceItem as never,
      registerProcess: registerProcess as never,
      createSopDraft: createSopDraft as never,
      now: () => new Date("2026-06-28T00:00:00.000Z"),
    },
  };
}

describe("archetype seed service — function contract assertions", () => {
  it("seedLaundryArchetype is a function", () => {
    expect(typeof seedLaundryArchetype).toBe("function");
  });
  it("assertSeedAllowed is a function", () => {
    expect(typeof assertSeedAllowed).toBe("function");
  });
  it("SeedNotAllowedError is a class (function constructor)", () => {
    expect(typeof SeedNotAllowedError).toBe("function");
  });
  it("SeedNotAllowedError instances are Error instances", () => {
    const err = new SeedNotAllowedError("prod");
    expect(err).toBeInstanceOf(Error);
  });
  it("SeedNotAllowedError message contains the env string", () => {
    const err = new SeedNotAllowedError("production");
    expect(err.message).toContain("production");
  });
  it("assertSeedAllowed does not throw for 'test'", () => {
    expect(() => assertSeedAllowed("test")).not.toThrow();
  });
  it("assertSeedAllowed does not throw for 'development'", () => {
    expect(() => assertSeedAllowed("development")).not.toThrow();
  });
  it("assertSeedAllowed throws SeedNotAllowedError for 'production'", () => {
    expect(() => assertSeedAllowed("production")).toThrow(SeedNotAllowedError);
  });
  it("assertSeedAllowed throws an Error for 'production'", () => {
    expect(() => assertSeedAllowed("production")).toThrow(Error);
  });
  it("seedLaundryArchetype resolves in test env (returns an object)", async () => {
    const { deps: d } = deps();
    const r = await seedLaundryArchetype({ workspaceId: "ws-x", actorId: "actor-x", env: "test" }, d);
    expect(r).toBeTruthy();
    expect(typeof r).toBe("object");
  });
  it("seedLaundryArchetype result has businessId", async () => {
    const { deps: d } = deps();
    const r = await seedLaundryArchetype({ workspaceId: "ws-x", actorId: "actor-x", env: "test" }, d);
    expect(r.businessId).toBe("biz1");
  });
  it("seedLaundryArchetype result has numeric equipmentCount > 0", async () => {
    const { deps: d } = deps();
    const r = await seedLaundryArchetype({ workspaceId: "ws-x", actorId: "actor-x", env: "test" }, d);
    expect(typeof r.equipmentCount).toBe("number");
    expect(r.equipmentCount).toBeGreaterThan(0);
  });
  it("seedLaundryArchetype result has numeric processCount > 0", async () => {
    const { deps: d } = deps();
    const r = await seedLaundryArchetype({ workspaceId: "ws-x", actorId: "actor-x", env: "test" }, d);
    expect(typeof r.processCount).toBe("number");
    expect(r.processCount).toBeGreaterThan(0);
  });
  it("seedLaundryArchetype result has numeric sopCount > 0", async () => {
    const { deps: d } = deps();
    const r = await seedLaundryArchetype({ workspaceId: "ws-x", actorId: "actor-x", env: "test" }, d);
    expect(typeof r.sopCount).toBe("number");
    expect(r.sopCount).toBeGreaterThan(0);
  });
  it("seedLaundryArchetype calls createBusiness exactly once", async () => {
    const { fns, deps: d } = deps();
    await seedLaundryArchetype({ workspaceId: "ws-x", actorId: "actor-x", env: "test" }, d);
    expect(fns.createBusiness).toHaveBeenCalledTimes(1);
  });
  it("seedLaundryArchetype calls registerProcess at least once", async () => {
    const { fns, deps: d } = deps();
    await seedLaundryArchetype({ workspaceId: "ws-x", actorId: "actor-x", env: "test" }, d);
    expect(fns.registerProcess.mock.calls.length).toBeGreaterThan(0);
  });
  it("seedLaundryArchetype calls createSopDraft at least once", async () => {
    const { fns, deps: d } = deps();
    await seedLaundryArchetype({ workspaceId: "ws-x", actorId: "actor-x", env: "test" }, d);
    expect(fns.createSopDraft.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("assertSeedAllowed", () => {
  it("throws in production, allows otherwise", () => {
    expect(() => assertSeedAllowed("production")).toThrow(SeedNotAllowedError);
    expect(() => assertSeedAllowed("test")).not.toThrow();
    expect(() => assertSeedAllowed("development")).not.toThrow();
  });
});

describe("seedLaundryArchetype", () => {
  const ctx = { workspaceId: "ws1", actorId: "owner1", env: "test" };

  it("persists business + equipment + compliance + processes + SOPs with mapped data", async () => {
    const { fns, deps: d } = deps();
    const r = await seedLaundryArchetype(ctx, d);

    expect(r.businessId).toBe("biz1");
    expect(fns.createBusiness).toHaveBeenCalledWith(
      expect.objectContaining({ businessType: "laundry_local_service", currency: "USD" }),
      "owner1",
      "ws1"
    );
    // equipment count matches the seed; a 'down' machine maps to downtimeState 'down'
    expect(fns.recordEquipment.mock.calls.length).toBe(r.equipmentCount);
    expect(fns.recordEquipment).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz1", equipmentType: "laundry_machine" }));
    // a maintenance-overdue machine maps to a past maintenanceDueAt
    const overdue = fns.recordEquipment.mock.calls.find((c) => c[0].maintenanceDueAt < new Date("2026-06-28T00:00:00.000Z"));
    expect(overdue).toBeTruthy();
    // a live (future) compliance licence is seeded
    expect(fns.recordComplianceItem).toHaveBeenCalledWith(expect.objectContaining({ kind: "licence" }));
    expect(fns.recordComplianceItem.mock.calls[0][0].expiresAt > new Date("2026-06-28T00:00:00.000Z")).toBe(true);
    expect(fns.registerProcess.mock.calls.length).toBe(r.processCount);
    expect(fns.createSopDraft.mock.calls.length).toBe(r.sopCount);
  });

  it("refuses to seed in production", async () => {
    const { deps: d } = deps();
    await expect(seedLaundryArchetype({ ...ctx, env: "production" }, d)).rejects.toBeInstanceOf(SeedNotAllowedError);
  });
});
