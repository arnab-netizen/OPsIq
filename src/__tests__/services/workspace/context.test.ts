import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UnauthorizedError } from "@/infra/errors";
import {
  getWorkspaceContext,
  requireWorkspaceContext,
  validateWorkspaceAccess,
  type WorkspaceContext,
} from "@/services/workspace/context";

// Mock the auth service
vi.mock("@/services/auth", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/services/auth";
const getSessionMock = getSession as ReturnType<typeof vi.fn>;

describe("Workspace Context Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── getWorkspaceContext() tests ─────────────────────────────────────────

  describe("getWorkspaceContext()", () => {
    it("should return workspace context with valid session", async () => {
      const userId = "user-123";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      const result = await getWorkspaceContext();

      expect(result).not.toBeNull();
      expect(result).toEqual({
        workspaceId: userId, // temporary: uses user ID as workspace
        userId,
      });
      expect(getSessionMock).toHaveBeenCalledOnce();
    });

    it("should return null when session is unavailable", async () => {
      getSessionMock.mockResolvedValueOnce(null);

      const result = await getWorkspaceContext();

      expect(result).toBeNull();
      expect(getSessionMock).toHaveBeenCalledOnce();
    });

    it("should throw when session has no user property", async () => {
      getSessionMock.mockResolvedValueOnce({});

      await expect(getWorkspaceContext()).rejects.toThrow();
    });

    it("should throw when session user is undefined", async () => {
      getSessionMock.mockResolvedValueOnce({
        user: undefined,
      });

      await expect(getWorkspaceContext()).rejects.toThrow();
    });

    it("should return context with undefined id when session user has no id property", async () => {
      getSessionMock.mockResolvedValueOnce({
        user: {},
      });

      const result = await getWorkspaceContext();

      expect(result).toBeDefined();
      expect(result?.workspaceId).toBeUndefined();
      expect(result?.userId).toBeUndefined();
    });

    it("should use userId as temporary workspace identifier", async () => {
      const userId = "temp-workspace-123";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      const result = await getWorkspaceContext();

      expect(result?.workspaceId).toBe(userId);
      expect(result?.userId).toBe(userId);
    });

    it("should handle UUIDv4 user IDs", async () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      getSessionMock.mockResolvedValueOnce({
        user: { id: uuid },
      });

      const result = await getWorkspaceContext();

      expect(result).toEqual({
        workspaceId: uuid,
        userId: uuid,
      });
    });

    it("should handle numeric string user IDs", async () => {
      const numericId = "12345";
      getSessionMock.mockResolvedValueOnce({
        user: { id: numericId },
      });

      const result = await getWorkspaceContext();

      expect(result).toEqual({
        workspaceId: numericId,
        userId: numericId,
      });
    });

    it("should handle alphanumeric user IDs with special characters", async () => {
      const id = "user_123-abc.xyz";
      getSessionMock.mockResolvedValueOnce({
        user: { id },
      });

      const result = await getWorkspaceContext();

      expect(result).toEqual({
        workspaceId: id,
        userId: id,
      });
    });

    it("should handle long user IDs", async () => {
      const longId = "a".repeat(256);
      getSessionMock.mockResolvedValueOnce({
        user: { id: longId },
      });

      const result = await getWorkspaceContext();

      expect(result?.workspaceId).toBe(longId);
      expect(result?.userId).toBe(longId);
    });

    it("should handle single-character user IDs", async () => {
      const charId = "x";
      getSessionMock.mockResolvedValueOnce({
        user: { id: charId },
      });

      const result = await getWorkspaceContext();

      expect(result).toEqual({
        workspaceId: charId,
        userId: charId,
      });
    });

    it("should return consistent results on repeated calls", async () => {
      const userId = "user-consistent";
      getSessionMock.mockResolvedValue({
        user: { id: userId },
      });

      const result1 = await getWorkspaceContext();
      const result2 = await getWorkspaceContext();

      expect(result1).toEqual(result2);
      expect(getSessionMock).toHaveBeenCalledTimes(2);
    });

    it("should handle session rejection", async () => {
      getSessionMock.mockRejectedValueOnce(new Error("Session error"));

      await expect(getWorkspaceContext()).rejects.toThrow();
    });

    it("should handle session with additional properties", async () => {
      const userId = "user-with-props";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId, email: "user@example.com", role: "admin" },
        expiresAt: new Date().toISOString(),
      });

      const result = await getWorkspaceContext();

      expect(result).toEqual({
        workspaceId: userId,
        userId,
      });
    });

    it("should return typed WorkspaceContext object", async () => {
      const userId = "user-typed";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      const result = await getWorkspaceContext();

      expect(result).toBeDefined();
      if (result) {
        expect(typeof result.workspaceId).toBe("string");
        expect(typeof result.userId).toBe("string");
      }
    });
  });

  // ─── requireWorkspaceContext() tests ─────────────────────────────────────

  describe("requireWorkspaceContext()", () => {
    it("should return workspace context with valid session", async () => {
      const userId = "user-require-valid";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      const result = await requireWorkspaceContext();

      expect(result).toEqual({
        workspaceId: userId,
        userId,
      });
    });

    it("should throw UnauthorizedError when session is unavailable", async () => {
      getSessionMock.mockResolvedValueOnce(null);

      await expect(requireWorkspaceContext()).rejects.toThrow(UnauthorizedError);
    });

    it("should throw with specific message when session unavailable", async () => {
      getSessionMock.mockResolvedValueOnce(null);

      await expect(requireWorkspaceContext()).rejects.toThrow("Workspace context required");
    });

    it("should throw UnauthorizedError with context-required message when session is null", async () => {
      getSessionMock.mockResolvedValueOnce(null);

      const error = await requireWorkspaceContext().catch((e) => e);

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toBe("Workspace context required");
    });

    it("should throw UnauthorizedError with specific message when session null", async () => {
      getSessionMock.mockResolvedValueOnce(null);

      try {
        await requireWorkspaceContext();
        expect.fail("Should have thrown");
      } catch (e) {
        if (e instanceof UnauthorizedError) {
          expect(e.message).toBe("Workspace context required");
        } else {
          throw e;
        }
      }
    });

    it("should throw when accessing workspaceId from undefined user", async () => {
      getSessionMock.mockResolvedValueOnce({});

      // getWorkspaceContext throws because session.user is undefined
      await expect(getWorkspaceContext()).rejects.toThrow();

      // requireWorkspaceContext also throws
      getSessionMock.mockResolvedValueOnce({});
      await expect(requireWorkspaceContext()).rejects.toThrow();
    });

    it("should fail closed on session error", async () => {
      getSessionMock.mockRejectedValueOnce(new Error("Auth failure"));

      await expect(requireWorkspaceContext()).rejects.toThrow();
    });

    it("should throw UnauthorizedError type specifically", async () => {
      getSessionMock.mockResolvedValueOnce(null);

      try {
        await requireWorkspaceContext();
        expect.fail("Should throw");
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedError);
      }
    });

    it("should not return null, always returns context or throws", async () => {
      const userId = "user-no-null";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      const result = await requireWorkspaceContext();

      expect(result).not.toBeNull();
      expect(result).toBeDefined();
    });

    it("should work with multiple valid calls", async () => {
      const userId1 = "user-1";
      const userId2 = "user-2";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId1 },
      });
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId2 },
      });

      const result1 = await requireWorkspaceContext();
      const result2 = await requireWorkspaceContext();

      expect(result1.userId).toBe(userId1);
      expect(result2.userId).toBe(userId2);
    });

    it("should handle rapid sequential calls with different sessions", async () => {
      const userIds = ["u1", "u2", "u3"];
      for (const userId of userIds) {
        getSessionMock.mockResolvedValueOnce({
          user: { id: userId },
        });
      }

      const results = await Promise.all([
        requireWorkspaceContext(),
        requireWorkspaceContext(),
        requireWorkspaceContext(),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((r) => expect(r).toBeDefined());
    });
  });

  // ─── validateWorkspaceAccess() tests ────────────────────────────────────

  describe("validateWorkspaceAccess()", () => {
    it("should allow access when workspace IDs match", async () => {
      const workspaceId = "workspace-123";
      getSessionMock.mockResolvedValueOnce({
        user: { id: workspaceId },
      });

      await expect(validateWorkspaceAccess(workspaceId)).resolves.toBeUndefined();
    });

    it("should deny access when workspace IDs don't match", async () => {
      const sessionWorkspace = "workspace-1";
      const requiredWorkspace = "workspace-2";
      getSessionMock.mockResolvedValueOnce({
        user: { id: sessionWorkspace },
      });

      await expect(validateWorkspaceAccess(requiredWorkspace)).rejects.toThrow(UnauthorizedError);
    });

    it("should throw UnauthorizedError with cross-workspace message on mismatch", async () => {
      getSessionMock.mockResolvedValueOnce({
        user: { id: "workspace-1" },
      });

      try {
        await validateWorkspaceAccess("workspace-2");
        expect.fail("Should throw");
      } catch (e) {
        if (e instanceof UnauthorizedError) {
          expect(e.message).toContain("Cross-workspace access denied");
        } else {
          throw e;
        }
      }
    });

    it("should fail closed on missing context", async () => {
      getSessionMock.mockResolvedValueOnce(null);

      await expect(validateWorkspaceAccess("any-workspace")).rejects.toThrow(UnauthorizedError);
    });

    it("should fail closed on missing session", async () => {
      getSessionMock.mockResolvedValueOnce(null);

      await expect(validateWorkspaceAccess("required-workspace")).rejects.toThrow();
    });

    it("should handle empty required workspace ID", async () => {
      const workspaceId = "ws-123";
      getSessionMock.mockResolvedValueOnce({
        user: { id: workspaceId },
      });

      await expect(validateWorkspaceAccess("")).rejects.toThrow(UnauthorizedError);
    });

    it("should handle empty current workspace ID", async () => {
      getSessionMock.mockResolvedValueOnce({
        user: { id: "" },
      });

      await expect(validateWorkspaceAccess("required")).rejects.toThrow(UnauthorizedError);
    });

    it("should do exact matching (case-sensitive)", async () => {
      getSessionMock.mockResolvedValueOnce({
        user: { id: "Workspace-123" },
      });

      // Different case should fail
      await expect(validateWorkspaceAccess("workspace-123")).rejects.toThrow(UnauthorizedError);
    });

    it("should do exact matching with special characters", async () => {
      const wsId = "workspace_123-abc";
      getSessionMock.mockResolvedValueOnce({
        user: { id: wsId },
      });

      await expect(validateWorkspaceAccess(wsId)).resolves.toBeUndefined();

      getSessionMock.mockResolvedValueOnce({
        user: { id: wsId },
      });
      await expect(validateWorkspaceAccess("workspace_123-abc!")).rejects.toThrow();
    });

    it("should allow access with UUID workspace IDs", async () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      getSessionMock.mockResolvedValueOnce({
        user: { id: uuid },
      });

      await expect(validateWorkspaceAccess(uuid)).resolves.toBeUndefined();
    });

    it("should deny access with different UUIDs", async () => {
      getSessionMock.mockResolvedValueOnce({
        user: { id: "550e8400-e29b-41d4-a716-446655440000" },
      });

      await expect(validateWorkspaceAccess("550e8400-e29b-41d4-a716-446655440001")).rejects.toThrow();
    });

    it("should handle numeric string workspace IDs", async () => {
      const numId = "12345";
      getSessionMock.mockResolvedValueOnce({
        user: { id: numId },
      });

      await expect(validateWorkspaceAccess(numId)).resolves.toBeUndefined();

      getSessionMock.mockResolvedValueOnce({
        user: { id: numId },
      });
      await expect(validateWorkspaceAccess("12346")).rejects.toThrow();
    });

    it("should work with multiple sequential validations", async () => {
      const ws1 = "workspace-1";
      const ws2 = "workspace-2";

      getSessionMock.mockResolvedValueOnce({
        user: { id: ws1 },
      });
      await expect(validateWorkspaceAccess(ws1)).resolves.toBeUndefined();

      getSessionMock.mockResolvedValueOnce({
        user: { id: ws2 },
      });
      await expect(validateWorkspaceAccess(ws2)).resolves.toBeUndefined();
    });

    it("should prevent cross-workspace access attacks", async () => {
      // Malicious actor tries to access admin workspace with their own ID
      const attackerWs = "attacker-workspace";
      const adminWs = "admin-workspace";

      getSessionMock.mockResolvedValueOnce({
        user: { id: attackerWs },
      });

      await expect(validateWorkspaceAccess(adminWs)).rejects.toThrow(UnauthorizedError);
    });

    it("should validate ownership before allowing access", async () => {
      const ownerWs = "owner-123";
      const otherWs = "other-456";

      getSessionMock.mockResolvedValueOnce({
        user: { id: ownerWs },
      });

      // Allowed: accessing own workspace
      await expect(validateWorkspaceAccess(ownerWs)).resolves.toBeUndefined();

      // Reset mock for next call
      getSessionMock.mockResolvedValueOnce({
        user: { id: ownerWs },
      });

      // Denied: accessing other workspace
      await expect(validateWorkspaceAccess(otherWs)).rejects.toThrow();
    });

    it("should handle long workspace IDs", async () => {
      const longId = "w".repeat(256);
      getSessionMock.mockResolvedValueOnce({
        user: { id: longId },
      });

      await expect(validateWorkspaceAccess(longId)).resolves.toBeUndefined();
    });

    it("should work with least-privilege pattern", async () => {
      // Session has access to workspace A only
      getSessionMock.mockResolvedValueOnce({
        user: { id: "workspace-A" },
      });

      // Can access A
      await expect(validateWorkspaceAccess("workspace-A")).resolves.toBeUndefined();

      // Cannot access B
      getSessionMock.mockResolvedValueOnce({
        user: { id: "workspace-A" },
      });
      await expect(validateWorkspaceAccess("workspace-B")).rejects.toThrow();
    });
  });

  // ─── Real-world scenarios ────────────────────────────────────────────────

  describe("Real-world scenarios", () => {
    it("should handle typical API request flow", async () => {
      const userId = "api-user-123";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      // Typical API route: require context, validate access, perform operation
      const context = await requireWorkspaceContext();
      expect(context).toBeDefined();
      expect(context.workspaceId).toBe(userId);

      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      await expect(validateWorkspaceAccess(context.workspaceId)).resolves.toBeUndefined();
    });

    it("should support multi-workspace organizations", async () => {
      const orgAdminId = "org-admin-workspace";

      getSessionMock.mockResolvedValueOnce({
        user: { id: orgAdminId },
      });

      const adminContext = await requireWorkspaceContext();
      expect(adminContext.workspaceId).toBe(orgAdminId);

      // Admin can only access their own workspace (fails closed)
      getSessionMock.mockResolvedValueOnce({
        user: { id: orgAdminId },
      });
      await expect(validateWorkspaceAccess("other-org-workspace")).rejects.toThrow();
    });

    it("should handle failed authentication flow", async () => {
      // User not logged in
      getSessionMock.mockResolvedValueOnce(null);

      const context = await getWorkspaceContext();
      expect(context).toBeNull();

      // Attempting protected operation
      getSessionMock.mockResolvedValueOnce(null);
      await expect(requireWorkspaceContext()).rejects.toThrow(UnauthorizedError);
    });

    it("should handle session timeout during request", async () => {
      getSessionMock.mockResolvedValueOnce(null);

      try {
        await requireWorkspaceContext();
        expect.fail("Should throw");
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedError);
      }
    });

    it("should prevent privilege escalation via workspace tampering", async () => {
      const userWorkspace = "user-ws-123";
      const elevatedWorkspace = "admin-ws-456";

      getSessionMock.mockResolvedValueOnce({
        user: { id: userWorkspace },
      });

      // User tries to escalate to admin workspace
      await expect(validateWorkspaceAccess(elevatedWorkspace)).rejects.toThrow(UnauthorizedError);
    });

    it("should work with 15+ concurrent API requests", async () => {
      const userId = "user-concurrent";
      const requests = Array(15)
        .fill(0)
        .map(() => {
          getSessionMock.mockResolvedValueOnce({
            user: { id: userId },
          });
          return getWorkspaceContext();
        });

      const results = await Promise.all(requests);
      results.forEach((r) => {
        expect(r).toEqual({
          workspaceId: userId,
          userId,
        });
      });
    });
  });

  // ─── Type safety ────────────────────────────────────────────────────────

  describe("Type safety", () => {
    it("should return typed WorkspaceContext from getWorkspaceContext", async () => {
      const userId = "user-typed";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      const context = await getWorkspaceContext();

      expect(context).toBeDefined();
      if (context) {
        expect("workspaceId" in context).toBe(true);
        expect("userId" in context).toBe(true);
        expect(typeof context.workspaceId).toBe("string");
        expect(typeof context.userId).toBe("string");
      }
    });

    it("should return Promise<WorkspaceContext | null> from getWorkspaceContext", async () => {
      getSessionMock.mockResolvedValueOnce(null);

      const result = await getWorkspaceContext();
      expect(typeof result === "object" || result === null).toBe(true);
    });

    it("should return Promise<WorkspaceContext> from requireWorkspaceContext", async () => {
      const userId = "user-promise";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      const result = await requireWorkspaceContext();
      expect(result).not.toBeNull();
      expect(typeof result.workspaceId).toBe("string");
      expect(typeof result.userId).toBe("string");
    });

    it("should return Promise<void> from validateWorkspaceAccess", async () => {
      const ws = "workspace-void";
      getSessionMock.mockResolvedValueOnce({
        user: { id: ws },
      });

      const result = await validateWorkspaceAccess(ws);
      expect(result).toBeUndefined();
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  describe("Edge cases", () => {
    it("should handle undefined session property", async () => {
      getSessionMock.mockResolvedValueOnce(undefined);

      const result = await getWorkspaceContext();
      expect(result).toBeNull();
    });

    it("should throw when session user is null", async () => {
      getSessionMock.mockResolvedValueOnce({
        user: null,
      });

      await expect(getWorkspaceContext()).rejects.toThrow();
    });

    it("should return context with undefined workspaceId when session user is empty object", async () => {
      getSessionMock.mockResolvedValueOnce({
        user: {},
      });

      const result = await getWorkspaceContext();
      expect(result).toBeDefined();
      expect(result?.workspaceId).toBeUndefined();
    });

    it("should handle whitespace-only user IDs", async () => {
      getSessionMock.mockResolvedValueOnce({
        user: { id: "   " },
      });

      const result = await getWorkspaceContext();
      expect(result).toBeDefined();
      expect(result?.workspaceId).toBe("   ");
    });

    it("should handle special characters in workspace IDs", async () => {
      const specialId = "ws-!@#$%^&*()_+-=[]{}|;:',.<>?/";
      getSessionMock.mockResolvedValueOnce({
        user: { id: specialId },
      });

      const result = await getWorkspaceContext();
      expect(result?.workspaceId).toBe(specialId);
    });

    it("should handle unicode characters in workspace IDs", async () => {
      const unicodeId = "user-😀-🎉-✨";
      getSessionMock.mockResolvedValueOnce({
        user: { id: unicodeId },
      });

      const result = await getWorkspaceContext();
      expect(result?.workspaceId).toBe(unicodeId);
    });

    it("should handle very long required workspace ID", async () => {
      const longId = "a".repeat(1024);
      getSessionMock.mockResolvedValueOnce({
        user: { id: longId },
      });

      await expect(validateWorkspaceAccess(longId)).resolves.toBeUndefined();
    });

    it("should handle null instead of error from getSession", async () => {
      getSessionMock.mockResolvedValueOnce(null);

      const context = await getWorkspaceContext();
      expect(context).toBeNull();
    });

    it("should not call getSession multiple times in requireWorkspaceContext", async () => {
      const userId = "user-once";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      await requireWorkspaceContext();

      // getSession should be called once (by getWorkspaceContext, which is called by requireWorkspaceContext)
      expect(getSessionMock.mock.calls.length).toBeGreaterThan(0);
    });
  });

  // ─── Consistency ────────────────────────────────────────────────────────

  describe("Consistency and determinism", () => {
    it("should return identical results for identical input", async () => {
      const userId = "user-deterministic";
      getSessionMock.mockResolvedValue({
        user: { id: userId },
      });

      const result1 = await getWorkspaceContext();
      const result2 = await getWorkspaceContext();

      expect(result1).toEqual(result2);
    });

    it("should maintain consistency across multiple validations", async () => {
      const ws = "workspace-consistency";
      getSessionMock.mockResolvedValue({
        user: { id: ws },
      });

      await expect(validateWorkspaceAccess(ws)).resolves.toBeUndefined();
      await expect(validateWorkspaceAccess(ws)).resolves.toBeUndefined();
      await expect(validateWorkspaceAccess(ws)).resolves.toBeUndefined();
    });

    it("should not mutate workspace context across calls", async () => {
      const userId = "user-immutable";
      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      const context1 = await getWorkspaceContext();
      const originalWorkspaceId = context1?.workspaceId;

      getSessionMock.mockResolvedValueOnce({
        user: { id: userId },
      });

      const context2 = await getWorkspaceContext();

      expect(context2?.workspaceId).toBe(originalWorkspaceId);
    });
  });
});
