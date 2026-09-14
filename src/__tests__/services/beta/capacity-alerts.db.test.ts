/**
 * [db] Capacity alerts — 80%/100% tier-crossing state machine. Real Postgres
 * (real PlatformSetting/CapacityAlertState/Workspace rows) so the actual
 * count/limit computation and the conditional-update race guard are
 * exercised for real, not just the pure tier arithmetic.
 *
 * Scenario per mission Stage 3 §14: 0->80, 80 sustained, 80->100, 100
 * sustained, 100->0 after cap increase, 0->80 again, and a capacity DECREASE
 * that crosses a threshold — driven as one continuous narrative against a
 * cap of 10, matching the exact example in the approved design (20/20=100%,
 * cap->40, 20/40=50%, later 32/40=80% alerts again — scaled down to keep
 * workspace seeding fast).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/beta/capacity-alerts.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const sendMock = vi.fn();
vi.mock("@/lib/integrations/email-provider", () => ({
  getEmailProvider: vi.fn(() => ({ send: sendMock })),
}));

import { checkAndSendCapacityAlert } from "@/services/beta/capacity-alerts.service";
import { updatePlatformSettings } from "@/services/beta/platform-settings.service";

const ACTOR_ID = "55555555-5555-4555-8555-555555555555";
const ORIGINAL_RECIPIENT = process.env.BETA_REQUEST_NOTIFICATION_EMAIL;

async function seedWorkspaces(count: number, seededIds: string[]) {
  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    seededIds.push(id);
    await db.workspace.create({
      data: { id, name: `Alert WS ${i}`, slug: `alert-ws-${id.slice(0, 8)}`, signupSource: "PUBLIC_BETA" },
    });
  }
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] capacity alerts — tier-crossing state machine", () => {
  const workspaceIds: string[] = [];

  beforeAll(async () => {
    await db.user.upsert({
      where: { id: ACTOR_ID },
      update: {},
      create: { id: ACTOR_ID, email: `alerts-actor-${ACTOR_ID}@example.com`, updatedAt: new Date() },
    });
    process.env.BETA_REQUEST_NOTIFICATION_EMAIL = "owner@opsiq.example";
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: ACTOR_ID } }).catch(() => undefined);
    await db.user.delete({ where: { id: ACTOR_ID } }).catch(() => undefined);
    if (ORIGINAL_RECIPIENT === undefined) delete process.env.BETA_REQUEST_NOTIFICATION_EMAIL;
    else process.env.BETA_REQUEST_NOTIFICATION_EMAIL = ORIGINAL_RECIPIENT;
  });

  beforeEach(async () => {
    sendMock.mockClear();
    sendMock.mockResolvedValue({ accepted: true });
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    await db.capacityAlertState.deleteMany({ where: { id: "global" } });
    await db.platformSetting.create({ data: { id: "global", admissionMode: "OPEN_BETA", capacityLimit: 10, updatedBy: ACTOR_ID } });
  });

  afterEach(async () => {
    if (workspaceIds.length) {
      await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      workspaceIds.length = 0;
    }
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    await db.capacityAlertState.deleteMany({ where: { id: "global" } });
    await db.auditEvent.deleteMany({ where: { entityId: "global", eventName: "platform_settings.capacity_alert_sent" } });
  });

  it("[db] 0 -> 80: crossing 80% sends exactly one alert", async () => {
    await seedWorkspaces(8, workspaceIds); // 8/10 = 80%
    await checkAndSendCapacityAlert();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].subject).toContain("80%");
    const state = await db.capacityAlertState.findUniqueOrThrow({ where: { id: "global" } });
    expect(state.lastThresholdSent).toBe(80);
  });

  it("[db] 80 sustained: repeated checks while still at/above 80% (below 100%) never re-alert", async () => {
    await seedWorkspaces(8, workspaceIds);
    await checkAndSendCapacityAlert();
    await checkAndSendCapacityAlert();
    await checkAndSendCapacityAlert();
    expect(sendMock).toHaveBeenCalledTimes(1); // only the first crossing
  });

  it("[db] 80 -> 100: reaching 100% sends a second alert", async () => {
    await seedWorkspaces(8, workspaceIds);
    await checkAndSendCapacityAlert(); // 80%
    await seedWorkspaces(2, workspaceIds); // now 10/10 = 100%
    await checkAndSendCapacityAlert();
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[1][0].subject).toContain("100%");
    const state = await db.capacityAlertState.findUniqueOrThrow({ where: { id: "global" } });
    expect(state.lastThresholdSent).toBe(100);
  });

  it("[db] 100 sustained: repeated checks at 100% never re-alert", async () => {
    await seedWorkspaces(10, workspaceIds);
    await checkAndSendCapacityAlert();
    await checkAndSendCapacityAlert();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("[db] 100 -> 0 after a capacity increase: silently resets, no alert on the way down", async () => {
    await seedWorkspaces(10, workspaceIds); // 10/10 = 100%
    await checkAndSendCapacityAlert();
    expect(sendMock).toHaveBeenCalledTimes(1);

    await updatePlatformSettings({ actorId: ACTOR_ID, capacityLimit: 40 }); // 10/40 = 25% -> tier 0, triggers the alert check itself
    expect(sendMock).toHaveBeenCalledTimes(1); // still just the original — the reset itself is silent

    const state = await db.capacityAlertState.findUniqueOrThrow({ where: { id: "global" } });
    expect(state.lastThresholdSent).toBe(0);
  });

  it("[db] 0 -> 80 again: a later re-crossing of 80% after the reset above fires a NEW alert", async () => {
    await seedWorkspaces(10, workspaceIds); // 100%
    await checkAndSendCapacityAlert();
    await updatePlatformSettings({ actorId: ACTOR_ID, capacityLimit: 40 }); // resets to 0, silent
    sendMock.mockClear();

    await seedWorkspaces(22, workspaceIds); // 32/40 = 80%
    await checkAndSendCapacityAlert();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].subject).toContain("80%");
  });

  it("[db] capacity DECREASE that crosses a threshold alerts (not just increases in utilization)", async () => {
    await seedWorkspaces(5, workspaceIds); // 5/10 = 50%, below 80%
    await checkAndSendCapacityAlert();
    expect(sendMock).toHaveBeenCalledTimes(0);

    await updatePlatformSettings({ actorId: ACTOR_ID, capacityLimit: 6 }); // 5/6 ≈ 83% -> crosses 80% via a DECREASE
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].subject).toContain("80%");
  });

  it("[db] email-provider failure does not corrupt capacity/signup state or throw", async () => {
    sendMock.mockRejectedValueOnce(new Error("provider down"));
    await seedWorkspaces(8, workspaceIds); // 80%
    await expect(checkAndSendCapacityAlert()).resolves.toBeUndefined(); // never throws
    const state = await db.capacityAlertState.findUniqueOrThrow({ where: { id: "global" } });
    expect(state.lastThresholdSent).toBe(80); // state transition still recorded
    const settings = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });
    expect(settings.capacityLimit).toBe(10); // capacity itself untouched
  });
});
