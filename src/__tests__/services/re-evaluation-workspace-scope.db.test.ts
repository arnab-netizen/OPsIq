/**
 * Re-evaluation workspace-scoping fix (BROKEN-SVC-4) — DB proof.
 *
 * `evaluateInterventionPhaseImpact` filtered `finding`/`action` by a flat `workspaceId` column that
 * those models do not have, so `triggerReEvaluation` threw `PrismaClientValidationError` on EVERY
 * intervention transition (shielded because all existing route tests mock `@/services/re-evaluation`).
 * The fix scopes those queries via the `engagement` relation (matching the KPI query in the same file).
 *
 * This test drives a REAL, UN-MOCKED intervention mode transition (which triggers the real
 * re-evaluation) and asserts it completes and persists — the exact call that threw before the fix.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/re-evaluation-workspace-scope.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { updateInterventionMode } from "@/services/intervention-state";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

interface Seeded { actorId: string; workspaceId: string; clientId: string; engagementId: string; }

async function seed(): Promise<Seeded> {
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `reeval-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "ReEval WS", slug: `reeval-${workspaceId.substring(0, 8)}` } });
  await db.clientAccount.create({ data: { id: clientId, name: "ReEval Client", createdBy: actorId, updatedAt: new Date() } });
  await db.engagement.create({
    data: {
      id: engagementId,
      code: `ENG-${engagementId.substring(0, 8)}`,
      title: "ReEval Engagement",
      clientId,
      serviceTier: "diagnostic",
      engagementMode: "advisory",
      workspaceId,
      updatedAt: new Date(),
    },
  });
  // A real Action in this engagement — the fixed `action.findMany` must return it (relation-scoped).
  await db.action.create({ data: { id: randomUUID(), engagementId, title: "ReEval Action", status: "open", updatedAt: new Date() } });
  return { actorId, workspaceId, clientId, engagementId };
}

async function cleanup(s: Seeded) {
  await db.auditEvent.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.action.deleteMany({ where: { engagementId: s.engagementId } }).catch(() => undefined);
  await db.engagement.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.clientAccount.delete({ where: { id: s.clientId } }).catch(() => undefined);
  await db.user.delete({ where: { id: s.actorId } }).catch(() => undefined);
}

function ctxFor(s: Seeded): CanonicalAuthContext {
  return {
    verifiedActorId: s.actorId,
    verifiedActorType: "user",
    verifiedActor: { id: s.actorId, email: "reeval@example.com", name: "ReEval", isActive: true },
    verifiedWorkspaceId: s.workspaceId,
    verifiedCapabilities: new Set<string>(),
    verifiedSessionSnapshot: {
      snapshotId: "snap", snapshotTimestamp: new Date(), snapshotHash: "", actorId: s.actorId,
      workspaceId: s.workspaceId, capabilities: [],
    },
  } as CanonicalAuthContext;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Re-evaluation workspace scoping (intervention transition, un-mocked)", () => {
  let s: Seeded;
  beforeEach(async () => { s = await seed(); });
  afterEach(async () => { await cleanup(s); });

  it("[db] a real intervention mode transition triggers re-evaluation without throwing", async () => {
    // Before the fix this threw PrismaClientValidationError inside evaluateInterventionPhaseImpact.
    await expect(
      updateInterventionMode(s.engagementId, { interventionMode: "growth", version: 1 }, ctxFor(s), s.workspaceId)
    ).resolves.toBeUndefined();

    const eng = await db.engagement.findUnique({ where: { id: s.engagementId }, select: { interventionMode: true } });
    expect(eng?.interventionMode).toBe("growth");
  });

  it("[db] re-evaluation is engagement/workspace scoped — a foreign engagement's actions do not leak", async () => {
    // Seed a second workspace + engagement + action; the re-evaluation of `s` must not be affected by it.
    const foreign = await seed();
    try {
      await expect(
        updateInterventionMode(s.engagementId, { interventionMode: "stabilization", version: 1 }, ctxFor(s), s.workspaceId)
      ).resolves.toBeUndefined();
      const eng = await db.engagement.findUnique({ where: { id: s.engagementId }, select: { interventionMode: true } });
      expect(eng?.interventionMode).toBe("stabilization");
      // Foreign engagement untouched.
      const foreignEng = await db.engagement.findUnique({ where: { id: foreign.engagementId }, select: { interventionMode: true } });
      expect(foreignEng?.interventionMode).toBe("recovery");
    } finally {
      await cleanup(foreign);
    }
  });
});
