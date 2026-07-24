/**
 * Jarvis 360 Slice 12 — do-not-repeat (pure) + promotion enforcement (DI). No DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import { evaluateDoNotRepeat } from "@/domain/owner-mode/do-not-repeat";
import { enforceDoNotRepeatForPromotion, DoNotRepeatBlockedError, type DnrDeps } from "@/services/owner-mode/do-not-repeat.service";

beforeEach(() => emitAuditEvent.mockClear());

describe("do-not-repeat — module contract assertions", () => {
  it("evaluateDoNotRepeat is a function", () => { expect(typeof evaluateDoNotRepeat).toBe("function"); });
  it("enforceDoNotRepeatForPromotion is a function", () => { expect(typeof enforceDoNotRepeatForPromotion).toBe("function"); });
  it("DoNotRepeatBlockedError is a class/function", () => { expect(typeof DoNotRepeatBlockedError).toBe("function"); });
  it("evaluateDoNotRepeat(null) returns an object", () => { expect(typeof evaluateDoNotRepeat(null)).toBe("object"); });
  it("evaluateDoNotRepeat(null).blocked is false", () => { expect(evaluateDoNotRepeat(null).blocked).toBe(false); });
  it("evaluateDoNotRepeat result has blocked field", () => { expect(evaluateDoNotRepeat(null)).toHaveProperty("blocked"); });
  it("evaluateDoNotRepeat with active memory returns blocked true", () => { expect(evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: true, memoryKey: "k" }).blocked).toBe(true); });
  it("evaluateDoNotRepeat with changedContext reason returns blocked false", () => { expect(evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: true, memoryKey: "k" }, "market shifted").blocked).toBe(false); });
  it("evaluateDoNotRepeat with active memory has requiresChangedContextReason true", () => { expect(evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: true, memoryKey: "k" }).requiresChangedContextReason).toBe(true); });
  it("evaluateDoNotRepeat with non-do_not_repeat category returns blocked false", () => { expect(evaluateDoNotRepeat({ category: "owner_preference", blocksRepetition: true, memoryKey: "k" }).blocked).toBe(false); });
  it("evaluateDoNotRepeat with blocksRepetition false returns blocked false", () => { expect(evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: false, memoryKey: "k" }).blocked).toBe(false); });
  it("DoNotRepeatBlockedError can be instantiated", () => { expect(() => new DoNotRepeatBlockedError("test")).not.toThrow(); });
  it("DoNotRepeatBlockedError instance is Error", () => { expect(new DoNotRepeatBlockedError("msg")).toBeInstanceOf(Error); });
  it("DoNotRepeatBlockedError instance is DoNotRepeatBlockedError", () => { expect(new DoNotRepeatBlockedError("msg")).toBeInstanceOf(DoNotRepeatBlockedError); });
});

describe("evaluateDoNotRepeat", () => {
  it("does not block when there is no matching memory", () => {
    expect(evaluateDoNotRepeat(null).blocked).toBe(false);
  });
  it("blocks an active do_not_repeat memory with no changed-context reason", () => {
    const d = evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: true, memoryKey: "k" });
    expect(d.blocked).toBe(true);
    expect(d.requiresChangedContextReason).toBe(true);
  });
  it("allows when a changed-context reason is supplied", () => {
    const d = evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: true, memoryKey: "k" }, "market shifted");
    expect(d.blocked).toBe(false);
  });
  it("ignores non-blocking or non-do_not_repeat memories", () => {
    expect(evaluateDoNotRepeat({ category: "owner_preference", blocksRepetition: true, memoryKey: "k" }).blocked).toBe(false);
    expect(evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: false, memoryKey: "k" }).blocked).toBe(false);
  });
});

function deps(findingCode: string | null, memory: { changedContextExplanation: string | null } | null): DnrDeps {
  return {
    db: {
      recommendation: { findUnique: vi.fn(async () => (findingCode === null ? { findingId: null } : { findingId: "f1" })) },
      finding: { findFirst: vi.fn(async () => (findingCode ? { impactArea: "operations" } : null)) },
      ownerDoNotRepeatRule: {
        findFirst: vi.fn(async () => (memory ? { blocksRepetition: true, ...memory } : null)),
        create: vi.fn(async () => ({ id: "m1" })),
      },
    },
  };
}

describe("enforceDoNotRepeatForPromotion (DI)", () => {
  it("blocks + audits when an active do_not_repeat memory matches the finding scope key", async () => {
    const d = deps("SALES_DISCOUNT", { changedContextExplanation: null });
    await expect(enforceDoNotRepeatForPromotion("rec1", "ws1", d)).rejects.toBeInstanceOf(DoNotRepeatBlockedError);
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
  });
  it("allows when the memory carries a changed-context explanation", async () => {
    const d = deps("SALES_DISCOUNT", { changedContextExplanation: "new season" });
    await expect(enforceDoNotRepeatForPromotion("rec1", "ws1", d)).resolves.toBeUndefined();
  });
  it("allows when the recommendation has no finding (no key)", async () => {
    const d = deps(null, { changedContextExplanation: null });
    await expect(enforceDoNotRepeatForPromotion("rec1", "ws1", d)).resolves.toBeUndefined();
  });
});
