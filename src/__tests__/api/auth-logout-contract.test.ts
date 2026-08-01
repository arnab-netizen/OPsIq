/**
 * POST /api/auth/logout — session-revocation contract (non-DB).
 *
 * Defect this pins: the route passed `ctx.verifiedActorId` (a USER id) into
 * `revokeSession()`, which resolves `session.id`. No session row carries a user
 * id, so Prisma raised P2025 and logout returned HTTP 500 on every call.
 *
 * The correct identifier is `ctx.session.sessionId` — the verified SessionInfo
 * the canonical wrapper resolves from the opaque cookie token.
 *
 * Coverage:
 *  1.  valid logout revokes and succeeds
 *  2.  the verified session id is used — never the actor id
 *  3.  the audit event references the session entity
 *  4.  the cookie is cleared on success
 *  5.  the cookie is cleared when the session was already revoked
 *  6.  an already-revoked session emits no duplicate audit event
 *  7.  a missing verified session does not revoke or throw
 *  8.  unrelated database failures still propagate (not suppressed)
 *  9.  canonical enforcement remains wired (fail-closed for unauthenticated)
 * 10.  login / session issuance is untouched by this change
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRevokeSession, mockEmitAuditEvent, mockCookieDelete, mockGetSessionCookieName } =
  vi.hoisted(() => ({
    mockRevokeSession: vi.fn(),
    mockEmitAuditEvent: vi.fn().mockResolvedValue(undefined),
    mockCookieDelete: vi.fn(),
    mockGetSessionCookieName: vi.fn().mockReturnValue("opsiq_session"),
  }));

// Run the real handler body directly so the test asserts route logic rather
// than wrapper internals; enforcement wiring is asserted separately below.
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: unknown) => handler,
}));

vi.mock("@/services/auth", () => ({
  revokeSession: mockRevokeSession,
  getSessionCookieName: mockGetSessionCookieName,
}));

vi.mock("@/infra/audit", () => ({ emitAuditEvent: mockEmitAuditEvent }));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ delete: mockCookieDelete }),
}));

import { POST as logoutHandler } from "@/app/api/auth/logout/route";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";

function ctx(over: Record<string, unknown> = {}) {
  return {
    verifiedActorId: ACTOR_ID,
    verifiedWorkspaceId: WORKSPACE_ID,
    session: {
      sessionId: SESSION_ID,
      user: { id: ACTOR_ID, email: "owner@example.test", name: null, isActive: true },
      expiresAt: new Date(Date.now() + 3_600_000),
    },
    ...over,
  } as never;
}

const run = logoutHandler as unknown as (c: never) => Promise<{ success: boolean }>;

beforeEach(() => {
  vi.clearAllMocks();
  mockRevokeSession.mockResolvedValue(true);
  mockGetSessionCookieName.mockReturnValue("opsiq_session");
});

describe("valid authenticated logout", () => {
  it("1. succeeds", async () => {
    await expect(run(ctx())).resolves.toEqual({ success: true });
  });

  it("2. passes the verified session id — never the actor id", async () => {
    await run(ctx());

    expect(mockRevokeSession).toHaveBeenCalledTimes(1);
    const [identity] = mockRevokeSession.mock.calls[0];
    expect(identity).toEqual(expect.objectContaining({ sessionId: SESSION_ID }));
    expect(identity.sessionId).not.toBe(ACTOR_ID);
    // The bug passed a bare string (the user id) as the first argument.
    expect(typeof identity).toBe("object");
  });

  it("3. emits an audit event referencing the session entity", async () => {
    await run(ctx());

    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: AUDIT_EVENTS.USER_LOGGED_OUT,
        entityType: "session",
        entityId: SESSION_ID,
        actorId: ACTOR_ID,
        workspaceId: WORKSPACE_ID,
      })
    );
  });

  it("4. clears the session cookie", async () => {
    await run(ctx());
    expect(mockCookieDelete).toHaveBeenCalledWith("opsiq_session");
  });
});

describe("idempotent logout", () => {
  it("5. clears the cookie and succeeds when the session was already revoked", async () => {
    mockRevokeSession.mockResolvedValue(false);

    await expect(run(ctx())).resolves.toEqual({ success: true });
    expect(mockCookieDelete).toHaveBeenCalledWith("opsiq_session");
  });

  it("6. emits no audit event when nothing was revoked", async () => {
    mockRevokeSession.mockResolvedValue(false);

    await run(ctx());
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("7. does not revoke when the context carries no verified session", async () => {
    await expect(run(ctx({ session: undefined }))).resolves.toEqual({ success: true });

    expect(mockRevokeSession).not.toHaveBeenCalled();
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
    // Cookie is still cleared — the client must not keep an unusable session.
    expect(mockCookieDelete).toHaveBeenCalledWith("opsiq_session");
  });
});

describe("error handling", () => {
  it("8. propagates unrelated database failures instead of suppressing them", async () => {
    mockRevokeSession.mockRejectedValue(new Error("connection terminated unexpectedly"));

    await expect(run(ctx())).rejects.toThrow("connection terminated unexpectedly");
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

describe("enforcement and issuance are unchanged", () => {
  it("9. the route is wrapped in canonical enforcement with skipReadinessCheck", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/app/api/auth/logout/route.ts", "utf-8")
    );

    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("skipReadinessCheck: true");
    // The defect signature must never reappear.
    expect(src).not.toContain("revokeSession(actorId");
  });

  it("10. login and session issuance are untouched by this change", async () => {
    const authSrc = await import("node:fs").then((fs) =>
      fs.readFileSync("src/services/auth.ts", "utf-8")
    );

    // Issuance still resolves sessions by opaque token, not by user id.
    expect(authSrc).toContain("where: { token: sessionToken }");
    expect(authSrc).toContain("sessionId: session.id");
    // Revocation is scoped to a single unrevoked session row.
    expect(authSrc).toContain("where: { id: session.sessionId, revokedAt: null }");
    // Bulk revocation by user must not have been introduced here.
    expect(authSrc).not.toContain("where: { userId }");
  });
});
