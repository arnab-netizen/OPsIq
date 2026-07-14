/**
 * Capability 5 — Owner Action Outcome service (DB-backed).
 *
 * Proves: create→read cycle, workspace isolation, deterministic delta
 * computation, invalid-vocabulary rejection, and NotFoundError on missing
 * business.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/owner-action-outcome.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  recordOwnerActionOutcome,
  listOwnerActionOutcomes,
} from "@/services/owner-mode/owner-action-outcome.service";
import { ValidationError, NotFoundError } from "@/infra/errors";

const actor = randomUUID();
const testWs = randomUUID();  // ClientAccount.id shared with OwnerBusiness.workspaceId
const otherWs = randomUUID(); // never seeded — proves workspace isolation

let businessId: string;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Capability 5 — OwnerActionOutcome service", () => {
  beforeAll(async () => {
    // User (FK anchor for audit events and createdBy fields).
    await db.user.upsert({
      where: { id: actor },
      update: {},
      create: {
        id: actor,
        email: `outcome-test-${actor}@test.local`,
        name: "OutcomeTest",
        isActive: true,
        updatedAt: new Date(),
      },
    });

    // ClientAccount — required because OwnerActionOutcome.workspaceId is FK to ClientAccount.id.
    await db.clientAccount.upsert({
      where: { id: testWs },
      update: {},
      create: {
        id: testWs,
        name: `OutcomeTest WS ${testWs}`,
        status: "active",
        visibility: "internal",
        updatedAt: new Date(),
      },
    });

    // OwnerBusiness — required for service's ownership check.
    const biz = await db.ownerBusiness.create({
      data: {
        id: randomUUID(),
        workspaceId: testWs,
        name: "Outcome Test Business",
        businessType: "generic_local_service",
        currency: "INR",
        createdBy: actor,
      },
    });
    businessId = biz.id;
  });

  afterAll(async () => {
    // Outcomes must be removed before ClientAccount (FK constraint).
    await db.ownerActionOutcome.deleteMany({ where: { workspaceId: testWs } });
    await db.ownerBusiness.deleteMany({ where: { workspaceId: testWs } });
    await db.clientAccount.delete({ where: { id: testWs } });
    await db.auditEvent.deleteMany({ where: { actorId: actor } });
    await db.user.delete({ where: { id: actor } });
  });

  it("records an outcome and retrieves it from the list", async () => {
    const result = await recordOwnerActionOutcome(testWs, actor, {
      businessId,
      outcomeStatus: "worked",
      ownerReportedResult: "Revenue increased by 8% in 30 days",
      evidenceQuality: "moderate",
    });

    expect(result.id).toBeTruthy();
    expect(result.workspaceId).toBe(testWs);
    expect(result.businessId).toBe(businessId);
    expect(result.outcomeStatus).toBe("worked");
    expect(result.ownerReportedResult).toBe("Revenue increased by 8% in 30 days");
    expect(result.evidenceQuality).toBe("moderate");

    const outcomes = await listOwnerActionOutcomes(testWs, businessId);
    expect(outcomes.some((o) => o.id === result.id)).toBe(true);
  });

  it("computes absoluteChange and percentageChange deterministically", async () => {
    const result = await recordOwnerActionOutcome(testWs, actor, {
      businessId,
      outcomeStatus: "partially_worked",
      actualMetricName: "weekly_revenue",
      beforeValue: 50000,
      afterValue: 55000,
      evidenceQuality: "strong",
    });

    expect(result.beforeValue).toBe(50000);
    expect(result.afterValue).toBe(55000);
    expect(result.absoluteChange).toBe(5000);
    // percentageChange = (5000 / 50000) * 100 = 10
    expect(result.percentageChange).toBeCloseTo(10, 5);
  });

  it("computes absoluteChange correctly for negative-before baseline", async () => {
    const result = await recordOwnerActionOutcome(testWs, actor, {
      businessId,
      outcomeStatus: "did_not_work",
      actualMetricName: "cash_position",
      beforeValue: -10000,
      afterValue: -8000,
    });

    expect(result.absoluteChange).toBe(2000);
    // percentageChange = (2000 / Math.abs(-10000)) * 100 = 20
    expect(result.percentageChange).toBeCloseTo(20, 5);
  });

  it("sets percentageChange to null when beforeValue is zero", async () => {
    const result = await recordOwnerActionOutcome(testWs, actor, {
      businessId,
      outcomeStatus: "not_measurable",
      beforeValue: 0,
      afterValue: 5000,
    });

    expect(result.absoluteChange).toBe(5000);
    expect(result.percentageChange).toBeNull();
  });

  it("leaves absoluteChange and percentageChange null when values are absent", async () => {
    const result = await recordOwnerActionOutcome(testWs, actor, {
      businessId,
      outcomeStatus: "too_early_to_judge",
      ownerReportedResult: "Still in progress",
    });

    expect(result.absoluteChange).toBeNull();
    expect(result.percentageChange).toBeNull();
  });

  it("records externalEventFlag and description", async () => {
    const result = await recordOwnerActionOutcome(testWs, actor, {
      businessId,
      outcomeStatus: "external_event_interference",
      externalEventFlag: true,
      externalEventDescription: "Flood disrupted operations for 2 weeks",
    });

    expect(result.externalEventFlag).toBe(true);
    expect(result.externalEventDescription).toBe("Flood disrupted operations for 2 weeks");
  });

  it("workspace isolation: otherWs cannot list outcomes seeded in testWs", async () => {
    const outcomes = await listOwnerActionOutcomes(otherWs, businessId).catch(() => null);
    // Service throws NotFoundError because businessId is not in otherWs; outcomes will be null or empty.
    expect(outcomes).toBeNull();
  });

  it("rejects an invalid outcomeStatus with ValidationError", async () => {
    await expect(
      recordOwnerActionOutcome(testWs, actor, {
        businessId,
        outcomeStatus: "completely_made_up" as never,
      })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an invalid evidenceQuality with ValidationError", async () => {
    await expect(
      recordOwnerActionOutcome(testWs, actor, {
        businessId,
        outcomeStatus: "worked",
        evidenceQuality: "uncertain" as never,
      })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a non-existent businessId with NotFoundError", async () => {
    await expect(
      recordOwnerActionOutcome(testWs, actor, {
        businessId: randomUUID(),
        outcomeStatus: "worked",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("list is ordered by createdAt desc (most recent first)", async () => {
    const outcomes = await listOwnerActionOutcomes(testWs, businessId);
    expect(outcomes.length).toBeGreaterThan(1);
    for (let i = 1; i < outcomes.length; i++) {
      expect(outcomes[i - 1].createdAt >= outcomes[i].createdAt).toBe(true);
    }
  });
});
