/**
 * GET /api/engagements/[engagementId]/report and services/report-generator — real route, real canonical wrapper, real Postgres.
 *
 * What was wrong before this file: the only report-generator test mocked `@/lib/db`, so it could not notice that
 * generateEngagementReport queried phantom Action columns (`workspaceId` in the where, `dueDate` / `priority` in the
 * orderBy — the Action table has none of them). Prisma rejected the call and GET /report answered 500 for EVERY engagement.
 * The route also had no client-visibility rule: a client-role reader received internal-only recommendations. Both are fixed
 * together with this file (see the commit message).
 *
 * Contract pinned, against seeded rows whose internal-only fields carry unique sentinel strings:
 *   - REDACTION: the report DTO is a closed whitelist. No internal-only field of the engagement (consultantNotes,
 *     humanFactors), finding (hypothesis, rootCause, consequence, metadata), recommendation (rationale, rollbackPlan, description),
 *     action (description, metadata), condition profile (notes, riskFactors) or KPI appears anywhere in the serialized body;
 *   - CLASSIFICATION: a reader with no internal role gets only client-visible recommendations (and nothing derived from an
 *     internal-only one), and a 404 — indistinguishable from "missing" — for an internal-only engagement. An internal reader
 *     still sees everything;
 *   - TENANCY / ACCESS: another workspace's caller gets 404 with nothing leaked; a same-workspace caller with no engagement
 *     membership gets 403; a role without engagement:view gets 403; no session gets 401; a malformed id gets 400;
 *   - NO SILENT MUTATION: generating a report is read-only. It changes no governed row (engagement, finding, recommendation,
 *     action, KPI, condition profile, an ISSUED deliverable) and writes no audit event; generateAndStoreReport writes exactly
 *     one deliverable.generated audit event, creates no Deliverable row and leaves an issued deliverable byte-for-byte unchanged.
 *     Two reports of an unchanged engagement are identical apart from generatedAt.
 *
 * Callers are a seeded User + WorkspaceMembership + workspace-scoped UserRoleAssignment + live Session; only the Next.js cookie
 * jar is stubbed to carry the session token. Tagged [db]; vitest.config.ts filters [db] tests out without TEST_WITH_DB=true.
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
import { GET as reportGet } from "@/app/api/engagements/[engagementId]/report/route";
import { generateAndStoreReport, generateEngagementReport } from "@/services/report-generator";

type Member = { userId: string; token: string };
type Fx = {
  workspaceId: string;
  engagementId: string;
  stageId: string;
  admin: Member;
  tag: string;
  internalRecId: string;
  visibleRecId: string;
  findingId: string;
  actionId: string;
  kpiId: string;
};

async function seedWorkspace(): Promise<string> {
  const workspaceId = randomUUID();
  await db.workspace.create({ data: { id: workspaceId, name: "report", slug: `report-${workspaceId}` } });
  return workspaceId;
}

async function seedMember(workspaceId: string, role: RoleName, engagementId?: string): Promise<Member> {
  const userId = randomUUID();
  const token = `report-${randomUUID()}`;
  await db.user.create({ data: { id: userId, email: `report-${userId}@example.com`, name: `report ${role}`, isActive: true, updatedAt: new Date() } });
  await db.workspaceMembership.create({ data: { workspaceId, userId, role: "admin" } });
  await db.userRoleAssignment.create({ data: { id: randomUUID(), userId, role, scope: "workspace", scopeId: workspaceId, isActive: true } });
  await db.session.create({ data: { id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 3_600_000) } });
  if (engagementId) {
    await db.engagementMembership.create({ data: { id: randomUUID(), userId, engagementId, role: "member" } });
  }
  return { userId, token };
}

/** An engagement whose every internal-only field carries a sentinel containing `tag`. */
async function seedEngagement(engagementVisibility: "internal" | "client_visible" = "client_visible"): Promise<Fx> {
  const workspaceId = await seedWorkspace();
  const tag = `SENTINEL${randomUUID().replace(/-/g, "")}`;
  const clientId = randomUUID();
  const engagementId = randomUUID();
  const stageId = randomUUID();
  const evidenceId = randomUUID();
  const findingId = randomUUID();
  const actionId = randomUUID();
  const kpiId = randomUUID();
  const internalRecId = randomUUID();
  const visibleRecId = randomUUID();

  await db.clientAccount.create({ data: { id: clientId, workspaceId, name: "Report client", visibility: "client_visible", updatedAt: new Date() } });
  await db.engagement.create({
    data: {
      id: engagementId,
      code: `RPT-${engagementId.substring(0, 8)}`,
      title: "Report engagement",
      clientId,
      workspaceId,
      serviceTier: "standard",
      engagementMode: "advisory",
      visibility: engagementVisibility,
      consultantNotes: `${tag}-consultantNotes`,
      humanFactors: { ownerBottleneck: `${tag}-humanFactors` },
      description: `${tag}-engagementDescription`,
      updatedAt: new Date(),
    },
  });
  await db.stage.create({ data: { id: stageId, engagementId, title: "Report stage", status: "in_progress", updatedAt: new Date() } });
  await db.businessConditionProfile.create({
    data: {
      id: randomUUID(),
      engagementId,
      workspaceId,
      businessStatus: "stable",
      severityScore: 4,
      urgencyLevel: "medium",
      cashPressureLevel: "low",
      marginPressureLevel: "low",
      clientConcentrationRisk: "low",
      ownerDependencyRisk: "low",
      keyPersonDependencyRisk: "low",
      processMaturityLevel: "medium",
      managementMaturityLevel: "medium",
      executionCapacityLevel: "medium",
      moralFragilityLevel: "low",
      resilienceLevel: "medium",
      growthReadinessLevel: "medium",
      notes: `${tag}-conditionNotes`,
      riskFactors: [`${tag}-riskFactor`],
      isCurrent: true,
      updatedAt: new Date(),
    },
  });
  await db.evidence.create({ data: { id: evidenceId, engagementId, title: `${tag}-evidenceTitle`, description: `${tag}-evidenceDescription`, source: "client_interview", status: "validated", updatedAt: new Date() } });
  await db.finding.create({
    data: {
      id: findingId,
      engagementId,
      primaryEvidenceId: evidenceId,
      title: "Report finding",
      summary: `${tag}-findingSummary`,
      severity: "critical",
      impactArea: "cash",
      hypothesis: `${tag}-hypothesis`,
      rootCause: `${tag}-rootCause`,
      consequence: `${tag}-consequence`,
      metadata: { internal: `${tag}-findingMetadata` },
      updatedAt: new Date(),
    },
  });
  await db.recommendation.create({
    data: {
      id: internalRecId,
      engagementId,
      workspaceId,
      title: `${tag}-INTERNAL-REC-TITLE`,
      description: `${tag}-internalRecDescription`,
      rationale: `${tag}-internalRecRationale`,
      rollbackPlan: `${tag}-internalRecRollback`,
      priority: "high",
      visibility: "internal",
    },
  });
  await db.recommendation.create({
    data: {
      id: visibleRecId,
      engagementId,
      workspaceId,
      title: "Visible recommendation",
      description: `${tag}-visibleRecDescription`,
      rationale: `${tag}-visibleRecRationale`,
      rollbackPlan: `${tag}-visibleRecRollback`,
      priority: "medium",
      visibility: "client_visible",
    },
  });
  await db.action.create({
    data: {
      id: actionId,
      engagementId,
      title: "Report action",
      description: `${tag}-actionDescription`,
      status: "in_progress",
      dueAt: new Date(Date.now() + 3 * 86_400_000),
      metadata: { internal: `${tag}-actionMetadata` },
      updatedAt: new Date(),
    },
  });
  await db.kPI.create({ data: { id: kpiId, engagementId, name: "Report KPI", description: "units", target: 10, currentValue: 4, updatedAt: new Date() } });

  const admin = await seedMember(workspaceId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER, engagementId);
  return { workspaceId, engagementId, stageId, admin, tag, internalRecId, visibleRecId, findingId, actionId, kpiId };
}

