/**
 * [db] P0-04 (production trust/governance closure) — real-PostgreSQL proof.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/production/retention-cleanup-audit-survival.db.test.ts
 *
 * Proves against a real database (not mocks) that a governed audit event —
 * including one old enough it would have matched the historical (now-removed)
 * AUDIT_EVENT_TTL_DAYS window — survives repeated cleanupOldRecords() runs,
 * the same function GET /api/health used to trigger periodically.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { cleanupOldRecords } from "@/services/production/retention-cleanup";

const WS = randomUUID();
const USER = randomUUID();

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] P0-04: audit records survive retention cleanup", () => {
  beforeAll(async () => {
    await db.workspace.create({
      data: { id: WS, name: "P0-04 Retention Test WS", slug: `p0-04-retention-${WS.slice(0, 8)}` },
    });
    await db.user.create({
      data: { id: USER, email: `p0-04-retention-${USER.slice(0, 8)}@test.local`, isActive: true, updatedAt: new Date() },
    });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { workspaceId: WS } });
    await db.workspace.deleteMany({ where: { id: WS } });
    await db.user.deleteMany({ where: { id: USER } });
  });

  it("an audit event older than the historical 90-day TTL survives repeated cleanupOldRecords() runs", async () => {
    const veryOld = new Date();
    veryOld.setDate(veryOld.getDate() - 400); // well past any TTL that ever existed

    const event = await db.auditEvent.create({
      data: {
        id: randomUUID(),
        workspaceId: WS,
        eventName: "test.p0_04_retention_survival",
        actorId: USER,
        entityType: "test",
        entityId: "audit-survival-fixture",
        occurredAt: veryOld,
        visibility: "internal",
      },
    });

    // Simulate the health-check-triggered cleanup firing repeatedly.
    for (let i = 0; i < 5; i++) {
      await cleanupOldRecords();
    }

    const stillThere = await db.auditEvent.findUnique({ where: { id: event.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.id).toBe(event.id);
    expect(stillThere?.occurredAt.getTime()).toBe(veryOld.getTime());
  });

  it("a freshly-created audit event also survives cleanup", async () => {
    const event = await db.auditEvent.create({
      data: {
        id: randomUUID(),
        workspaceId: WS,
        eventName: "test.p0_04_retention_survival_fresh",
        actorId: USER,
        entityType: "test",
        entityId: "audit-survival-fixture-fresh",
        visibility: "internal",
      },
    });

    await cleanupOldRecords();

    const stillThere = await db.auditEvent.findUnique({ where: { id: event.id } });
    expect(stillThere).not.toBeNull();
  });
});
