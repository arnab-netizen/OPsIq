/**
 * Real-Postgres proof of the capacity-increase safety guard: a refused increase changes nothing (no row change, no
 * version bump, no audit event), an authorized increase writes the reason and actor into the existing
 * capacity_changed audit event, and a confirmation can never authorize a different value. The mocked matrix lives in
 * platform-settings-capacity-increase.test.ts; the concurrent-writer case is in platform-capacity-locking.db.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { updatePlatformSettings } from "@/services/beta/platform-settings.service";
import { ValidationError } from "@/infra/errors";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] platform capacity — increase guard", () => {
  const ADMIN = "33333333-3333-4333-8333-333333333331";

  beforeAll(async () => {
    await db.user.upsert({
      where: { id: ADMIN },
      update: {},
      create: { id: ADMIN, email: `capguard-admin-${ADMIN}@example.com`, updatedAt: new Date() },
    });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: ADMIN } }).catch(() => undefined);
    await db.user.deleteMany({ where: { id: ADMIN } }).catch(() => undefined);
  });

  beforeEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    await db.auditEvent.deleteMany({ where: { actorId: ADMIN } });
  });

  afterEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
  });

  const seed = (admissionMode: string, capacityLimit: number) =>
    db.platformSetting.create({ data: { id: "global", admissionMode, capacityLimit, updatedBy: "test-seed" } });
  const auditNames = async () =>
    (await db.auditEvent.findMany({ where: { actorId: ADMIN }, select: { eventName: true } })).map((e: { eventName: string }) => e.eventName);

  it("[db] INVITE_ONLY -> OPEN_BETA with capacity 10 stores OPEN_BETA / 10 and writes no capacity audit event", async () => {
    await seed("INVITE_ONLY", 10);
    await updatePlatformSettings({ actorId: ADMIN, admissionMode: "OPEN_BETA" });
    const row = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });
    expect(row).toMatchObject({ admissionMode: "OPEN_BETA", capacityLimit: 10 });
    expect(await auditNames()).toEqual(["platform_settings.admission_mode_changed"]);
  });

  it("[db] a refused increase leaves the row, its version and the audit log untouched — even with a mode in the same request", async () => {
    await seed("INVITE_ONLY", 10);
    const before = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });

    await expect(updatePlatformSettings({ actorId: ADMIN, admissionMode: "OPEN_BETA", capacityLimit: 1000, reason: "no confirmation given" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updatePlatformSettings({ actorId: ADMIN, capacityLimit: 25, capacityIncreaseConfirmation: { from: 10, to: 25 } })).rejects.toBeInstanceOf(ValidationError);
    await expect(updatePlatformSettings({ actorId: ADMIN, capacityLimit: 1000, capacityIncreaseConfirmation: { from: 10, to: 25 }, reason: "wrong value" })).rejects.toBeInstanceOf(ValidationError);

    const after = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });
    expect(after).toMatchObject({ admissionMode: "INVITE_ONLY", capacityLimit: 10, version: before.version });
    expect(await auditNames()).toEqual([]);
  });

  it("[db] an exact confirmation with a reason raises capacity and the existing capacity_changed audit event records old value, new value, reason and actor", async () => {
    await seed("OPEN_BETA", 10);
    await updatePlatformSettings({ actorId: ADMIN, capacityLimit: 25, capacityIncreaseConfirmation: { from: 10, to: 25 }, reason: "Second wave of invitees" });

    const row = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });
    expect(row.capacityLimit).toBe(25);
    const events = await db.auditEvent.findMany({ where: { actorId: ADMIN, eventName: "platform_settings.capacity_changed" } });
    expect(events).toHaveLength(1);
    expect(events[0].actorId).toBe(ADMIN);
    expect(events[0].payload).toMatchObject({ oldValue: 10, newValue: 25, reason: "Second wave of invitees" });
  });

  it("[db] lowering capacity from the emergency ceiling needs no increase confirmation", async () => {
    await seed("OPEN_BETA", 1000);
    await updatePlatformSettings({ actorId: ADMIN, capacityLimit: 10 });
    const row = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });
    expect(row.capacityLimit).toBe(10);
    const events = await db.auditEvent.findMany({ where: { actorId: ADMIN, eventName: "platform_settings.capacity_changed" } });
    expect(events[0].payload).toMatchObject({ oldValue: 1000, newValue: 10 });
  });

  it("[db] a stale confirmation made against an older capacity is refused once capacity has moved", async () => {
    await seed("OPEN_BETA", 10);
    await updatePlatformSettings({ actorId: ADMIN, capacityLimit: 20, capacityIncreaseConfirmation: { from: 10, to: 20 }, reason: "first" });
    await expect(
      updatePlatformSettings({ actorId: ADMIN, capacityLimit: 30, capacityIncreaseConfirmation: { from: 10, to: 30 }, reason: "stale page" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } })).capacityLimit).toBe(20);
  });
});
