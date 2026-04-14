import { describe, it, expect } from "vitest";
import { getActorHierarchyLevel, canDo } from "./auth-guard";
import type { PolicyContext } from "@/policies/capability-check";
import { ROLES } from "@/domain/constants/roles";
import { CAPABILITIES } from "@/domain/constants/capabilities";

function makeCtx(
  roles: Array<{ role: string; scope?: string | null; scopeId?: string | null }>
): PolicyContext {
  return { userId: "user-1", roles: roles as PolicyContext["roles"] };
}

describe("getActorHierarchyLevel", () => {
  it("returns correct level for system_admin", () => {
    const ctx = makeCtx([{ role: ROLES.SYSTEM_ADMIN }]);
    expect(getActorHierarchyLevel(ctx)).toBe(100);
  });

  it("returns correct level for experienced_consultant", () => {
    const ctx = makeCtx([{ role: ROLES.EXPERIENCED_CONSULTANT }]);
    expect(getActorHierarchyLevel(ctx)).toBe(60);
  });

  it("returns highest level when user has multiple roles", () => {
    const ctx = makeCtx([
      { role: ROLES.VIEWER },
      { role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER },
      { role: ROLES.ANALYST },
    ]);
    expect(getActorHierarchyLevel(ctx)).toBe(80);
  });

  it("returns -1 for user with no roles", () => {
    const ctx = makeCtx([]);
    expect(getActorHierarchyLevel(ctx)).toBe(-1);
  });
});

describe("canDo", () => {
  it("returns true when user has the capability", () => {
    const ctx = makeCtx([{ role: ROLES.EXPERIENCED_CONSULTANT }]);
    expect(canDo(ctx, CAPABILITIES.STAGE_VIEW)).toBe(true);
  });

  it("returns false when user lacks the capability", () => {
    const ctx = makeCtx([{ role: ROLES.VIEWER }]);
    expect(canDo(ctx, CAPABILITIES.ENGAGEMENT_CREATE)).toBe(false);
  });

  it("respects scope when provided", () => {
    const ctx = makeCtx([
      { role: ROLES.BEGINNER_CONSULTANT, scope: "engagement", scopeId: "eng-1" },
    ]);
    expect(
      canDo(ctx, CAPABILITIES.STAGE_VIEW, { type: "engagement", id: "eng-1" })
    ).toBe(true);
    expect(
      canDo(ctx, CAPABILITIES.STAGE_VIEW, { type: "engagement", id: "eng-2" })
    ).toBe(false);
  });
});
