/**
 * Phase 4: Waste/Leakage Detection — DB proof
 *
 * `[db]`-gated. Proves: leakage events persist to PostgreSQL; status transitions
 * are enforced; recurrence counter increments; recovery amount is required for
 * verified status; workspace isolation prevents cross-workspace reads; summary
 * aggregates correctly across categories.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-mode/waste-leakage.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  recordLeakageEvent,
  updateLeakageStatus,
  incrementRecurrence,
  listLeakageEvents,
  getLeakageSummary,
} from "@/services/owner-mode/waste-leakage.service";
import { NotFoundError, ValidationError } from "@/infra/errors";

const actor = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `waste-leak-${actor}@example.com`,
      name: "Waste Leak Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

afterAll(async () => {
  await db.wasteLeakageEvent.deleteMany({ where: { workspaceId: wsA } });
  await db.wasteLeakageEvent.deleteMany({ where: { workspaceId: wsB } });
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
});

describe("[db] Phase 4 — Waste/Leakage Detection persistence", () => {
  it("[db] persists a leakage event with all fields", async () => {
    const eventId = await recordLeakageEvent({
      workspaceId: wsA,
      actorId: actor,
      category: "DISCOUNT_LEAK",
      source: "finance",
      amount: 1500,
      currency: "GBP",
      detectedAt: new Date("2026-07-01"),
      materialityThreshold: 500,
      confidenceLevel: "HIGH",
      description: "Repeated 20% discounts to single customer without approval",
    });

    expect(eventId).toBeTruthy();

    const row = await db.wasteLeakageEvent.findFirst({ where: { id: eventId } });
    expect(row).toBeTruthy();
    expect(row!.workspaceId).toBe(wsA);
    expect(row!.category).toBe("DISCOUNT_LEAK");
    expect(row!.source).toBe("finance");
    expect(row!.amount).toBe(1500);
    expect(row!.currency).toBe("GBP");
    expect(row!.status).toBe("detected");
    expect(row!.materialityThreshold).toBe(500);
    expect(row!.confidenceLevel).toBe("HIGH");
    expect(row!.description).toBe("Repeated 20% discounts to single customer without approval");
    expect(row!.recurrenceCount).toBe(0);
    expect(row!.recoveryAmount).toBeNull();
    expect(row!.verifiedAt).toBeNull();
  });

  it("[db] persists minimal leakage event (nulls for optional fields)", async () => {
    const eventId = await recordLeakageEvent({
      workspaceId: wsA,
      actorId: actor,
      category: "REWORK",
      source: "operations",
      detectedAt: new Date(),
    });

    const row = await db.wasteLeakageEvent.findFirst({ where: { id: eventId } });
    expect(row!.amount).toBeNull();
    expect(row!.evidenceId).toBeNull();
    expect(row!.materialityThreshold).toBeNull();
    expect(row!.confidenceLevel).toBe("LOW");
    expect(row!.status).toBe("detected");
  });

  it("[db] advances status through lifecycle: detected → investigating → confirmed", async () => {
    const eventId = await recordLeakageEvent({
      workspaceId: wsA,
      actorId: actor,
      category: "IDLE_CAPACITY",
      source: "operations",
      amount: 3000,
      detectedAt: new Date(),
    });

    await updateLeakageStatus(eventId, {
      workspaceId: wsA,
      actorId: actor,
      newStatus: "investigating",
    });
    const investigating = await db.wasteLeakageEvent.findFirst({ where: { id: eventId } });
    expect(investigating!.status).toBe("investigating");

    await updateLeakageStatus(eventId, {
      workspaceId: wsA,
      actorId: actor,
      newStatus: "confirmed",
    });
    const confirmed = await db.wasteLeakageEvent.findFirst({ where: { id: eventId } });
    expect(confirmed!.status).toBe("confirmed");
  });

  it("[db] requires recoveryAmount when verifying recovery", async () => {
    const eventId = await recordLeakageEvent({
      workspaceId: wsA,
      actorId: actor,
      category: "SUPPLIER_OVERCHARGE",
      source: "supplier",
      amount: 800,
      detectedAt: new Date(),
    });

    await expect(
      updateLeakageStatus(eventId, {
        workspaceId: wsA,
        actorId: actor,
        newStatus: "verified",
        // recoveryAmount intentionally omitted
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("[db] persists verified recovery with amount and timestamp", async () => {
    const eventId = await recordLeakageEvent({
      workspaceId: wsA,
      actorId: actor,
      category: "SUPPLIER_OVERCHARGE",
      source: "supplier",
      amount: 1200,
      detectedAt: new Date(),
    });

    await updateLeakageStatus(eventId, {
      workspaceId: wsA,
      actorId: actor,
      newStatus: "verified",
      recoveryAmount: 900,
    });

    const row = await db.wasteLeakageEvent.findFirst({ where: { id: eventId } });
    expect(row!.status).toBe("verified");
    expect(row!.recoveryAmount).toBe(900);
    expect(row!.verifiedAt).not.toBeNull();
    expect(row!.verifiedBy).toBe(actor);
  });

  it("[db] persists dismissal with reason", async () => {
    const eventId = await recordLeakageEvent({
      workspaceId: wsA,
      actorId: actor,
      category: "OTHER",
      source: "finance",
      detectedAt: new Date(),
    });

    await updateLeakageStatus(eventId, {
      workspaceId: wsA,
      actorId: actor,
      newStatus: "dismissed",
      dismissalReason: "False positive — one-off customer adjustment",
    });

    const row = await db.wasteLeakageEvent.findFirst({ where: { id: eventId } });
    expect(row!.status).toBe("dismissed");
    expect(row!.dismissalReason).toBe("False positive — one-off customer adjustment");
  });

  it("[db] increments recurrence counter", async () => {
    const eventId = await recordLeakageEvent({
      workspaceId: wsA,
      actorId: actor,
      category: "REWORK",
      source: "quality",
      detectedAt: new Date(),
    });

    await incrementRecurrence(eventId, wsA);
    await incrementRecurrence(eventId, wsA);

    const row = await db.wasteLeakageEvent.findFirst({ where: { id: eventId } });
    expect(row!.recurrenceCount).toBe(2);
  });

  it("[db] updateLeakageStatus throws NotFoundError for wrong workspace", async () => {
    const eventId = await recordLeakageEvent({
      workspaceId: wsA,
      actorId: actor,
      category: "UNDERPRICING",
      source: "sales",
      detectedAt: new Date(),
    });

    await expect(
      updateLeakageStatus(eventId, {
        workspaceId: wsB,
        actorId: actor,
        newStatus: "confirmed",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] listLeakageEvents excludes dismissed events", async () => {
    const wsC = randomUUID();
    const activeId = await recordLeakageEvent({
      workspaceId: wsC,
      actorId: actor,
      category: "REWORK",
      source: "operations",
      detectedAt: new Date(),
    });
    const dismissedId = await recordLeakageEvent({
      workspaceId: wsC,
      actorId: actor,
      category: "OTHER",
      source: "finance",
      detectedAt: new Date(),
    });

    await updateLeakageStatus(dismissedId, {
      workspaceId: wsC,
      actorId: actor,
      newStatus: "dismissed",
      dismissalReason: "noise",
    });

    const events = await listLeakageEvents(wsC);
    expect(events.some((e) => e.id === activeId)).toBe(true);
    expect(events.some((e) => e.id === dismissedId)).toBe(false);

    // Cleanup isolated workspace
    await db.wasteLeakageEvent.deleteMany({ where: { workspaceId: wsC } });
  });

  it("[db] getLeakageSummary aggregates totalDetected, totalConfirmed, totalVerifiedRecovery", async () => {
    const wsD = randomUUID();
    // 2 detected, 1 confirmed, 1 verified
    await recordLeakageEvent({ workspaceId: wsD, actorId: actor, category: "DISCOUNT_LEAK", source: "finance", amount: 500, detectedAt: new Date() });
    await recordLeakageEvent({ workspaceId: wsD, actorId: actor, category: "REWORK", source: "operations", amount: 300, detectedAt: new Date() });

    const confirmedId = await recordLeakageEvent({ workspaceId: wsD, actorId: actor, category: "IDLE_CAPACITY", source: "operations", amount: 1000, detectedAt: new Date() });
    await updateLeakageStatus(confirmedId, { workspaceId: wsD, actorId: actor, newStatus: "confirmed" });

    const verifiedId = await recordLeakageEvent({ workspaceId: wsD, actorId: actor, category: "SUPPLIER_OVERCHARGE", source: "supplier", amount: 2000, detectedAt: new Date() });
    await updateLeakageStatus(verifiedId, { workspaceId: wsD, actorId: actor, newStatus: "verified", recoveryAmount: 1800 });

    const summary = await getLeakageSummary(wsD);
    expect(summary.totalDetected).toBe(4); // none dismissed
    expect(summary.totalConfirmed).toBe(2); // confirmed + verified
    expect(summary.totalVerifiedRecovery).toBe(1800);
    expect(summary.topSources.length).toBeGreaterThanOrEqual(1);
    expect(summary.topSources.length).toBeLessThanOrEqual(3);

    // Cleanup isolated workspace
    await db.wasteLeakageEvent.deleteMany({ where: { workspaceId: wsD } });
  });

  it("[db] getLeakageSummary returns empty summary for workspace with no events", async () => {
    const emptyWs = randomUUID();
    const summary = await getLeakageSummary(emptyWs);
    expect(summary.totalDetected).toBe(0);
    expect(summary.totalConfirmed).toBe(0);
    expect(summary.totalVerifiedRecovery).toBe(0);
    expect(summary.topSources).toHaveLength(0);
  });

  it("[db] listLeakageEvents isolates by workspace — wsA events not visible from wsB", async () => {
    await recordLeakageEvent({
      workspaceId: wsB,
      actorId: actor,
      category: "REWORK",
      source: "quality",
      detectedAt: new Date(),
    });

    const wsAEvents = await listLeakageEvents(wsA);
    const wsBEvents = await listLeakageEvents(wsB);

    expect(wsAEvents.every((e) => e.workspaceId === wsA)).toBe(true);
    expect(wsBEvents.every((e) => e.workspaceId === wsB)).toBe(true);
    expect(wsAEvents.some((e) => e.workspaceId === wsB)).toBe(false);
  });
});
