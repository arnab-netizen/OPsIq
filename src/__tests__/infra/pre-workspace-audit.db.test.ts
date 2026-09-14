/**
 * [db] Administration V1 — pre-workspace/platform audit durability fix.
 *
 * Proves: a null-workspaceId emitAuditEvent call now persists a real,
 * durable audit_event row (previously a silent no-op); the row is always
 * explicitly UNCHAINED (previousHash: null, no previous-event lookup);
 * queryAuditEvents(null, ...) retrieves these as an explicit, separate mode;
 * and the existing workspace-scoped hash-chain path is completely unchanged
 * (verifyAuditChainIntegrity still works exactly as before for a real
 * workspace, and pre-workspace rows never enter its computation).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/infra/pre-workspace-audit.db.test.ts
 */
import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { emitAuditEvent, queryAuditEvents, verifyAuditChainIntegrity } from "@/infra/audit";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] pre-workspace/platform audit events", () => {
  const entityIds: string[] = [];
  const workspaceIds: string[] = [];

  afterEach(async () => {
    if (entityIds.length) {
      await db.auditEvent.deleteMany({ where: { entityId: { in: entityIds } } }).catch(() => undefined);
      entityIds.length = 0;
    }
    if (workspaceIds.length) {
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: workspaceIds } } }).catch(() => undefined);
      workspaceIds.length = 0;
    }
  });

  it("[db] a null-workspaceId event now persists a durable row (previously a silent no-op)", async () => {
    const entityId = randomUUID();
    entityIds.push(entityId);

    const eventId = await emitAuditEvent({
      eventName: "beta_request.created",
      entityType: "beta_request",
      entityId,
      payload: { test: true },
      visibility: "internal",
    });

    expect(eventId).not.toBe("fail-safe-no-workspace-id");

    const row = await db.auditEvent.findUnique({ where: { id: eventId } });
    expect(row).not.toBeNull();
    expect(row?.workspaceId).toBeNull();
    expect(row?.previousHash).toBeNull();
    expect(row?.eventName).toBe("beta_request.created");
  });

  it("[db] two concurrent null-workspaceId events both persist independently (no shared chain pointer to race on)", async () => {
    const entityIdA = randomUUID();
    const entityIdB = randomUUID();
    entityIds.push(entityIdA, entityIdB);

    const [idA, idB] = await Promise.all([
      emitAuditEvent({ eventName: "beta_request.created", entityType: "beta_request", entityId: entityIdA }),
      emitAuditEvent({ eventName: "beta_request.created", entityType: "beta_request", entityId: entityIdB }),
    ]);

    const rowA = await db.auditEvent.findUnique({ where: { id: idA } });
    const rowB = await db.auditEvent.findUnique({ where: { id: idB } });
    // Both persisted, both independently unchained — neither's previousHash
    // depends on (or races against) the other.
    expect(rowA?.previousHash).toBeNull();
    expect(rowB?.previousHash).toBeNull();
    expect(rowA?.workspaceId).toBeNull();
    expect(rowB?.workspaceId).toBeNull();
  });

  it("[db] queryAuditEvents(null, ...) retrieves pre-workspace events as an explicit, separate mode", async () => {
    const entityId = randomUUID();
    entityIds.push(entityId);
    await emitAuditEvent({ eventName: "beta_request.created", entityType: "beta_request", entityId });

    const results = await queryAuditEvents({ workspaceId: null, entityId });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.workspaceId === null)).toBe(true);
  });

  it("[db] the existing workspace-scoped hash chain is completely unchanged: a real workspaceId still chains and verifies", async () => {
    const workspaceId = randomUUID();
    workspaceIds.push(workspaceId);
    await db.workspace.create({
      data: { id: workspaceId, name: "Audit WS", slug: `audit-ws-${workspaceId.slice(0, 8)}`, updatedAt: new Date() },
    });

    await emitAuditEvent({ eventName: "user.email_verified", workspaceId, entityType: "user", entityId: "u1" });
    await emitAuditEvent({ eventName: "user.policy_accepted", workspaceId, entityType: "user", entityId: "u1" });

    const integrity = await verifyAuditChainIntegrity(workspaceId);
    expect(integrity.isValid).toBe(true);
    expect(integrity.eventsChecked).toBe(1); // one link between the two events

    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  });

  it("[db] a pre-workspace event never appears in a real workspace's chain-verified query", async () => {
    const workspaceId = randomUUID();
    const entityId = randomUUID();
    workspaceIds.push(workspaceId);
    entityIds.push(entityId);
    await db.workspace.create({
      data: { id: workspaceId, name: "Audit WS 2", slug: `audit-ws2-${workspaceId.slice(0, 8)}`, updatedAt: new Date() },
    });

    await emitAuditEvent({ eventName: "beta_request.created", entityType: "beta_request", entityId }); // pre-workspace
    await emitAuditEvent({ eventName: "user.email_verified", workspaceId, entityType: "user", entityId: "u1" }); // scoped

    const scopedResults = await queryAuditEvents({ workspaceId });
    expect(scopedResults.every((r) => r.workspaceId === workspaceId)).toBe(true);
    expect(scopedResults.some((r) => r.entityId === entityId)).toBe(false);

    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  });
});