async function getReport(token: string | undefined, id: string) {
  cookieJar.token = token;
  const req = new NextRequest(`http://localhost/api/engagements/${id}/report`, { method: "GET" });
  const res = await reportGet(req, { params: Promise.resolve({ engagementId: id }) });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.status, body, text };
}

/** Every governed row the report reads, as a comparable snapshot. */
async function snapshot(fx: Fx) {
  const [engagement, finding, recs, action, kpi, profile, deliverables, audits] = await Promise.all([
    db.engagement.findUniqueOrThrow({ where: { id: fx.engagementId } }),
    db.finding.findUniqueOrThrow({ where: { id: fx.findingId } }),
    db.recommendation.findMany({ where: { engagementId: fx.engagementId }, orderBy: { id: "asc" } }),
    db.action.findUniqueOrThrow({ where: { id: fx.actionId } }),
    db.kPI.findUniqueOrThrow({ where: { id: fx.kpiId } }),
    db.businessConditionProfile.findMany({ where: { engagementId: fx.engagementId } }),
    db.deliverable.findMany({ where: { engagementId: fx.engagementId }, orderBy: { id: "asc" } }),
    db.auditEvent.count({ where: { workspaceId: fx.workspaceId } }),
  ]);
  return JSON.stringify({ engagement, finding, recs, action, kpi, profile, deliverables, audits });
}

