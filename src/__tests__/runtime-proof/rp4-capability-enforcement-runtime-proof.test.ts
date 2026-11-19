/**
 * PHASE RP4: Capability Enforcement Runtime Proof
 *
 * Requirement (execution_state.json, "Capability Enforcement Runtime Proof"): a user without the required
 * capability gets 403 on a protected route; a user with it is allowed.
 *
 * Every request below goes through the REAL route handlers wrapped by the REAL `withCanonicalEnforcement`
 * (src/lib/canonical-route-enforcement.ts) on real Postgres: real Session row -> real getSession /
 * getPolicyContext -> real canonical capability resolution (canonical-auth-facts + canonical-capability-resolver
 * + policies/capability-check). Only the Next.js cookie jar is stubbed, to carry the seeded session token.
 *
 * Contracts exercised (from the code, not invented):
 *   - PATCH /api/recommendations/[id] requires RECOMMENDATION_APPROVE (declared on the wrapper and re-checked in the
 *     handler, so these tests prove the behaviour of the two layers together, not the wrapper declaration alone);
 *   - POST  /api/recommendations      declares requireCapabilities [RECOMMENDATION_CREATE];
 *   - ROLE_CAPABILITIES: ADMIN_OR_PORTFOLIO_MANAGER holds approve+create; EXPERIENCED_CONSULTANT holds create but
 *     NOT approve; BEGINNER_CONSULTANT holds neither; a self-serve owner (ADMIN_OR_PORTFOLIO_MANAGER with
 *     WorkspaceMembership.role "owner") is narrowed to OWNER_SCOPED_CAPABILITIES (no approve);
 *   - the verified workspace is derived server-side from the caller's own active membership, never from input;
 *   - a successful mutation persists a `recommendation.updated` / `recommendation.created` audit event.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

const cookieJar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "opsiq_session" && cookieJar.token ? { value: cookieJar.token } : undefined),
  }),
}));

import { db, getDbInstance } from "@/lib/db";
import { ROLES, type RoleName } from "@/domain/constants/roles";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getPolicyContext } from "@/services/auth";
import { resolveCanonicalCapabilities } from "@/lib/canonical-capability-resolver";
import { PATCH as patchRecommendation } from "@/app/api/recommendations/[recommendationId]/route";
import { POST as postRecommendation } from "@/app/api/recommendations/route";

type Fixture = { workspaceId: string; engagementId: string; findingId: string };

async function seedWorkspace(label: string): Promise<Fixture> {
  const workspaceId = randomUUID();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  const evidenceId = randomUUID();
  const findingId = randomUUID();
  await db.workspace.create({ data: { id: workspaceId, name: `RP4 ${label}`, slug: `rp4-${workspaceId}` } });
  await db.clientAccount.create({ data: { id: clientId, workspaceId, name: `RP4 client ${label}`, updatedAt: new Date() } });
  await db.engagement.create({
    data: {
      id: engagementId,
      code: `RP4-${engagementId.substring(0, 8)}`,
      title: `RP4 engagement ${label}`,
      clientId,
      workspaceId,
      serviceTier: "standard",
      engagementMode: "advisory",
      updatedAt: new Date(),
    },
  });
  await db.evidence.create({
    data: { id: evidenceId, engagementId, title: "RP4 evidence", description: "RP4 evidence", source: "interview", status: "validated", updatedAt: new Date() },
  });
  await db.finding.create({
    data: { id: findingId, engagementId, primaryEvidenceId: evidenceId, title: "RP4 finding", summary: "RP4 finding", severity: "high", impactArea: "operations", updatedAt: new Date() },
  });
  return { workspaceId, engagementId, findingId };
}

/** A real user + active membership + workspace-scoped role assignment + live Session row. Returns the user id and token. */
async function seedMember(workspaceId: string, role: RoleName, membershipRole = "admin"): Promise<{ userId: string; token: string }> {
  const userId = randomUUID();
  const token = `rp4-${randomUUID()}`;
  await db.user.create({ data: { id: userId, email: `rp4-${userId}@example.com`, name: `RP4 ${role}`, isActive: true, updatedAt: new Date() } });
  await db.workspaceMembership.create({ data: { workspaceId, userId, role: membershipRole } });
  await db.userRoleAssignment.create({ data: { id: randomUUID(), userId, role, scope: "workspace", scopeId: workspaceId, isActive: true } });
  await db.session.create({ data: { id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 3_600_000) } });
  return { userId, token };
}

async function seedRecommendation(fx: Fixture): Promise<string> {
  const rec = await db.recommendation.create({
    data: { engagementId: fx.engagementId, workspaceId: fx.workspaceId, findingId: fx.findingId, title: `RP4 rec ${randomUUID()}`, priority: "high" },
  });
  return rec.id;
}

