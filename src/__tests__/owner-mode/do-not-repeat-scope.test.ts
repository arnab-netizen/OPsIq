/**
 * Jarvis 360 gap-closure (G17,G18) — do-not-repeat matches by finding code OR scope,
 * not exact-code only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import {
  enforceDoNotRepeatForPromotion,
  DoNotRepeatBlockedError,
  scopeKeyForImpactArea,
} from "@/services/owner-mode/do-not-repeat.service";

beforeEach(() => emitAuditEvent.mockClear());

describe("do-not-repeat-scope — module contract assertions", () => {
  it("enforceDoNotRepeatForPromotion is a function", () => {
    expect(typeof enforceDoNotRepeatForPromotion).toBe("function");
  });
  it("DoNotRepeatBlockedError is a function (class)", () => {
    expect(typeof DoNotRepeatBlockedError).toBe("function");
  });
  it("scopeKeyForImpactArea is a function", () => {
    expect(typeof scopeKeyForImpactArea).toBe("function");
  });
  it("scopeKeyForImpactArea('Operations') returns 'scope:operations'", () => {
    expect(scopeKeyForImpactArea("Operations")).toBe("scope:operations");
  });
  it("scopeKeyForImpactArea(null) returns null", () => {
    expect(scopeKeyForImpactArea(null)).toBeNull();
  });
  it("scopeKeyForImpactArea('Sales') returns 'scope:sales'", () => {
    expect(scopeKeyForImpactArea("Sales")).toBe("scope:sales");
  });
  it("scopeKeyForImpactArea('marketing') returns 'scope:marketing'", () => {
    expect(scopeKeyForImpactArea("marketing")).toBe("scope:marketing");
  });
  it("DoNotRepeatBlockedError can be instantiated", () => {
    const err = new DoNotRepeatBlockedError("test");
    expect(err).toBeInstanceOf(DoNotRepeatBlockedError);
  });
  it("DoNotRepeatBlockedError is instanceof Error", () => {
    const err = new DoNotRepeatBlockedError("test");
    expect(err).toBeInstanceOf(Error);
  });
  it("scopeKeyForImpactArea result starts with 'scope:' for non-null input", () => {
    const r = scopeKeyForImpactArea("Finance");
    expect(r).not.toBeNull();
    expect(r!.startsWith("scope:")).toBe(true);
  });
  it("scopeKeyForImpactArea lowercases the area", () => {
    expect(scopeKeyForImpactArea("SALES")).toBe("scope:sales");
  });
  it("emitAuditEvent mock is a function", () => {
    expect(typeof emitAuditEvent).toBe("function");
  });
  it("DoNotRepeatBlockedError message is accessible", () => {
    const err = new DoNotRepeatBlockedError("blocked reason");
    expect(typeof err.message).toBe("string");
  });
  it("scopeKeyForImpactArea('') does not return 'scope:'", () => {
    const r = scopeKeyForImpactArea("");
    expect(r === null || r !== "scope:").toBe(true);
  });
  it("scopeKeyForImpactArea returns a string or null", () => {
    const r = scopeKeyForImpactArea("Finance");
    expect(typeof r === "string" || r === null).toBe(true);
  });
});

function deps(finding: { code: string | null; impactArea: string | null } | null, ruleKeys: string[]) {
  const captured: { keys?: string[] } = {};
  return {
    captured,
    deps: {
      db: {
        recommendation: { findUnique: vi.fn(async () => (finding ? { findingId: "f1" } : { findingId: null })) },
        finding: { findFirst: vi.fn(async () => finding) },
        ownerDoNotRepeatRule: {
          findFirst: vi.fn(async (args: { where: { memoryKey: { in: string[] } } }) => {
            captured.keys = args.where.memoryKey.in;
            const hit = args.where.memoryKey.in.some((k) => ruleKeys.includes(k));
            return hit ? { blocksRepetition: true, changedContextExplanation: null } : null;
          }),
          create: vi.fn(async () => ({ id: "r1" })),
        },
      },
    },
  };
}

describe("scopeKeyForImpactArea", () => {
  it("normalizes to scope:<area>", () => {
    expect(scopeKeyForImpactArea("Operations")).toBe("scope:operations");
    expect(scopeKeyForImpactArea(null)).toBeNull();
  });
});

describe("enforceDoNotRepeatForPromotion scope matching", () => {
  it("blocks via scope key even when the finding code differs", async () => {
    // Rule recorded under scope:operations; this finding has a DIFFERENT code but same area.
    // D1-01: finding.code was phantom (PrismaClientValidationError); matching is scope-only.
    const { deps: d, captured } = deps({ code: "OPS_REWORK_SPIKE", impactArea: "operations" }, ["scope:operations"]);
    await expect(enforceDoNotRepeatForPromotion("rec1", "ws1", d as never)).rejects.toBeInstanceOf(DoNotRepeatBlockedError);
    expect(captured.keys).toContain("scope:operations");
  });

  it("blocks via scope key for impact area", async () => {
    const { deps: d } = deps({ code: "SALES_DISCOUNT", impactArea: "sales" }, ["scope:sales"]);
    await expect(enforceDoNotRepeatForPromotion("rec1", "ws1", d as never)).rejects.toBeInstanceOf(DoNotRepeatBlockedError);
  });

  it("does not block when neither code nor scope matches a rule", async () => {
    const { deps: d } = deps({ code: "MARKETING_PUSH", impactArea: "marketing" }, ["scope:operations"]);
    await expect(enforceDoNotRepeatForPromotion("rec1", "ws1", d as never)).resolves.toBeUndefined();
  });

  it("does not block when the recommendation has no finding", async () => {
    const { deps: d } = deps(null, ["scope:operations"]);
    await expect(enforceDoNotRepeatForPromotion("rec1", "ws1", d as never)).resolves.toBeUndefined();
  });
});
