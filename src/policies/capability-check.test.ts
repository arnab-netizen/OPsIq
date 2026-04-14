import { describe, it, expect } from "vitest";
import {
  hasCapability,
  requireCapability,
  highestRole,
  type PolicyContext,
} from "./capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES } from "@/domain/constants/roles";
import { ForbiddenError } from "@/infra/errors";

function makeCtx(
  roles: Array<{
    role: string;
    scope?: string | null;
    scopeId?: string | null;
  }>
): PolicyContext {
  return { userId: "user-1", roles: roles as PolicyContext["roles"] };
}

describe("Capability check", () => {
  it("system_admin has every capability", () => {
    const ctx = makeCtx([{ role: ROLES.SYSTEM_ADMIN }]);
    expect(hasCapability(ctx, CAPABILITIES.SYSTEM_ADMIN)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.FILE_DELETE)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.OVERRIDE_DECIDE)).toBe(true);
  });

  it("viewer has only limited capabilities", () => {
    const ctx = makeCtx([{ role: ROLES.VIEWER }]);
    expect(hasCapability(ctx, CAPABILITIES.ENGAGEMENT_VIEW)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.ENGAGEMENT_CREATE)).toBe(false);
    expect(hasCapability(ctx, CAPABILITIES.FILE_UPLOAD)).toBe(false);
  });

  it("consultant cannot approve recommendations", () => {
    const ctx = makeCtx([{ role: ROLES.CONSULTANT }]);
    expect(hasCapability(ctx, CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(false);
  });

  it("principal_consultant can approve recommendations", () => {
    const ctx = makeCtx([{ role: ROLES.PRINCIPAL_CONSULTANT }]);
    expect(hasCapability(ctx, CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(true);
  });

  it("client_owner can approve deliverables", () => {
    const ctx = makeCtx([{ role: ROLES.CLIENT_OWNER }]);
    expect(hasCapability(ctx, CAPABILITIES.DELIVERABLE_APPROVE)).toBe(true);
  });

  it("client_stakeholder cannot approve deliverables", () => {
    const ctx = makeCtx([{ role: ROLES.CLIENT_STAKEHOLDER }]);
    expect(hasCapability(ctx, CAPABILITIES.DELIVERABLE_APPROVE)).toBe(false);
  });

  it("scoped role matches only within scope", () => {
    const ctx = makeCtx([
      { role: ROLES.CONSULTANT, scope: "engagement", scopeId: "eng-1" },
    ]);
    expect(
      hasCapability(ctx, CAPABILITIES.STAGE_VIEW, {
        type: "engagement",
        id: "eng-1",
      })
    ).toBe(true);
    expect(
      hasCapability(ctx, CAPABILITIES.STAGE_VIEW, {
        type: "engagement",
        id: "eng-2",
      })
    ).toBe(false);
  });

  it("unscoped role grants capability regardless of scope check", () => {
    const ctx = makeCtx([{ role: ROLES.CONSULTANT }]);
    expect(
      hasCapability(ctx, CAPABILITIES.STAGE_VIEW, {
        type: "engagement",
        id: "eng-1",
      })
    ).toBe(true);
  });

  it("user with no roles has no capabilities", () => {
    const ctx = makeCtx([]);
    expect(hasCapability(ctx, CAPABILITIES.ENGAGEMENT_VIEW)).toBe(false);
  });

  it("requireCapability throws ForbiddenError when missing", () => {
    const ctx = makeCtx([{ role: ROLES.VIEWER }]);
    expect(() =>
      requireCapability(ctx, CAPABILITIES.ENGAGEMENT_CREATE)
    ).toThrow(ForbiddenError);
  });

  it("requireCapability does not throw when present", () => {
    const ctx = makeCtx([{ role: ROLES.VIEWER }]);
    expect(() =>
      requireCapability(ctx, CAPABILITIES.ENGAGEMENT_VIEW)
    ).not.toThrow();
  });

  it("highestRole returns the role with the highest hierarchy level", () => {
    const ctx = makeCtx([
      { role: ROLES.ANALYST },
      { role: ROLES.SENIOR_CONSULTANT },
      { role: ROLES.VIEWER },
    ]);
    expect(highestRole(ctx)).toBe(ROLES.SENIOR_CONSULTANT);
  });

  it("highestRole returns null for empty roles", () => {
    const ctx = makeCtx([]);
    expect(highestRole(ctx)).toBe(null);
  });

  it("multiple roles union their capabilities", () => {
    const ctx = makeCtx([
      { role: ROLES.ANALYST },
      { role: ROLES.CLIENT_OWNER },
    ]);
    // analyst has KPI_RECORD, client_owner has DELIVERABLE_APPROVE
    expect(hasCapability(ctx, CAPABILITIES.KPI_RECORD)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.DELIVERABLE_APPROVE)).toBe(true);
  });
});
