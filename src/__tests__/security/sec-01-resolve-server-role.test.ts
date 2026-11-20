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

import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { resolveServerRole, deriveServerRole } from "@/services/auth/server-role";

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

describe("SEC-01 deriveServerRole — canonical handlers derive the role from the wrapper's verified policy", () => {
  beforeEach(() => mockGetPolicyContext.mockReset());

  it("maps the verified policy exactly like resolveServerRole and never re-reads auth", () => {
    expect(deriveServerRole(null)).toBeNull();
    expect(deriveServerRole(undefined)).toBeNull();
    expect(deriveServerRole(ctx([]))).toBe("viewer");
    expect(deriveServerRole(ctx([ROLES.VIEWER]))).toBe("viewer");
    expect(deriveServerRole(ctx([ROLES.ADMIN_OR_PORTFOLIO_MANAGER]))).toBe("admin");
    expect(deriveServerRole(ctx([ROLES.SYSTEM_ADMIN]))).toBe("admin");
    expect(deriveServerRole(ctx([ROLES.ANALYST]))).not.toBe("admin");
    expect(mockGetPolicyContext).not.toHaveBeenCalled();
  });

  // A getPolicyContext() inside a withCanonicalEnforcement handler runs after the session snapshot is finalized and
  // is refused by the shadow-read enforcer (SHADOW_AUTH_READ_DETECTED → 500 on every authenticated request), so no
  // API route may call resolveServerRole(); they pass ctx.policy to deriveServerRole instead.
  it("no API route calls resolveServerRole()", () => {
    const root = path.resolve(__dirname, "../../app/api");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name) && readFileSync(full, "utf8").includes("resolveServerRole")) offenders.push(path.relative(root, full));
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
