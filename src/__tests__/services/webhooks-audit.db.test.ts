/**
 * [db] P0-02 (production trust/governance closure) — real-PostgreSQL webhook
 * audit proof.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/webhooks-audit.db.test.ts
 *
 * The mocked unit tests in src/__tests__/api/webhooks.test.ts prove the audit
 * field-mapping is *structurally* correct (right keys, right shape) against a
 * fake emitAuditEvent. This file proves the *complete real chain* instead:
 * registerWebhook()/deleteWebhook() (the actual production service functions,
 * unmocked) → emitAuditEvent() → Prisma → a real disposable PostgreSQL
 * database — not Neon, not production.
 *
 * While writing this test, code review (cross-referencing
 * prisma/schema.prisma's `AuditEvent.actorId @db.Uuid` against
 * deleteWebhook's old `actorId: string = "system"` default) surfaced a real
 * defect: "system" is not a valid UUID, so any call to deleteWebhook()
 * without an explicit actor would have thrown a Postgres constraint error on
 * the audit insert the first time it ran against a real database. Fixed in
 * src/services/webhooks.service.ts (actorId is now optional with no invalid
 * default, matching emitAuditEvent's own `actorId ?? null` handling for a
 * nullable column) as part of this same P0-02 closure.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { registerWebhook, deleteWebhook, clearWebhooks } from "@/services/webhooks.service";

const WS_A = randomUUID();
const WS_B = randomUUID();
const USER_CREATOR = randomUUID();
const USER_DELETER = randomUUID();

async function seedWorkspace(id: string, slug: string) {
  await db.workspace.create({ data: { id, name: `Webhook Audit Test WS ${slug}`, slug } });
}

async function seedUser(id: string, email: string) {
  await db.user.create({ data: { id, email, isActive: true, updatedAt: new Date() } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] P0-02: webhook audit — real Postgres proof", () => {
  beforeAll(async () => {
    await seedWorkspace(WS_A, `webhook-audit-a-${WS_A.slice(0, 8)}`);
    await seedWorkspace(WS_B, `webhook-audit-b-${WS_B.slice(0, 8)}`);
    await seedUser(USER_CREATOR, `webhook-audit-creator-${USER_CREATOR.slice(0, 8)}@test.local`);
    await seedUser(USER_DELETER, `webhook-audit-deleter-${USER_DELETER.slice(0, 8)}@test.local`);
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [WS_A, WS_B] } } });
    await db.workspace.deleteMany({ where: { id: { in: [WS_A, WS_B] } } });
    await db.user.deleteMany({ where: { id: { in: [USER_CREATOR, USER_DELETER] } } });
  });

  beforeEach(() => {
    // webhookStore is an in-memory module singleton — reset between tests so
    // registrations from one test don't leak into another's assertions.
    clearWebhooks();
  });

  it("TEST A — registerWebhook() persists exactly the expected AuditEvent in real Postgres", async () => {
    const url = "https://example.com/webhook-audit-test-a";
    const events = ["action:created", "decision:updated"];

    const webhook = await registerWebhook(WS_A, url, events, USER_CREATOR);

    // 1. registration succeeds as currently designed
    expect(webhook.id).toBeDefined();
    expect(webhook.workspaceId).toBe(WS_A);

    const auditRow = await db.auditEvent.findFirst({
      where: { workspaceId: WS_A, entityId: webhook.id, eventName: AUDIT_EVENTS.WEBHOOK_CREATED },
    });

    // 2. exactly the expected audit event is persisted (not silently dropped)
    expect(auditRow).not.toBeNull();
    // 3. workspaceId is correct
    expect(auditRow?.workspaceId).toBe(WS_A);
    // 4. actor identity is correct
    expect(auditRow?.actorId).toBe(USER_CREATOR);
    // 5. eventName is correct
    expect(auditRow?.eventName).toBe("webhook.created");
    // 6. entity/resource identifier is correct
    expect(auditRow?.entityType).toBe("webhook");
    expect(auditRow?.entityId).toBe(webhook.id);
    // 7. payload survives the camelCase mapping (url/events, not url/event or
    //    snake_case) — this is the exact class of bug P0-02 fixed.
    expect(auditRow?.payload).toMatchObject({ url, events });
  });

  it("TEST B — deleteWebhook() persists exactly the expected AuditEvent, distinguishable from create", async () => {
    const webhook = await registerWebhook(
      WS_A,
      "https://example.com/webhook-audit-test-b",
      ["action:created"],
      USER_CREATOR
    );

    // Deleted by a DIFFERENT actor than the creator, to prove actor identity
    // is captured per-event rather than inherited from creation.
    await deleteWebhook(webhook.id, WS_A, USER_DELETER);

    const deleteRow = await db.auditEvent.findFirst({
      where: { workspaceId: WS_A, entityId: webhook.id, eventName: AUDIT_EVENTS.WEBHOOK_DELETED },
    });

    // 1. deletion succeeds according to existing contract (no throw above)
    // 2. corresponding delete audit event is persisted
    expect(deleteRow).not.toBeNull();
    // 3. workspaceId is correct
    expect(deleteRow?.workspaceId).toBe(WS_A);
    // 4. actor identity is correct (the deleter, not the creator)
    expect(deleteRow?.actorId).toBe(USER_DELETER);
    // 5. webhook/resource identity is correct
    expect(deleteRow?.entityType).toBe("webhook");
    expect(deleteRow?.entityId).toBe(webhook.id);

    // 7. create and delete audit records are distinguishable (both exist,
    //    same entityId, different eventName and different actor)
    const createRow = await db.auditEvent.findFirst({
      where: { workspaceId: WS_A, entityId: webhook.id, eventName: AUDIT_EVENTS.WEBHOOK_CREATED },
    });
    expect(createRow).not.toBeNull();
    expect(createRow?.actorId).toBe(USER_CREATOR);
    expect(createRow?.eventName).not.toBe(deleteRow?.eventName);
  });

  it("deleteWebhook() called with no explicit actor does not crash the audit insert (the defect this test file found and fixed)", async () => {
    const webhook = await registerWebhook(
      WS_A,
      "https://example.com/webhook-audit-test-no-actor",
      ["action:created"],
      USER_CREATOR
    );

    // No third argument — exercises the exact path that used to default to
    // the invalid UUID literal "system".
    await expect(deleteWebhook(webhook.id, WS_A)).resolves.toBeUndefined();

    const deleteRow = await db.auditEvent.findFirst({
      where: { workspaceId: WS_A, entityId: webhook.id, eventName: AUDIT_EVENTS.WEBHOOK_DELETED },
    });
    expect(deleteRow).not.toBeNull();
    expect(deleteRow?.actorId).toBeNull();
  });

  it("WORKSPACE ISOLATION — Workspace B cannot delete or generate a delete-audit for Workspace A's webhook", async () => {
    const webhook = await registerWebhook(
      WS_A,
      "https://example.com/webhook-audit-test-isolation",
      ["action:created"],
      USER_CREATOR
    );

    await expect(deleteWebhook(webhook.id, WS_B, USER_DELETER)).rejects.toThrow();

    // No delete audit event was written under either workspace for this entity.
    const deleteRowUnderB = await db.auditEvent.findFirst({
      where: { workspaceId: WS_B, entityId: webhook.id, eventName: AUDIT_EVENTS.WEBHOOK_DELETED },
    });
    const deleteRowUnderA = await db.auditEvent.findFirst({
      where: { workspaceId: WS_A, entityId: webhook.id, eventName: AUDIT_EVENTS.WEBHOOK_DELETED },
    });
    expect(deleteRowUnderB).toBeNull();
    expect(deleteRowUnderA).toBeNull();

    // The webhook is still deletable from its real (A) workspace afterward —
    // proves the failed cross-workspace attempt didn't corrupt state.
    await expect(deleteWebhook(webhook.id, WS_A, USER_DELETER)).resolves.toBeUndefined();
  });

  it("DISPATCH TRUTHFULNESS — registration never implies live event dispatch is operational", async () => {
    const webhook = await registerWebhook(
      WS_A,
      "https://example.com/webhook-audit-test-dispatch",
      ["action:created"],
      USER_CREATOR
    );

    expect(webhook.dispatchStatus).toBe("not_configured");

    const auditRow = await db.auditEvent.findFirst({
      where: { workspaceId: WS_A, entityId: webhook.id, eventName: AUDIT_EVENTS.WEBHOOK_CREATED },
    });
    // The audit payload itself must not claim delivery either.
    expect(auditRow?.payload).not.toHaveProperty("delivered");
    expect(auditRow?.payload).not.toHaveProperty("dispatched");
  });
});
