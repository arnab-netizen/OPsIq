/**
 * POST /api/onboarding/workspace — REAL route + REAL canonical-route-enforcement.
 *
 * `withCanonicalEnforcement` is NOT mocked here (unlike
 * src/__tests__/api/owner/tender/screen.test.ts-style tests) — this exercises
 * the actual auth/workspace/capability pipeline the real wrapper runs,
 * against a real database, exactly the way the hostile audit demanded route
 * reachability be proven rather than assumed.
 *
 * Two facts this pins:
 *
 * 1. An actor who already has an active workspace membership (e.g. a
 *    just-signed-up owner) can direct-POST this endpoint and it can never
 *    create a second workspace for them — the endpoint is unconditionally
 *    disabled (FeatureDisabledError, 501) before it does anything.
 *
 * 2. A session with ZERO active workspace memberships never even reaches
 *    this route's handler: `withCanonicalEnforcement`'s workspace-resolution
 *    step (STEP 1.5 in canonical-route-enforcement.ts) unconditionally looks
 *    up an active WorkspaceMembership and throws a 403
 *    ("workspace_context_invalid") before the handler runs — regardless of
 *    `requireWorkspace: false`. This is the exact defect a prior revision of
 *    this workstream missed: a "recovery form" calling this endpoint for a
 *    zero-workspace user was dead code, since the request never gets past
 *    the wrapper. Only `@/services/auth`'s fact-gathering functions are
 *    mocked (same technique as
 *    src/__tests__/api/growth/pricing-tiers-real-route.db.test.ts) so the
 *    wrapper's own membership lookup runs for real against real DB rows.
 *
 * In both cases the database is asserted to gain no new Workspace.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let mockActorId = randomUUID();
let mockWorkspaceId: string | null = null;
/** Toggle between "this session has an active membership" and "it has none". */
let mockHasMembership = true;

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: {
      user: { id: mockActorId, email: "test@example.com", name: "Test User", isActive: true },
      sessionId: "test-session",
      expiresAt: new Date(Date.now() + 86400000),
    },
    invalidReason: undefined,
  })),
  getSession: vi.fn(async () => ({
    user: { id: mockActorId, email: "test@example.com", name: "Test User", isActive: true },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: {
      userId: mockActorId,
      roles: mockHasMembership
        ? [{ role: "admin_or_portfolio_manager", scope: "workspace", scopeId: mockWorkspaceId }]
        : [],
      engagementMemberships: [],
    },
    invalidReason: undefined,
  })),
  getPolicyContext: vi.fn(async () => ({
    userId: mockActorId,
    roles: mockHasMembership
      ? [{ role: "admin_or_portfolio_manager", scope: "workspace", scopeId: mockWorkspaceId }]
      : [],
    engagementMemberships: [],
  })),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/onboarding/workspace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] POST /api/onboarding/workspace — REAL route + REAL canonical-route-enforcement",
  () => {
    beforeEach(() => {
      mockActorId = randomUUID();
      mockWorkspaceId = null;
      mockHasMembership = true;
    });

    afterEach(async () => {
      if (mockWorkspaceId) {
        await db.auditEvent.deleteMany({ where: { workspaceId: mockWorkspaceId } });
        await db.userRoleAssignment.deleteMany({ where: { userId: mockActorId } });
        await db.workspaceMembership.deleteMany({ where: { userId: mockActorId } });
        await db.workspace.deleteMany({ where: { id: mockWorkspaceId } });
      }
      await db.user.deleteMany({ where: { id: mockActorId } });
    });

    it("[db] an already-onboarded actor's direct POST cannot create Workspace B — disabled before any DB write", async () => {
      mockWorkspaceId = randomUUID();
      await db.user.create({ data: { id: mockActorId, email: `${mockActorId}@example.com`, updatedAt: new Date() } });
      await db.workspace.create({
        data: { id: mockWorkspaceId, name: "Existing WS", slug: `existing-${mockWorkspaceId.slice(0, 8)}`, isActive: true },
      });
      await db.workspaceMembership.create({
        data: { workspaceId: mockWorkspaceId, userId: mockActorId, role: "owner", isActive: true },
      });
      await db.userRoleAssignment.create({
        data: {
          id: randomUUID(),
          userId: mockActorId,
          role: "admin_or_portfolio_manager",
          scope: "workspace",
          scopeId: mockWorkspaceId,
          isActive: true,
        },
      });

      const { POST } = await import("@/app/api/onboarding/workspace/route");
      const res = await POST(
        makeRequest({ name: "Second Workspace", slug: `second-${randomUUID().slice(0, 8)}` }),
        { params: Promise.resolve({}) }
      );

      expect(res.status).toBe(501);

      const workspaces = await db.workspace.findMany({ where: { createdBy: mockActorId } });
      expect(workspaces).toHaveLength(0);
      const memberships = await db.workspaceMembership.findMany({ where: { userId: mockActorId } });
      expect(memberships).toHaveLength(1);
      expect(memberships[0].workspaceId).toBe(mockWorkspaceId);
    });

    it("[db] a zero-active-membership session never reaches the handler — the wrapper itself 403s first", async () => {
      mockHasMembership = false;
      await db.user.create({ data: { id: mockActorId, email: `${mockActorId}@example.com`, updatedAt: new Date() } });
      // Deliberately create no WorkspaceMembership row for this actor — the
      // real STEP 1.5 membership lookup in canonical-route-enforcement.ts
      // must find none.

      const { POST } = await import("@/app/api/onboarding/workspace/route");
      const res = await POST(
        makeRequest({ name: "My Workspace", slug: `my-ws-${randomUUID().slice(0, 8)}` }),
        { params: Promise.resolve({}) }
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.classification).toContain("workspace_context_invalid");

      const workspaces = await db.workspace.findMany({ where: { createdBy: mockActorId } });
      expect(workspaces).toHaveLength(0);
      const memberships = await db.workspaceMembership.findMany({ where: { userId: mockActorId } });
      expect(memberships).toHaveLength(0);
    });
  }
);
