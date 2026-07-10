import { PrismaClient } from '@/generated/prisma/client';
import { v4 as uuid } from 'uuid';
import { PrivateModeRole } from '@/domain/private-mode/role-config';
import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';

/**
 * Private mode role access control service.
 * Manages role grant/revoke with approval workflow and workspace isolation.
 *
 * All mutation methods emit audit events and use a CAS (compare-and-swap) pattern
 * via updateMany with a state predicate in the WHERE clause. This prevents TOCTOU
 * races where concurrent callers both pass an application-level guard then race to
 * write. The audit event is emitted inside the same transaction so a failed audit
 * rolls back the state change (fail-closed).
 */

export class PrivateModeRoleAccessService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Request role access for a user in a workspace.
   * Requires owner approval unless requireOwnerApproval is disabled.
   */
  async grantRoleAccess(
    workspaceId: string,
    userId: string,
    role: PrivateModeRole,
    grantedBy: string,
    requireApproval: boolean = true,
  ) {
    // Verify workspace exists
    const workspace = await this.prisma.clientAccount.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Verify requester is OWNER
    const requesterAccess = await this.prisma.privateModeAccess.findFirst({
      where: { workspaceId, userId: grantedBy },
    });
    if (!requesterAccess || requesterAccess.role !== 'OWNER') {
      throw new Error('Only OWNER can grant roles');
    }

    // A single record can exist per (workspace, user) due to the unique
    // (workspace_id, user_id) constraint. Inspect the existing record (if any)
    // to decide between rejecting a duplicate active grant and reopening a
    // previously revoked grant.
    const existing = await this.prisma.privateModeAccess.findFirst({
      where: { workspaceId, userId },
    });
    if (existing && !existing.revokedAt) {
      throw new Error(`User already has role in workspace: ${existing.role}`);
    }

    if (existing && existing.revokedAt) {
      // Reopen the revoked record in place. Creating a new row would violate the
      // unique (workspace_id, user_id) constraint, so the prior grant is reset to
      // a fresh grant with cleared revocation and approval state.
      // CAS: only update if revokedAt is still non-null (guard against concurrent re-grant).
      const reopened = await this.prisma.$transaction(async (tx) => {
        const res = await tx.privateModeAccess.updateMany({
          where: { id: existing.id, workspaceId, revokedAt: { not: null } },
          data: {
            role,
            grantedBy,
            grantedAt: new Date(),
            revokedAt: null,
            revokedBy: null,
            revokeReason: null,
            approvalStatus: requireApproval ? 'pending' : 'approved',
            approvedBy: requireApproval ? null : grantedBy,
            approvedAt: requireApproval ? null : new Date(),
            rejectionReason: null,
            updatedAt: new Date(),
          },
        });

        if (res.count !== 1) {
          throw new Error('Re-grant conflict: record was concurrently modified');
        }

        await emitAuditEvent(
          {
            eventName: requireApproval ? AUDIT_EVENTS.APPROVAL_REQUESTED : AUDIT_EVENTS.ROLE_ASSIGNED,
            workspaceId,
            actorId: grantedBy,
            actorType: 'user',
            entityType: 'private_mode_access',
            entityId: existing.id,
            payload: { userId, role, requireApproval, action: 're-grant' },
            visibility: 'internal',
          },
          tx,
        );

        const record = await tx.privateModeAccess.findUnique({ where: { id: existing.id } });
        if (!record) throw new Error('Unexpected: record not found after re-grant');
        return record;
      });
      return reopened;
    }

    // Create new access record with audit inside transaction (fail-closed)
    const accessId = uuid();
    const access = await this.prisma.$transaction(async (tx) => {
      const created = await tx.privateModeAccess.create({
        data: {
          id: accessId,
          workspaceId,
          userId,
          role,
          grantedBy,
          approvalStatus: requireApproval ? 'pending' : 'approved',
          approvedBy: requireApproval ? null : grantedBy,
          approvedAt: requireApproval ? null : new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await emitAuditEvent(
        {
          eventName: requireApproval ? AUDIT_EVENTS.APPROVAL_REQUESTED : AUDIT_EVENTS.ROLE_ASSIGNED,
          workspaceId,
          actorId: grantedBy,
          actorType: 'user',
          entityType: 'private_mode_access',
          entityId: created.id,
          payload: { userId, role, requireApproval, action: 'new-grant' },
          visibility: 'internal',
        },
        tx,
      );

      return created;
    });

    return access;
  }

  /**
   * Approve pending role access request.
   * Only OWNER can approve.
   */
  async approveRoleAccess(workspaceId: string, accessId: string, approvedBy: string) {
    // Verify approver is OWNER (read-only pre-check outside transaction)
    const approver = await this.prisma.privateModeAccess.findFirst({
      where: { workspaceId, userId: approvedBy },
    });
    if (!approver || approver.role !== 'OWNER') {
      throw new Error('Only OWNER can approve roles');
    }

    // Verify access record exists and belongs to workspace (pre-check for clear error)
    const access = await this.prisma.privateModeAccess.findUnique({
      where: { id: accessId },
    });
    if (!access) {
      throw new Error(`Access record not found: ${accessId}`);
    }
    if (access.workspaceId !== workspaceId) {
      throw new Error('Workspace mismatch');
    }

    // CAS + audit in transaction: only update if still pending and not revoked.
    // This prevents concurrent double-approve races (TOCTOU fix).
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.privateModeAccess.updateMany({
        where: {
          id: accessId,
          workspaceId,
          approvalStatus: 'pending',
          revokedAt: null,
        },
        data: {
          approvalStatus: 'approved',
          approvedBy,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      if (res.count !== 1) {
        throw new Error(`Cannot approve: grant is no longer in pending status`);
      }

      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.APPROVAL_GRANTED,
          workspaceId,
          actorId: approvedBy,
          actorType: 'user',
          entityType: 'private_mode_access',
          entityId: accessId,
          payload: { userId: access.userId, role: access.role },
          visibility: 'internal',
        },
        tx,
      );

      const record = await tx.privateModeAccess.findUnique({ where: { id: accessId } });
      if (!record) throw new Error('Unexpected: record not found after approval');
      return record;
    });

    return updated;
  }

  /**
   * Reject pending role access request.
   * Only OWNER can reject.
   */
  async rejectRoleAccess(
    workspaceId: string,
    accessId: string,
    rejectionReason: string,
    rejectedBy: string,
  ) {
    // Verify rejector is OWNER (read-only pre-check)
    const rejector = await this.prisma.privateModeAccess.findFirst({
      where: { workspaceId, userId: rejectedBy },
    });
    if (!rejector || rejector.role !== 'OWNER') {
      throw new Error('Only OWNER can reject roles');
    }

    // Verify access record exists and belongs to workspace (pre-check for clear error)
    const access = await this.prisma.privateModeAccess.findUnique({
      where: { id: accessId },
    });
    if (!access) {
      throw new Error(`Access record not found: ${accessId}`);
    }
    if (access.workspaceId !== workspaceId) {
      throw new Error('Workspace mismatch');
    }

    // CAS + audit in transaction: only update if still pending (TOCTOU fix)
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.privateModeAccess.updateMany({
        where: {
          id: accessId,
          workspaceId,
          approvalStatus: 'pending',
        },
        data: {
          approvalStatus: 'rejected',
          rejectionReason,
          updatedAt: new Date(),
        },
      });

      if (res.count !== 1) {
        throw new Error(`Cannot reject: grant is no longer in pending status`);
      }

      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.APPROVAL_DENIED,
          workspaceId,
          actorId: rejectedBy,
          actorType: 'user',
          entityType: 'private_mode_access',
          entityId: accessId,
          payload: { userId: access.userId, role: access.role, rejectionReason },
          visibility: 'internal',
        },
        tx,
      );

      const record = await tx.privateModeAccess.findUnique({ where: { id: accessId } });
      if (!record) throw new Error('Unexpected: record not found after rejection');
      return record;
    });

    return updated;
  }

  /**
   * Revoke role access from a user.
   * Only OWNER can revoke. Can revoke any status (pending/approved).
   */
  async revokeRoleAccess(
    workspaceId: string,
    accessId: string,
    revokeReason: string,
    revokedBy: string,
  ) {
    // Find access record and enforce workspace isolation before authorization.
    // Validating the record's workspace binding first ensures a grant belonging
    // to another workspace cannot be acted on through this workspace's context.
    const access = await this.prisma.privateModeAccess.findUnique({
      where: { id: accessId },
    });
    if (!access) {
      throw new Error(`Access record not found: ${accessId}`);
    }
    if (access.workspaceId !== workspaceId) {
      throw new Error('Workspace mismatch');
    }

    // Verify revoker is OWNER of this workspace
    const revoker = await this.prisma.privateModeAccess.findFirst({
      where: { workspaceId, userId: revokedBy },
    });
    if (!revoker || revoker.role !== 'OWNER') {
      throw new Error('Only OWNER can revoke roles');
    }

    // CAS + audit in transaction: only revoke if revokedAt is still null (TOCTOU fix).
    // Preserves the "Role already revoked" semantics for callers.
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.privateModeAccess.updateMany({
        where: {
          id: accessId,
          workspaceId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokedBy,
          revokeReason,
          updatedAt: new Date(),
        },
      });

      if (res.count !== 1) {
        throw new Error('Role already revoked');
      }

      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.ROLE_REVOKED,
          workspaceId,
          actorId: revokedBy,
          actorType: 'user',
          entityType: 'private_mode_access',
          entityId: accessId,
          payload: { userId: access.userId, role: access.role, revokeReason },
          visibility: 'internal',
        },
        tx,
      );

      const record = await tx.privateModeAccess.findUnique({ where: { id: accessId } });
      if (!record) throw new Error('Unexpected: record not found after revocation');
      return record;
    });

    return updated;
  }

  /**
   * Get all active roles in a workspace (non-revoked).
   */
  async getWorkspaceRoles(workspaceId: string) {
    const roles = await this.prisma.privateModeAccess.findMany({
      where: {
        workspaceId,
        approvalStatus: 'approved',
        revokedAt: null,
      },
      orderBy: { grantedAt: 'asc' },
    });
    return roles;
  }

  /**
   * Get pending role requests for a workspace.
   */
  async getPendingRequests(workspaceId: string) {
    const pending = await this.prisma.privateModeAccess.findMany({
      where: {
        workspaceId,
        approvalStatus: 'pending',
      },
      orderBy: { grantedAt: 'asc' },
    });
    return pending;
  }

  /**
   * Get user's role in a workspace.
   */
  async getUserRole(workspaceId: string, userId: string): Promise<PrivateModeRole | null> {
    const access = await this.prisma.privateModeAccess.findFirst({
      where: {
        workspaceId,
        userId,
        approvalStatus: 'approved',
        revokedAt: null,
      },
    });
    if (!access) {
      return null;
    }
    return access.role as PrivateModeRole;
  }

  /**
   * Check if user has any active private mode access in workspace.
   */
  async hasPrivateModeAccess(workspaceId: string, userId: string): Promise<boolean> {
    const role = await this.getUserRole(workspaceId, userId);
    return role !== null;
  }
}
