/**
 * Phase 2 G4 — shock event → governed adaptive re-evaluation proof (owner-journey stage 11).
 *
 * Wave-8 owner-journey coverage matrix, gap G4:
 *   "Crisis/chaos specs exercise shock surfaces; a focused end-to-end assertion binding a shock event
 *    to the adaptive re-evaluation of BusinessConditionProfile + InterventionMode/Phase + priority +
 *    review cadence is owed."
 *
 * Proves two things end-to-end against the real database:
 *  A. BINDING — recording a real shock event via `createShockEvent` binds into the governed
 *     re-evaluation engine and PERSISTS an adaptive change (intervention phase re-evaluated + version
 *     bumped, condition-changed audit emitted). Existing shock tests MOCK the re-evaluation; this
 *     drives it un-mocked.
 *  B. DIMENSIONS — the governed re-evaluation for `changeType: "shock_event"` re-evaluates ALL
 *     mandated dimensions: BusinessConditionProfile + InterventionMode + InterventionPhase +
 *     recommendation/action priority + review cadence + health. (Contrast with G3: the KPI path
 *     deliberately excludes phase; the shock path includes it.)
 *
 * Dimensions exercised (per CLAUDE.md): 2 business condition, 3 intervention mode + phase,
 * 4 human execution reality (shock is a business-operational event).
 *
 * DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true. Setup mirrors the proven
 * `re-evaluation-workspace-scope.db.test.ts` template.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { createShockEvent } from "@/services/shock-event";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

interface Seeded {
  actorId: string;
  workspaceId: string;
  clientId: string;
  engagementId: string;
}

/** Seed base rows. `interventionPhase` starts at "growth" so a re-evaluation to an earlier phase is observable. */
async function seedBase(startPhase = "growth"): Promise<Seeded> {
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `g4-${actorId}@test.local`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "G4 WS", slug: `g4-${workspaceId.substring(0, 8)}` } });
  await db.clientAccount.create({ data: { id: clientId, name: "G4 Client", createdBy: actorId, updatedAt: new Date() } });
  await db.engagement.create({
    data: {
      id: engagementId,
      code: `G4-${engagementId.substring(0, 8)}`,
      title: "G4 Engagement",
      clientId,
      serviceTier: "diagnostic",
      engagementMode: "advisory",
      interventionMode: "growth",
      interventionPhase: startPhase,
      workspaceId,
      updatedAt: new Date(),
    },
  });
  return { actorId, workspaceId, clientId, engagementId };
}

/** A CURRENT critical condition profile (severityScore 9 → shock detection confirmed; critical cash → recovery mode). */
async function seedCriticalProfile(s: Seeded) {
  await db.businessConditionProfile.create({
    data: {
      id: randomUUID(),
      engagementId: s.engagementId,
      workspaceId: s.workspaceId,
      businessStatus: "distressed",
      severityScore: 9,
      urgencyLevel: "critical",
      cashPressureLevel: "critical",
      marginPressureLevel: "high",
      clientConcentrationRisk: "medium",
      ownerDependencyRisk: "high",
      keyPersonDependencyRisk: "medium",
      processMaturityLevel: "medium",
      managementMaturityLevel: "medium",
      executionCapacityLevel: "medium",
      moralFragilityLevel: "low",
      resilienceLevel: "low",
      growthReadinessLevel: "medium",
      isCurrent: true,
      updatedAt: new Date(),
    },
  });
}

async function cleanup(s: Seeded) {
  await db.auditEvent.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.shockEvent.deleteMany({ where: { engagementId: s.engagementId } }).catch(() => undefined);
  await db.recommendation.deleteMany({ where: { engagementId: s.engagementId } }).catch(() => undefined);
  await db.businessConditionProfile.deleteMany({ where: { engagementId: s.engagementId } }).catch(() => undefined);
  await db.engagement.deleteMany({ where: { id: s.engagementId } }).catch(() => undefined);
  await db.clientAccount.delete({ where: { id: s.clientId } }).catch(() => undefined);
  await db.user.delete({ where: { id: s.actorId } }).catch(() => undefined);
}