/** Unlimited plan carrying the two plan capabilities the create path checks (decision:create at the route, generate_recommendation in the service). */
async function seedUnlimitedPlan(workspaceId: string): Promise<void> {
  const planId = randomUUID();
  const billingAccountId = randomUUID();
  await db.plan.create({ data: { id: planId, name: `rp4-plan-${planId}`, priceMonthly: 0, priceYearly: 0 } });
  await db.planCapability.create({ data: { id: randomUUID(), planId, key: CAPABILITIES.DECISION_CREATE, limit: null } });
  await db.planCapability.create({ data: { id: randomUUID(), planId, key: "generate_recommendation", limit: null } });
  await db.billingAccount.create({ data: { id: billingAccountId, workspaceId, providerCustomerId: `rp4-${billingAccountId}` } });
  await db.subscription.create({
    data: { id: randomUUID(), billingAccountId, planId, status: "active", currentPeriodStart: new Date(Date.now() - 86_400_000), currentPeriodEnd: new Date(Date.now() + 29 * 86_400_000) },
  });
}

async function patchAs(token: string, recommendationId: string, body: unknown) {
  cookieJar.token = token;
  const req = new NextRequest(`http://localhost/api/recommendations/${recommendationId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await patchRecommendation(req, { params: Promise.resolve({ recommendationId }) });
  return { status: res.status, body: await res.json() };
}

async function postAs(token: string, body: unknown, idempotencyKey: string) {
  cookieJar.token = token;
  const req = new NextRequest("http://localhost/api/recommendations", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  });
  const res = await postRecommendation(req, { params: Promise.resolve({}) });
  return { status: res.status, body: await res.json() };
}

const auditCount = (workspaceId: string, eventName: string, entityId?: string) =>
  db.auditEvent.count({ where: { workspaceId, eventName, ...(entityId ? { entityId } : {}) } });

describe("Phase RP4: Capability Enforcement Runtime Proof (real canonical wrapper, real DB)", () => {
  let ws: Fixture;

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    cookieJar.token = undefined;
    ws = await seedWorkspace("primary");
  });

  describe("PATCH /api/recommendations/[id] requires recommendation:approve", () => {
    it("a member WITHOUT recommendation:approve gets 403; the row is not mutated and no update audit event is written", async () => {
      const consultant = await seedMember(ws.workspaceId, ROLES.EXPERIENCED_CONSULTANT);
      const recId = await seedRecommendation(ws);

      const res = await patchAs(consultant.token, recId, { priority: "low", version: 1 });

      expect(res.status).toBe(403);
      const row = await db.recommendation.findUniqueOrThrow({ where: { id: recId } });
      expect(row.priority).toBe("high");
      expect(row.version).toBe(1);
      expect(await auditCount(ws.workspaceId, "recommendation.updated", recId)).toBe(0);
    });

    it("a member WITH recommendation:approve succeeds; the mutation and a recommendation.updated audit event are persisted", async () => {
      const approver = await seedMember(ws.workspaceId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const recId = await seedRecommendation(ws);

      const res = await patchAs(approver.token, recId, { priority: "low", version: 1 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: recId, priority: "low", version: 2 });
      const row = await db.recommendation.findUniqueOrThrow({ where: { id: recId } });
      expect(row.priority).toBe("low");
      expect(row.version).toBe(2);
      const audits = await db.auditEvent.findMany({ where: { workspaceId: ws.workspaceId, eventName: "recommendation.updated", entityId: recId } });
      expect(audits).toHaveLength(1);
      expect(audits[0].actorId).toBe(approver.userId);
      expect(audits[0].entityType).toBe("recommendation");
    });

    it("a self-serve owner (admin role narrowed by membership role 'owner') is denied approve: 403, no mutation", async () => {
      const owner = await seedMember(ws.workspaceId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER, "owner");
      const recId = await seedRecommendation(ws);

      const res = await patchAs(owner.token, recId, { priority: "low", version: 1 });

      expect(res.status).toBe(403);
      const row = await db.recommendation.findUniqueOrThrow({ where: { id: recId } });
      expect(row.priority).toBe("high");
      expect(row.version).toBe(1);
      expect(await auditCount(ws.workspaceId, "recommendation.updated", recId)).toBe(0);
    });

    it("another workspace's approver cannot mutate this workspace's recommendation: workspace is derived from their own membership, so it is not found (404) and nothing changes", async () => {
      const other = await seedWorkspace("foreign");
      const foreignApprover = await seedMember(other.workspaceId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const recId = await seedRecommendation(ws);

      const res = await patchAs(foreignApprover.token, recId, { priority: "low", version: 1 });

      expect(res.status).toBe(404);
      const row = await db.recommendation.findUniqueOrThrow({ where: { id: recId } });
      expect(row.priority).toBe("high");
      expect(row.version).toBe(1);
      expect(await auditCount(ws.workspaceId, "recommendation.updated", recId)).toBe(0);
      expect(await auditCount(other.workspaceId, "recommendation.updated", recId)).toBe(0);
    });

    it("revoking the role assignment removes the capability on the very next request (403, no mutation)", async () => {
      const approver = await seedMember(ws.workspaceId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const recId = await seedRecommendation(ws);
      await db.userRoleAssignment.updateMany({ where: { userId: approver.userId }, data: { isActive: false, revokedAt: new Date() } });

      const res = await patchAs(approver.token, recId, { priority: "low", version: 1 });

      expect(res.status).toBe(403);
      const row = await db.recommendation.findUniqueOrThrow({ where: { id: recId } });
      expect(row.version).toBe(1);
      expect(await auditCount(ws.workspaceId, "recommendation.updated", recId)).toBe(0);
    });

    it("a request with no session is rejected 401 before the handler runs; nothing changes", async () => {
      const recId = await seedRecommendation(ws);
      cookieJar.token = undefined;
      const req = new NextRequest(`http://localhost/api/recommendations/${recId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ priority: "low", version: 1 }),
      });

      const res = await patchRecommendation(req, { params: Promise.resolve({ recommendationId: recId }) });

      expect(res.status).toBe(401);
      const row = await db.recommendation.findUniqueOrThrow({ where: { id: recId } });
      expect(row.version).toBe(1);
    });
  });

  describe("POST /api/recommendations requires recommendation:create", () => {
    it("a member WITHOUT recommendation:create gets 403 and no recommendation or audit event is created", async () => {
      await seedUnlimitedPlan(ws.workspaceId);
      const beginner = await seedMember(ws.workspaceId, ROLES.BEGINNER_CONSULTANT);
      const title = `RP4 denied create ${randomUUID()}`;

      const res = await postAs(
        beginner.token,
        { engagementId: ws.engagementId, findingId: ws.findingId, title, summary: "s", priority: "high", type: "fix", rationale: "r" },
        `rp4-${randomUUID()}`
      );

      expect(res.status).toBe(403);
      expect(await db.recommendation.count({ where: { workspaceId: ws.workspaceId, title } })).toBe(0);
      expect(await auditCount(ws.workspaceId, "recommendation.created")).toBe(0);
    });

    it("a member WITH recommendation:create (but not approve) creates it: 201, row persisted with createdBy, recommendation.created audit event persisted", async () => {
      await seedUnlimitedPlan(ws.workspaceId);
      const consultant = await seedMember(ws.workspaceId, ROLES.EXPERIENCED_CONSULTANT);
      const title = `RP4 allowed create ${randomUUID()}`;

      const res = await postAs(
        consultant.token,
        { engagementId: ws.engagementId, findingId: ws.findingId, title, summary: "s", priority: "high", type: "fix", rationale: "r" },
        `rp4-${randomUUID()}`
      );

      expect(res.status).toBe(201);
      const rows = await db.recommendation.findMany({ where: { workspaceId: ws.workspaceId, title } });
      expect(rows).toHaveLength(1);
      expect(rows[0].createdBy).toBe(consultant.userId);
      expect(res.body).toMatchObject({ id: rows[0].id });
      const audits = await db.auditEvent.findMany({ where: { workspaceId: ws.workspaceId, eventName: "recommendation.created", entityId: rows[0].id } });
      expect(audits).toHaveLength(1);
      expect(audits[0].actorId).toBe(consultant.userId);
    });
  });

  describe("canonical capability resolution from real DB role rows", () => {
    it("resolves create-without-approve for a consultant, both for an admin, and neither for a beginner — scoped to the member's own workspace", async () => {
      const other = await seedWorkspace("resolver-foreign");
      const consultant = await seedMember(ws.workspaceId, ROLES.EXPERIENCED_CONSULTANT);
      const admin = await seedMember(ws.workspaceId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
      const beginner = await seedMember(ws.workspaceId, ROLES.BEGINNER_CONSULTANT);

      const resolve = async (token: string, workspaceId: string) => {
        cookieJar.token = token;
        return resolveCanonicalCapabilities(await getPolicyContext(workspaceId));
      };

      const c = await resolve(consultant.token, ws.workspaceId);
      expect(c.has(CAPABILITIES.RECOMMENDATION_CREATE)).toBe(true);
      expect(c.has(CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(false);

      const a = await resolve(admin.token, ws.workspaceId);
      expect(a.has(CAPABILITIES.RECOMMENDATION_CREATE)).toBe(true);
      expect(a.has(CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(true);

      const b = await resolve(beginner.token, ws.workspaceId);
      expect(b.has(CAPABILITIES.RECOMMENDATION_CREATE)).toBe(false);
      expect(b.has(CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(false);
      expect(b.has(CAPABILITIES.RECOMMENDATION_VIEW)).toBe(true);

      // The admin has no membership in the other workspace: no policy context, hence an empty capability set.
      const foreign = await resolve(admin.token, other.workspaceId);
      expect(foreign.global.size).toBe(0);
      expect(foreign.has(CAPABILITIES.RECOMMENDATION_APPROVE)).toBe(false);
    });
  });
});
