import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { diagnoseBusiness } from "@/services/diagnosis";
import type { BusinessProblemInput } from "@/services/diagnosis";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * Phase 3 Item 2 — diagnoseBusiness real-DB workspace-isolation proof (required lane).
 *
 * `diagnoseBusiness` is the owner's entry point (POST /api/diagnosis): it runs the diagnosis
 * engines and then, in a single DB transaction, persists a client, engagement, business-condition
 * profile, and the evidence → finding → recommendation → action value chain. Until now its ONLY
 * test was the EXCLUDED `diagnosis.integration.test.ts` (vitest config excludes `*.integration.test.ts`),
 * so the full transaction had NEVER run in the required maintained lane. Phase 2 G5 fixed one
 * workspace-isolation defect on this path (`assessCondition` created `BusinessConditionProfile`
 * without `workspaceId`, which the global tenant backstop
 * `src/lib/prisma-workspace-enforcement.ts` rejects) and explicitly flagged that the rest of the
 * `diagnoseBusiness` transaction "may carry further workspace-isolation gaps of the same class".
 *
 * This test closes that gap: it drives the REAL `diagnoseBusiness` service against the real database
 * (this file is `*.db.test.ts`, so it runs in the required `build-and-test` lane, NOT excluded) and
 * proves, end-to-end:
 *   1. diagnosis persists the expected records (engagement, client, condition profile, findings,
 *      recommendations, actions) — no owner-facing 500 from the transaction,
 *   2. workspaceId is supplied everywhere the tenant backstop requires it (Engagement,
 *      Recommendation, BusinessConditionProfile creates would otherwise throw
 *      "WORKSPACE ISOLATION VIOLATION"),
 *   3. every persisted record belongs to the caller's workspace,
 *   4. cross-workspace data is neither read nor written: a second workspace diagnosing the SAME
 *      business name creates its OWN client (the client lookup is workspace-scoped — no cross-tenant
 *      reuse/read) and its records never leak into the first workspace.
 *
 * DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true. Setup mirrors the proven G5 owner-journey
 * smoke and Wave-3 recommendation DB tests.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 3 Item 2 — diagnoseBusiness persists workspace-isolated records with no cross-tenant leak",
  () => {
    const workspaceAId = randomUUID();
    const workspaceBId = randomUUID();
    const userAId = randomUUID();
    const userBId = randomUUID();
    const stamp = randomUUID().substring(0, 8);
    // Same business name in both workspaces — the cross-tenant reuse probe.
    const businessName = `Acme Diagnostics ${stamp}`;

    // Populated by the diagnosis runs so afterAll can clean up FK-safely.
    let engagementAId = "";
    let engagementBId = "";

    const authContextFor = (userId: string, workspaceId: string) =>
      ({
        verifiedActorId: userId,
        verifiedActorType: "user",
        verifiedActor: { id: userId, email: `${userId}@test.local`, name: "P3I2", isActive: true },
        verifiedWorkspaceId: workspaceId,
        verifiedCapabilities: new Set<string>(),
        // assessCondition (called inside diagnoseBusiness) reads authContext.session?.user?.id.
        session: { user: { id: userId } },
        verifiedSessionSnapshot: {
          snapshotId: "snap",
          snapshotTimestamp: new Date(),
          snapshotHash: "",
          actorId: userId,
          workspaceId,
          capabilities: [],
        },
        policy: null,
      }) as unknown as CanonicalAuthContext;

    const problemFor = (name: string): BusinessProblemInput => ({
      businessName: name,
      businessType: "professional_services",
      problemStatement: "Monthly costs have overtaken revenue and cash is tightening fast.",
      mainIssue: "high_costs",
      monthlyRevenue: 10000,
      monthlyCosts: 15000,
      customerCount: 20,
    });

    beforeAll(async () => {
      await db.user.create({ data: { id: userAId, email: `p3i2-a-${stamp}@test.local`, updatedAt: new Date() } });
      await db.user.create({ data: { id: userBId, email: `p3i2-b-${stamp}@test.local`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceAId, name: "P3I2 WS A", slug: `p3i2-a-${stamp}` } });
      await db.workspace.create({ data: { id: workspaceBId, name: "P3I2 WS B", slug: `p3i2-b-${stamp}` } });
    });

    afterAll(async () => {
      const engagementIds = [engagementAId, engagementBId].filter(Boolean);
      const workspaceIds = [workspaceAId, workspaceBId];
      try {
        if (engagementIds.length) {
          await db.action.deleteMany({ where: { engagementId: { in: engagementIds } } });
          await db.recommendation.deleteMany({ where: { engagementId: { in: engagementIds } } });
          await db.finding.deleteMany({ where: { engagementId: { in: engagementIds } } });
          await db.evidence.deleteMany({ where: { engagementId: { in: engagementIds } } });
          await db.businessConditionProfile.deleteMany({ where: { engagementId: { in: engagementIds } } });
        }
        // canonical_events is append-only (trigger prevents DELETE) — skip, workspace has no FK back to it
        await db.auditEvent.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
        if (engagementIds.length) {
          await db.engagement.deleteMany({ where: { id: { in: engagementIds } } });
        }
        await db.clientAccount.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
        await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
        await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] persists a workspace-scoped diagnosis with no owner-facing 500", async () => {
      const result = await diagnoseBusiness(
        problemFor(businessName),
        authContextFor(userAId, workspaceAId),
        workspaceAId
      );
      engagementAId = result.engagementId;

      // 1. Diagnosis returned the expected persisted value chain.
      expect(result.engagementId).toBeTruthy();
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.actionPlan.length).toBeGreaterThan(0);

      // 2 + 3. Engagement + client persisted and scoped to workspace A.
      const engagement = await db.engagement.findUnique({ where: { id: engagementAId } });
      expect(engagement).not.toBeNull();
      expect(engagement?.workspaceId).toBe(workspaceAId);

      const client = await db.clientAccount.findUnique({ where: { id: engagement!.clientId } });
      expect(client).not.toBeNull();
      expect(client?.workspaceId).toBe(workspaceAId);

      // Business-condition profile persisted, current, and workspace-scoped (the G5 fix, re-proven
      // through the full diagnoseBusiness path).
      const profile = await db.businessConditionProfile.findFirst({
        where: { engagementId: engagementAId, isCurrent: true },
      });
      expect(profile).not.toBeNull();
      expect(profile?.workspaceId).toBe(workspaceAId);

      // Every persisted recommendation carries workspace A (the tenant backstop requires it on create).
      const recs = await db.recommendation.findMany({ where: { engagementId: engagementAId } });
      expect(recs.length).toBe(result.recommendations.length);
      expect(recs.every((r) => r.workspaceId === workspaceAId)).toBe(true);

      // Findings / evidence / actions persisted under the workspace-A engagement (their tenancy is
      // via engagementId; they have no direct workspaceId column).
      const findings = await db.finding.findMany({ where: { engagementId: engagementAId } });
      const evidence = await db.evidence.findMany({ where: { engagementId: engagementAId } });
      const actions = await db.action.findMany({ where: { engagementId: engagementAId } });
      expect(findings.length).toBe(result.findings.length);
      expect(evidence.length).toBeGreaterThan(0);
      expect(actions.length).toBe(result.actionPlan.length);
    });

    it("[db] isolates a second workspace diagnosing the SAME business (no cross-tenant reuse or leak)", async () => {
      const result = await diagnoseBusiness(
        problemFor(businessName),
        authContextFor(userBId, workspaceBId),
        workspaceBId
      );
      engagementBId = result.engagementId;

      // Distinct engagement, scoped to workspace B.
      expect(engagementBId).not.toBe(engagementAId);
      const engagementB = await db.engagement.findUnique({ where: { id: engagementBId } });
      expect(engagementB?.workspaceId).toBe(workspaceBId);

      // The client lookup is workspace-scoped: workspace B created its OWN client for the same
      // business name rather than reusing (reading) workspace A's client.
      const clientB = await db.clientAccount.findUnique({ where: { id: engagementB!.clientId } });
      expect(clientB?.workspaceId).toBe(workspaceBId);
      const engagementA = await db.engagement.findUnique({ where: { id: engagementAId } });
      expect(clientB?.id).not.toBe(engagementA?.clientId);

      // Two same-named clients now exist, one per workspace — no collapse across tenants.
      const sameNameClients = await db.clientAccount.findMany({ where: { name: businessName } });
      expect(sameNameClients.length).toBe(2);
      expect(new Set(sameNameClients.map((c) => c.workspaceId))).toEqual(
        new Set([workspaceAId, workspaceBId])
      );

      // Negative isolation: workspace B's engagement/recommendations never appear in workspace A's
      // scope, and vice versa.
      const workspaceAEngagements = await db.engagement.findMany({ where: { workspaceId: workspaceAId } });
      expect(workspaceAEngagements.map((e) => e.id)).not.toContain(engagementBId);

      const workspaceBRecs = await db.recommendation.findMany({ where: { workspaceId: workspaceBId } });
      expect(workspaceBRecs.length).toBeGreaterThan(0);
      expect(workspaceBRecs.every((r) => r.workspaceId === workspaceBId)).toBe(true);
      expect(workspaceBRecs.map((r) => r.engagementId).every((id) => id === engagementBId)).toBe(true);
    });
  }
);
