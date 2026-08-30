/**
 * Pure (no DB) capability-matrix tests for the self-serve-owner capability
 * scoping fix in src/policies/capability-check.ts.
 *
 * POST /api/auth/signup is the only production-reachable path that creates a
 * UserRoleAssignment, and it always grants ADMIN_OR_PORTFOLIO_MANAGER plus a
 * WorkspaceMembership.role of "owner". That one role historically carried the
 * full ~46-capability consulting-firm bundle (CLIENT_*, ENGAGEMENT_*, LEAD_*,
 * DELIVERABLE_*, FINDING_*, USER_CREATE/UPDATE/ASSIGN_ROLE, etc.) even for a
 * self-serve SMB owner who has no legitimate use for it. These tests pin:
 *
 *  1. workspaceRole="owner" narrows ADMIN_OR_PORTFOLIO_MANAGER to the
 *     owner-safe subset (OWNER_VIEW/MANAGE/ONBOARD, SOP_MANAGE, USER_VIEW,
 *     FILE_*) and excludes every consulting-firm-only capability.
 *  2. Any other (or absent) workspaceRole keeps the FULL historical bundle --
 *     a legitimately-provisioned portfolio manager is not regressed.
 *  3. Every other role (EXPERIENCED_CONSULTANT, CLIENT_OWNER, VIEWER, ...) is
 *     completely unaffected by workspaceRole -- the narrowing is scoped
 *     exclusively to ADMIN_OR_PORTFOLIO_MANAGER.
 *  4. hasCapability() honors the same narrowing end-to-end via PolicyContext.
 */
import { describe, it, expect } from "vitest";
import {
  getCapabilitiesForRole,
  hasCapability,
  type PolicyContext,
} from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES } from "@/domain/constants/roles";

const OWNER_SAFE = [
  CAPABILITIES.USER_VIEW,
  CAPABILITIES.FILE_UPLOAD,
  CAPABILITIES.FILE_VIEW,
  CAPABILITIES.FILE_DELETE,
  CAPABILITIES.OWNER_VIEW,
  CAPABILITIES.OWNER_MANAGE,
  CAPABILITIES.OWNER_ONBOARD,
  CAPABILITIES.SOP_MANAGE,
] as const;

const CONSULTANT_ONLY_SAMPLE = [
  CAPABILITIES.CLIENT_VIEW,
  CAPABILITIES.CLIENT_CREATE,
  CAPABILITIES.ENGAGEMENT_VIEW,
  CAPABILITIES.ENGAGEMENT_CREATE,
  CAPABILITIES.LEAD_VIEW,
  CAPABILITIES.LEAD_CREATE,
  CAPABILITIES.DELIVERABLE_VIEW,
  CAPABILITIES.DELIVERABLE_APPROVE,
  CAPABILITIES.FINDING_VIEW,
  CAPABILITIES.RECOMMENDATION_APPROVE,
  CAPABILITIES.USER_CREATE,
  CAPABILITIES.USER_UPDATE,
  CAPABILITIES.USER_ASSIGN_ROLE,
  CAPABILITIES.DECISION_CLOSE,
  CAPABILITIES.STAGE_TRANSITION,
] as const;

describe("capability-check: self-serve owner scoping", () => {
  it("workspaceRole='owner' narrows ADMIN_OR_PORTFOLIO_MANAGER to exactly the owner-safe subset", () => {
    const caps = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER, "owner");
    expect([...caps].sort()).toEqual([...OWNER_SAFE].sort());
  });

  it("workspaceRole='owner' excludes every sampled consulting-firm-only capability", () => {
    const caps = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER, "owner");
    for (const cap of CONSULTANT_ONLY_SAMPLE) {
      expect(caps).not.toContain(cap);
    }
  });

  it("no workspaceRole context (undefined) keeps the full historical bundle", () => {
    const caps = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
    expect(caps.length).toBeGreaterThan(OWNER_SAFE.length);
    for (const cap of CONSULTANT_ONLY_SAMPLE) {
      expect(caps).toContain(cap);
    }
    expect(caps).toContain(CAPABILITIES.OWNER_VIEW);
  });

  it("workspaceRole='admin' (a non-signup value, e.g. internal-ops-provisioned) keeps the full bundle", () => {
    const caps = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER, "admin");
    for (const cap of CONSULTANT_ONLY_SAMPLE) {
      expect(caps).toContain(cap);
    }
  });

  it("other roles are completely unaffected by workspaceRole='owner'", () => {
    for (const role of [
      ROLES.EXPERIENCED_CONSULTANT,
      ROLES.BEGINNER_CONSULTANT,
      ROLES.ANALYST,
      ROLES.CLIENT_OWNER,
      ROLES.CLIENT_TEAM_MEMBER,
      ROLES.VIEWER,
      ROLES.SYSTEM_ADMIN,
    ] as const) {
      expect(getCapabilitiesForRole(role, "owner")).toEqual(getCapabilitiesForRole(role));
    }
  });

  it("hasCapability(): a signup-shaped PolicyContext (role=ADMIN_OR_PORTFOLIO_MANAGER, workspaceRole='owner') is denied CLIENT_VIEW/ENGAGEMENT_VIEW/USER_CREATE", () => {
    const ctx: PolicyContext = {
      userId: "u1",
      roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: "ws1" }],
      workspaceRole: "owner",
    };
    expect(hasCapability(ctx, CAPABILITIES.CLIENT_VIEW)).toBe(false);
    expect(hasCapability(ctx, CAPABILITIES.ENGAGEMENT_VIEW)).toBe(false);
    expect(hasCapability(ctx, CAPABILITIES.USER_CREATE)).toBe(false);
    expect(hasCapability(ctx, CAPABILITIES.DELIVERABLE_APPROVE)).toBe(false);
  });

  it("hasCapability(): the same signup-shaped context is ALLOWED OWNER_VIEW/OWNER_MANAGE/USER_VIEW", () => {
    const ctx: PolicyContext = {
      userId: "u1",
      roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: "ws1" }],
      workspaceRole: "owner",
    };
    expect(hasCapability(ctx, CAPABILITIES.OWNER_VIEW)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.OWNER_MANAGE)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.USER_VIEW)).toBe(true);
  });

  it("hasCapability(): a portfolio-manager-shaped context (workspaceRole='admin') retains ALLOW for CLIENT_VIEW/ENGAGEMENT_VIEW/DELIVERABLE_APPROVE", () => {
    const ctx: PolicyContext = {
      userId: "u2",
      roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: "ws2" }],
      workspaceRole: "admin",
    };
    expect(hasCapability(ctx, CAPABILITIES.CLIENT_VIEW)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.ENGAGEMENT_VIEW)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.DELIVERABLE_APPROVE)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.OWNER_VIEW)).toBe(true);
  });

  it("hasCapability(): a context with no workspaceRole at all (undefined) retains the full bundle -- no silent regression for callers that never set it", () => {
    const ctx: PolicyContext = {
      userId: "u3",
      roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: "ws3" }],
    };
    expect(hasCapability(ctx, CAPABILITIES.CLIENT_VIEW)).toBe(true);
  });
});
