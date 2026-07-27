/**
 * Stage 5 DB Proof — I6: BCP Historical Integrity
 *
 * Proves with real PostgreSQL (no mocks):
 *   - Integration event triggers BCP reassessment for the correct workspace/business
 *   - Previous current BCP becomes historical (isCurrent=false) after reassessment
 *   - Exactly one BCP profile has isCurrent=true per (workspaceId, businessId)
 *   - Historical profiles accumulate in version order
 *   - Another workspace's BCP is completely untouched after reassessment
 *   - Two concurrent reassessments cannot leave multiple isCurrent=true rows (I6/I10)
 *   - Workspace-scoped audit events persist for each reassessment (I9)
 *   - inputFactsJson and triggeredBy are absent from public audit payload (I3)
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/stage5/i6-bcp-historical-integrity.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  createConditionProfile,
  evaluateConditionProfile,
  type BcpInputFacts,
} from "@/services/owner-mode/owner-bcp.service";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const ACTOR = randomUUID();

const healthyFacts: BcpInputFacts = {
  financialHealthScore: 80,
  operationalHealthScore: 75,
  salesHealthScore: 70,
  sopHealthScore: 65,
  humanExecutionRisk: "LOW",
};

const distressedFacts: BcpInputFacts = {
  financialHealthScore: 25,
  operationalHealthScore: 30,
  salesHealthScore: 20,
  sopHealthScore: 15,
  humanExecutionRisk: "HIGH",
};

async function cleanupBcp(workspaceId: string) {
  await db.ownerBusinessConditionProfile.deleteMany({ where: { workspaceId } });
  await db.auditEvent.deleteMany({ where: { workspaceId } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] I6 — BCP Historical Integrity", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: ACTOR },
      update: {},
      create: {
        id: ACTOR,
        email: `i6-bcp-test-${ACTOR}@example.com`,
        name: "I6 BCP Test Actor",
        isActive: true,
        updatedAt: new Date(),
      },
    });
  });

  it("[db] initial BCP is version 1 with isCurrent=true", async () => {
    const workspaceId = randomUUID();
    const businessId = randomUUID();

    const initial = await createConditionProfile({
      workspaceId,
      actorId: ACTOR,
      businessId,
      facts: healthyFacts,
    });

    expect(initial.version).toBe(1);
    expect(initial.isCurrent).toBe(true);
    expect(initial.workspaceId).toBe(workspaceId);
    expect(initial.businessId).toBe(businessId);

    const dbRow = await db.ownerBusinessConditionProfile.findFirst({
      where: { workspaceId, businessId },
    });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.isCurrent).toBe(true);
    // inputFactsJson stored internally — confirmed present in DB row
    expect(dbRow!.inputFactsJson).toBeTruthy();

    await cleanupBcp(workspaceId);
  });

  it("[db] reassessment creates new version; old version becomes historical", async () => {
    const workspaceId = randomUUID();
    const businessId = randomUUID();

    await createConditionProfile({
      workspaceId,
      actorId: ACTOR,
      businessId,
      facts: healthyFacts,
    });

    const updated = await evaluateConditionProfile({
      workspaceId,
      actorId: ACTOR,
      businessId,
      facts: distressedFacts,
      triggerType: "KPI_CHANGE",
      triggerDescription: "I6 test: revenue declined",
    });

    expect(updated.version).toBe(2);
    expect(updated.isCurrent).toBe(true);

    const v1 = await db.ownerBusinessConditionProfile.findFirst({
      where: { workspaceId, businessId, version: 1 },
    });
    expect(v1).not.toBeNull();
    expect(v1!.isCurrent).toBe(false);

    const currentCount = await db.ownerBusinessConditionProfile.count({
      where: { workspaceId, businessId, isCurrent: true },
    });
    expect(currentCount).toBe(1);

    const totalCount = await db.ownerBusinessConditionProfile.count({
      where: { workspaceId, businessId },
    });
    expect(totalCount).toBe(2);

    await cleanupBcp(workspaceId);
  });

  it("[db] historical profiles accumulate in version order with one current", async () => {
    const workspaceId = randomUUID();
    const businessId = randomUUID();

    await createConditionProfile({
      workspaceId,
      actorId: ACTOR,
      businessId,
      facts: healthyFacts,
    });
    await evaluateConditionProfile({
      workspaceId,
      actorId: ACTOR,
      businessId,
      facts: distressedFacts,
      triggerType: "BLOCKER_EVENT",
      triggerDescription: "blocker appeared",
    });
    await evaluateConditionProfile({
      workspaceId,
      actorId: ACTOR,
      businessId,
      facts: healthyFacts,
      triggerType: "EVIDENCE_UPDATE",
      triggerDescription: "recovery evidence",
    });

    const allProfiles = await db.ownerBusinessConditionProfile.findMany({
      where: { workspaceId, businessId },
      orderBy: { version: "asc" },
    });

    expect(allProfiles).toHaveLength(3);
    expect(allProfiles[0].isCurrent).toBe(false); // v1
    expect(allProfiles[1].isCurrent).toBe(false); // v2
    expect(allProfiles[2].isCurrent).toBe(true);  // v3 — current
    expect(allProfiles[2].version).toBe(3);

    const currentCount = await db.ownerBusinessConditionProfile.count({
      where: { workspaceId, businessId, isCurrent: true },
    });
    expect(currentCount).toBe(1);

    await cleanupBcp(workspaceId);
  });

  it("[db] cross-workspace: another workspace BCP is untouched after reassessment", async () => {
    const workspaceA = randomUUID();
    const workspaceB = randomUUID();
    const businessId = randomUUID();

    await createConditionProfile({
      workspaceId: workspaceA,
      actorId: ACTOR,
      businessId,
      facts: healthyFacts,
    });
    await createConditionProfile({
      workspaceId: workspaceB,
      actorId: ACTOR,
      businessId,
      facts: healthyFacts,
    });

    // Reassess only workspace A
    await evaluateConditionProfile({
      workspaceId: workspaceA,
      actorId: ACTOR,
      businessId,
      facts: distressedFacts,
      triggerType: "SHOCK_EVENT",
      triggerDescription: "shock event in workspace A",
    });

    // Workspace A: exactly one current at version 2
    const aCurrent = await db.ownerBusinessConditionProfile.findFirst({
      where: { workspaceId: workspaceA, businessId, isCurrent: true },
    });
    expect(aCurrent).not.toBeNull();
    expect(aCurrent!.version).toBe(2);

    const aCount = await db.ownerBusinessConditionProfile.count({
      where: { workspaceId: workspaceA, businessId },
    });
    expect(aCount).toBe(2); // v1 historical + v2 current

    // Workspace B: unchanged — still v1 current, total 1 row
    const bCurrent = await db.ownerBusinessConditionProfile.findFirst({
      where: { workspaceId: workspaceB, businessId, isCurrent: true },
    });
    expect(bCurrent).not.toBeNull();
    expect(bCurrent!.version).toBe(1);
    expect(bCurrent!.isCurrent).toBe(true);

    const bCount = await db.ownerBusinessConditionProfile.count({
      where: { workspaceId: workspaceB, businessId },
    });
    expect(bCount).toBe(1);

    await cleanupBcp(workspaceA);
    await cleanupBcp(workspaceB);
  });

  it("[db] concurrent reassessments produce exactly one isCurrent=true row (I6/I10)", async () => {
    const workspaceId = randomUUID();
    const businessId = randomUUID();

    await createConditionProfile({
      workspaceId,
      actorId: ACTOR,
      businessId,
      facts: healthyFacts,
    });

    // Two concurrent reassessments — Serializable transaction ensures one wins
    const results = await Promise.allSettled([
      evaluateConditionProfile({
        workspaceId,
        actorId: ACTOR,
        businessId,
        facts: distressedFacts,
        triggerType: "KPI_CHANGE",
        triggerDescription: "concurrent reassessment 1",
      }),
      evaluateConditionProfile({
        workspaceId,
        actorId: ACTOR,
        businessId,
        facts: { ...healthyFacts, financialHealthScore: 60 },
        triggerType: "EVIDENCE_UPDATE",
        triggerDescription: "concurrent reassessment 2",
      }),
    ]);

    // At least one must succeed
    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    // The invariant: exactly one isCurrent=true regardless of which succeeded
    const currentCount = await db.ownerBusinessConditionProfile.count({
      where: { workspaceId, businessId, isCurrent: true },
    });
    expect(currentCount).toBe(1);

    await cleanupBcp(workspaceId);
  });

  it("[db] BCP reassessment emits workspace-scoped audit event with no internal fields (I9/I3)", async () => {
    const workspaceId = randomUUID();
    const businessId = randomUUID();

    await createConditionProfile({
      workspaceId,
      actorId: ACTOR,
      businessId,
      facts: healthyFacts,
    });
    await evaluateConditionProfile({
      workspaceId,
      actorId: ACTOR,
      businessId,
      facts: distressedFacts,
      triggerType: "KPI_CHANGE",
      triggerDescription: "audit evidence test",
    });

    const auditEvents = await db.auditEvent.findMany({
      where: {
        workspaceId,
        eventName: { in: ["owner_bcp.created", "owner_bcp.evaluated"] },
      },
      orderBy: { occurredAt: "asc" },
    });

    expect(auditEvents.length).toBeGreaterThanOrEqual(2);

    const evalEvent = auditEvents.find((e) => e.eventName === "owner_bcp.evaluated");
    expect(evalEvent).toBeDefined();
    expect(evalEvent!.workspaceId).toBe(workspaceId);
    expect(evalEvent!.actorId).toBe(ACTOR);

    // I3: internal-only fields must not appear in public audit payload
    const payload = evalEvent!.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("inputFactsJson");
    expect(payload).not.toHaveProperty("triggeredBy");
    // Required fields are present
    expect(payload).toHaveProperty("businessId");
    expect(payload).toHaveProperty("triggerType");
    expect(payload).toHaveProperty("conditionCode");

    await cleanupBcp(workspaceId);
  });
});
