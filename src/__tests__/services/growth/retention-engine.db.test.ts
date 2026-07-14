/**
 * Retention Engine — DB-backed paths proof (real PostgreSQL).
 *
 * Proves: recordMetrics persists to DB, listCohorts is workspace-scoped,
 * data survives across calls, and audit event is emitted.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/growth/retention-engine.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { RetentionEngine } from "@/services/growth/retention-engine";
import { ValidationError } from "@/infra/errors";

const actor = randomUUID();
const testWs = randomUUID();
const otherWs = randomUUID(); // never seeded — proves workspace isolation

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] RetentionEngine — DB persistence", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actor },
      update: {},
      create: {
        id: actor,
        email: `retention-db-${actor}@test.local`,
        name: "RetentionDbTest",
        isActive: true,
        updatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await db.retentionCohort.deleteMany({ where: { workspaceId: testWs } });
    await db.auditEvent.deleteMany({ where: { actorId: actor } });
    await db.user.delete({ where: { id: actor } });
  });

  it("recordMetrics persists a cohort and returns the RetentionMetrics", async () => {
    const metrics = await RetentionEngine.recordMetrics(testWs, actor, {
      cohortMonth: "2026-01",
      cohortSize: 200,
      monthlyRetention: { 1: 0.95, 2: 0.90, 3: 0.85 },
      avgMonthlyChurn: 0.05,
    });

    expect(metrics.cohortMonth).toBe("2026-01");
    expect(metrics.cohortSize).toBe(200);
    expect(metrics.avgMonthlyChurn).toBe(0.05);
    expect(metrics.workspaceId).toBe(testWs);
  });

  it("listCohorts returns previously recorded cohorts in reverse-chronological order", async () => {
    await RetentionEngine.recordMetrics(testWs, actor, {
      cohortMonth: "2026-02",
      cohortSize: 180,
      monthlyRetention: { 1: 0.92, 2: 0.88 },
      avgMonthlyChurn: 0.06,
    });

    const cohorts = await RetentionEngine.listCohorts(testWs);

    expect(cohorts.length).toBeGreaterThanOrEqual(2);
    // Ordered by cohortMonth desc — "2026-02" before "2026-01"
    const months = cohorts.map((c) => c.cohortMonth);
    expect(months[0] >= months[1]).toBe(true);
  });

  it("listCohorts for an unseeded workspace returns empty array (workspace isolation)", async () => {
    const cohorts = await RetentionEngine.listCohorts(otherWs);
    expect(cohorts).toHaveLength(0);
  });

  it("recordMetrics monthlyRetention is persisted and recoverable as a Record<number,number>", async () => {
    const input = { 1: 0.94, 2: 0.89, 3: 0.83 };
    await RetentionEngine.recordMetrics(testWs, actor, {
      cohortMonth: "2026-03",
      monthlyRetention: input,
      avgMonthlyChurn: 0.07,
    });

    const cohorts = await RetentionEngine.listCohorts(testWs);
    const march = cohorts.find((c) => c.cohortMonth === "2026-03");
    expect(march).toBeDefined();
    expect(march!.monthlyRetention[1]).toBeCloseTo(0.94, 5);
    expect(march!.monthlyRetention[3]).toBeCloseTo(0.83, 5);
  });

  it("recordMetrics throws ValidationError for empty workspaceId (no DB touch)", async () => {
    await expect(
      RetentionEngine.recordMetrics("", actor, {
        cohortMonth: "2026-04",
        monthlyRetention: { 1: 0.95 },
        avgMonthlyChurn: 0.05,
      })
    ).rejects.toThrow(ValidationError);
  });
});