function ctxFor(s: Seeded): CanonicalAuthContext {
  return {
    verifiedActorId: s.actorId,
    verifiedActorType: "user",
    verifiedActor: { id: s.actorId, email: "g4@test.local", name: "G4", isActive: true },
    verifiedWorkspaceId: s.workspaceId,
    verifiedCapabilities: new Set<string>(),
    session: { user: { id: s.actorId } },
    verifiedSessionSnapshot: {
      snapshotId: "snap", snapshotTimestamp: new Date(), snapshotHash: "", actorId: s.actorId,
      workspaceId: s.workspaceId, capabilities: [],
    },
  } as unknown as CanonicalAuthContext;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] G4 — shock event binds to governed adaptive re-evaluation", () => {
  let s: Seeded;
  afterEach(async () => { await cleanup(s); });

  it("[db] recording a shock event persists the event, confirms detection, and drives a persisted governed re-evaluation", async () => {
    s = await seedBase("growth"); // no findings → phase re-evaluates to an earlier phase, observable as a change
    await seedCriticalProfile(s);

    const before = await db.engagement.findUnique({ where: { id: s.engagementId }, select: { interventionPhase: true, version: true } });

    const result = await createShockEvent(
      { engagementId: s.engagementId, severity: "critical", notes: "sudden major client loss" },
      ctxFor(s),
      s.workspaceId
    );

    // The shock event is recorded and detection is confirmed by the critical condition profile.
    expect(result.id).toBeTruthy();
    expect(result.detectionConfirmed).toBe(true);

    const persisted = await db.shockEvent.findMany({ where: { engagementId: s.engagementId } });
    expect(persisted.length).toBe(1);
    expect(persisted[0].severity).toBe("critical");

    // The shock is audited...
    const shockAudited = await db.auditEvent.count({
      where: { workspaceId: s.workspaceId, eventName: AUDIT_EVENTS.SHOCK_EVENT_RECORDED },
    });
    expect(shockAudited).toBeGreaterThanOrEqual(1);

    // ...and it BOUND into the governed re-evaluation (not just recorded): condition-changed emitted,
    // and the intervention phase was re-evaluated + persisted with a version bump.
    const conditionChanged = await db.auditEvent.count({
      where: { workspaceId: s.workspaceId, eventName: AUDIT_EVENTS.CONDITION_CHANGED },
    });
    expect(conditionChanged).toBeGreaterThanOrEqual(1);

    const after = await db.engagement.findUnique({ where: { id: s.engagementId }, select: { interventionPhase: true, version: true } });
    expect(after?.interventionPhase).not.toBe(before?.interventionPhase); // "growth" → re-evaluated phase
    expect((after?.version ?? 0)).toBeGreaterThan(before?.version ?? 0);
  });

  it("[db] governed re-evaluation for shock_event re-evaluates ALL dimensions (condition + mode + phase + priority + cadence + health)", async () => {
    s = await seedBase("triage");
    await seedCriticalProfile(s);

    const result = await triggerReEvaluation({
      changeType: "shock_event",
      entityType: "ShockEvent",
      entityId: randomUUID(),
      engagementId: s.engagementId,
      workspaceId: s.workspaceId,
      severity: "critical",
      description: "Shock: major client loss",
      triggeredBy: s.actorId,
    });

    // Shock re-evaluates EVERY dimension (the distinguishing contrast with the KPI path in G3).
    expect(result.targets.businessConditionProfile).toBe(true);
    expect(result.targets.interventionMode).toBe(true);
    expect(result.targets.interventionPhase).toBe(true);
    expect(result.targets.recommendationPriority).toBe(true);
    expect(result.targets.actionPriority).toBe(true);
    expect(result.targets.reviewCadence).toBe(true);
    expect(result.targets.healthStatus).toBe(true);

    // Business condition → critical (critical cash pressure).
    expect(result.businessConditionImpact.recommendedRating).toBe("critical");
    // Intervention mode → recovery (distressed + critical financial pressure).
    expect(result.interventionModeImpact.recommendedMode).toBe("recovery");
    // Intervention phase re-evaluated (present, with an explicit advance decision).
    expect(typeof result.interventionPhaseImpact.canAdvance).toBe("boolean");
    // Priority escalates.
    expect(result.priorityImpact.recommendationPriorityShift).toBe("escalate");
    expect(result.priorityImpact.actionPriorityShift).toBe("escalate");
    // Review cadence tightens to the critical interval.
    expect(result.reviewCadenceImpact.recommendedDaysUntilReview).toBe(3);
    expect(result.reviewCadenceImpact.riskLevel).toBe("critical");
    // Health status re-evaluated + audit id returned.
    expect(["healthy", "at_risk", "critical", "unknown"]).toContain(result.healthStatusImpact.recommendedStatus);
    expect(result.auditEventId).toBeTruthy();
  });
});
