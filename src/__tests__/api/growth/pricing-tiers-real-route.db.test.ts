/**
 * REAL (unmocked) canonical-route-enforcement.ts integration tests for:
 *   POST /api/growth/pricing-tiers
 *   POST /api/growth/pricing-tiers/[tierId]/supersede
 *   GET  /api/growth/pricing-tiers
 *
 * Unlike src/__tests__/api/growth/pricing-tiers-routes.test.ts (which mocks
 * canonical-route-enforcement.ts entirely to test capability declarations),
 * this file exercises the REAL withCanonicalEnforcement error-handling path
 * against a real Postgres database. It proves:
 *
 *  1. create with features -> HTTP 201 -> stable id -> immediate GET/list
 *     contains that id -> persisted features match submitted features.
 *  2. supersede with features -> new version created -> readback succeeds ->
 *     old/new relationship correct (old ARCHIVED + supersededById, new
 *     DRAFT/pending_approval with version+1).
 *  3. create with no features -> rejected with the owner-safe validation
 *     message ("At least one feature is required"), not a generic 500.
 *  4. workspace isolation: a tier created in workspace A is invisible to
 *     workspace B's GET/list.
 *  5. the safe-vs-generic error message policy on the REAL wrapper: a known
 *     AppError (ValidationError, via the no-features case above) exposes its
 *     real message; an unexpected internal Error thrown deeper in the
 *     handler chain exposes only the generic "Internal server error" text,
 *     never the underlying message.
 *
 * Auth is bypassed the same way src/__tests__/p2b/real-route-tests.test.ts
 * does it: @/services/auth is mocked to supply a valid session/policy so the
 * REAL canonical-route-enforcement.ts auth-state-build + evaluate + handler
 * + error-classification logic all run for real against a real workspace
 * membership row.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let testActorIdForMock = randomUUID();
let testWorkspaceIdForMock = randomUUID();

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
  // admin_or_portfolio_manager carries ENGAGEMENT_UPDATE/ENGAGEMENT_VIEW
  // (see src/policies/capability-check.ts ROLE_CAPABILITIES), which is what
  // the pricing-tiers routes require.
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: {
      userId: testActorIdForMock,
      roles: [
        {
          role: "admin_or_portfolio_manager",
          scope: "workspace",
          scopeId: testWorkspaceIdForMock,
        },
      ],
      engagementMemberships: [],
    },
    invalidReason: undefined,
  })),
  getPolicyContext: vi.fn(async () => ({
    userId: testActorIdForMock,
    roles: [
      {
        role: "admin_or_portfolio_manager",
        scope: "workspace",
        scopeId: testWorkspaceIdForMock,
      },
    ],
    engagementMemberships: [],
  })),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/growth/pricing-tiers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(): NextRequest {
  return new NextRequest("https://example.com/api/growth/pricing-tiers", {
    method: "GET",
  });
}

const CREATE_BODY_WITH_FEATURES = {
  name: "Enterprise",
  entryPrice: 499,
  maxPrice: 999,
  currency: "USD",
  features: ["SSO", "Priority Support"],
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "Growth Pricing Tiers — REAL route + REAL canonical-route-enforcement",
  () => {
    let workspaceA: string;
    let workspaceB: string;
    let actorId: string;

    beforeEach(async () => {
      actorId = randomUUID();
      workspaceA = randomUUID();
      workspaceB = randomUUID();
      testActorIdForMock = actorId;
      testWorkspaceIdForMock = workspaceA;

      await db.user.create({
        data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() },
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
    });

    afterEach(async () => {
      await db.growthPriceTier.deleteMany({
        where: { workspaceId: { in: [workspaceA, workspaceB] } },
      });
      await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
      await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
      await db.user.deleteMany({ where: { id: actorId } });
    });

    it("create with features: HTTP 201, stable id, immediate list contains it with matching features", async () => {
      const { POST: createPost, GET: listGet } = await import(
        "@/app/api/growth/pricing-tiers/route"
      );

      const createResponse = await createPost(makeRequest(CREATE_BODY_WITH_FEATURES), {
        params: Promise.resolve({}),
      });
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json();
      expect(created.id).toEqual(expect.any(String));
      expect(created.features).toEqual(["SSO", "Priority Support"]);

      const listResponse = await listGet(makeGetRequest(), { params: Promise.resolve({}) });
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json();
      const readback = list.find((t: { id: string }) => t.id === created.id);
      expect(readback).toBeDefined();
      expect(readback.features).toEqual(["SSO", "Priority Support"]);

      const dbRow = await db.growthPriceTier.findUnique({ where: { id: created.id } });
      expect(dbRow?.features).toEqual(["SSO", "Priority Support"]);
    });

    it("create with no features: rejected with the owner-safe validation message, not a generic 500", async () => {
      const { POST: createPost } = await import("@/app/api/growth/pricing-tiers/route");

      const response = await createPost(
        makeRequest({ name: "No Features Tier", entryPrice: 10, maxPrice: 20, currency: "USD" }),
        { params: Promise.resolve({}) }
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("At least one feature is required");
      expect(body.error).not.toBe("Internal server error");

      const survivingRows = await db.growthPriceTier.count({ where: { workspaceId: workspaceA } });
      expect(survivingRows).toBe(0);
    });

    it("supersede with features: new version created, readback succeeds, old/new relationship correct", async () => {
      const { POST: createPost } = await import("@/app/api/growth/pricing-tiers/route");
      const { POST: supersedePost } = await import(
        "@/app/api/growth/pricing-tiers/[tierId]/supersede/route"
      );
      const { GET: listGet } = await import("@/app/api/growth/pricing-tiers/route");

      const createResponse = await createPost(makeRequest(CREATE_BODY_WITH_FEATURES), {
        params: Promise.resolve({}),
      });
      const original = await createResponse.json();

      const supersedeResponse = await supersedePost(
        makeRequest({
          name: "Enterprise Plus",
          entryPrice: 599,
          maxPrice: 1199,
          currency: "USD",
          features: ["SSO", "Priority Support", "Dedicated CSM"],
        }),
        { params: Promise.resolve({ tierId: original.id }) }
      );
      expect(supersedeResponse.status).toBe(201);
      const superseding = await supersedeResponse.json();

      expect(superseding.id).not.toBe(original.id);
      expect(superseding.version).toBe((original.version ?? 1) + 1);
      expect(superseding.status).toBe("DRAFT");
      expect(superseding.approvalStatus).toBe("pending_approval");
      expect(superseding.features).toEqual(["SSO", "Priority Support", "Dedicated CSM"]);

      const listResponse = await listGet(makeGetRequest(), { params: Promise.resolve({}) });
      const list = await listResponse.json();
      const oldRow = list.find((t: { id: string }) => t.id === original.id);
      const newRow = list.find((t: { id: string }) => t.id === superseding.id);
      expect(oldRow.status).toBe("ARCHIVED");
      expect(oldRow.supersededById).toBe(superseding.id);
      expect(newRow).toBeDefined();
      expect(newRow.features).toEqual(["SSO", "Priority Support", "Dedicated CSM"]);
    });

    it("workspace isolation: a tier created in workspace A is invisible to workspace B's list", async () => {
      const { POST: createPost, GET: listGet } = await import(
        "@/app/api/growth/pricing-tiers/route"
      );

      testWorkspaceIdForMock = workspaceA;
      const createResponse = await createPost(makeRequest(CREATE_BODY_WITH_FEATURES), {
        params: Promise.resolve({}),
      });
      const created = await createResponse.json();

      await db.workspaceMembership.create({
        data: { userId: actorId, workspaceId: workspaceB, role: "admin", isActive: true },
      });
      testWorkspaceIdForMock = workspaceB;

      const listResponseB = await listGet(makeGetRequest(), { params: Promise.resolve({}) });
      const listB = await listResponseB.json();
      expect(listB.find((t: { id: string }) => t.id === created.id)).toBeUndefined();
    });

    it("safe-error policy: a raw internal Error thrown by the handler is NEVER exposed to the client", async () => {
      // Exercise the REAL withCanonicalEnforcement catch block with a
      // handler that throws a raw, unclassified Error carrying a fake
      // secret -- proving the response body never contains it, regardless
      // of the isKnownSafeClientError fix added for AppError subclasses.
      const { withCanonicalEnforcement } = await import("@/lib/canonical-route-enforcement");
      const secretDetail = "postgres://prod-user:s3cr3t@internal-host:5432/db";

      const wrapped = withCanonicalEnforcement(
        async () => {
          throw new Error(`Database connection failed: ${secretDetail}`);
        },
        { requireWorkspace: true, requireCapabilities: ["engagement:update"] }
      );

      const response = await wrapped(makeRequest({}), { params: Promise.resolve({}) });
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("Internal server error");
      expect(JSON.stringify(body)).not.toContain(secretDetail);
      expect(JSON.stringify(body)).not.toContain("s3cr3t");
    });

    it("safe-error policy: a known ValidationError DOES expose its safe message via the real wrapper", async () => {
      const { withCanonicalEnforcement } = await import("@/lib/canonical-route-enforcement");
      const { ValidationError } = await import("@/infra/errors");

      const wrapped = withCanonicalEnforcement(
        async () => {
          throw new ValidationError("At least one feature is required");
        },
        { requireWorkspace: true, requireCapabilities: ["engagement:update"] }
      );

      const response = await wrapped(makeRequest({}), { params: Promise.resolve({}) });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("At least one feature is required");
    });
  }
);
