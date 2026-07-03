import { describe, it, expect } from "vitest";
import { canonicalizeAuthContext } from "@/lib/auth-guard";
import type { AuthContext } from "@/lib/auth-guard";
import type { SessionInfo } from "@/services/auth";
import type { PolicyContext } from "@/policies/capability-check";
import { UnauthorizedError } from "@/infra/errors";

describe("canonicalizeAuthContext - PHASE G6R Auth Type Bridge", () => {
  // Helper to create test AuthContext
  function createAuthContext(overrides?: Partial<AuthContext>): AuthContext {
    return {
      session: {
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
          isActive: true,
        },
        sessionId: "session-456",
        expiresAt: new Date(Date.now() + 86400000),
      },
      policy: {
        userId: "user-123",
        roles: [
          {
            role: "admin",
            scope: "workspace",
            scopeId: "workspace-789",
          },
        ],
        engagementMemberships: [],
      },
      ...overrides,
    };
  }

  it("should convert valid AuthContext to CanonicalAuthContext", () => {
    const auth = createAuthContext();
    const ctx = canonicalizeAuthContext(auth, "workspace-789");

    expect(ctx.verifiedActorId).toBe("user-123");
    expect(ctx.verifiedActorType).toBe("user");
    expect(ctx.verifiedActor.id).toBe("user-123");
    expect(ctx.verifiedWorkspaceId).toBe("workspace-789");
    expect(ctx.verifiedCapabilities.has("admin")).toBe(true);
  });

  it("should preserve actor identity", () => {
    const auth = createAuthContext();
    const ctx = canonicalizeAuthContext(auth, "workspace-789");

    expect(ctx.verifiedActor).toEqual(auth.session.user);
    expect(ctx.verifiedSessionSnapshot.actorId).toBe("user-123");
  });

  it("should preserve workspace identity", () => {
    const auth = createAuthContext();
    const ctx = canonicalizeAuthContext(auth, "workspace-xyz");

    expect(ctx.verifiedWorkspaceId).toBe("workspace-xyz");
    expect(ctx.verifiedSessionSnapshot.workspaceId).toBe("workspace-xyz");
  });

  it("should fail closed when authContext is null", () => {
    expect(() => canonicalizeAuthContext(null, "workspace-789")).toThrow(UnauthorizedError);
    expect(() => canonicalizeAuthContext(undefined, "workspace-789")).toThrow(UnauthorizedError);
  });

  it("should fail closed when session is missing", () => {
    const auth = createAuthContext({ session: undefined });
    expect(() => canonicalizeAuthContext(auth, "workspace-789")).toThrow(UnauthorizedError);
  });

  it("should fail closed when user is missing", () => {
    const auth = createAuthContext({
      session: {
        user: undefined,
        sessionId: "session-456",
        expiresAt: new Date(),
      } as any,
    });
    expect(() => canonicalizeAuthContext(auth, "workspace-789")).toThrow(UnauthorizedError);
  });

  it("should fail closed when user ID is missing", () => {
    const auth = createAuthContext({
      session: {
        user: {
          id: "",
          email: "test@example.com",
          name: "Test User",
          isActive: true,
        },
        sessionId: "session-456",
        expiresAt: new Date(),
      },
    });
    expect(() => canonicalizeAuthContext(auth, "workspace-789")).toThrow(UnauthorizedError);
  });

  it("should fail closed when workspace is empty", () => {
    const auth = createAuthContext();
    expect(() => canonicalizeAuthContext(auth, "")).toThrow(UnauthorizedError);
    expect(() => canonicalizeAuthContext(auth, "   ")).toThrow(UnauthorizedError);
  });

  it("should extract capabilities from policy roles", () => {
    const auth = createAuthContext({
      policy: {
        userId: "user-123",
        roles: [
          { role: "admin", scope: "workspace", scopeId: "workspace-789" },
          { role: "editor", scope: "workspace", scopeId: "workspace-789" },
        ],
        engagementMemberships: [],
      },
    });
    const ctx = canonicalizeAuthContext(auth, "workspace-789");

    expect(ctx.verifiedCapabilities.has("admin")).toBe(true);
    expect(ctx.verifiedCapabilities.has("editor")).toBe(true);
  });

  it("should not fabricate permissions", () => {
    const auth = createAuthContext({
      policy: {
        userId: "user-123",
        roles: [
          { role: "viewer", scope: "workspace", scopeId: "workspace-789" },
        ],
        engagementMemberships: [],
      },
    });
    const ctx = canonicalizeAuthContext(auth, "workspace-789");

    expect(ctx.verifiedCapabilities.has("viewer")).toBe(true);
    expect(ctx.verifiedCapabilities.has("admin")).toBe(false);
  });

  it("should handle empty policy gracefully", () => {
    const auth = createAuthContext({
      policy: {
        userId: "user-123",
        roles: [],
        engagementMemberships: [],
      },
    });
    const ctx = canonicalizeAuthContext(auth, "workspace-789");

    expect(ctx.verifiedCapabilities.size).toBe(0);
  });

  it("should create valid verifiedSessionSnapshot", () => {
    const auth = createAuthContext();
    const ctx = canonicalizeAuthContext(auth, "workspace-789");

    expect(ctx.verifiedSessionSnapshot.snapshotId).toBeDefined();
    expect(ctx.verifiedSessionSnapshot.snapshotTimestamp).toBeDefined();
    expect(ctx.verifiedSessionSnapshot.actorId).toBe("user-123");
    expect(ctx.verifiedSessionSnapshot.workspaceId).toBe("workspace-789");
    expect(Array.isArray(ctx.verifiedSessionSnapshot.capabilities)).toBe(true);
  });

  it("should preserve session and policy in canonical context", () => {
    const auth = createAuthContext();
    const ctx = canonicalizeAuthContext(auth, "workspace-789");

    expect(ctx.session).toEqual(auth.session);
    expect(ctx.policy).toEqual(auth.policy);
  });

  it("should not include optional tracing fields (intentional omission)", () => {
    const auth = createAuthContext();
    const ctx = canonicalizeAuthContext(auth, "workspace-789");

    // These should be undefined (not included)
    expect(ctx.traceId).toBeUndefined();
    expect(ctx.executionTrace).toBeUndefined();
    expect(ctx.request).toBeUndefined();
    expect(ctx.correlationId).toBeUndefined();
    expect(ctx.requestId).toBeUndefined();
  });
});
