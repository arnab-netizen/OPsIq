/**
 * Bundle 3.8 — OwnerOnboarding lifecycle (PostgreSQL-backed).
 *
 * Proves:
 *  - startOnboarding: idempotent create (one per workspace), IN_PROGRESS
 *  - completeOnboarding: archetype + initialActionQueue seeded, COMPLETED
 *  - completeOnboarding idempotent: same completionKey returns same state
 *  - SURVIVAL_MODE archetype: NEGATIVE profitability + low runway
 *  - GROWTH_READY archetype: GROWING revenue + POSITIVE profitability
 *  - TURNAROUND archetype: DECLINING revenue
 *  - triggerReOnboarding: RE_ONBOARDING state, reason recorded
 *  - Internal fields excluded from DTO (archetypeScore, completionKey, createdBy)
 *  - Invalid revenueTrend / profitability rejected with ValidationError
 *  - workspace isolation: separate workspaces get separate onboarding records
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/bundle-3.8-onboarding.db.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  startOnboarding,
  completeOnboarding,
  triggerReOnboarding,
  classifyArchetype,
  buildInitialActionQueue,
} from "@/services/owner-mode/owner-onboarding-lifecycle.service";
import { ValidationError } from "@/infra/errors";

const actor = randomUUID();
const workspaceId = randomUUID();
const businessId = randomUUID();
const ownerId = randomUUID();

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Bundle 3.8 — OwnerOnboarding lifecycle (ephemeral PostgreSQL)",
  () => {
    beforeAll(async () => {
      await db.user.upsert({
        where: { id: actor },
        update: {},
        create: {
          id: actor,
          email: `onboarding-test-${actor}@test.local`,
          name: "OnboardingTestActor",
          isActive: true,
          updatedAt: new Date(),
        },
      });
    });

    afterAll(async () => {
      await db.ownerOnboarding.deleteMany({ where: { workspaceId } });
      await db.auditEvent.deleteMany({ where: { actorId: actor } });
      await db.user.delete({ where: { id: actor } });
    });

    it("startOnboarding: creates record in IN_PROGRESS state", async () => {
      const result = await startOnboarding({
        workspaceId,
        actorId: actor,
        businessId,
        ownerId,
        businessName: "Acme Local Bakery",
        businessType: "food_retail",
        revenueRange: "100k-500k",
        revenueTrend: "STABLE",
        profitability: "BREAKEVEN",
        cashRunwayWeeks: 12,
        ownerHoursPerWeek: 60,
        teamSize: 5,
      });

      expect(result.id).toBeTruthy();
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.status).toBe("IN_PROGRESS");
      expect(result.businessName).toBe("Acme Local Bakery");
      expect(result.archetype).toBeNull();
      expect(result.initialActionQueue).toBeNull();
      // Internal fields excluded from DTO
      expect((result as Record<string, unknown>).archetypeScore).toBeUndefined();
      expect((result as Record<string, unknown>).completionKey).toBeUndefined();
      expect((result as Record<string, unknown>).createdBy).toBeUndefined();
    });

    it("startOnboarding: idempotent — second call returns same record", async () => {
      const second = await startOnboarding({
        workspaceId,
        actorId: actor,
        businessId: randomUUID(),
        ownerId: randomUUID(),
        businessName: "Different Name Should Not Overwrite",
        businessType: "other",
        revenueRange: "0-50k",
        revenueTrend: "DECLINING",
        profitability: "NEGATIVE",
      });

      expect(second.businessName).toBe("Acme Local Bakery");
    });

    it("completeOnboarding: classifies STABILIZATION archetype, seeds initialActionQueue", async () => {
      const completed = await completeOnboarding({
        workspaceId,
        actorId: actor,
        completionKey: "completion-key-001",
      });

      expect(completed.status).toBe("COMPLETED");
      expect(completed.archetype).toBe("STABILIZATION");
      expect(completed.initialActionQueue).toBeTruthy();
      expect(Array.isArray(completed.initialActionQueue)).toBe(true);
      expect((completed.initialActionQueue as string[]).length).toBe(5);
      expect(completed.completedAt).toBeTruthy();
    });

    it("completeOnboarding: idempotent — same completionKey returns same state without re-seeding", async () => {
      const first = await completeOnboarding({
        workspaceId,
        actorId: actor,
        completionKey: "completion-key-001",
      });
      const second = await completeOnboarding({
        workspaceId,
        actorId: actor,
        completionKey: "completion-key-001",
      });
      expect(second.id).toBe(first.id);
      expect(second.archetype).toBe("STABILIZATION");
    });

    it("triggerReOnboarding: sets RE_ONBOARDING status, records reason", async () => {
      const reOnboarded = await triggerReOnboarding({
        workspaceId,
        actorId: actor,
        reOnboardingReason: "Business acquired a second location — major scope change",
      });

      expect(reOnboarded.status).toBe("RE_ONBOARDING");
      expect(reOnboarded.reOnboardingReason).toBe(
        "Business acquired a second location — major scope change"
      );
    });

    it("classifyArchetype: SURVIVAL_MODE when NEGATIVE + runway < 8 weeks", () => {
      const { archetype, archetypeScore } = classifyArchetype("DECLINING", "NEGATIVE", 4);
      expect(archetype).toBe("SURVIVAL_MODE");
      expect(archetypeScore).toBe(0.1);
    });

    it("classifyArchetype: GROWTH_READY when GROWING + POSITIVE", () => {
      const { archetype, archetypeScore } = classifyArchetype("GROWING", "POSITIVE", 52);
      expect(archetype).toBe("GROWTH_READY");
      expect(archetypeScore).toBe(0.9);
    });

    it("classifyArchetype: TURNAROUND when DECLINING revenue (regardless of profitability)", () => {
      const { archetype } = classifyArchetype("DECLINING", "BREAKEVEN", 20);
      expect(archetype).toBe("TURNAROUND");
    });

    it("classifyArchetype: STABILIZATION when STABLE + BREAKEVEN with adequate runway", () => {
      const { archetype } = classifyArchetype("STABLE", "BREAKEVEN", 26);
      expect(archetype).toBe("STABILIZATION");
    });

    it("buildInitialActionQueue: returns 5 actionable items for each archetype", () => {
      for (const archetype of ["SURVIVAL_MODE", "TURNAROUND", "STABILIZATION", "GROWTH_READY"] as const) {
        const queue = buildInitialActionQueue(archetype);
        expect(queue).toHaveLength(5);
        for (const item of queue) expect(item.length).toBeGreaterThan(10);
      }
    });

    it("startOnboarding: rejects invalid revenueTrend with ValidationError", async () => {
      const isolatedWs = randomUUID();
      await expect(
        startOnboarding({
          workspaceId: isolatedWs,
          actorId: actor,
          businessId: randomUUID(),
          ownerId: randomUUID(),
          businessName: "Test",
          businessType: "test",
          revenueRange: "0-50k",
          revenueTrend: "SIDEWAYS",
          profitability: "POSITIVE",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("startOnboarding: rejects invalid profitability with ValidationError", async () => {
      const isolatedWs = randomUUID();
      await expect(
        startOnboarding({
          workspaceId: isolatedWs,
          actorId: actor,
          businessId: randomUUID(),
          ownerId: randomUUID(),
          businessName: "Test",
          businessType: "test",
          revenueRange: "0-50k",
          revenueTrend: "STABLE",
          profitability: "UNKNOWN",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("workspace isolation: different workspaces maintain separate onboarding records", async () => {
      const wsA = randomUUID();
      const wsB = randomUUID();

      const onboardingA = await startOnboarding({
        workspaceId: wsA,
        actorId: actor,
        businessId: randomUUID(),
        ownerId: randomUUID(),
        businessName: "Workspace A Business",
        businessType: "retail",
        revenueRange: "50k-100k",
        revenueTrend: "GROWING",
        profitability: "POSITIVE",
      });
      const onboardingB = await startOnboarding({
        workspaceId: wsB,
        actorId: actor,
        businessId: randomUUID(),
        ownerId: randomUUID(),
        businessName: "Workspace B Business",
        businessType: "services",
        revenueRange: "100k-500k",
        revenueTrend: "DECLINING",
        profitability: "NEGATIVE",
        cashRunwayWeeks: 3,
      });

      expect(onboardingA.id).not.toBe(onboardingB.id);
      expect(onboardingA.workspaceId).toBe(wsA);
      expect(onboardingB.workspaceId).toBe(wsB);

      // Cleanup
      await db.ownerOnboarding.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    });

    it("audit events emitted: onboarding.started, onboarding.completed, onboarding.re_triggered", async () => {
      const auditEvents = await db.auditEvent.findMany({
        where: {
          actorId: actor,
          workspaceId,
          eventName: {
            in: ["onboarding.started", "onboarding.completed", "onboarding.re_triggered"],
          },
        },
      });
      const names = auditEvents.map((e) => e.eventName);
      expect(names).toContain("onboarding.started");
      expect(names).toContain("onboarding.completed");
      expect(names).toContain("onboarding.re_triggered");
    });
  }
);
