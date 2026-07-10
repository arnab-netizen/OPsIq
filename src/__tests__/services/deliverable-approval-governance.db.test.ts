/**
 * Phase 6F — updateDeliverableReviewStatus governance (real-DB proof).
 *
 * Before Phase 6F, updateDeliverableReviewStatus had three defects:
 *   1. Version guard not applied in WHERE: update used only `{ id: deliverableId }` —
 *      the `input.version` field was unused, making the optimistic-lock mechanism a no-op.
 *      A stale caller would silently overwrite a concurrent change.
 *   2. No status guard: a second approve call would silently re-run the status→"approved"
 *      write with a bumped version, bypassing any terminal-state protection.
 *   3. Post-commit audit: emitAuditEvent was called after the deliverable update committed,
 *      meaning a crashed server leaves the status changed but no audit trail.
 *
 * The fix:
 *   - Pre-check: rejects already-approved with ConflictError before entering the transaction.
 *   - CAS WHERE: `updateMany({ where: { id, version: input.version, status: { not: "approved" } } })`
 *     — stale version OR already-approved returns count 0 → OptimisticLockError.
 *   - Audit-in-transaction: emitAuditEvent(input, tx) inside $transaction (fail-closed).
 *
 * Note: updateDeliverableReviewStatus is currently dead code (no live HTTP route calls it).
 * These tests prove correctness for when the function is wired up.
 *
 * Gated by TEST_WITH_DB=true.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { updateDeliverableReviewStatus } from '@/services/deliverable';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { CAPABILITIES } from '@/domain/constants/capabilities';
import { SHOULD_RUN_DB_TESTS } from '@/__tests__/test-helpers/db-test-gate';
import type { ServiceAuthEnvelope } from '@/lib/canonical-route-enforcement';

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  '[db] Phase 6F — updateDeliverableReviewStatus version guard + audit atomicity',
  () => {
    const stamp = randomUUID().substring(0, 8);
    const workspaceId = randomUUID();
    const userId = randomUUID();
    const clientId = randomUUID();
    const engagementId = randomUUID();
    const stageId = randomUUID();
    const deliverableIds: string[] = [];

    function makeAuth(caps: string[] = [CAPABILITIES.DELIVERABLE_APPROVE]): ServiceAuthEnvelope {
      return {
        verifiedActorId: userId,
        verifiedActorType: 'user',
        verifiedWorkspaceId: workspaceId,
        verifiedCapabilities: new Set(caps),
        hasInternalAccess: false,
      };
    }

    async function seedDeliverable(status = 'draft', version = 1): Promise<string> {
      const id = randomUUID();
      await db.deliverable.create({
        data: {
          id,
          updatedAt: new Date(),
          engagementId,
          stageId,
          title: 'Test deliverable',
          status,
          version,
          createdBy: userId,
        },
      });
      deliverableIds.push(id);
      return id;
    }

    beforeAll(async () => {
      await db.workspace.create({ data: { id: workspaceId, name: '6F-DA WS', slug: `p6f-da-${stamp}` } });
      await db.user.create({ data: { id: userId, email: `p6f-da-${stamp}@test.local`, isActive: true, updatedAt: new Date() } });
      await db.clientAccount.create({ data: { id: clientId, name: '6F Client', workspaceId, updatedAt: new Date() } });
      await db.engagement.create({
        data: {
          id: engagementId,
          updatedAt: new Date(),
          code: `6F-${stamp}`,
          title: '6F Engagement',
          clientId,
          workspaceId,
          serviceTier: 'standard',
          engagementMode: 'advisory',
          status: 'draft',
          healthStatus: 'unknown',
        },
      });
      await db.stage.create({ data: { id: stageId, engagementId, title: 'Stage 1', status: 'active', updatedAt: new Date() } });
    });

    afterAll(async () => {
      try {
        await db.auditEvent.deleteMany({ where: { workspaceId } });
        await db.deliverable.deleteMany({ where: { id: { in: deliverableIds } } });
        await db.stage.deleteMany({ where: { id: stageId } });
        await db.engagement.deleteMany({ where: { id: engagementId } });
        await db.clientAccount.deleteMany({ where: { id: clientId } });
        await db.user.deleteMany({ where: { id: userId } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
      } catch {
        // best-effort cleanup
      }
    });

    it('correct version approves and emits DELIVERABLE_APPROVED audit', async () => {
      const id = await seedDeliverable('draft', 1);

      const result = await updateDeliverableReviewStatus(id, { version: 1 }, makeAuth());

      expect(result.status).toBe('approved');
      expect(result.version).toBe(2);
      expect(result.approvedBy).toBe(userId);

      const audit = await db.auditEvent.findFirst({
        where: { entityId: id, eventName: AUDIT_EVENTS.DELIVERABLE_APPROVED, workspaceId },
      });
      expect(audit).not.toBeNull();
      expect(audit!.actorId).toBe(userId);
    });

    it('stale version fails with OptimisticLockError (version guard enforced in WHERE)', async () => {
      const id = await seedDeliverable('draft', 3);

      const { OptimisticLockError } = await import('@/infra/errors');

      // Supply version 1 when current version is 3
      await expect(
        updateDeliverableReviewStatus(id, { version: 1 }, makeAuth()),
      ).rejects.toThrow(OptimisticLockError);
    });

    it('already-approved deliverable fails with ConflictError before entering transaction', async () => {
      const id = await seedDeliverable('approved', 2);

      const { ConflictError } = await import('@/infra/errors');

      await expect(
        updateDeliverableReviewStatus(id, { version: 2 }, makeAuth()),
      ).rejects.toThrow(ConflictError);
    });

    it('missing DELIVERABLE_APPROVE capability throws ForbiddenError', async () => {
      const id = await seedDeliverable('draft', 1);

      const { ForbiddenError } = await import('@/infra/errors');

      await expect(
        updateDeliverableReviewStatus(id, { version: 1 }, makeAuth([])),
      ).rejects.toThrow(ForbiddenError);

      // Confirm no status change occurred
      const row = await db.deliverable.findUnique({ where: { id } });
      expect(row!.status).toBe('draft');
    });

    it('workspace isolation enforced — cross-workspace deliverable returns not found', async () => {
      const id = await seedDeliverable('draft', 1);
      const otherAuth: ServiceAuthEnvelope = {
        verifiedActorId: userId,
        verifiedActorType: 'user',
        verifiedWorkspaceId: randomUUID(),
        verifiedCapabilities: new Set([CAPABILITIES.DELIVERABLE_APPROVE]),
        hasInternalAccess: false,
      };

      const { NotFoundError } = await import('@/infra/errors');

      await expect(
        updateDeliverableReviewStatus(id, { version: 1 }, otherAuth),
      ).rejects.toThrow(NotFoundError);
    });

    it('audit is atomic: no DELIVERABLE_APPROVED event exists for failed approval (stale version)', async () => {
      const id = await seedDeliverable('draft', 5);

      const before = await db.auditEvent.count({
        where: { entityId: id, eventName: AUDIT_EVENTS.DELIVERABLE_APPROVED },
      });

      await expect(
        updateDeliverableReviewStatus(id, { version: 2 }, makeAuth()),
      ).rejects.toThrow();

      const after = await db.auditEvent.count({
        where: { entityId: id, eventName: AUDIT_EVENTS.DELIVERABLE_APPROVED },
      });

      expect(after).toBe(before); // no phantom audit event written
    });
  },
);
