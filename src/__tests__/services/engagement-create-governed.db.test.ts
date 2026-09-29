/**
 * Governed engagement creation against a real database (regression for three latent defects that
 * made createEngagement / addMember fail on every call, masked because no test ran them on a DB):
 *  1. Engagement.code is globally unique but availability was checked per workspace → two
 *     workspaces with same-prefix clients both generated "ACM-001" → P2002 → 500.
 *  2. initializeInterventionState treated a truthy Engagement.interventionMode as "already
 *     initialized", but the column is NOT NULL DEFAULT 'recovery' → every new engagement was
 *     rejected. Initialization is now recorded by the unique InterventionState row.
 *  3. addMember created an EngagementMembership without an id (the column has no default).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/engagement-create-governed.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { createEngagement } from "@/services/engagement";
import { initializeInterventionState } from "@/services/intervention-state";
import { addMember } from "@/services/engagement-membership";

const ctx = (actorId: string, workspaceId: string) =>
  ({ verifiedActorId: actorId, verifiedWorkspaceId: workspaceId, verifiedActorType: "user" }) as unknown as CanonicalAuthContext;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] governed engagement creation", () => {
  const stamp = randomUUID().slice(0, 8);
  const workspaces = [randomUUID(), randomUUID()];
  const users = [randomUUID(), randomUUID()];
  const clients = [randomUUID(), randomUUID()];
  let plan: PlanEntitlementFixture | undefined;
  const engagementIds: string[] = [];

  beforeAll(async () => {
    const now = new Date();
    for (let i = 0; i < 2; i++) {
      await db.workspace.create({ data: { id: workspaces[i], name: `Eng ${i}`, slug: `eng-${i}-${stamp}` } });
      await db.user.create({ data: { id: users[i], email: `${users[i]}@example.com`, isActive: true, updatedAt: now } });
      await db.workspaceMembership.create({ data: { userId: users[i], workspaceId: workspaces[i], role: "admin", isActive: true } });
      // Same name in both workspaces → same "ZZT" prefix and "-001" sequence.
      await db.clientAccount.create({
        data: { id: clients[i], workspaceId: workspaces[i], name: `ZZ-TEST-SANDBOX ${stamp}`, industry: "test", createdBy: users[i], updatedAt: now },
      });
    }
    plan = await seedPlanEntitlement(workspaces, ["create_engagement"]);
  });

  afterAll(async () => {
    try {
      await db.engagementMembership.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.businessConditionProfile.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.interventionState.deleteMany({ where: { engagementId: { in: engagementIds } } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await db.usageEvent.deleteMany({ where: { workspaceId: { in: workspaces } } });
      await db.engagement.deleteMany({ where: { id: { in: engagementIds } } });
      await db.clientAccount.deleteMany({ where: { id: { in: clients } } });
      await cleanupPlanEntitlement(plan);
      await db.workspaceMembership.deleteMany({ where: { userId: { in: users } } });
      await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    } catch {
      // best-effort cleanup (ephemeral test database)
    }
  });

  it("[db] creates engagements in two workspaces whose clients share a code prefix; codes stay unique", async () => {
    for (let i = 0; i < 2; i++) {
      const created = await createEngagement(
        { clientId: clients[i], title: `Governed ${stamp} ${i}`, serviceTier: "standard", engagementMode: "expert", interventionMode: "stabilization" },
        ctx(users[i], workspaces[i]),
        workspaces[i]
      );
      engagementIds.push(created.id);
    }
    const rows = await db.engagement.findMany({ where: { id: { in: engagementIds } } });
    expect(new Set(rows.map((r) => r.code)).size).toBe(2);
    expect(rows.every((r) => r.code.startsWith("ZZT-001"))).toBe(true);
    // The requested mode replaces the column default, and initialization is recorded once.
    expect(rows.every((r) => r.interventionMode === "stabilization" && r.interventionPhase === "triage")).toBe(true);
    expect(await db.interventionState.count({ where: { engagementId: { in: engagementIds } } })).toBe(2);
    // CLAUDE.md four-dimension rule: business condition is never silently dropped, even before any
    // diagnosis has run. The placeholder profile states "unknown" honestly rather than fabricating
    // a rating, and Engagement.healthStatus (written in the same createEngagement call) agrees.
    const profiles = await db.businessConditionProfile.findMany({ where: { engagementId: { in: engagementIds } } });
    expect(profiles.length).toBe(2);
    expect(profiles.every((p) => p.businessStatus === "unknown" && p.urgencyLevel === "unknown" && p.isCurrent === true)).toBe(true);
    expect(profiles.every((p) => p.cashPressureLevel === "unknown" && p.resilienceLevel === "unknown")).toBe(true);
    expect(profiles.every((p) => p.conditionScore === 50 && p.ownerHealthScore === 50)).toBe(true);
    expect(rows.every((r) => r.healthStatus === "unknown")).toBe(true);
  });

  it("[db] initializing intervention state twice is rejected", async () => {
    await expect(
      initializeInterventionState(engagementIds[0], "recovery", ctx(users[0], workspaces[0]), workspaces[0])
    ).rejects.toThrow("Intervention state already initialized for this engagement");
    const row = await db.engagement.findUniqueOrThrow({ where: { id: engagementIds[0] } });
    expect(row.interventionMode).toBe("stabilization");
  });

  it("[db] addMember persists an engagement membership", async () => {
    const result = await addMember(
      { userId: users[0], engagementId: engagementIds[0], role: "admin_or_portfolio_manager", workspaceId: workspaces[0] },
      ctx(users[0], workspaces[0])
    );
    expect(result.isNew).toBe(true);
    const membership = await db.engagementMembership.findUniqueOrThrow({ where: { id: result.id } });
    expect([membership.userId, membership.engagementId, membership.isActive]).toEqual([users[0], engagementIds[0], true]);
  });
});
