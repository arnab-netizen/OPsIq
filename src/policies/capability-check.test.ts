import { describe, it, expect } from "vitest";
import {
  hasCapability,
  requireCapability,
  highestRole,
  getCapabilitiesForRole,
  hasInternalAccess,
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
  }>,
  engagementMemberships?: Array<{ engagementId: string; role: string }>
): PolicyContext {
  return {
    userId: "user-1",
    roles: roles as PolicyContext["roles"],
    engagementMemberships: engagementMemberships as PolicyContext["engagementMemberships"],
  };
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

  it("beginner_consultant cannot approve recommendations", () => {
    const ctx = makeCtx([{ role: ROLES.BEGINNER_CONSULTANT }]);
    expect(hasCapability(ctx, CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(false);
  });

  it("admin_or_portfolio_manager can approve recommendations", () => {
    const ctx = makeCtx([{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER }]);
    expect(hasCapability(ctx, CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(true);
  });

  it("client_owner can approve deliverables", () => {
    const ctx = makeCtx([{ role: ROLES.CLIENT_OWNER }]);
    expect(hasCapability(ctx, CAPABILITIES.DELIVERABLE_APPROVE)).toBe(true);
  });

  it("client_team_member cannot approve deliverables", () => {
    const ctx = makeCtx([{ role: ROLES.CLIENT_TEAM_MEMBER }]);
    expect(hasCapability(ctx, CAPABILITIES.DELIVERABLE_APPROVE)).toBe(false);
  });

  it("scoped role matches only within scope", () => {
    const ctx = makeCtx([
      { role: ROLES.BEGINNER_CONSULTANT, scope: "engagement", scopeId: "eng-1" },
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
    const ctx = makeCtx([{ role: ROLES.BEGINNER_CONSULTANT }]);
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
      { role: ROLES.EXPERIENCED_CONSULTANT },
      { role: ROLES.VIEWER },
    ]);
    expect(highestRole(ctx)).toBe(ROLES.EXPERIENCED_CONSULTANT);
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

  // ─── Module 1: New tests ───────────────────────────────────────────────

  describe("beginner vs experienced consultant differentiation", () => {
    it("beginner_consultant cannot validate findings", () => {
      const ctx = makeCtx([{ role: ROLES.BEGINNER_CONSULTANT }]);
      expect(hasCapability(ctx, CAPABILITIES.FINDING_VALIDATE)).toBe(false);
    });

    it("experienced_consultant can validate findings", () => {
      const ctx = makeCtx([{ role: ROLES.EXPERIENCED_CONSULTANT }]);
      expect(hasCapability(ctx, CAPABILITIES.FINDING_VALIDATE)).toBe(true);
    });

    it("beginner_consultant cannot create engagements", () => {
      const ctx = makeCtx([{ role: ROLES.BEGINNER_CONSULTANT }]);
      expect(hasCapability(ctx, CAPABILITIES.ENGAGEMENT_CREATE)).toBe(false);
    });

    it("experienced_consultant can create engagements", () => {
      const ctx = makeCtx([{ role: ROLES.EXPERIENCED_CONSULTANT }]);
      expect(hasCapability(ctx, CAPABILITIES.ENGAGEMENT_CREATE)).toBe(true);
    });

    it("beginner_consultant cannot resolve soft blockers", () => {
      const ctx = makeCtx([{ role: ROLES.BEGINNER_CONSULTANT }]);
      expect(hasCapability(ctx, CAPABILITIES.STAGE_RESOLVE_SOFT_BLOCKER)).toBe(false);
    });

    it("experienced_consultant can resolve soft blockers", () => {
      const ctx = makeCtx([{ role: ROLES.EXPERIENCED_CONSULTANT }]);
      expect(hasCapability(ctx, CAPABILITIES.STAGE_RESOLVE_SOFT_BLOCKER)).toBe(true);
    });
  });

  describe("internal-only capability guard", () => {
    it("client_owner cannot access internal-only capabilities", () => {
      const ctx = makeCtx([{ role: ROLES.CLIENT_OWNER }]);
      expect(hasCapability(ctx, CAPABILITIES.CLIENT_CREATE)).toBe(false);
      expect(hasCapability(ctx, CAPABILITIES.ENGAGEMENT_CREATE)).toBe(false);
      expect(hasCapability(ctx, CAPABILITIES.FINDING_CREATE)).toBe(false);
      expect(hasCapability(ctx, CAPABILITIES.RISK_MANAGE)).toBe(false);
    });

    it("client_team_member cannot access internal-only capabilities", () => {
      const ctx = makeCtx([{ role: ROLES.CLIENT_TEAM_MEMBER }]);
      expect(hasCapability(ctx, CAPABILITIES.EVIDENCE_VALIDATE)).toBe(false);
      expect(hasCapability(ctx, CAPABILITIES.OVERRIDE_DECIDE)).toBe(false);
      expect(hasCapability(ctx, CAPABILITIES.FILE_DELETE)).toBe(false);
    });
  });

  describe("engagement membership scoped capabilities", () => {
    it("grants capability via engagement membership", () => {
      const ctx = makeCtx(
        [], // no global roles
        [{ engagementId: "eng-1", role: ROLES.EXPERIENCED_CONSULTANT }]
      );
      expect(
        hasCapability(ctx, CAPABILITIES.STAGE_VIEW, {
          type: "engagement",
          id: "eng-1",
        })
      ).toBe(true);
    });

    it("does not grant capability for different engagement", () => {
      const ctx = makeCtx(
        [],
        [{ engagementId: "eng-1", role: ROLES.EXPERIENCED_CONSULTANT }]
      );
      expect(
        hasCapability(ctx, CAPABILITIES.STAGE_VIEW, {
          type: "engagement",
          id: "eng-2",
        })
      ).toBe(false);
    });

    it("engagement membership does not grant non-scoped capability", () => {
      const ctx = makeCtx(
        [],
        [{ engagementId: "eng-1", role: ROLES.EXPERIENCED_CONSULTANT }]
      );
      // Without scope, engagement membership should not grant access
      expect(hasCapability(ctx, CAPABILITIES.STAGE_VIEW)).toBe(false);
    });

    it("client role in engagement membership cannot access internal-only caps", () => {
      const ctx = makeCtx(
        [],
        [{ engagementId: "eng-1", role: ROLES.CLIENT_OWNER }]
      );
      expect(
        hasCapability(ctx, CAPABILITIES.FINDING_CREATE, {
          type: "engagement",
          id: "eng-1",
        })
      ).toBe(false);
      expect(
        hasCapability(ctx, CAPABILITIES.FINDING_VIEW, {
          type: "engagement",
          id: "eng-1",
        })
      ).toBe(true);
    });
  });

  describe("getCapabilitiesForRole", () => {
    it("returns capabilities for a valid role", () => {
      const caps = getCapabilitiesForRole(ROLES.VIEWER);
      expect(caps).toContain(CAPABILITIES.ENGAGEMENT_VIEW);
      expect(caps).not.toContain(CAPABILITIES.ENGAGEMENT_CREATE);
    });

    it("returns all capabilities for system_admin", () => {
      const caps = getCapabilitiesForRole(ROLES.SYSTEM_ADMIN);
      const allCaps = Object.values(CAPABILITIES);
      expect(caps.length).toBe(allCaps.length);
    });
  });

  describe("hasInternalAccess", () => {
    it("returns true for internal roles", () => {
      const ctx = makeCtx([{ role: ROLES.EXPERIENCED_CONSULTANT }]);
      expect(hasInternalAccess(ctx)).toBe(true);
    });

    it("returns false for client-only roles", () => {
      const ctx = makeCtx([{ role: ROLES.CLIENT_OWNER }]);
      expect(hasInternalAccess(ctx)).toBe(false);
    });

    it("returns true if user has both internal and client roles", () => {
      const ctx = makeCtx([
        { role: ROLES.ANALYST },
        { role: ROLES.CLIENT_OWNER },
      ]);
      expect(hasInternalAccess(ctx)).toBe(true);
    });

    it("returns false for no roles", () => {
      const ctx = makeCtx([]);
      expect(hasInternalAccess(ctx)).toBe(false);
    });
  });
});
