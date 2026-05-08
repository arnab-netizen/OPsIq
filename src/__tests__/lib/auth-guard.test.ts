import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getActorHierarchyLevel,
  canDo,
  requireAuth,
  requireAuthForCapability,
  requireAuthInternal,
  getServerAuthContext,
} from "@/lib/auth-guard";
import type { PolicyContext, AuthContext } from "@/lib/auth-guard";
import { ROLES } from "@/domain/constants/roles";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";

vi.mock("@/services/auth", () => ({
  requireSession: vi.fn(),
  requirePolicyContext: vi.fn(),
  getSession: vi.fn(),
  getPolicyContext: vi.fn(),
}));

import * as authService from "@/services/auth";

function makeCtx(
  roles: Array<{ role: string; scope?: string | null; scopeId?: string | null }>
): PolicyContext {
  return { userId: "user-1", roles: roles as PolicyContext["roles"] };
}

function makeSession(userId: string = "user-1") {
  return {
    user: { id: userId, email: "user@example.com", name: "User", isActive: true },
    sessionId: "session-1",
    expiresAt: new Date(Date.now() + 86400000),
  };
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

describe("Auth Primitives (Fail-Closed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireAuth", () => {
    it("returns auth context when session and policy valid", async () => {
      const session = makeSession();
      const policy = makeCtx([{ role: ROLES.EXPERIENCED_CONSULTANT }]);

      vi.mocked(authService.requireSession).mockResolvedValueOnce(session as any);
      vi.mocked(authService.requirePolicyContext).mockResolvedValueOnce(policy);

      const auth = await requireAuth();
      expect(auth.session.user.id).toBe("user-1");
      expect(auth.policy.roles[0].role).toBe(ROLES.EXPERIENCED_CONSULTANT);
    });

    it("throws UnauthorizedError when session missing", async () => {
      vi.mocked(authService.requireSession).mockRejectedValueOnce(
        new UnauthorizedError("No session")
      );

      await expect(requireAuth()).rejects.toThrow(UnauthorizedError);
    });

    it("throws UnauthorizedError when policy context missing", async () => {
      const session = makeSession();
      vi.mocked(authService.requireSession).mockResolvedValueOnce(session as any);
      vi.mocked(authService.requirePolicyContext).mockRejectedValueOnce(
        new UnauthorizedError("No policy")
      );

      await expect(requireAuth()).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("requireAuthForCapability", () => {
    it("returns auth when user has required capability", async () => {
      const session = makeSession();
      const policy = makeCtx([{ role: ROLES.EXPERIENCED_CONSULTANT }]);

      vi.mocked(authService.requireSession).mockResolvedValueOnce(session as any);
      vi.mocked(authService.requirePolicyContext).mockResolvedValueOnce(policy);

      const auth = await requireAuthForCapability(CAPABILITIES.STAGE_VIEW);
      expect(auth.session.user.id).toBe("user-1");
    });

    it("throws ForbiddenError when user lacks capability", async () => {
      const session = makeSession();
      const policy = makeCtx([{ role: ROLES.VIEWER }]);

      vi.mocked(authService.requireSession).mockResolvedValueOnce(session as any);
      vi.mocked(authService.requirePolicyContext).mockResolvedValueOnce(policy);

      await expect(
        requireAuthForCapability(CAPABILITIES.ENGAGEMENT_CREATE)
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws UnauthorizedError when session missing (fail-closed)", async () => {
      vi.mocked(authService.requireSession).mockRejectedValueOnce(
        new UnauthorizedError("No session")
      );

      await expect(
        requireAuthForCapability(CAPABILITIES.STAGE_VIEW)
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("requireAuthInternal", () => {
    it("returns auth when user has internal role", async () => {
      const session = makeSession();
      const policy = makeCtx([{ role: ROLES.EXPERIENCED_CONSULTANT }]);

      vi.mocked(authService.requireSession).mockResolvedValueOnce(session as any);
      vi.mocked(authService.requirePolicyContext).mockResolvedValueOnce(policy);

      const auth = await requireAuthInternal();
      expect(auth.session.user.id).toBe("user-1");
    });

    it("throws ForbiddenError when user has client role only", async () => {
      const session = makeSession();
      const policy = makeCtx([{ role: ROLES.CLIENT_OWNER }]);

      vi.mocked(authService.requireSession).mockResolvedValueOnce(session as any);
      vi.mocked(authService.requirePolicyContext).mockResolvedValueOnce(policy);

      await expect(requireAuthInternal()).rejects.toThrow(ForbiddenError);
    });
  });

  describe("getServerAuthContext", () => {
    it("returns auth context when valid", async () => {
      const session = makeSession();
      const policy = makeCtx([{ role: ROLES.EXPERIENCED_CONSULTANT }]);

      vi.mocked(authService.requireSession).mockResolvedValueOnce(session as any);
      vi.mocked(authService.requirePolicyContext).mockResolvedValueOnce(policy);

      const auth = await getServerAuthContext();
      expect(auth).not.toBeNull();
      expect(auth?.session.user.id).toBe("user-1");
    });

    it("returns null when session missing (graceful)", async () => {
      vi.mocked(authService.requireSession).mockRejectedValueOnce(
        new UnauthorizedError("No session")
      );

      const auth = await getServerAuthContext();
      expect(auth).toBeNull();
    });

    it("returns null when policy context missing (graceful)", async () => {
      const session = makeSession();
      vi.mocked(authService.requireSession).mockResolvedValueOnce(session as any);
      vi.mocked(authService.requirePolicyContext).mockRejectedValueOnce(
        new UnauthorizedError("No policy")
      );

      const auth = await getServerAuthContext();
      expect(auth).toBeNull();
    });
  });
});
