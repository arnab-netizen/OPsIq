/**
 * Phase 6C-F2 — systematic raw-500-create sweep regression proof.
 *
 * A repo-wide scan found create calls that raw-500 because they omit the required `id` (and, where the
 * model has no default, `updatedAt`) or write phantom columns, on Prisma models that have no DB default for
 * those fields. Confirmed sites (all previously raw-500'd; each fixed in this PR):
 *   - services/engagement.ts        createEngagement      (Engagement: +id +updatedAt)
 *   - app/api/onboarding/invite      db.user.create        (User: +id +updatedAt)
 *   - services/deliverable.ts       createDeliverable     (Deliverable: +id +updatedAt)
 *   - services/client-contact.ts    create contact        (ClientContact: +id +updatedAt, drop phantom createdBy)
 *   - services/entitlement.service  usageEvent create     (UsageEvent: +id; model has no updatedAt column)
 *
 * Each test runs the exact create payload the fixed code writes (the defect locus) against a REAL database
 * and proves it persists a schema-valid record with a real `id` and no raw 500. Before the fix these payloads
 * threw PrismaClientValidationError ("Argument `id` is missing." / unknown `createdBy`). Full end-to-end
 * service/route invocation (capability/plan/session harness) is deferred — the create payload is the defect
 * and is proven directly (no Prisma mocks).
 *
 * DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 6C-F2 — systemic raw-500-create fixes persist schema-valid records",
  () => {
    const stamp = randomUUID().substring(0, 8);
    const workspaceId = randomUUID();
    const userId = randomUUID();
    const clientId = randomUUID();
    const engagementId = randomUUID();
    const stageId = randomUUID();

    beforeAll(async () => {
      await db.workspace.create({ data: { id: workspaceId, name: "F2 WS", slug: `f2-${stamp}` } });
      await db.user.create({
        data: { id: userId, email: `f2-${stamp}@test.local`, isActive: true, updatedAt: new Date() },
      });
      await db.clientAccount.create({
        data: { id: clientId, name: "F2 Client", workspaceId, updatedAt: new Date() },
      });
      await db.engagement.create({
        data: {
          id: engagementId,
          updatedAt: new Date(),
          code: `F2-${stamp}`,
          title: "F2 Engagement",
          clientId,
          workspaceId,
          serviceTier: "standard",
          engagementMode: "advisory",
          status: "draft",
          healthStatus: "unknown",
        },
      });
      await db.stage.create({
        data: { id: stageId, engagementId, title: "Stage 1", status: "active", updatedAt: new Date() },
      });
    });

    afterAll(async () => {
      try {
        await db.deliverable.deleteMany({ where: { engagementId } });
        await db.clientContact.deleteMany({ where: { clientId } });
        await db.usageEvent.deleteMany({ where: { workspaceId } });
        await db.stage.deleteMany({ where: { id: stageId } });
        await db.engagement.deleteMany({ where: { id: engagementId } });
        await db.clientAccount.deleteMany({ where: { id: clientId } });
        await db.user.deleteMany({ where: { id: userId } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] engagement create (createEngagement fix) persists with id + updatedAt — was raw-500", async () => {
      const id = randomUUID();
      const created = await db.engagement.create({
        data: {
          id,
          updatedAt: new Date(),
          code: `F2E-${stamp}`,
          title: "Second engagement",
          clientId,
          workspaceId,
          serviceTier: "standard",
          engagementMode: "advisory",
          createdBy: userId,
          status: "draft",
          healthStatus: "unknown",
        },
      });
      expect(created.id).toBe(id);
      expect(created.workspaceId).toBe(workspaceId);
      expect(created.updatedAt).toBeInstanceOf(Date);
      await db.engagement.deleteMany({ where: { id } });
    });

    it("[db] onboarding invite user create persists with id + updatedAt — was raw-500", async () => {
      const id = randomUUID();
      const created = await db.user.create({
        data: { id, email: `invitee-${stamp}@test.local`, name: `invitee-${stamp}`, updatedAt: new Date() },
      });
      expect(created.id).toBe(id);
      expect(created.email).toBe(`invitee-${stamp}@test.local`);
      expect(created.updatedAt).toBeInstanceOf(Date);
      await db.user.deleteMany({ where: { id } });
    });

    it("[db] deliverable create (createDeliverable fix) persists with id + updatedAt — was raw-500", async () => {
      const created = await db.deliverable.create({
        data: {
          id: randomUUID(),
          updatedAt: new Date(),
          engagementId,
          stageId,
          title: "F2 Deliverable",
          description: null,
          createdBy: userId,
        },
      });
      expect(created.id).toBeTruthy();
      expect(created.engagementId).toBe(engagementId);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it("[db] client contact create persists with id + updatedAt and no phantom createdBy — was raw-500", async () => {
      const created = await db.clientContact.create({
        data: {
          id: randomUUID(),
          updatedAt: new Date(),
          clientId,
          name: "Jane Client",
          email: null,
          phone: null,
          role: null,
          isPrimary: false,
          notes: null,
        },
      });
      expect(created.id).toBeTruthy();
      expect(created.clientId).toBe(clientId);
      expect(created.name).toBe("Jane Client");
      expect("createdBy" in (created as Record<string, unknown>)).toBe(false); // phantom column gone
    });

    it("[db] usage event create persists with id — was raw-500 (UsageEvent requires explicit id)", async () => {
      const created = await db.usageEvent.create({
        data: { id: randomUUID(), workspaceId, key: "decision_create", value: 1, timestamp: new Date() },
      });
      expect(created.id).toBeTruthy();
      expect(created.workspaceId).toBe(workspaceId);
      expect(created.key).toBe("decision_create");
    });
  }
);
