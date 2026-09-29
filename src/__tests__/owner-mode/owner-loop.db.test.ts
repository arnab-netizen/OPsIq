/**
 * Jarvis 360 owner-flow closure (EH-22/EH-06/EH-26) — `[db]`-gated owner-loop proof.
 *
 * Runs only under TEST_WITH_DB=true against a real PostgreSQL with the owner migrations
 * applied. Seeds the laundry archetype through the REAL runtime service, then proves the
 * owner-action gate reads that persisted state and enforces it (capacity bottleneck from
 * a maintenance-overdue/saturated machine blocks a growth-domain action) — a real
 * service/DB owner loop, not a DI construction.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/owner-loop.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { seedLaundryArchetype } from "@/services/owner-mode/archetype-seed.service";
import { enforceOwnerActionGates } from "@/services/owner-mode/owner-action-gate.service";
import { getOwnerControlCenter } from "@/services/owner-mode/owner-control-center.service";

const actor = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `seed-test-${actor}@example.com`, name: "Seed Test", isActive: true, updatedAt: new Date() },
  });
});

describe("[db] owner archetype seed → live gate + control center", () => {
  it("[db] seeds the archetype and the capacity gate blocks a growth action", async () => {
    const workspaceId = randomUUID();
    const result = await seedLaundryArchetype({ workspaceId, actorId: actor, env: "test" });

    expect(result.businessId).toBeTruthy();
    expect(result.equipmentCount).toBeGreaterThan(0);
    expect(result.processCount).toBeGreaterThan(0);
    expect(result.sopCount).toBeGreaterThan(0);

    // The seed includes a maintenance-overdue + saturated machine → capacity bottleneck →
    // a material growth-domain transition is blocked by the real owner-action gate.
    await expect(
      enforceOwnerActionGates({ workspaceId, businessId: result.businessId, actionId: randomUUID(), domain: "marketing", toStatus: "completed" })
    ).rejects.toThrow();

    // The control center reads the persisted equipment/process/SOP state for this workspace.
    const panel = await getOwnerControlCenter(workspaceId, {
      dataSufficiencyStatus: "caution",
      lowConfidenceDomains: [],
      blockedRecommendations: 0,
      proofBlocked: 0,
      financeBlocked: 0,
      ownerApprovalsRequired: 0,
      nextBestAction: null,
    });
    expect(panel.sections.equipmentBottlenecks).toBeGreaterThan(0);
    expect(panel.sections.sopsNeedingReview).toBeGreaterThanOrEqual(1); // draft SOP from the seed
  });

  it("[db] is workspace-isolated — a different workspace sees no seeded state", async () => {
    const otherWs = randomUUID();
    await expect(
      enforceOwnerActionGates({ workspaceId: otherWs, businessId: randomUUID(), actionId: randomUUID(), domain: "marketing", toStatus: "completed" })
    ).resolves.toMatchObject({ workspaceId: otherWs, domain: "marketing" }); // no equipment/compliance/cycles in this workspace → no block
  });
});
