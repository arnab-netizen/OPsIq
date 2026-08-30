/**
 * REAL (unmocked) canonical-route-enforcement.ts integration tests for:
 *   GET /api/users
 *
 * Companion to src/__tests__/api/users-routes.test.ts (which mocks
 * canonical-route-enforcement.ts entirely to test capability declarations).
 * This file exercises the REAL withCanonicalEnforcement auth pipeline against
 * a real Postgres database, proving the actual authorization decision that
 * replaced the removed `ctx.verifiedActorType !== "service"` guard:
 *
 *  1. A "user" actor holding the USER_VIEW capability (admin_or_portfolio_manager,
 *     experienced_consultant) succeeds -- HTTP 200, real workspace-scoped data.
 *  2. A "user" actor WITHOUT USER_VIEW (client_owner) is denied -- HTTP 403 with
 *     the governed "Insufficient permissions" message, never the removed
 *     "Internal only" text and never any actor-type/internal-implementation
 *     language.
 *  3. Workspace isolation holds: a user listed under workspace A never appears
 *     in workspace B's GET /api/users response.
 *
 * Auth is bypassed the same way src/__tests__/api/growth/pricing-tiers-real-route.db.test.ts
 * does it: @/services/auth is mocked to supply a valid session/policy so the REAL
 * canonical-route-enforcement.ts auth-state-build + evaluate + handler +
 * error-classification logic all run for real against real workspace membership rows.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { RoleName } from "@/domain/constants/roles";

let testActorIdForMock = randomUUID();
let testWorkspaceIdForMock = randomUUID();
let testRoleForMock: RoleName = "admin_or_portfolio_manager";

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: {
      user: {
        id: testActorIdForMock,
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      sessionId: "test-session",
      expiresAt: new Date(Date.now() + 86400000),
    },
    invalidReason: undefined,
  })),
  getSession: vi.fn(async () => ({
    user: {
      id: testActorIdForMock,
      email: "test@example.com",
      name: "Test User",
      isActive: true,
    },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: {
      userId: testActorIdForMock,
      roles: [
        { role: testRoleForMock, scope: "workspace", scopeId: testWorkspaceIdForMock },
      ],
      engagementMemberships: [],
    },
    invalidReason: undefined,
  })),
  getPolicyContext: vi.fn(async () => ({
    userId: testActorIdForMock,
    roles: [
      { role: testRoleForMock, scope: "workspace", scopeId: testWorkspaceIdForMock },
    ],
    engagementMemberships: [],
  })),
}));

function makeGetRequest(): NextRequest {
  return new NextRequest("https://example.com/api/users?limit=50", { method: "GET" });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "GET /api/users — REAL route + REAL canonical-route-enforcement",
  () => {
    let workspaceA: string;
    let workspaceB: string;
    let actorId: string;
    let listedUserAId: string;
    let listedUserBId: string;

    beforeEach(async () => {
      actorId = randomUUID();
      workspaceA = randomUUID();
      workspaceB = randomUUID();
      listedUserAId = randomUUID();
      listedUserBId = randomUUID();
      testActorIdForMock = actorId;
      testWorkspaceIdForMock = workspaceA;
      testRoleForMock = "admin_or_portfolio_manager";

      await db.user.create({
        data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() },
      });
      await db.user.create({
        data: { id: listedUserAId, email: `${listedUserAId}@example.com`, updatedAt: new Date() },
      });
      await db.user.create({
        data: { id: listedUserBId, email: `${listedUserBId}@example.com`, updatedAt: new Date() },
      });
      await db.workspace.create({
        data: { id: workspaceA, name: "WS A", slug: `ws-a-${workspaceA.substring(0, 8)}` },
      });
      await db.workspace.create({
        data: { id: workspaceB, name: "WS B", slug: `ws-b-${workspaceB.substring(0, 8)}` },
      });
      await db.workspaceMembership.create({
        data: { userId: actorId, workspaceId: workspaceA, role: "admin", isActive: true },
      });
      // A user visible only through workspace A's membership.
      await db.workspaceMembership.create({
        data: { userId: listedUserAId, workspaceId: workspaceA, role: "viewer", isActive: true },
      });
      // A user visible only through workspace B's membership -- must never show
      // up in workspace A's GET /api/users response.
      await db.workspaceMembership.create({
        data: { userId: listedUserBId, workspaceId: workspaceB, role: "viewer", isActive: true },
      });
    });

    afterEach(async () => {
      await db.workspaceMembership.deleteMany({
        where: { userId: { in: [actorId, listedUserAId, listedUserBId] } },
      });
      await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
      await db.user.deleteMany({ where: { id: { in: [actorId, listedUserAId, listedUserBId] } } });
    });

    it("admin_or_portfolio_manager (holds USER_VIEW): 200, returns workspace-A-scoped users", async () => {
      testRoleForMock = "admin_or_portfolio_manager";
      const { GET } = await import("@/app/api/users/route");

      const response = await GET(makeGetRequest(), { params: Promise.resolve({}) });
      expect(response.status).toBe(200);

      const body = await response.json();
      const ids = body.users.map((u: { id: string }) => u.id);
      expect(ids).toContain(listedUserAId);
      expect(ids).not.toContain(listedUserBId);
    });

    it("experienced_consultant (holds USER_VIEW): 200", async () => {
      testRoleForMock = "experienced_consultant";
      const { GET } = await import("@/app/api/users/route");

      const response = await GET(makeGetRequest(), { params: Promise.resolve({}) });
      expect(response.status).toBe(200);
    });

    it("client_owner (does NOT hold USER_VIEW): 403 with the governed 'Insufficient permissions' message -- never 'Internal only', never actor-type language", async () => {
      testRoleForMock = "client_owner";
      const { GET } = await import("@/app/api/users/route");

      const response = await GET(makeGetRequest(), { params: Promise.resolve({}) });
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.error).toBe("Insufficient permissions");
      expect(body.error).not.toContain("Internal only");
      expect(JSON.stringify(body).toLowerCase()).not.toContain("actor");
      expect(JSON.stringify(body).toLowerCase()).not.toContain("service");
    });

    it("workspace isolation: workspace B's GET never contains workspace A's listed user", async () => {
      // A second, workspace-B-only actor, exercising the route as themselves --
      // verifiedWorkspaceId is server-derived from THIS actor's own earliest
      // active membership, never from the mocked policy's scopeId.
      const actorIdB = randomUUID();
      await db.user.create({
        data: { id: actorIdB, email: `${actorIdB}@example.com`, updatedAt: new Date() },
      });
      await db.workspaceMembership.create({
        data: { userId: actorIdB, workspaceId: workspaceB, role: "admin", isActive: true },
      });

      testActorIdForMock = actorIdB;
      testWorkspaceIdForMock = workspaceB;
      testRoleForMock = "admin_or_portfolio_manager";

      try {
        const { GET } = await import("@/app/api/users/route");
        const response = await GET(makeGetRequest(), { params: Promise.resolve({}) });
        expect(response.status).toBe(200);

        const body = await response.json();
        const ids = body.users.map((u: { id: string }) => u.id);
        expect(ids).toContain(listedUserBId);
        expect(ids).not.toContain(listedUserAId);
      } finally {
        await db.workspaceMembership.deleteMany({ where: { userId: actorIdB } });
        await db.user.deleteMany({ where: { id: actorIdB } });
      }
    });
  }
);
