/**
 * Canonical test utilities and factories.
 * Use these builders instead of inline mock objects to prevent contract drift.
 */

import type { AuthContext } from "@/lib/auth-guard";
import type { SessionInfo, AuthenticatedUser } from "@/services/auth";
import type { PolicyContext } from "@/policies/capability-check";
import type { RoleName } from "@/domain/constants/roles";

// ─── AuthenticatedUser Factory ─────────────────────────────────────────────

export function createMockAuthenticatedUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    isActive: true,
    ...overrides,
  };
}

// ─── SessionInfo Factory ──────────────────────────────────────────────────

export function createMockSessionInfo(overrides?: Partial<SessionInfo>): SessionInfo {
  return {
    user: createMockAuthenticatedUser(),
    sessionId: "session-123",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    ...overrides,
  };
}

// ─── PolicyContext Factory ────────────────────────────────────────────────

export function createMockPolicyContext(overrides?: Partial<PolicyContext>): PolicyContext {
  return {
    userId: "user-123",
    roles: [
      {
        role: "SYSTEM_ADMIN" as RoleName,
        scope: undefined,
        scopeId: undefined,
      },
    ],
    engagementMemberships: [],
    ...overrides,
  };
}

// ─── AuthContext Factory (PRIMARY - use this) ────────────────────────────

export function createMockAuthContext(overrides?: {
  session?: Partial<SessionInfo>;
  policy?: Partial<PolicyContext>;
}): AuthContext {
  return {
    session: createMockSessionInfo(overrides?.session),
    policy: createMockPolicyContext(overrides?.policy),
  };
}

// ─── Mock Response Factory ─────────────────────────────────────────────────

export function createMockResponse(
  data: unknown = {},
  options?: { ok?: boolean; status?: number; statusText?: string }
): Response {
  const json = async () => data;
  const text = async () => JSON.stringify(data);

  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    statusText: options?.statusText ?? "OK",
    headers: new Headers(),
    redirected: false,
    type: "basic" as ResponseType,
    url: "http://test.local",
    clone: function() { return this; },
    blob: async () => new Blob([JSON.stringify(data)]),
    arrayBuffer: async () => new ArrayBuffer(0),
    text,
    json,
    formData: async () => new FormData(),
  } as Response;
}

// ─── Persistence Service Args Factory ─────────────────────────────────────

export function createPersistenceArgs(
  workspaceId: string = "workspace-123",
  actorId: string = "user-123"
): [workspaceId: string, actorId: string] {
  return [workspaceId, actorId];
}

// ─── Event Args Factory ────────────────────────────────────────────────────

export function createEventArgs(
  workspaceId: string = "workspace-123",
  actorId: string = "user-123",
  reason?: string
): [workspaceId: string, actorId: string, reason?: string] {
  return reason ? [workspaceId, actorId, reason] : [workspaceId, actorId];
}
