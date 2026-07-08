/**
 * Phase 2 G3 — weekly KPI-deterioration → governed adaptive re-evaluation proof (owner-journey stage 10).
 *
 * Wave-8 owner-journey coverage matrix, gap G3:
 *   "Weekly summary renders; an end-to-end assertion that a significant change (KPI deterioration)
 *    routes into governed re-evaluation of condition/mode/phase + review cadence (the CLAUDE.md
 *    mandatory adaptive rule) is owed."
 *
 * Proves two things end-to-end against the real database:
 *  A. ROUTING — a real sustained KPI-deterioration pattern (declining KPI snapshots) routes through
 *     `detectKPIDeteriorationPattern` (the weekly-review escalation sweep) into the governed
 *     re-evaluation engine `triggerReEvaluation` (it is not just an alert).
 *  B. DIMENSIONS — the governed re-evaluation for `changeType: "kpi_deterioration"` re-evaluates the
 *     mandated dimensions: BusinessConditionProfile, InterventionMode, recommendation + action
 *     priority, review cadence, and health status.
 *
 * Honest deviation from the Wave-8 gap text: the gap lists "condition/mode/phase + cadence", but the
 * governed engine (`determineReEvaluationTargets`) INTENTIONALLY excludes `interventionPhase` for the
 * `kpi_deterioration` change type (phase is driven by the findings/action lifecycle, not by KPI
 * trend). This test asserts and documents the real governed behaviour — `targets.interventionPhase`
 * is `false` for KPI deterioration — rather than asserting a phase change the engine deliberately
 * does not make. (The shock path, G4, DOES re-evaluate phase; the contrast is intentional.)
 *
 * Dimensions exercised (per CLAUDE.md): 1 consulting lifecycle stage (weekly review cadence),
 * 2 business condition, 3 intervention mode + phase (mode + cadence adapt).
 *
 * DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true. Setup mirrors the proven
 * `re-evaluation-workspace-scope.db.test.ts` template.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { detectKPIDeteriorationPattern } from "@/services/escalation";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

interface Seeded {
  actorId: string;
  workspaceId: string;
  clientId: string;
  engagementId: string;
}

async function seedBase(): Promise<Seeded> {
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `g3-${actorId}@test.local`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "G3 WS", slug: `g3-${workspaceId.substring(0, 8)}` } });
  await db.clientAccount.create({ data: { id: clientId, name: "G3 Client", createdBy: actorId, updatedAt: new Date() } });
  await db.engagement.create({
    data: {
      id: engagementId,
      code: `G3-${engagementId.substring(0, 8)}`,
      title: "G3 Engagement",
      clientId,
      serviceTier: "diagnostic",
      engagementMode: "advisory",
      interventionMode: "stabilization",
      workspaceId,
      updatedAt: new Date(),
    },
  });
  return { actorId, workspaceId, clientId, engagementId };
}

/** A CURRENT distressed condition profile with critical cash pressure (drives escalation). */
async function seedDistressedProfile(s: Seeded) {
  await db.businessConditionProfile.create({
    data: {
      id: randomUUID(),
      engagementId: s.engagementId,
      workspaceId: s.workspaceId,
      businessStatus: "distressed",
      severityScore: 8,
      urgencyLevel: "high",
      cashPressureLevel: "critical",
      marginPressureLevel: "high",
      clientConcentrationRisk: "medium",
      ownerDependencyRisk: "medium",
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

async function seedRecommendation(s: Seeded, priority: string): Promise<string> {
  const id = randomUUID();
  await db.recommendation.create({
    data: { id, engagementId: s.engagementId, workspaceId: s.workspaceId, title: `G3 rec ${priority}`, priority, createdBy: s.actorId },
  });
  return id;
}

async function cleanup(s: Seeded) {
  await db.auditEvent.deleteMany({ where: { workspaceId: s.workspaceId } }).catch(() => undefined);
  await db.kPISnapshot.deleteMany({ where: { kpi: { engagementId: s.engagementId } } }).catch(() => undefined);
  await db.kPI.deleteMany({ where: { engagementId: s.engagementId } }).catch(() => undefined);
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
    verifiedActor: { id: s.actorId, email: "g3@test.local", name: "G3", isActive: true },
    verifiedWorkspaceId: s.workspaceId,
    verifiedCapabilities: new Set<string>(),
    // detectKPIDeteriorationPattern reads authContext.session?.user?.id for the audit actor.
    session: { user: { id: s.actorId } },
    verifiedSessionSnapshot: {
      snapshotId: "snap", snapshotTimestamp: new Date(), snapshotHash: "", actorId: s.actorId,
      workspaceId: s.workspaceId, capabilities: [],
    },
  } as unknown as CanonicalAuthContext;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] G3 — weekly KPI deterioration routes into governed adaptive re-evaluation", () => {
  let s: Seeded;
  beforeEach(async () => { s = await seedBase(); });
  afterEach(async () => { await cleanup(s); });

  it("[db] a sustained KPI-deterioration pattern routes into governed re-evaluation (not just an alert)", async () => {
    await seedDistressedProfile(s);
    await seedRecommendation(s, "low");

    // A KPI (higher-is-better) with three snapshots declining over time → deterioration pattern.
    const kpiId = randomUUID();
    await db.kPI.create({
      data: { id: kpiId, engagementId: s.engagementId, name: "Monthly Revenue", target: 100, currentValue: 60, direction: "up", createdBy: s.actorId, updatedAt: new Date() },
    });
    const base = Date.UTC(2026, 0, 1);
    // recordedAt oldest → newest with strictly DECREASING value (100 → 80 → 60).
    await db.kPISnapshot.create({ data: { id: randomUUID(), kpiId, value: 100, recordedAt: new Date(base) } });
    await db.kPISnapshot.create({ data: { id: randomUUID(), kpiId, value: 80, recordedAt: new Date(base + 7 * 86400000) } });
    await db.kPISnapshot.create({ data: { id: randomUUID(), kpiId, value: 60, recordedAt: new Date(base + 14 * 86400000) } });

    const alert = await detectKPIDeteriorationPattern(s.engagementId, ctxFor(s), s.workspaceId);

    // Routing: a real alert is raised for the deteriorating KPI.
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("kpi_deterioration_pattern");
    expect(alert?.relatedEntityIds).toContain(kpiId);

    // Governed re-evaluation actually fired (not merely an alert): the engine emits CONDITION_CHANGED.
    const conditionChanged = await db.auditEvent.count({
      where: { workspaceId: s.workspaceId, eventName: AUDIT_EVENTS.CONDITION_CHANGED },
    });
    expect(conditionChanged).toBeGreaterThanOrEqual(1);

    // The escalation itself is audited.
    const escalationAudited = await db.auditEvent.count({
      where: { workspaceId: s.workspaceId, eventName: AUDIT_EVENTS.ESCALATION_ALERT_KPI_DETERIORATION_PATTERN },
    });
    expect(escalationAudited).toBeGreaterThanOrEqual(1);
  });

  it("[db] governed re-evaluation for kpi_deterioration re-evaluates condition + mode + priority + cadence + health (phase deliberately excluded)", async () => {
    await seedDistressedProfile(s);
    await seedRecommendation(s, "low");

    // Two higher-is-better KPIs, both currently below target → majority deteriorating.
    for (const name of ["Revenue", "Margin"]) {
      await db.kPI.create({
        data: { id: randomUUID(), engagementId: s.engagementId, name, target: 100, currentValue: 50, direction: "up", createdBy: s.actorId, updatedAt: new Date() },
      });
    }

    const result = await triggerReEvaluation({
      changeType: "kpi_deterioration",
      entityType: "kpi",
      entityId: s.engagementId,
      engagementId: s.engagementId,
      workspaceId: s.workspaceId,
      severity: "high",
      description: "Majority of KPIs deteriorating",
      triggeredBy: s.actorId,
    });

    // Governed target map for kpi_deterioration: everything EXCEPT interventionPhase.
    expect(result.targets.businessConditionProfile).toBe(true);
    expect(result.targets.interventionMode).toBe(true);
    expect(result.targets.recommendationPriority).toBe(true);
    expect(result.targets.actionPriority).toBe(true);
    expect(result.targets.reviewCadence).toBe(true);
    expect(result.targets.healthStatus).toBe(true);
    expect(result.targets.interventionPhase).toBe(false); // by design for KPI deterioration

    // BusinessConditionProfile re-evaluated: KPI-deterioration factor detected; critical cash → critical rating.
    expect(result.businessConditionImpact.reasoningFactors).toContain("kpi_deterioration");
    expect(result.businessConditionImpact.reasoningFactors).toContain("critical_cash_pressure");
    expect(result.businessConditionImpact.recommendedRating).toBe("critical");

    // InterventionMode re-evaluated to recovery (distressed + critical financial pressure).
    expect(result.interventionModeImpact.recommendedMode).toBe("recovery");

    // Recommendation + action priority escalate under a critical rating.
    expect(result.priorityImpact.recommendationPriorityShift).toBe("escalate");
    expect(result.priorityImpact.actionPriorityShift).toBe("escalate");

    // Review cadence tightens to the critical interval.
    expect(result.reviewCadenceImpact.recommendedDaysUntilReview).toBe(3);
    expect(result.reviewCadenceImpact.riskLevel).toBe("critical");

    // Health status re-evaluated and audit event id returned.
    expect(["healthy", "at_risk", "critical", "unknown"]).toContain(result.healthStatusImpact.recommendedStatus);
    expect(result.auditEventId).toBeTruthy();

    // The governed re-evaluation persisted a CONDITION_CHANGED audit event.
    const conditionChanged = await db.auditEvent.count({
      where: { workspaceId: s.workspaceId, eventName: AUDIT_EVENTS.CONDITION_CHANGED },
    });
    expect(conditionChanged).toBeGreaterThanOrEqual(1);
  });
});
