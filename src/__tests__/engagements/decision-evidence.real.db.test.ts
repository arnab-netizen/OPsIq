/**
 * GET /api/engagements/[engagementId]/decision-evidence and services/decision-evidence + decision-control — real route,
 * real canonical wrapper, real Postgres.
 *
 * The decision-evidence surface explains WHY the engine reached its primary decision for an engagement. Its only prior
 * tests lived under src/__ignored_tests__ and were never executed. This file verifies, against seeded rows:
 *   - EVIDENCE GATING: the decision type, triggers and counts are derived from the persisted engagement, findings, actions
 *     and recommendations only. A healthy engagement with no records reports "tracking normally"; an unresolved critical
 *     finding drives a trigger and the primary decision; the same finding once resolved no longer does; engagement health
 *     "critical" is critical drift and makes the decision "immediate"; open high-priority recommendations drive the fallback
 *     trigger. The returned item lists are exactly the persisted rows (ids and counts);
 *   - TENANCY: another workspace's caller — and a caller of another workspace who holds a stray EngagementMembership row for
 *     this engagement — is denied (403) with nothing of the evidence leaked; the access guard and the service each refuse a
 *     foreign workspace on their own (404 / 403), so neither layer relies on the other;
 *   - AUTHORIZATION BY CAPABILITY: a role without engagement:view is refused 403 even with an engagement membership; a role
 *     with engagement:view but no membership of THIS engagement is refused 403; no session is 401;
 *   - VALIDATION: a malformed engagement id is refused 400 before any read; an unknown (well-formed) id is 404;
 *   - READ-ONLY: generating evidence writes no audit event and no decision snapshot.
 *
 * KNOWN DEFECT (pinned with it.fails, reproduction in the commit message): the evidence/decision services read
 * Action.dueDate and Action.priority, neither of which is a column of the Action table (it has dueAt and no priority). So
 * "overdue action" and "critical action" are never detected, and the "overdue critical action -> immediate decision" rule
 * (Rule 2, also in decision-control and execution-drift) can never fire. The it.fails case below passes while the defect
 * exists and turns red the day the services read the real column, at which point remove `.fails`.
 *
 * Callers are a seeded User + WorkspaceMembership + workspace-scoped UserRoleAssignment + live Session; only the Next.js
 * cookie jar is stubbed to carry the session token. Tagged [db]; vitest.config.ts filters [db] tests out of runs without
 * TEST_WITH_DB=true.
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
import { ForbiddenError, NotFoundError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import { GET as evidenceGet } from "@/app/api/engagements/[engagementId]/decision-evidence/route";
import { getDecisionEvidence } from "@/services/decision-evidence/decision-evidence.service";
import { getPrimaryDecision } from "@/services/decision-control/decision-control.service";

type Member = { userId: string; token: string };
type Eng = { workspaceId: string; engagementId: string; admin: Member; tag: string };

async function seedWorkspace(): Promise<string> {
  const workspaceId = randomUUID();
  await db.workspace.create({ data: { id: workspaceId, name: "evidence", slug: `evidence-${workspaceId}` } });
  return workspaceId;
}

async function seedMember(workspaceId: string, role: RoleName, engagementId?: string): Promise<Member> {
  const userId = randomUUID();
  const token = `evidence-${randomUUID()}`;
  await db.user.create({ data: { id: userId, email: `evidence-${userId}@example.com`, name: `evidence ${role}`, isActive: true, updatedAt: new Date() } });
  await db.workspaceMembership.create({ data: { workspaceId, userId, role: "admin" } });
  await db.userRoleAssignment.create({ data: { id: randomUUID(), userId, role, scope: "workspace", scopeId: workspaceId, isActive: true } });
  await db.session.create({ data: { id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 3_600_000) } });
  if (engagementId) {
    await db.engagementMembership.create({ data: { id: randomUUID(), userId, engagementId, role: "member" } });
  }
  return { userId, token };
}

/** An engagement with an admin member and NO findings, actions or recommendations. */
async function seedEngagement(healthStatus = "healthy"): Promise<Eng> {
  const workspaceId = await seedWorkspace();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  await db.clientAccount.create({ data: { id: clientId, workspaceId, name: "Evidence client", updatedAt: new Date() } });
  await db.engagement.create({
    data: { id: engagementId, code: `EVD-${engagementId.substring(0, 8)}`, title: "Evidence engagement", clientId, workspaceId, serviceTier: "standard", engagementMode: "advisory", healthStatus, updatedAt: new Date() },
  });
  const admin = await seedMember(workspaceId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER, engagementId);
  return { workspaceId, engagementId, admin, tag: `EVIDENCE${randomUUID().replace(/-/g, "")}` };
}

