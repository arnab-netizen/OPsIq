import { PrismaClient } from '@/generated/prisma/client';
import { v4 as uuid } from 'uuid';
import { PrivateModeRole } from '@/domain/private-mode/role-config';

/**
 * Private mode role access control service.
 * Manages role grant/revoke with approval workflow and workspace isolation.
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

    // Check if user already has active access in this workspace
    const existing = await this.prisma.privateModeAccess.findFirst({
      where: { workspaceId, userId, revokedAt: null },
    });
    if (existing) {
      throw new Error(`User already has role in workspace: ${existing.role}`);
    }

    // Create new access record
    const accessId = uuid();
    const access = await this.prisma.privateModeAccess.create({
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

    return access;
  }

  /**
   * Approve pending role access request.
   * Only OWNER can approve.
   */
  async approveRoleAccess(workspaceId: string, accessId: string, approvedBy: string) {
    // Verify approver is OWNER
    const approver = await this.prisma.privateModeAccess.findFirst({
      where: { workspaceId, userId: approvedBy },
    });
    if (!approver || approver.role !== 'OWNER') {
      throw new Error('Only OWNER can approve roles');
    }

    // Find access record and verify it's pending
    const access = await this.prisma.privateModeAccess.findUnique({
      where: { id: accessId },
    });
    if (!access) {
      throw new Error(`Access record not found: ${accessId}`);
    }
    if (access.workspaceId !== workspaceId) {
      throw new Error('Workspace mismatch');
    }
    if (access.approvalStatus !== 'pending') {
      throw new Error(`Cannot approve role in ${access.approvalStatus} status`);
    }
    if (access.revokedAt) {
      throw new Error('Cannot approve revoked role');
    }

    // Approve the access
    const updated = await this.prisma.privateModeAccess.update({
      where: { id: accessId },
      data: {
        approvalStatus: 'approved',
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      },
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
    // Verify rejector is OWNER
    const rejector = await this.prisma.privateModeAccess.findFirst({
      where: { workspaceId, userId: rejectedBy },
    });
    if (!rejector || rejector.role !== 'OWNER') {
      throw new Error('Only OWNER can reject roles');
    }

    // Find access record and verify it's pending
    const access = await this.prisma.privateModeAccess.findUnique({
      where: { id: accessId },
    });
    if (!access) {
      throw new Error(`Access record not found: ${accessId}`);
    }
    if (access.workspaceId !== workspaceId) {
      throw new Error('Workspace mismatch');
    }
    if (access.approvalStatus !== 'pending') {
      throw new Error(`Cannot reject role in ${access.approvalStatus} status`);
    }

    // Reject the access
    const updated = await this.prisma.privateModeAccess.update({
      where: { id: accessId },
      data: {
        approvalStatus: 'rejected',
        rejectionReason,
        updatedAt: new Date(),
      },
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
    // Verify revoker is OWNER
    const revoker = await this.prisma.privateModeAccess.findFirst({
      where: { workspaceId, userId: revokedBy },
    });
    if (!revoker || revoker.role !== 'OWNER') {
      throw new Error('Only OWNER can revoke roles');
    }

    // Find access record
    const access = await this.prisma.privateModeAccess.findUnique({
      where: { id: accessId },
    });
    if (!access) {
      throw new Error(`Access record not found: ${accessId}`);
    }
    if (access.workspaceId !== workspaceId) {
      throw new Error('Workspace mismatch');
    }
    if (access.revokedAt) {
      throw new Error('Role already revoked');
    }

    // Revoke the access
    const updated = await this.prisma.privateModeAccess.update({
      where: { id: accessId },
      data: {
        revokedAt: new Date(),
        revokedBy,
        revokeReason,
        updatedAt: new Date(),
      },
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
