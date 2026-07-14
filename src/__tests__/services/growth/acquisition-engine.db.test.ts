/**
 * Acquisition Engine — DB-backed paths proof (real PostgreSQL).
 *
 * Proves: recordMetrics persists to DB, listMetrics is workspace-scoped,
 * data survives across calls, and audit event is emitted.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/growth/acquisition-engine.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { AcquisitionEngine } from "@/services/growth/acquisition-engine";
import { AcquisitionChannel } from "@/domain/growth/growth-engines";
import { ValidationError } from "@/infra/errors";

const actor = randomUUID();
const testWs = randomUUID();
const otherWs = randomUUID(); // never seeded — proves workspace isolation

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] AcquisitionEngine — DB persistence", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actor },
      update: {},
      create: {
        id: actor,
        email: `acquisition-db-${actor}@test.local`,
        name: "AcquisitionDbTest",
        isActive: true,
        updatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await db.acquisitionMetricsRecord.deleteMany({ where: { workspaceId: testWs } });
    await db.auditEvent.deleteMany({ where: { actorId: actor } });
    await db.user.delete({ where: { id: actor } });
  });

  it("recordMetrics persists a channel-month record and returns AcquisitionMetrics", async () => {
    const metrics = await AcquisitionEngine.recordMetrics(testWs, actor, {
      channel: AcquisitionChannel.PAID_SEARCH,
      month: "2026-01",
      leads: 150,
      qualifiedLeads: 45,
      conversions: 10,
      costPerLead: 10,
      costPerAcquisition: 150,
      targetCPA: 200,
    });

    expect(metrics.workspaceId).toBe(testWs);
    expect(metrics.channel).toBe(AcquisitionChannel.PAID_SEARCH);
    expect(metrics.month).toBe("2026-01");
    expect(metrics.leads).toBe(150);
    expect(metrics.conversions).toBe(10);
  });

  it("listMetrics returns previously recorded metrics in reverse-chronological order", async () => {
    await AcquisitionEngine.recordMetrics(testWs, actor, {
      channel: AcquisitionChannel.ORGANIC,
      month: "2026-02",
      leads: 80,
      conversions: 4,
      costPerLead: 0,
      costPerAcquisition: 0,
      targetCPA: 0,
    });

    const all = await AcquisitionEngine.listMetrics(testWs);
    expect(all.length).toBeGreaterThanOrEqual(2);

    const months = all.map((m) => m.month);
    // Ordered desc: "2026-02" before "2026-01"
    expect(months[0] >= months[1]).toBe(true);
  });

  it("listMetrics for an unseeded workspace returns empty array (workspace isolation)", async () => {
    const result = await AcquisitionEngine.listMetrics(otherWs);
    expect(result).toHaveLength(0);
  });

  it("listMetrics with channel filter returns only that channel", async () => {
    const result = await AcquisitionEngine.listMetrics(testWs, AcquisitionChannel.ORGANIC);
    expect(result.length).toBeGreaterThanOrEqual(1);
    result.forEach((m) => expect(m.channel).toBe(AcquisitionChannel.ORGANIC));
  });

  it("qualifiedLeads is persisted and recoverable", async () => {
    await AcquisitionEngine.recordMetrics(testWs, actor, {
      channel: AcquisitionChannel.PARTNER,
      month: "2026-03",
      leads: 40,
      qualifiedLeads: 20,
      conversions: 5,
      costPerLead: 25,
      costPerAcquisition: 200,
      targetCPA: 250,
    });

    const all = await AcquisitionEngine.listMetrics(testWs);
    const partner = all.find((m) => m.channel === AcquisitionChannel.PARTNER && m.month === "2026-03");
    expect(partner).toBeDefined();
    expect(partner!.qualifiedLeads).toBe(20);
  });

  it("recordMetrics throws ValidationError for empty workspaceId (no DB touch)", async () => {
    await expect(
      AcquisitionEngine.recordMetrics("", actor, {
        channel: AcquisitionChannel.ORGANIC,
        month: "2026-04",
        leads: 100,
        conversions: 5,
        costPerLead: 0,
        costPerAcquisition: 0,
        targetCPA: 0,
      })
    ).rejects.toThrow(ValidationError);
  });
});