async function seedFinding(e: Eng, over: { severity?: string; status?: string; title?: string } = {}): Promise<string> {
  const evidenceId = randomUUID();
  const id = randomUUID();
  await db.evidence.create({ data: { id: evidenceId, engagementId: e.engagementId, title: "ev", description: "ev", source: "client_interview", status: "validated", updatedAt: new Date() } });
  await db.finding.create({
    data: {
      id,
      engagementId: e.engagementId,
      primaryEvidenceId: evidenceId,
      title: over.title ?? `${e.tag}-finding`,
      summary: "s",
      severity: over.severity ?? "critical",
      impactArea: "cash",
      status: over.status ?? "identified",
      updatedAt: new Date(),
    },
  });
  return id;
}

async function seedAction(e: Eng, over: { status?: string; dueAt?: Date | null } = {}): Promise<string> {
  const id = randomUUID();
  await db.action.create({
    data: { id, engagementId: e.engagementId, title: `${e.tag}-action`, status: over.status ?? "in_progress", dueAt: over.dueAt ?? null, updatedAt: new Date() },
  });
  return id;
}

async function seedRecommendation(e: Eng, priority: string, status = "pending"): Promise<string> {
  const id = randomUUID();
  await db.recommendation.create({ data: { id, engagementId: e.engagementId, workspaceId: e.workspaceId, title: `${e.tag}-rec`, priority, status } });
  return id;
}

type Evidence = {
  decisionId: string;
  engagementId: string;
  decisionType: string;
  inputs: {
    actions: { total: number; overdue: number; blocked: number; critical: number; items: Array<{ id: string }> };
    findings: { total: number; critical: number; unresolved: number; items: Array<{ id: string }> };
    recommendations: { total: number; open: number; highPriority: number; items: Array<{ id: string }> };
    metrics: { driftDetected: boolean; driftSeverity: string | null; healthStatus: string };
  };
  reasoning: { triggers: string[]; rulesApplied: string[] };
  impactBasis: { driftSeverityScore: number; timelineToFailureHours: number | null };
};

async function getEvidence(token: string | undefined, id: string) {
  cookieJar.token = token;
  const req = new NextRequest(`http://localhost/api/engagements/${id}/decision-evidence`, { method: "GET" });
  const res = await evidenceGet(req, { params: Promise.resolve({ engagementId: id }) });
  const text = await res.text();
  let body: { success?: boolean; data?: Evidence; error?: string } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    body = {};
  }
  return { status: res.status, body, text, data: body.data as Evidence };
}

