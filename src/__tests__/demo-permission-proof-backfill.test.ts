/**
 * DEMO PERMISSION PROOF & BACKFILL ENDPOINT TESTS
 *
 * Verify: GET returns permission state, POST idempotently backfills missing UserRoleAssignment,
 * diagnostic key validation, fail-closed semantics, no duplicate assignments,
 * capability resolution via ROLE_CAPABILITIES registry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as demoPermissionRoute from '@/app/api/internal/demo-permission-proof/route';
import { SHOULD_RUN_DB_TESTS } from '@/__tests__/test-helpers/db-test-gate';

// Mock database
vi.mock('@/lib/db', () => ({
  getDbInstance: vi.fn().mockResolvedValue(undefined),
  db: {
    user: {
      findUnique: vi.fn(),
    },
    workspaceMembership: {
      findFirst: vi.fn(),
    },
    userRoleAssignment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    // POST step 6 (route.ts) also backfills the demo user's EngagementMembership
    // for ENG-001, so the mocked client must expose these delegates too.
    engagement: {
      findFirst: vi.fn(),
    },
    engagementMembership: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('@/infra/logger', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock capabilities
vi.mock('@/policies/capability-check', () => ({
  getCapabilitiesForRole: (role: string) => {
    if (role === 'admin_or_portfolio_manager') {
      return ['engagement:view', 'engagement:edit', 'client:view', 'admin:view'];
    }
    return [];
  },
}));

vi.mock('@/domain/constants/capabilities', () => ({
  CAPABILITIES: {
    ENGAGEMENT_VIEW: 'engagement:view',
  },
}));

vi.mock('@/domain/constants/roles', () => ({
  ROLES: {
    ADMIN_OR_PORTFOLIO_MANAGER: 'admin_or_portfolio_manager',
  },
}));

const { db } = await import('@/lib/db');

describe.skipIf(!SHOULD_RUN_DB_TESTS)('Demo Permission Proof & Backfill Endpoint', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000';
  const demoUserEmail = 'operator@demo.local';
  const diagnosticKey = 'test-diagnostic-key-123';

  const createMockRequest = (
    method: 'GET' | 'POST',
    diagnosticKeyValue?: string
  ): NextRequest => {
    const headers = new Headers();
    if (diagnosticKeyValue !== undefined) {
      headers.set('x-opsiq-diagnostic-key', diagnosticKeyValue);
    }
    return new NextRequest(
      new URL('http://localhost:3000/api/internal/demo-permission-proof'),
      { method, headers }
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Set environment variable for diagnostic key validation
    process.env.OPSIQ_DIAGNOSTIC_KEY = diagnosticKey;
  });

  describe('Diagnostic key validation', () => {
    it('GET without diagnostic key returns 404', async () => {
      const request = createMockRequest('GET');
      const response = await demoPermissionRoute.GET(request);
      expect(response.status).toBe(404);
    });

    it('GET with wrong diagnostic key returns 404', async () => {
      const request = createMockRequest('GET', 'wrong-key');
      const response = await demoPermissionRoute.GET(request);
      expect(response.status).toBe(404);
    });

    it('GET with correct diagnostic key proceeds', async () => {
      vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);
      const request = createMockRequest('GET', diagnosticKey);
      const response = await demoPermissionRoute.GET(request);
      expect(response.status).toBe(200);
    });

    it('POST without diagnostic key returns 404', async () => {
      const request = createMockRequest('POST');
      const response = await demoPermissionRoute.POST(request);
      expect(response.status).toBe(404);
    });

    it('POST with wrong diagnostic key returns 404', async () => {
      const request = createMockRequest('POST', 'wrong-key');
      const response = await demoPermissionRoute.POST(request);
      expect(response.status).toBe(404);
    });
  });

  describe('GET - Permission Proof', () => {
    describe('User not found', () => {
      it('returns userFound: false, classification: membership_missing', async () => {
        vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);

        const request = createMockRequest('GET', diagnosticKey);
        const response = await demoPermissionRoute.GET(request);
        const data = await response.json();

        expect(data.userFound).toBe(false);
        expect(data.membershipFound).toBe(false);
        expect(data.classification).toBe('membership_missing');
      });
    });

    describe('User found but membership missing', () => {
      it('returns membershipFound: false, classification: membership_missing', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(null);

        const request = createMockRequest('GET', diagnosticKey);
        const response = await demoPermissionRoute.GET(request);
        const data = await response.json();

        expect(data.userFound).toBe(true);
        expect(data.membershipFound).toBe(false);
        expect(data.classification).toBe('membership_missing');
      });
    });

    describe('Workspace ID validation', () => {
      it('rejects non-UUID workspace ID, returns classification: workspace_id_invalid', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        const mockMembership = {
          workspaceId: 'demo',
          userId: 'user-1',
          isActive: true,
        };

        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);

        const request = createMockRequest('GET', diagnosticKey);
        const response = await demoPermissionRoute.GET(request);
        const data = await response.json();

        expect(data.workspaceIdUuidLike).toBe(false);
        expect(data.classification).toBe('workspace_id_invalid');
      });

      it('accepts UUID-formatted workspace ID', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        const mockMembership = {
          workspaceId: validUUID,
          userId: 'user-1',
          isActive: true,
        };

        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
        vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(null);
        vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([]);

        const request = createMockRequest('GET', diagnosticKey);
        const response = await demoPermissionRoute.GET(request);
        const data = await response.json();

        expect(data.workspaceIdUuidLike).toBe(true);
      });
    });

    describe('Role assignment state', () => {
      it('returns roleAssignmentFound: false when no assignment exists', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        const mockMembership = {
          workspaceId: validUUID,
          userId: 'user-1',
          isActive: true,
        };

        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
        vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(null);
        vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([]);

        const request = createMockRequest('GET', diagnosticKey);
        const response = await demoPermissionRoute.GET(request);
        const data = await response.json();

        expect(data.roleAssignmentFound).toBe(false);
        expect(data.classification).toBe('role_assignment_missing');
      });

      it('returns roleAssignmentFound: true but roleAssignmentActive: false when inactive', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        const mockMembership = {
          workspaceId: validUUID,
          userId: 'user-1',
          isActive: true,
        };
        const mockInactiveAssignment = {
          id: 'assignment-1',
          userId: 'user-1',
          role: 'admin_or_portfolio_manager',
          isActive: false,
        };

        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
        vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(mockInactiveAssignment as never);
        vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([]);

        const request = createMockRequest('GET', diagnosticKey);
        const response = await demoPermissionRoute.GET(request);
        const data = await response.json();

        expect(data.roleAssignmentFound).toBe(true);
        expect(data.roleAssignmentActive).toBe(false);
        expect(data.classification).toBe('role_assignment_missing');
      });

      it('returns classification: permission_ready when active assignment with engagement:view', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        const mockMembership = {
          workspaceId: validUUID,
          userId: 'user-1',
          isActive: true,
        };
        const mockActiveAssignment = {
          id: 'assignment-1',
          userId: 'user-1',
          role: 'admin_or_portfolio_manager',
          isActive: true,
        };

        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
        vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(mockActiveAssignment as never);
        vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([mockActiveAssignment] as never);

        const request = createMockRequest('GET', diagnosticKey);
        const response = await demoPermissionRoute.GET(request);
        const data = await response.json();

        expect(data.classification).toBe('permission_ready');
        expect(data.roleGrantsEngagementView).toBe(true);
        expect(data.policyContextHasEngagementView).toBe(true);
      });

      it('masks workspace ID in safe output', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        const mockMembership = {
          workspaceId: validUUID,
          userId: 'user-1',
          isActive: true,
        };

        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
        vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(null);
        vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([]);

        const request = createMockRequest('GET', diagnosticKey);
        const response = await demoPermissionRoute.GET(request);
        const data = await response.json();

        expect(data.workspaceIdSample).toMatch(/^550e\.\.\.0000$/);
      });
    });
  });

  describe('POST - Idempotent Backfill', () => {
    describe('Failure scenarios', () => {
      it('fails closed with 400 when user not found', async () => {
        vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);

        const request = createMockRequest('POST', diagnosticKey);
        const response = await demoPermissionRoute.POST(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.status).toBe('failed');
        expect(data.reason).toBe('user_not_found');
      });

      it('fails closed with 400 when membership not found', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(null);

        const request = createMockRequest('POST', diagnosticKey);
        const response = await demoPermissionRoute.POST(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.status).toBe('failed');
        expect(data.reason).toBe('membership_not_found');
      });

      it('fails closed with 400 when workspace ID not UUID-like', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        const mockMembership = {
          workspaceId: 'demo',
          userId: 'user-1',
          isActive: true,
        };

        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);

        const request = createMockRequest('POST', diagnosticKey);
        const response = await demoPermissionRoute.POST(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.status).toBe('failed');
        expect(data.reason).toBe('workspace_id_invalid');
      });
    });

    describe('Idempotent creation', () => {
      it('creates new UserRoleAssignment when missing', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        const mockMembership = {
          workspaceId: validUUID,
          userId: 'user-1',
          isActive: true,
        };
        const mockNewAssignment = {
          id: 'assignment-1',
          userId: 'user-1',
          role: 'admin_or_portfolio_manager',
          isActive: true,
        };

        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
        vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(null);
        vi.mocked(db.userRoleAssignment.create).mockResolvedValueOnce(mockNewAssignment as never);
        vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([mockNewAssignment] as never);

        const request = createMockRequest('POST', diagnosticKey);
        const response = await demoPermissionRoute.POST(request);

        expect(response.status).toBe(200);
        expect(vi.mocked(db.userRoleAssignment.create)).toHaveBeenCalled();

        const data = await response.json();
        expect(data.status).toBe('success');
        expect(data.roleAssignmentActive).toBe(true);
      });

      it('does not create duplicate - returns 200 if already exists', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        const mockMembership = {
          workspaceId: validUUID,
          userId: 'user-1',
          isActive: true,
        };
        const mockExistingAssignment = {
          id: 'assignment-1',
          userId: 'user-1',
          role: 'admin_or_portfolio_manager',
          isActive: true,
        };

        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
        vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(mockExistingAssignment as never);
        vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([mockExistingAssignment] as never);

        const request = createMockRequest('POST', diagnosticKey);
        const response = await demoPermissionRoute.POST(request);

        expect(response.status).toBe(200);
        // Should not call create when already exists and active
        expect(vi.mocked(db.userRoleAssignment.create)).not.toHaveBeenCalled();

        const data = await response.json();
        expect(data.status).toBe('success');
      });

      it('reactivates deactivated assignment', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        const mockMembership = {
          workspaceId: validUUID,
          userId: 'user-1',
          isActive: true,
        };
        const mockInactiveAssignment = {
          id: 'assignment-1',
          userId: 'user-1',
          role: 'admin_or_portfolio_manager',
          isActive: false,
        };
        const mockReactivatedAssignment = {
          ...mockInactiveAssignment,
          isActive: true,
        };

        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
        vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(mockInactiveAssignment as never);
        vi.mocked(db.userRoleAssignment.update).mockResolvedValueOnce(mockReactivatedAssignment as never);
        vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([mockReactivatedAssignment] as never);

        const request = createMockRequest('POST', diagnosticKey);
        const response = await demoPermissionRoute.POST(request);

        expect(response.status).toBe(200);
        expect(vi.mocked(db.userRoleAssignment.update)).toHaveBeenCalled();

        const data = await response.json();
        expect(data.status).toBe('success');
        expect(data.roleAssignmentActive).toBe(true);
      });

      it('verifies engagement:view capability after backfill', async () => {
        const mockUser = { id: 'user-1', email: demoUserEmail };
        const mockMembership = {
          workspaceId: validUUID,
          userId: 'user-1',
          isActive: true,
        };
        const mockNewAssignment = {
          id: 'assignment-1',
          userId: 'user-1',
          role: 'admin_or_portfolio_manager',
          isActive: true,
        };

        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
        vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(null);
        vi.mocked(db.userRoleAssignment.create).mockResolvedValueOnce(mockNewAssignment as never);
        vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([mockNewAssignment] as never);

        const request = createMockRequest('POST', diagnosticKey);
        const response = await demoPermissionRoute.POST(request);

        const data = await response.json();
        expect(data.roleGrantsEngagementView).toBe(true);
      });
    });

    describe('ENG-001 engagement membership backfill', () => {
      const mockUser = { id: 'user-1', email: demoUserEmail };
      const mockMembership = { workspaceId: validUUID, userId: 'user-1', isActive: true };
      const mockActiveAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: 'admin_or_portfolio_manager',
        isActive: true,
      };
      const mockEngagement = { id: 'engagement-1', code: 'ENG-001', workspaceId: validUUID };

      const arrangeRoleAssignmentPresent = () => {
        vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
        vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
        vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(mockActiveAssignment as never);
        vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([mockActiveAssignment] as never);
      };

      it('looks up ENG-001 in the membership workspace and reports no backfill when it does not exist', async () => {
        arrangeRoleAssignmentPresent();
        vi.mocked(db.engagement.findFirst).mockResolvedValueOnce(null);

        const response = await demoPermissionRoute.POST(createMockRequest('POST', diagnosticKey));

        expect(response.status).toBe(200);
        expect(vi.mocked(db.engagement.findFirst)).toHaveBeenCalledWith({
          where: { code: 'ENG-001', workspaceId: validUUID },
        });
        expect(vi.mocked(db.engagementMembership.findFirst)).not.toHaveBeenCalled();
        expect(vi.mocked(db.engagementMembership.create)).not.toHaveBeenCalled();
        expect(vi.mocked(db.engagementMembership.update)).not.toHaveBeenCalled();
        const data = await response.json();
        expect(data.status).toBe('success');
        expect(data.engagementMembershipBackfilled).toBe(false);
      });

      it('creates the engagement membership when missing', async () => {
        arrangeRoleAssignmentPresent();
        vi.mocked(db.engagement.findFirst).mockResolvedValueOnce(mockEngagement as never);
        vi.mocked(db.engagementMembership.findFirst).mockResolvedValueOnce(null);
        vi.mocked(db.engagementMembership.create).mockResolvedValueOnce({ id: 'em-1' } as never);

        const response = await demoPermissionRoute.POST(createMockRequest('POST', diagnosticKey));

        expect(response.status).toBe(200);
        expect(vi.mocked(db.engagementMembership.findFirst)).toHaveBeenCalledWith({
          where: { userId: 'user-1', engagementId: 'engagement-1' },
        });
        expect(vi.mocked(db.engagementMembership.create)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(db.engagementMembership.create).mock.calls[0][0]).toMatchObject({
          data: { userId: 'user-1', engagementId: 'engagement-1', role: 'member', isActive: true },
        });
        expect(vi.mocked(db.engagementMembership.update)).not.toHaveBeenCalled();
        const data = await response.json();
        expect(data.engagementMembershipBackfilled).toBe(true);
      });

      it('reactivates an inactive engagement membership instead of creating a duplicate', async () => {
        arrangeRoleAssignmentPresent();
        vi.mocked(db.engagement.findFirst).mockResolvedValueOnce(mockEngagement as never);
        vi.mocked(db.engagementMembership.findFirst).mockResolvedValueOnce({ id: 'em-1', isActive: false } as never);
        vi.mocked(db.engagementMembership.update).mockResolvedValueOnce({ id: 'em-1', isActive: true } as never);

        const response = await demoPermissionRoute.POST(createMockRequest('POST', diagnosticKey));

        expect(response.status).toBe(200);
        expect(vi.mocked(db.engagementMembership.create)).not.toHaveBeenCalled();
        expect(vi.mocked(db.engagementMembership.update)).toHaveBeenCalledWith({
          where: { id: 'em-1' },
          data: { isActive: true },
        });
        const data = await response.json();
        expect(data.engagementMembershipBackfilled).toBe(true);
      });

      it('is a no-op when the engagement membership is already active', async () => {
        arrangeRoleAssignmentPresent();
        vi.mocked(db.engagement.findFirst).mockResolvedValueOnce(mockEngagement as never);
        vi.mocked(db.engagementMembership.findFirst).mockResolvedValueOnce({ id: 'em-1', isActive: true } as never);

        const response = await demoPermissionRoute.POST(createMockRequest('POST', diagnosticKey));

        expect(response.status).toBe(200);
        expect(vi.mocked(db.engagementMembership.create)).not.toHaveBeenCalled();
        expect(vi.mocked(db.engagementMembership.update)).not.toHaveBeenCalled();
        const data = await response.json();
        expect(data.status).toBe('success');
        expect(data.engagementMembershipBackfilled).toBe(false);
      });
    });

    describe('Error handling', () => {
      it('returns 500 on unexpected database error', async () => {
        vi.mocked(db.user.findUnique).mockRejectedValueOnce(new Error('Database connection failed'));

        const request = createMockRequest('POST', diagnosticKey);
        const response = await demoPermissionRoute.POST(request);

        expect(response.status).toBe(500);
        const data = await response.json();
        expect(data.status).toBe('failed');
        expect(data.reason).toBe('internal_error');
      });
    });
  });

  describe('Smoke test integration assumptions', () => {
    it('smoke test calls POST only when GET returns role_assignment_missing', async () => {
      // This test documents the smoke test behavior:
      // 1. GET /api/internal/demo-permission-proof
      // 2. If classification === "role_assignment_missing", POST to backfill
      // 3. GET again to verify
      // 4. Proceed to /api/engagements only if classification === "permission_ready"

      const mockUser = { id: 'user-1', email: demoUserEmail };
      const mockMembership = {
        workspaceId: validUUID,
        userId: 'user-1',
        isActive: true,
      };

      // First GET: no assignment
      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
      vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([]);

      const getRequest = createMockRequest('GET', diagnosticKey);
      const getResponse = await demoPermissionRoute.GET(getRequest);
      const getdata = await getResponse.json();

      expect(getdata.classification).toBe('role_assignment_missing');

      // POST to backfill
      const mockNewAssignment = {
        id: 'assignment-1',
        userId: 'user-1',
        role: 'admin_or_portfolio_manager',
        isActive: true,
      };

      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as never);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as never);
      vi.mocked(db.userRoleAssignment.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.userRoleAssignment.create).mockResolvedValueOnce(mockNewAssignment as never);
      vi.mocked(db.userRoleAssignment.findMany).mockResolvedValueOnce([mockNewAssignment] as never);

      const postRequest = createMockRequest('POST', diagnosticKey);
      const postResponse = await demoPermissionRoute.POST(postRequest);
      const postData = await postResponse.json();

      expect(postData.status).toBe('success');
    });
  });
});
