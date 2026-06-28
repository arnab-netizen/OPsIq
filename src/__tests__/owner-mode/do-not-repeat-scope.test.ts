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

function deps(finding: { code: string | null; impactArea: string | null } | null, ruleKeys: string[]) {
  const captured: { keys?: string[] } = {};
  return {
    captured,
    deps: {
      db: {
        recommendation: { findUnique: vi.fn(async () => (finding ? { findingId: "f1" } : { findingId: null })) },
        finding: { findUnique: vi.fn(async () => finding) },
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
    const { deps: d, captured } = deps({ code: "OPS_REWORK_SPIKE", impactArea: "operations" }, ["scope:operations"]);
    await expect(enforceDoNotRepeatForPromotion("rec1", "ws1", d as never)).rejects.toBeInstanceOf(DoNotRepeatBlockedError);
    expect(captured.keys).toContain("scope:operations");
    expect(captured.keys).toContain("OPS_REWORK_SPIKE");
  });

  it("blocks via exact finding code", async () => {
    const { deps: d } = deps({ code: "SALES_DISCOUNT", impactArea: "sales" }, ["SALES_DISCOUNT"]);
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