const REPORT_KEYS = [
  "actions",
  "businessImpact",
  "executionCertainty",
  "executionRiskGovernance",
  "executiveSummary",
  "findings",
  "kpis",
  "metadata",
  "recommendations",
  "reviewStatus",
  "summary",
];

describe("[db] GET /api/engagements/[id]/report — real route, real wrapper, real report-generator", () => {
  let fx: Fx;

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    cookieJar.token = undefined;
    fx = await seedEngagement();
  });

  describe("report content (internal reader)", () => {
    it("[db] 200 with the closed set of report sections, populated from the seeded rows", async () => {
      const res = await getReport(fx.admin.token, fx.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(REPORT_KEYS);
      const summary = res.body.summary as Record<string, unknown>;
      expect(summary).toMatchObject({ engagementId: fx.engagementId, engagementTitle: "Report engagement", status: "draft", healthStatus: "healthy", interventionMode: "recovery" });
      expect(summary.currentCondition).toMatchObject({ businessStatus: "stable", severityScore: 4 });
      expect(res.body.findings).toEqual([{ id: fx.findingId, title: "Report finding", severity: "critical" }]);
      expect((res.body.recommendations as Array<{ id: string }>).map((r) => r.id).sort()).toEqual([fx.internalRecId, fx.visibleRecId].sort());
      const actions = res.body.actions as Array<{ id: string; status: string; urgency: string; dueDate: string }>;
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ id: fx.actionId, status: "in_progress", urgency: "due-soon" });
      expect(res.body.kpis).toEqual([{ id: fx.kpiId, name: "Report KPI", unit: "units", current: 4, target: 10, direction: "up" }]);
      expect(res.body.executiveSummary).toMatchObject({ totalFindings: 1, criticalFindings: 1, overallRiskLevel: "high", immediateActionRequired: true });
      expect((res.body.metadata as { dataCompleteness: Record<string, boolean> }).dataCompleteness).toEqual({
        hasFindings: true,
        hasRecommendations: true,
        hasActions: true,
        hasKPIs: true,
        hasConditionProfile: true,
      });
    });

    it("[db] an overdue action is reported overdue (the dueAt column drives urgency)", async () => {
      await db.action.update({ where: { id: fx.actionId }, data: { dueAt: new Date(Date.now() - 2 * 86_400_000) } });

      const res = await getReport(fx.admin.token, fx.engagementId);

      expect(res.status, res.text).toBe(200);
      expect((res.body.actions as Array<{ urgency: string }>)[0].urgency).toBe("overdue");
    });
  });

  describe("REDACTION: no internal-only field leaks into the DTO", () => {
    it("[db] none of the engagement / finding / recommendation / action / condition internal-only fields appear in the body", async () => {
      const res = await getReport(fx.admin.token, fx.engagementId);

      expect(res.status, res.text).toBe(200);
      // Every sentinel this fixture planted in a field the DTO does not whitelist — except the INTERNAL recommendation's
      // title, which is a whitelisted field (an internal reader legitimately sees it).
      for (const field of [
        "consultantNotes",
        "humanFactors",
        "engagementDescription",
        "conditionNotes",
        "riskFactor",
        "evidenceTitle",
        "evidenceDescription",
        "findingSummary",
        "hypothesis",
        "rootCause",
        "consequence",
        "findingMetadata",
        "internalRecDescription",
        "internalRecRationale",
        "internalRecRollback",
        "visibleRecDescription",
        "visibleRecRationale",
        "visibleRecRollback",
        "actionDescription",
        "actionMetadata",
      ]) {
        expect(res.text, field).not.toContain(`${fx.tag}-${field}`);
      }
    });

    it("[db] each list item is a closed whitelist of fields", async () => {
      const res = await getReport(fx.admin.token, fx.engagementId);

      expect(res.status, res.text).toBe(200);
      const allowed = {
        findings: ["id", "title", "severity", "category"],
        recommendations: ["id", "title", "priority", "status", "linkedFindingId"],
        actions: ["id", "title", "priority", "status", "dueDate", "urgency"],
        kpis: ["id", "name", "unit", "baseline", "current", "target", "direction"],
      } as const;
      for (const [section, keys] of Object.entries(allowed)) {
        for (const item of res.body[section] as Array<Record<string, unknown>>) {
          for (const k of Object.keys(item)) expect(keys as readonly string[], `${section}.${k}`).toContain(k);
        }
      }
    });
  });

  describe("CLASSIFICATION: internal-only vs client-visible", () => {
    it("[db] an internal reader sees the internal-only recommendation", async () => {
      const res = await getReport(fx.admin.token, fx.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(res.text).toContain(`${fx.tag}-INTERNAL-REC-TITLE`);
      expect((res.body.executiveSummary as { totalFindings: number }).totalFindings).toBe(1);
      expect((res.body.recommendations as unknown[]).length).toBe(2);
    });

    it("[db] a client_owner reader gets 200 with ONLY the client-visible recommendation; the internal-only one leaks nowhere", async () => {
      const client = await seedMember(fx.workspaceId, ROLES.CLIENT_OWNER, fx.engagementId);

      const res = await getReport(client.token, fx.engagementId);

      expect(res.status, res.text).toBe(200);
      const recs = res.body.recommendations as Array<{ id: string; title: string }>;
      expect(recs.map((r) => r.id)).toEqual([fx.visibleRecId]);
      expect(res.text).not.toContain(fx.internalRecId);
      expect(res.text).not.toContain(`${fx.tag}-INTERNAL-REC-TITLE`);
      expect(res.text).not.toContain(fx.tag);
      expect((res.body.metadata as { dataCompleteness: { hasRecommendations: boolean } }).dataCompleteness.hasRecommendations).toBe(true);
    });

    it("[db] a client_team_member reader gets only the client-visible recommendation; an internal-only engagement is 404 for them", async () => {
      const member = await seedMember(fx.workspaceId, ROLES.CLIENT_TEAM_MEMBER, fx.engagementId);

      const res = await getReport(member.token, fx.engagementId);

      expect(res.status, res.text).toBe(200);
      expect((res.body.recommendations as Array<{ id: string }>).map((r) => r.id)).toEqual([fx.visibleRecId]);
      expect(res.text).not.toContain(fx.tag);

      const internal = await seedEngagement("internal");
      const member2 = await seedMember(internal.workspaceId, ROLES.CLIENT_TEAM_MEMBER, internal.engagementId);
      const denied = await getReport(member2.token, internal.engagementId);
      expect(denied.status, denied.text).toBe(404);
      expect(denied.text).not.toContain(internal.tag);
    });

    it("[db] a user holding BOTH a client role and an internal role (client_owner + analyst) is an internal reader: sees the internal-only recommendation", async () => {
      const mixed = await seedMember(fx.workspaceId, ROLES.CLIENT_OWNER, fx.engagementId);
      await db.userRoleAssignment.create({ data: { id: randomUUID(), userId: mixed.userId, role: ROLES.ANALYST, scope: "workspace", scopeId: fx.workspaceId, isActive: true } });

      const res = await getReport(mixed.token, fx.engagementId);

      expect(res.status, res.text).toBe(200);
      expect((res.body.recommendations as Array<{ id: string }>).map((r) => r.id).sort()).toEqual([fx.internalRecId, fx.visibleRecId].sort());
    });

    it("[db] a client_owner reader sees no recommendations at all when every recommendation is internal-only", async () => {
      await db.recommendation.update({ where: { id: fx.visibleRecId }, data: { visibility: "internal" } });
      const client = await seedMember(fx.workspaceId, ROLES.CLIENT_OWNER, fx.engagementId);

      const res = await getReport(client.token, fx.engagementId);

      expect(res.status, res.text).toBe(200);
      expect(res.body.recommendations).toEqual([]);
      expect((res.body.metadata as { dataCompleteness: { hasRecommendations: boolean } }).dataCompleteness.hasRecommendations).toBe(false);
      expect(res.text).not.toContain(fx.tag);
    });

    it("[db] an internal-only engagement is 404 for a client reader (indistinguishable from missing) and 200 for an internal reader", async () => {
      const internal = await seedEngagement("internal");
      const client = await seedMember(internal.workspaceId, ROLES.CLIENT_OWNER, internal.engagementId);

      const asClient = await getReport(client.token, internal.engagementId);
      const missing = await getReport(client.token, randomUUID());
      const asAdmin = await getReport(internal.admin.token, internal.engagementId);

      expect(asClient.status, asClient.text).toBe(404);
      expect(missing.status, missing.text).toBe(404);
      expect(asClient.text).not.toContain(internal.tag);
      expect(asClient.text).not.toContain("Report engagement");
      expect(asAdmin.status, asAdmin.text).toBe(200);
    });

    it("[db] generateEngagementReport(clientVisibleOnly) drops the internal-only recommendation; the default keeps it", async () => {
      const clientView = await generateEngagementReport(fx.engagementId, fx.workspaceId, { clientVisibleOnly: true });
      const internalView = await generateEngagementReport(fx.engagementId, fx.workspaceId);

      expect(clientView.recommendations.map((r) => r.id)).toEqual([fx.visibleRecId]);
      expect(internalView.recommendations.map((r) => r.id).sort()).toEqual([fx.internalRecId, fx.visibleRecId].sort());
    });
  });

  describe("TENANCY and ACCESS", () => {
    it("[db] another workspace's caller gets 404 and nothing of the engagement leaks", async () => {
      const otherWs = await seedWorkspace();
      const outsider = await seedMember(otherWs, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const res = await getReport(outsider.token, fx.engagementId);

      expect(res.status, res.text).toBe(404);
      expect(res.text).not.toContain(fx.tag);
      expect(res.text).not.toContain("Report engagement");
      expect(res.text).not.toContain(fx.findingId);
    });

    it("[db] a same-workspace admin with NO engagement membership is refused 403", async () => {
      const noMembership = await seedMember(fx.workspaceId, ROLES.ADMIN_OR_PORTFOLIO_MANAGER);

      const res = await getReport(noMembership.token, fx.engagementId);

      expect(res.status, res.text).toBe(403);
      expect(res.text).not.toContain("Report finding");
    });

    it("[db] a role without engagement:view (beta_request_operator) is refused 403 by the wrapper", async () => {
      const operator = await seedMember(fx.workspaceId, ROLES.BETA_REQUEST_OPERATOR, fx.engagementId);

      const res = await getReport(operator.token, fx.engagementId);

      expect(res.status, res.text).toBe(403);
      expect(res.text).not.toContain("Report finding");
    });

    it("[db] no session: 401", async () => {
      const res = await getReport(undefined, fx.engagementId);
      expect(res.status, res.text).toBe(401);
    });

    it("[db] a malformed engagement id is refused 400 before any read", async () => {
      const res = await getReport(fx.admin.token, "not-a-uuid");
      expect(res.status, res.text).toBe(400);
    });
  });

  describe("NO SILENT MUTATION: reports are read-only and issued deliverables are immutable", () => {
    async function seedIssuedDeliverable(): Promise<string> {
      const id = randomUUID();
      await db.deliverable.create({
        data: {
          id,
          stageId: fx.stageId,
          engagementId: fx.engagementId,
          title: "Issued report",
          description: "frozen",
          status: "issued",
          version: 3,
          approvedBy: fx.admin.userId,
          approvedAt: new Date(Date.now() - 86_400_000),
          updatedAt: new Date(Date.now() - 86_400_000),
        },
      });
      return id;
    }

    it("[db] GET /report changes no governed row and writes no audit event, including an issued deliverable", async () => {
      const issuedId = await seedIssuedDeliverable();
      const before = await snapshot(fx);

      const first = await getReport(fx.admin.token, fx.engagementId);
      const second = await getReport(fx.admin.token, fx.engagementId);

      expect(first.status, first.text).toBe(200);
      expect(second.status, second.text).toBe(200);
      expect(await snapshot(fx)).toBe(before);
      const issued = await db.deliverable.findUniqueOrThrow({ where: { id: issuedId } });
      expect(issued).toMatchObject({ status: "issued", version: 3, title: "Issued report", description: "frozen" });
    });

    it("[db] two reports of an unchanged engagement are identical apart from generatedAt", async () => {
      // Both generatedAt stamps (report metadata and the embedded execution-certainty result) are the only moving parts.
      const strip = (b: Record<string, unknown>) =>
        JSON.stringify(b, (key, value) => (key === "generatedAt" ? undefined : value));
      const first = await getReport(fx.admin.token, fx.engagementId);
      const second = await getReport(fx.admin.token, fx.engagementId);

      expect(first.status, first.text).toBe(200);
      expect(strip(second.body)).toBe(strip(first.body));
    });

    it("[db] generateAndStoreReport emits exactly one deliverable.generated audit event, creates no Deliverable and leaves an issued one untouched", async () => {
      const issuedId = await seedIssuedDeliverable();
      const rowsBefore = await db.deliverable.findMany({ where: { engagementId: fx.engagementId }, orderBy: { id: "asc" } });
      const governedBefore = await snapshot(fx);

      const stored = await generateAndStoreReport(fx.engagementId, fx.workspaceId, fx.admin.userId, "report", "client_visible");

      expect(stored.report.recommendations.map((r) => r.id)).toEqual([fx.visibleRecId]);
      const audits = await db.auditEvent.findMany({ where: { workspaceId: fx.workspaceId, eventName: "deliverable.generated" } });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actorId: fx.admin.userId, entityId: stored.id, visibility: "client_visible" });
      expect(audits[0].payload).toMatchObject({ engagementId: fx.engagementId, deliverableType: "report" });
      expect(await db.deliverable.findMany({ where: { engagementId: fx.engagementId }, orderBy: { id: "asc" } })).toEqual(rowsBefore);
      const issued = await db.deliverable.findUniqueOrThrow({ where: { id: issuedId } });
      expect(issued.status).toBe("issued");
      // The only change to the audited snapshot is the one new audit event.
      const governedAfter = JSON.parse(await snapshot(fx)) as { audits: number };
      expect(governedAfter.audits).toBe((JSON.parse(governedBefore) as { audits: number }).audits + 1);
    });

    it("[db] generateAndStoreReport refuses another workspace's engagement with NotFound and writes nothing", async () => {
      const otherWs = await seedWorkspace();
      const auditsBefore = await db.auditEvent.count({ where: { eventName: "deliverable.generated" } });

      await expect(generateAndStoreReport(fx.engagementId, otherWs, fx.admin.userId)).rejects.toThrow(/not found/i);

      expect(await db.auditEvent.count({ where: { eventName: "deliverable.generated" } })).toBe(auditsBefore);
    });
  });
});