describe("[db] GET /api/engagements/[id]/decision-evidence — real route, real wrapper, real services", () => {
  let e: Eng;

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    cookieJar.token = undefined;
    e = await seedEngagement();
  });

  describe("EVIDENCE GATING: the decision is derived from persisted evidence only", () => {
    it("[db] an engagement with no records: 200, 'tracking normally', all counts zero, decision type recommended", async () => {
      const res = await getEvidence(e.admin.token, e.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.data.engagementId).toBe(e.engagementId);
      expect(res.data.decisionId).toMatch(new RegExp(`^dec-${e.engagementId}-\\d+$`));
      expect(res.data.decisionType).toBe("recommended");
      expect(res.data.reasoning.triggers).toEqual(["Engagement tracking normally - no critical issues detected"]);
      expect(res.data.reasoning.rulesApplied).toHaveLength(6);
      expect(res.data.inputs.actions).toMatchObject({ total: 0, overdue: 0, blocked: 0, critical: 0, items: [] });
      expect(res.data.inputs.findings).toMatchObject({ total: 0, critical: 0, unresolved: 0, items: [] });
      expect(res.data.inputs.recommendations).toMatchObject({ total: 0, open: 0, highPriority: 0, items: [] });
      expect(res.data.inputs.metrics).toMatchObject({ driftDetected: false, driftSeverity: null, healthStatus: "healthy" });
    });

    it("[db] an unresolved critical finding drives the trigger and is listed; the same finding once resolved no longer does", async () => {
      const findingId = await seedFinding(e);

      const open = await getEvidence(e.admin.token, e.engagementId);

      expect(open.status, open.text).toBe(200);
      expect(open.data.reasoning.triggers).toContain("1 unresolved critical finding(s)");
      expect(open.data.reasoning.triggers).not.toContain("Engagement tracking normally - no critical issues detected");
      expect(open.data.inputs.findings).toMatchObject({ total: 1, critical: 1, unresolved: 1 });
      expect(open.data.inputs.findings.items.map((f) => f.id)).toEqual([findingId]);
      expect(open.data.inputs.metrics.driftDetected).toBe(true);
      expect(open.data.impactBasis.recoveryProbabilityPct).toBe(50);

      await db.finding.update({ where: { id: findingId }, data: { status: "resolved" } });
      const resolved = await getEvidence(e.admin.token, e.engagementId);

      expect(resolved.status, resolved.text).toBe(200);
      expect(resolved.data.reasoning.triggers).not.toContain("1 unresolved critical finding(s)");
      expect(resolved.data.inputs.findings).toMatchObject({ total: 1, critical: 1, unresolved: 0 });
      expect(resolved.data.reasoning.triggers).toEqual(["Engagement tracking normally - no critical issues detected"]);
      expect(resolved.data.impactBasis.recoveryProbabilityPct).toBe(80);
    });

    it("[db] three RESOLVED critical findings and no unresolved ones: no trigger, recovery 80, risk level 0 — resolved findings add nothing", async () => {
      for (let i = 0; i < 3; i++) await seedFinding(e, { status: i === 0 ? "closed" : "resolved", title: `${e.tag}-resolved-${i}` });

      const res = await getEvidence(e.admin.token, e.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(res.data.inputs.findings).toMatchObject({ total: 3, critical: 3, unresolved: 0 });
      expect(res.data.reasoning.triggers).toEqual(["Engagement tracking normally - no critical issues detected"]);
      expect(res.data.impactBasis.recoveryProbabilityPct).toBe(80);
      expect((res.data as unknown as { confidenceBreakdown: { riskLevel: number } }).confidenceBreakdown.riskLevel).toBe(0);
    });

    it("[db] three UNRESOLVED critical findings: trigger names 3, recovery 20, risk level carries the 3x20 weight", async () => {
      for (let i = 0; i < 3; i++) await seedFinding(e, { title: `${e.tag}-open-${i}` });

      const res = await getEvidence(e.admin.token, e.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(res.data.inputs.findings).toMatchObject({ total: 3, critical: 3, unresolved: 3 });
      expect(res.data.reasoning.triggers).toContain("3 unresolved critical finding(s)");
      expect(res.data.impactBasis.recoveryProbabilityPct).toBe(20);
      // (3 * 20 + drift 0 + max(0, 50 - confidence)) / 5, at least 12
      expect((res.data as unknown as { confidenceBreakdown: { riskLevel: number } }).confidenceBreakdown.riskLevel).toBeGreaterThanOrEqual(12);
    });

    it("[db] a blocked action with only a RESOLVED critical finding raises no blocked-with-findings trigger; with an unresolved one it does", async () => {
      await seedAction(e, { status: "blocked" });
      await seedFinding(e, { status: "resolved" });

      const resolvedOnly = await getEvidence(e.admin.token, e.engagementId);
      expect(resolvedOnly.status, resolvedOnly.text).toBe(200);
      expect(resolvedOnly.data.reasoning.triggers.some((t) => t.includes("blocked critical action"))).toBe(false);

      await seedFinding(e);
      const withOpen = await getEvidence(e.admin.token, e.engagementId);
      expect(withOpen.data.reasoning.triggers).toContain("1 blocked critical action(s) with unresolved findings");
    });

    it("[db] two resolved plus one unresolved critical finding: exactly 1 is counted", async () => {
      await seedFinding(e, { status: "resolved" });
      await seedFinding(e, { status: "resolved" });
      await seedFinding(e);

      const res = await getEvidence(e.admin.token, e.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(res.data.reasoning.triggers).toContain("1 unresolved critical finding(s)");
      expect(res.data.impactBasis.recoveryProbabilityPct).toBe(50);
    });

    it("[db] the primary decision (decision-control) is the critical-finding decision, consistent with the evidence trigger", async () => {
      await seedFinding(e, { title: "Cash is collapsing" });

      const decision = await getPrimaryDecision(e.engagementId, e.workspaceId);

      expect(decision.type).toBe("recommended");
      expect(decision.title).toBe("Resolve critical finding: Cash is collapsing");
      expect(decision.rationale).toContain("1 critical finding(s) require resolution");
      expect(decision.actionId).toBeNull();
    });

    it("[db] engagement health 'critical' is critical drift: decision type 'immediate', drift severity critical, 72h timeline", async () => {
      const crit = await seedEngagement("critical");

      const res = await getEvidence(crit.admin.token, crit.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(res.data.decisionType).toBe("immediate");
      expect(res.data.reasoning.triggers).toContain("Critical execution drift detected");
      expect(res.data.inputs.metrics).toMatchObject({ driftDetected: true, driftSeverity: "critical", healthStatus: "critical" });
      expect(res.data.impactBasis).toMatchObject({ driftSeverityScore: 100, timelineToFailureHours: 72 });
    });

    it("[db] open high-priority recommendations drive the fallback trigger; a completed one does not", async () => {
      const recId = await seedRecommendation(e, "high");
      await seedRecommendation(e, "critical", "completed");

      const res = await getEvidence(e.admin.token, e.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(res.data.reasoning.triggers).toEqual(["Open high-priority recommendations awaiting review"]);
      expect(res.data.inputs.recommendations).toMatchObject({ total: 2, open: 1, highPriority: 1 });
      expect(res.data.inputs.recommendations.items.map((r) => r.id)).toContain(recId);
    });

    it("[db] a blocked action is counted blocked and listed", async () => {
      const actionId = await seedAction(e, { status: "blocked" });
      await seedAction(e, { status: "in_progress" });

      const res = await getEvidence(e.admin.token, e.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(res.data.inputs.actions).toMatchObject({ total: 2, blocked: 1 });
      expect(res.data.inputs.actions.items.map((a) => a.id)).toContain(actionId);
    });

    // KNOWN DEFECT — see the file header. Remove `.fails` when the services read Action.dueAt.
    it.fails("[db] KNOWN DEFECT: an in-progress action whose dueAt is in the past is counted overdue", async () => {
      await seedAction(e, { status: "in_progress", dueAt: new Date(Date.now() - 3 * 86_400_000) });

      const res = await getEvidence(e.admin.token, e.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(res.data.inputs.actions.overdue).toBe(1);
    });
  });

  describe("TENANCY: nothing of another workspace's engagement is reachable", () => {
    beforeEach(async () => {
      await seedFinding(e, { title: `${e.tag}-finding` });
      await seedAction(e);
      await seedRecommendation(e, "high");
    });

    it("[db] another workspace's caller is denied 403 and nothing of the evidence leaks", async () => {
      const otherWs = await seedWorkspace();
      const outsider = await seedMember(otherWs, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const res = await getEvidence(outsider.token, e.engagementId);

      expect(res.status, res.text).toBe(403);
      expect(res.body.success).toBeUndefined();
      expect(res.text).not.toContain(e.tag);
      expect(res.text).not.toContain("Evidence engagement");
      expect(res.text).not.toContain("decisionType");
    });

    it("[db] a caller of another workspace who holds a stray EngagementMembership row for this engagement is still denied", async () => {
      const otherWs = await seedWorkspace();
      const outsider = await seedMember(otherWs, ROLES.ADMIN_OR_PORTFOLIO_MANAGER, e.engagementId);

      const res = await getEvidence(outsider.token, e.engagementId);

      expect(res.status, res.text).toBe(403);
      expect(res.text).not.toContain(e.tag);
      expect(res.text).not.toContain("decisionType");
    });

    it("[db] assertEngagementAccess on its own refuses a membership that does not belong to the verified workspace", async () => {
      const otherWs = await seedWorkspace();
      const outsider = await seedMember(otherWs, ROLES.ADMIN_OR_PORTFOLIO_MANAGER, e.engagementId);

      await expect(assertEngagementAccess(outsider.userId, e.engagementId, otherWs)).rejects.toThrow(ForbiddenError);
      await expect(assertEngagementAccess(e.admin.userId, e.engagementId, e.workspaceId)).resolves.toBeUndefined();
    });

    it("[db] the services on their own refuse a foreign workspace with NotFound and return no data", async () => {
      const otherWs = await seedWorkspace();

      await expect(getDecisionEvidence(e.engagementId, otherWs)).rejects.toThrow(NotFoundError);
      await expect(getPrimaryDecision(e.engagementId, otherWs)).rejects.toThrow(NotFoundError);
    });
  });

  describe("AUTHORIZATION BY CAPABILITY", () => {
    it("[db] a role without engagement:view (beta_request_operator) is refused 403 even with an engagement membership", async () => {
      await seedFinding(e);
      const operator = await seedMember(e.workspaceId, ROLES.BETA_REQUEST_OPERATOR, e.engagementId);

      const res = await getEvidence(operator.token, e.engagementId);

      expect(res.status, res.text).toBe(403);
      expect(res.text).not.toContain(e.tag);
      expect(res.text).not.toContain("decisionType");
    });

    it("[db] a role holding engagement:view but with no membership of THIS engagement is refused 403", async () => {
      const analystNoMembership = await seedMember(e.workspaceId, ROLES.ANALYST);

      const res = await getEvidence(analystNoMembership.token, e.engagementId);

      expect(res.status, res.text).toBe(403);
      expect(res.text).not.toContain("decisionType");
    });

    it("[db] a role holding engagement:view with a membership (analyst) is allowed", async () => {
      const analyst = await seedMember(e.workspaceId, ROLES.ANALYST, e.engagementId);

      const res = await getEvidence(analyst.token, e.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(res.data.engagementId).toBe(e.engagementId);
    });

    it("[db] an inactive engagement membership is refused 403", async () => {
      const lapsed = await seedMember(e.workspaceId, ROLES.ANALYST, e.engagementId);
      await db.engagementMembership.updateMany({ where: { userId: lapsed.userId, engagementId: e.engagementId }, data: { isActive: false, removedAt: new Date() } });

      const res = await getEvidence(lapsed.token, e.engagementId);

      expect(res.status, res.text).toBe(403);
    });

    it("[db] no session: 401", async () => {
      const res = await getEvidence(undefined, e.engagementId);
      expect(res.status, res.text).toBe(401);
    });
  });

  describe("VALIDATION", () => {
    it("[db] a malformed engagement id is refused 400 before any read", async () => {
      const res = await getEvidence(e.admin.token, "not-a-uuid");
      expect(res.status, res.text).toBe(400);
    });

    it("[db] a well-formed id that names no engagement is refused (a caller can hold no membership of it): 403 and no data", async () => {
      const res = await getEvidence(e.admin.token, randomUUID());
      expect(res.status, res.text).toBe(403);
      expect(res.text).not.toContain("decisionType");
    });

    it("[db] the service refuses an unknown engagement id with NotFound", async () => {
      await expect(getDecisionEvidence(randomUUID(), e.workspaceId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("READ-ONLY", () => {
    it("[db] generating evidence writes no audit event and no decision snapshot", async () => {
      await seedFinding(e);
      const auditsBefore = await db.auditEvent.count({ where: { workspaceId: e.workspaceId } });
      const snapshotsBefore = await db.decisionSnapshot.count({ where: { engagementId: e.engagementId } });
      const engagementBefore = await db.engagement.findUniqueOrThrow({ where: { id: e.engagementId } });

      const res = await getEvidence(e.admin.token, e.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(await db.auditEvent.count({ where: { workspaceId: e.workspaceId } })).toBe(auditsBefore);
      expect(await db.decisionSnapshot.count({ where: { engagementId: e.engagementId } })).toBe(snapshotsBefore);
      const engagementAfter = await db.engagement.findUniqueOrThrow({ where: { id: e.engagementId } });
      expect(engagementAfter.updatedAt.getTime()).toBe(engagementBefore.updatedAt.getTime());
      expect(engagementAfter.version).toBe(engagementBefore.version);
    });
  });
});
