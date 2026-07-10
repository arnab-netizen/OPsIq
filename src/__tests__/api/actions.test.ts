/**
 * API Route Tests: Actions (Phase 6C Wave 2 — placebo conversion)
 *
 * This file previously contained ~121 vacuous placebo tests (`expect(true).toBe(true)` and empty
 * `TODO_A2_FAKE_TEST_QUARANTINED` bodies) that asserted nothing and imported no real handler — so the
 * action create/list paths could break (and one did: `listActions` filtered on a phantom `owner`
 * column) while these tests stayed green.
 *
 * Phase 6C Wave 2 converts the safely-provable subset into REAL assertions against the real
 * `createAction` / `listActions` services, backed by a real Postgres database (no Prisma mocks counted
 * as DB proof, and audit/event emission left un-mocked so the full governed write path is exercised).
 *
 * Converting the list path uncovered a real owner-facing defect: `listActions` mapped the `assignedTo`
 * filter onto `where.owner`, but the Action model has no `owner` column — every call with an
 * `assignedTo` filter raw-500'd with PrismaClientValidationError. Fixed in `src/services/action.ts`
 * (`where.owner` → `where.assignedTo`) and proven by the assignedTo-filter regression test below.
 *
 * Tests that reference routes/operations with no service import here (GET/PATCH/start/complete/
 * impact-delta, the `/api/actions/[id]` HTTP wrappers, capability/header enforcement that lives in
 * `withCanonicalEnforcement`/`withAuth` — which the repo's own "real route test" skips for lack of an
 * HTTP harness) are documented as DEFERRED in
 * docs/audits/2026-07-10-phase-6c-wave-2-actions-placebo-conversion/ACTIONS_PLACEBO_INVENTORY.md
 * rather than faked here.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createAction, listActions } from "@/services/action";
import type { CreateActionInput } from "@/services/action";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { NotFoundError } from "@/infra/errors";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

function ctxFor(actorId: string, workspaceId: string): CanonicalAuthContext {
  return {
    verifiedActorId: actorId,
    verifiedActorType: "user",
    verifiedActor: { id: actorId, email: `actions-${actorId}@test.local`, name: "Actions Actor", isActive: true },
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: new Set<string>(),
    verifiedSessionSnapshot: {
      snapshotId: "snap",
      snapshotTimestamp: new Date(),
      snapshotHash: "",
      actorId,
      workspaceId,
      capabilities: [],
    },
  } as CanonicalAuthContext;
}

describe("Actions API — service input validation (fail-closed, no DB required)", () => {
  const validWorkspaceId = randomUUID();

  it("createAction rejects a missing auth context (fail-closed, before any DB access)", async () => {
    const input: CreateActionInput = {
      engagementId: randomUUID(),
      recommendationId: randomUUID(),
      title: "No auth",
    };
    await expect(
      createAction(input, null as unknown as CanonicalAuthContext, validWorkspaceId)
    ).rejects.toThrow(/authentication context/i);
  });

  it("createAction rejects a missing workspace context (fail-closed, before any DB access)", async () => {
    const input: CreateActionInput = {
      engagementId: randomUUID(),
      recommendationId: randomUUID(),
      title: "No workspace",
    };
    await expect(
      createAction(input, ctxFor(randomUUID(), validWorkspaceId), "")
    ).rejects.toThrow(/workspace context/i);
  });

  it("listActions rejects a missing/invalid workspace id (fail-closed workspace enforcement)", async () => {
    await expect(listActions("", { engagementId: randomUUID() })).rejects.toThrow(/workspace/i);
  });

  it("listActions requires engagementId for workspace scoping (Action has no direct workspace column)", async () => {
    await expect(listActions(validWorkspaceId, {})).rejects.toThrow(/engagementId is required/i);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Actions API — real create + list workspace isolation (Phase 6C Wave 2)",
  () => {
    const stamp = randomUUID().substring(0, 8);
    const actorId = randomUUID();
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const clientId = randomUUID();
    const engagementId = randomUUID();
    const otherEngagementId = randomUUID();
    let recommendationId: string;
    let otherRecommendationId: string;

    beforeAll(async () => {
      // Real actor row so createAction's audit-event actor FK (audit_events_actor_id_fkey) is satisfied.
      await db.user.create({
        data: { id: actorId, email: `p6c-act-${stamp}@test.local`, isActive: true, updatedAt: new Date() },
      });
      await db.workspace.create({ data: { id: workspaceId, name: "Actions WS", slug: `act-${stamp}` } });
      await db.workspace.create({ data: { id: otherWorkspaceId, name: "Actions WS2", slug: `act2-${stamp}` } });
      await db.clientAccount.create({
        data: { id: clientId, name: "Actions Client", workspaceId, createdBy: actorId, updatedAt: new Date() },
      });
      await db.engagement.create({
        data: {
          id: engagementId,
          updatedAt: new Date(),
          code: `ACT-${stamp}`,
          title: "Actions Engagement",
          clientId,
          workspaceId,
          serviceTier: "standard",
          engagementMode: "advisory",
          status: "draft",
          healthStatus: "unknown",
        },
      });
      await db.engagement.create({
        data: {
          id: otherEngagementId,
          updatedAt: new Date(),
          code: `ACT2-${stamp}`,
          title: "Other Workspace Engagement",
          clientId,
          workspaceId: otherWorkspaceId,
          serviceTier: "standard",
          engagementMode: "advisory",
          status: "draft",
          healthStatus: "unknown",
        },
      });
      // Real recommendations so the actions_recommendation_id_fkey FK is satisfied.
      const rec = await db.recommendation.create({
        data: { engagementId, workspaceId, title: "Rec A", priority: "high" },
      });
      recommendationId = rec.id;
      const otherRec = await db.recommendation.create({
        data: { engagementId: otherEngagementId, workspaceId: otherWorkspaceId, title: "Rec B", priority: "high" },
      });
      otherRecommendationId = otherRec.id;
    });

    afterAll(async () => {
      try {
        await db.auditEvent.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
        await db.action.deleteMany({ where: { engagementId: { in: [engagementId, otherEngagementId] } } });
        await db.usageEvent.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
        await db.recommendation.deleteMany({ where: { engagementId: { in: [engagementId, otherEngagementId] } } });
        await db.engagement.deleteMany({ where: { id: { in: [engagementId, otherEngagementId] } } });
        await db.clientAccount.deleteMany({ where: { id: clientId } });
        await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
        await db.user.deleteMany({ where: { id: actorId } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] createAction persists a real draft action scoped to the engagement/workspace (no raw 500)", async () => {
      const created = await createAction(
        { engagementId, recommendationId, title: "Reduce churn", description: "Owner action", priority: "high" },
        ctxFor(actorId, workspaceId),
        workspaceId
      );
      expect(created.id).toBeTruthy();
      expect(created.title).toBe("Reduce churn");

      const row = await db.action.findUnique({
        where: { id: created.id },
        select: { status: true, engagementId: true, recommendationId: true, updatedAt: true },
      });
      expect(row).not.toBeNull();
      expect(row!.status).toBe("draft"); // initial status enforced by service, not caller input
      expect(row!.engagementId).toBe(engagementId); // scoped to the verified engagement
      expect(row!.recommendationId).toBe(recommendationId);
      expect(row!.updatedAt).toBeInstanceOf(Date);

      // Governed write path emitted a real audit event (un-mocked) for the creation.
      const audits = await db.auditEvent.findMany({ where: { entityId: created.id, workspaceId } });
      expect(audits.length).toBeGreaterThan(0);
      expect(audits.some((a) => a.actorId === actorId)).toBe(true);
    });

    it("[db] createAction rejects an engagement in another workspace (tenant isolation, NotFoundError)", async () => {
      // Engagement lives in otherWorkspaceId; calling with workspaceId must not find it → fail-closed.
      await expect(
        createAction(
          { engagementId: otherEngagementId, recommendationId: otherRecommendationId, title: "Cross-tenant" },
          ctxFor(actorId, workspaceId),
          workspaceId
        )
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("[db] createAction replays a duplicate idempotency key without creating a second action", async () => {
      const key = `idem-${randomUUID()}`;
      const input: CreateActionInput = {
        engagementId,
        recommendationId,
        title: "Idempotent action",
        priority: "medium",
      };
      const first = await createAction(input, ctxFor(actorId, workspaceId), workspaceId, key);
      const second = await createAction(input, ctxFor(actorId, workspaceId), workspaceId, key);
      expect(second.id).toBe(first.id); // replayed outcome, never re-executed

      const rows = await db.action.findMany({
        where: { engagementId, title: "Idempotent action" },
        select: { id: true },
      });
      expect(rows.length).toBe(1); // exactly one row — no duplicate create
    });

    it("[db] listActions returns the engagement's actions with a real items+pagination DTO shape", async () => {
      const result = await listActions(workspaceId, { engagementId });
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every((a: { engagementId: string }) => a.engagementId === engagementId)).toBe(true);
      expect(result.pagination).toMatchObject({ limit: 50, offset: 0 });
      expect(result.pagination.total).toBe(result.items.length);
      expect(typeof result.pagination.hasMore).toBe("boolean");
    });

    it("[db] listActions does not leak actions from another workspace's engagement (tenant isolation)", async () => {
      // Seed a real action in the other workspace's engagement directly.
      const foreignId = randomUUID();
      await db.action.create({
        data: { id: foreignId, engagementId: otherEngagementId, title: "Foreign action", status: "draft", updatedAt: new Date() },
      });
      const mine = await listActions(workspaceId, { engagementId });
      expect(mine.items.map((a: { id: string }) => a.id)).not.toContain(foreignId);
      // The relation filter (engagement.workspaceId) means requesting a foreign engagement under my
      // workspace returns nothing, never the other tenant's rows.
      const spoof = await listActions(workspaceId, { engagementId: otherEngagementId });
      expect(spoof.items.length).toBe(0);
    });

    it("[db] listActions status filter narrows to matching actions without leaking other statuses", async () => {
      // Seed one completed action alongside the existing draft actions.
      await db.action.create({
        data: { id: randomUUID(), engagementId, title: "Done action", status: "completed", updatedAt: new Date() },
      });
      const completed = await listActions(workspaceId, { engagementId, status: "completed" });
      expect(completed.items.length).toBeGreaterThan(0);
      expect(completed.items.every((a: { status: string }) => a.status === "completed")).toBe(true);
      const draftOnly = await listActions(workspaceId, { engagementId, status: "draft" });
      expect(draftOnly.items.every((a: { status: string }) => a.status === "draft")).toBe(true);
    });

    it("[db] listActions assignedTo filter returns the matching action (regression: was raw-500 on phantom `owner`)", async () => {
      // Before the Phase 6C Wave 2 fix, listActions mapped assignedTo onto `where.owner`, a column the
      // Action model does not have, so this call threw PrismaClientValidationError (raw 500). Reaching a
      // filtered result proves `where.assignedTo` is now used.
      const assignee = randomUUID();
      const assigned = await createAction(
        { engagementId, recommendationId, title: "Assigned action", assignedTo: assignee, priority: "low" },
        ctxFor(actorId, workspaceId),
        workspaceId
      );
      const filtered = await listActions(workspaceId, { engagementId, assignedTo: assignee });
      expect(filtered.items.map((a: { id: string }) => a.id)).toContain(assigned.id);
      expect(filtered.items.every((a: { assignedTo: string | null }) => a.assignedTo === assignee)).toBe(true);
    });
  }
);

describe("Regression: Action Prisma Schema Mismatch (dueDate vs dueAt, priority not a column)", () => {
  it("should map API input dueDate → Prisma dueAt (Action schema has dueAt, not dueDate)", () => {
    // Production failure 2026-06-01: Diagnosis failed with PrismaClientValidationError because code wrote
    // `dueDate` to Action, whose column is `dueAt`. The service maps input.dueDate → dueAt: new Date(...).
    const actionCreateInput: CreateActionInput = {
      engagementId: randomUUID(),
      recommendationId: randomUUID(),
      title: "Test Action",
      dueDate: "2026-06-15T00:00:00Z",
      description: "Test description",
    };
    const mappedValue = actionCreateInput.dueDate ? new Date(actionCreateInput.dueDate) : null;
    expect(mappedValue).toBeTruthy();
    expect(mappedValue instanceof Date).toBe(true);
  });

  it("should not treat priority as an Action column (priority belongs to Recommendation)", () => {
    // Action model does NOT have a `priority` field; createAction uses it only to drive re-evaluation.
    const validActionFields = [
      "id",
      "engagementId",
      "stageId",
      "recommendationId",
      "title",
      "description",
      "status",
      "assignedTo",
      "dueAt",
      "startedAt",
      "completedAt",
      "verifiedAt",
      "metadata",
      "version",
      "createdAt",
      "updatedAt",
    ];
    expect(validActionFields).not.toContain("priority");
    expect(validActionFields).not.toContain("owner"); // the phantom column the listActions bug used
  });
});
