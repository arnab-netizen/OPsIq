import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/db';
import { PrivateModeRoleAccessService } from '@/services/private-mode/role-access.service';
import { v4 as uuid } from 'uuid';
import { SHOULD_RUN_DB_TESTS } from '@/__tests__/test-helpers/db-test-gate';

describe('[db] B24-S2: Private Mode Role Access Service — DB-Backed Tests', () => {
  let service: PrivateModeRoleAccessService;
  let workspaceId: string;
  let ownerId: string;
  let consultantId: string;
  let analystId: string;

  beforeEach(async () => {
    if (!SHOULD_RUN_DB_TESTS) return;

    service = new PrivateModeRoleAccessService(db);

    // Create test workspace
    workspaceId = uuid();
    await db.clientAccount.create({
      data: {
        id: workspaceId,
        name: 'Test Workspace',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Create test users
    ownerId = uuid();
    consultantId = uuid();
    analystId = uuid();

    // Grant owner role directly (initial setup)
    await db.privateModeAccess.create({
      data: {
        id: uuid(),
        workspaceId,
        userId: ownerId,
        role: 'OWNER',
        grantedAt: new Date(),
        grantedBy: ownerId, // Self-grant for initial setup
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    if (!SHOULD_RUN_DB_TESTS) return;
    // Cleanup test data
    await db.privateModeAccess.deleteMany({
      where: { workspaceId },
    });
    await db.clientAccount.deleteMany({
      where: { id: workspaceId },
    });
  });

  describe('Role Grant and Approval Workflow', () => {
    it('should grant role with pending approval', async () => {
      const access = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        true, // requireApproval
      );

      expect(access.workspaceId).toBe(workspaceId);
      expect(access.userId).toBe(consultantId);
      expect(access.role).toBe('CONSULTANT');
      expect(access.approvalStatus).toBe('pending');
      expect(access.grantedBy).toBe(ownerId);
    });

    it('should grant role with immediate approval', async () => {
      const access = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        false, // requireApproval=false
      );

      expect(access.approvalStatus).toBe('approved');
      expect(access.approvedBy).toBe(ownerId);
      expect(access.approvedAt).not.toBeNull();
    });

    it('should approve pending role request', async () => {
      // Grant with pending status
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        true,
      );

      // Approve it
      const approved = await service.approveRoleAccess(workspaceId, grant.id, ownerId);

      expect(approved.approvalStatus).toBe('approved');
      expect(approved.approvedBy).toBe(ownerId);
    });

    it('should reject pending role request', async () => {
      // Grant with pending status
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        true,
      );

      // Reject it
      const rejected = await service.rejectRoleAccess(
        workspaceId,
        grant.id,
        'Does not meet requirements',
        ownerId,
      );

      expect(rejected.approvalStatus).toBe('rejected');
      expect(rejected.rejectionReason).toBe('Does not meet requirements');
    });

    it('should not allow non-OWNER to grant roles', async () => {
      // First grant consultant role
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        false,
      );

      // Try to grant analyst role as consultant (should fail)
      await expect(
        service.grantRoleAccess(workspaceId, analystId, 'ANALYST', consultantId, false),
      ).rejects.toThrow('Only OWNER can grant roles');
    });

    it('should prevent duplicate roles for same user', async () => {
      // Grant consultant role
      await service.grantRoleAccess(workspaceId, consultantId, 'CONSULTANT', ownerId, false);

      // Try to grant again (should fail)
      await expect(
        service.grantRoleAccess(workspaceId, consultantId, 'ANALYST', ownerId, false),
      ).rejects.toThrow('User already has role in workspace');
    });

    it('should allow re-granting role after revocation', async () => {
      // Grant role
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        false,
      );

      // Revoke it
      await service.revokeRoleAccess(workspaceId, grant.id, 'No longer needed', ownerId);

      // Re-grant should succeed
      const regrant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'ANALYST',
        ownerId,
        false,
      );

      expect(regrant.userId).toBe(consultantId);
      expect(regrant.role).toBe('ANALYST');
    });
  });

  describe('Role Revocation', () => {
    it('should revoke approved role', async () => {
      // Grant role
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        false,
      );

      // Revoke it
      const revoked = await service.revokeRoleAccess(
        workspaceId,
        grant.id,
        'Employee left company',
        ownerId,
      );

      expect(revoked.revokedAt).not.toBeNull();
      expect(revoked.revokedBy).toBe(ownerId);
      expect(revoked.revokeReason).toBe('Employee left company');
    });

    it('should revoke pending role', async () => {
      // Grant with pending status
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        true,
      );

      // Revoke it (even though pending)
      const revoked = await service.revokeRoleAccess(
        workspaceId,
        grant.id,
        'Changed mind',
        ownerId,
      );

      expect(revoked.revokedAt).not.toBeNull();
    });

    it('should not allow double revocation', async () => {
      // Grant and revoke
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        false,
      );
      await service.revokeRoleAccess(workspaceId, grant.id, 'First revoke', ownerId);

      // Try to revoke again (should fail)
      await expect(
        service.revokeRoleAccess(workspaceId, grant.id, 'Second revoke', ownerId),
      ).rejects.toThrow('Role already revoked');
    });

    it('should not allow non-OWNER to revoke roles', async () => {
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        false,
      );

      await expect(
        service.revokeRoleAccess(workspaceId, grant.id, 'Reason', consultantId),
      ).rejects.toThrow('Only OWNER can revoke roles');
    });
  });

  describe('Workspace Isolation', () => {
    it('should enforce workspace isolation on role queries', async () => {
      // Create second workspace
      const workspace2Id = uuid();
      await db.clientAccount.create({
        data: {
          id: workspace2Id,
          name: 'Workspace 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const owner2Id = uuid();
      await db.privateModeAccess.create({
        data: {
          id: uuid(),
          workspaceId: workspace2Id,
          userId: owner2Id,
          role: 'OWNER',
          grantedAt: new Date(),
          grantedBy: owner2Id,
          approvalStatus: 'approved',
          approvedAt: new Date(),
          approvedBy: owner2Id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Grant consultant to workspace 1
      await service.grantRoleAccess(workspaceId, consultantId, 'CONSULTANT', ownerId, false);

      // Try to revoke from workspace 2 (should fail)
      const ws1Roles = await service.getWorkspaceRoles(workspaceId);
      expect(ws1Roles).toHaveLength(2); // owner + consultant

      // Cleanup workspace 2
      await db.privateModeAccess.deleteMany({
        where: { workspace_id: workspace2Id },
      });
      await db.clientAccount.delete({
        where: { id: workspace2Id },
      });
    });

    it('should prevent cross-workspace role access', async () => {
      // Grant role in workspace 1
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        false,
      );

      // Create workspace 2
      const workspace2Id = uuid();
      await db.clientAccount.create({
        data: {
          id: workspace2Id,
          name: 'Workspace 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Try to revoke with workspace 2 ID (should fail)
      await expect(
        service.revokeRoleAccess(workspace2Id, grant.id, 'Reason', ownerId),
      ).rejects.toThrow('Workspace mismatch');

      // Cleanup
      await db.clientAccount.delete({
        where: { id: workspace2Id },
      });
    });
  });

  describe('Role Retrieval and Status Checks', () => {
    it('should get all active roles in workspace', async () => {
      // Grant multiple roles
      await service.grantRoleAccess(workspaceId, consultantId, 'CONSULTANT', ownerId, false);
      await service.grantRoleAccess(workspaceId, analystId, 'ANALYST', ownerId, false);

      const roles = await service.getWorkspaceRoles(workspaceId);

      expect(roles).toHaveLength(3); // owner + consultant + analyst
      const roleNames = roles.map((r) => r.role);
      expect(roleNames).toContain('OWNER');
      expect(roleNames).toContain('CONSULTANT');
      expect(roleNames).toContain('ANALYST');
    });

    it('should exclude revoked roles from active list', async () => {
      // Grant and revoke
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        false,
      );
      await service.revokeRoleAccess(workspaceId, grant.id, 'Reason', ownerId);

      const roles = await service.getWorkspaceRoles(workspaceId);
      expect(roles).toHaveLength(1); // only owner
      expect(roles[0].role).toBe('OWNER');
    });

    it('should get pending role requests', async () => {
      // Grant with pending status
      await service.grantRoleAccess(workspaceId, consultantId, 'CONSULTANT', ownerId, true);
      await service.grantRoleAccess(workspaceId, analystId, 'ANALYST', ownerId, true);

      const pending = await service.getPendingRequests(workspaceId);
      expect(pending).toHaveLength(2);
    });

    it('should get user role in workspace', async () => {
      await service.grantRoleAccess(workspaceId, consultantId, 'CONSULTANT', ownerId, false);

      const role = await service.getUserRole(workspaceId, consultantId);
      expect(role).toBe('CONSULTANT');
    });

    it('should return null for unapproved role', async () => {
      // Grant with pending status
      await service.grantRoleAccess(workspaceId, consultantId, 'CONSULTANT', ownerId, true);

      const role = await service.getUserRole(workspaceId, consultantId);
      expect(role).toBeNull();
    });

    it('should return null for revoked role', async () => {
      // Grant and revoke
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        false,
      );
      await service.revokeRoleAccess(workspaceId, grant.id, 'Reason', ownerId);

      const role = await service.getUserRole(workspaceId, consultantId);
      expect(role).toBeNull();
    });

    it('should check if user has private mode access', async () => {
      // Initially no access
      let hasAccess = await service.hasPrivateModeAccess(workspaceId, consultantId);
      expect(hasAccess).toBe(false);

      // Grant access
      await service.grantRoleAccess(workspaceId, consultantId, 'CONSULTANT', ownerId, false);
      hasAccess = await service.hasPrivateModeAccess(workspaceId, consultantId);
      expect(hasAccess).toBe(true);

      // Revoke access
      const access = await db.privateModeAccess.findFirst({
        where: { user_id: consultantId, workspace_id: workspaceId },
      });
      await service.revokeRoleAccess(workspaceId, access!.id, 'Reason', ownerId);
      hasAccess = await service.hasPrivateModeAccess(workspaceId, consultantId);
      expect(hasAccess).toBe(false);
    });
  });

  describe('Acceptance Gates (Protocol §33)', () => {
    it('should gate private mode by role/config', async () => {
      // Only users with approved roles in private mode can access features
      const access = await service.hasPrivateModeAccess(workspaceId, consultantId);
      expect(access).toBe(false);

      // After granting
      await service.grantRoleAccess(workspaceId, consultantId, 'CONSULTANT', ownerId, false);
      const accessAfter = await service.hasPrivateModeAccess(workspaceId, consultantId);
      expect(accessAfter).toBe(true);
    });

    it('should prevent unauthorized role changes', async () => {
      // Non-owner cannot grant
      await expect(
        service.grantRoleAccess(workspaceId, analystId, 'ANALYST', consultantId, false),
      ).rejects.toThrow('Only OWNER can grant roles');

      // Non-owner cannot approve
      const grant = await service.grantRoleAccess(
        workspaceId,
        analystId,
        'ANALYST',
        ownerId,
        true,
      );
      await expect(
        service.approveRoleAccess(workspaceId, grant.id, consultantId),
      ).rejects.toThrow('Only OWNER can approve roles');

      // Non-owner cannot revoke
      const grant2 = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        false,
      );
      await expect(
        service.revokeRoleAccess(workspaceId, grant2.id, 'Reason', analystId),
      ).rejects.toThrow('Only OWNER can revoke roles');
    });

    it('should track audit fields for role changes', async () => {
      // Grant role
      const grant = await service.grantRoleAccess(
        workspaceId,
        consultantId,
        'CONSULTANT',
        ownerId,
        true,
      );

      // Verify audit fields
      expect(grant.grantedBy).toBe(ownerId);
      expect(grant.grantedAt).not.toBeNull();

      // Approve
      const approved = await service.approveRoleAccess(workspaceId, grant.id, ownerId);
      expect(approved.approvedBy).toBe(ownerId);
      expect(approved.approvedAt).not.toBeNull();

      // Revoke
      const revoked = await service.revokeRoleAccess(
        workspaceId,
        grant.id,
        'Reason',
        ownerId,
      );
      expect(revoked.revokedBy).toBe(ownerId);
      expect(revoked.revokedAt).not.toBeNull();
    });
  });
});
