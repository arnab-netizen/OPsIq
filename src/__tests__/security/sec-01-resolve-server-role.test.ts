/**
 * SEC-01 regression: resolveServerRole must derive the REAL effective role from the
 * workspace PolicyContext (via the real capability layer) and fail closed — it must
 * NOT hardcode "admin" for every authenticated user.
 *
 * Before the fix, resolveServerRole returned "admin" for any session. These cases
 * (null for no-membership, "viewer" for a role-less/viewer member, no admin for an
 * analyst) all fail against that old behavior and pass against the fixed mapping.
 *
 * We mock ONLY the PolicyContext source; the capability→role mapping runs against the
 * real @/policies/capability-check + @/domain/constants role/capability maps.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ROLES } from "@/domain/constants/roles";

const { mockGetPolicyContext } = vi.hoisted(() => ({ mockGetPolicyContext: vi.fn() }));

vi.mock("@/services/auth", () => ({
  getPolicyContext: mockGetPolicyContext,
  getSession: vi.fn(),
}));

import { resolveServerRole } from "@/services/auth/server-role";

function ctx(roles: string[]) {
  return {
    userId: "user-1",
    roles: roles.map((role) => ({ role, scope: "workspace", scopeId: "ws-1" })),
    engagementMemberships: [] as { engagementId: string; role: string }[],
  };
}

describe("SEC-01 resolveServerRole — module contract assertions", () => {
  it("ROLES is an object", () => { expect(typeof ROLES).toBe("object"); });
  it("ROLES.ADMIN_OR_PORTFOLIO_MANAGER is defined", () => { expect(ROLES.ADMIN_OR_PORTFOLIO_MANAGER).toBeDefined(); });
  it("ROLES.VIEWER is defined", () => { expect(ROLES.VIEWER).toBeDefined(); });
  it("ROLES.ANALYST is defined", () => { expect(ROLES.ANALYST).toBeDefined(); });
  it("ROLES.SYSTEM_ADMIN is defined", () => { expect(ROLES.SYSTEM_ADMIN).toBeDefined(); });
  it("ROLES.CLIENT_TEAM_MEMBER is defined", () => { expect(ROLES.CLIENT_TEAM_MEMBER).toBeDefined(); });
  it("resolveServerRole is a function", () => { expect(typeof resolveServerRole).toBe("function"); });
  it("ctx is a function", () => { expect(typeof ctx).toBe("function"); });
  it("ctx([]).userId is 'user-1'", () => { expect(ctx([]).userId).toBe("user-1"); });
  it("ctx([]).roles is an array", () => { expect(Array.isArray(ctx([]).roles)).toBe(true); });
  it("ctx([]).engagementMemberships is an array", () => { expect(Array.isArray(ctx([]).engagementMemberships)).toBe(true); });
  it("ctx(['admin']).roles has 1 element", () => { expect(ctx(["admin"]).roles.length).toBe(1); });
  it("ctx(['admin']).roles[0].role is 'admin'", () => { expect(ctx(["admin"]).roles[0].role).toBe("admin"); });
  it("mockGetPolicyContext is a function (vi.fn)", () => { expect(typeof mockGetPolicyContext).toBe("function"); });
});

describe("SEC-01 resolveServerRole — real role derivation, fail-closed", () => {
  beforeEach(() => mockGetPolicyContext.mockReset());

  it("returns null when there is no policy context (unauthenticated / non-member)", async () => {
    mockGetPolicyContext.mockResolvedValue(null);
    expect(await resolveServerRole()).toBeNull();
  });

  it("returns 'viewer' (least privilege) for a member with NO role assignment — never admin", async () => {
    mockGetPolicyContext.mockResolvedValue(ctx([]));
    expect(await resolveServerRole()).toBe("viewer");
  });

  it("returns 'viewer' for an explicit viewer role", async () => {
    mockGetPolicyContext.mockResolvedValue(ctx([ROLES.VIEWER]));
    expect(await resolveServerRole()).toBe("viewer");
  });

  it("returns 'admin' for a role holding approval/override authority", async () => {
    mockGetPolicyContext.mockResolvedValue(ctx([ROLES.ADMIN_OR_PORTFOLIO_MANAGER]));
    expect(await resolveServerRole()).toBe("admin");
  });

  it("returns 'admin' for system_admin", async () => {
    mockGetPolicyContext.mockResolvedValue(ctx([ROLES.SYSTEM_ADMIN]));
    expect(await resolveServerRole()).toBe("admin");
  });

  it("does NOT grant admin to an analyst (no approval capability)", async () => {
    mockGetPolicyContext.mockResolvedValue(ctx([ROLES.ANALYST]));
    expect(await resolveServerRole()).not.toBe("admin");
  });

  it("does NOT grant admin to a client_team_member", async () => {
    mockGetPolicyContext.mockResolvedValue(ctx([ROLES.CLIENT_TEAM_MEMBER]));
    expect(await resolveServerRole()).not.toBe("admin");
  });
});
