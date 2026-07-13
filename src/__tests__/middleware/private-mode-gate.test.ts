import { describe, it, expect } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  getPrivateModeAccess,
  enforcePrivateModeGate,
  addPrivateModeContext,
  createPrismaPrivateModeResolver,
  OWNER_DASHBOARD_GATE,
  PRIVATE_ADMIN_GATE,
  PRIVATE_CONSULTANT_GATE,
  PRIVATE_ANALYST_GATE,
  type PrivateModeGateDeps,
} from '@/middleware/private-mode-gate';
import type { PrivateModeRole } from '@/domain/private-mode/role-config';

describe('B25-S1: Private Mode Gate Middleware', () => {
  function createRequest(headers: Record<string, string>): NextRequest {
    const url = new URL('http://localhost:3000/api/test');
    const request = new NextRequest(url);

    // Mock headers by returning them from .get()
    const originalGet = request.headers.get.bind(request.headers);
    request.headers.get = (name: string) => headers[name.toLowerCase()] || null;

    return request;
  }

  // DB-backed resolver stub, keyed on `${workspaceId}:${userId}`. Represents the
  // real PrivateModeAccess table; the gate must consult THIS, never a header.
  function stubDeps(roleMap: Record<string, PrivateModeRole>): PrivateModeGateDeps {
    return {
      resolveRole: async (workspaceId: string, userId: string) =>
        roleMap[`${workspaceId}:${userId}`] ?? null,
    };
  }

  describe('getPrivateModeAccess — role comes from DB, never headers', () => {
    it('IGNORES a spoofed x-private-mode-role header when no DB resolver is wired (fail closed)', async () => {
      const request = createRequest({
        'x-user-id': 'user-123',
        'x-workspace-id': '00000000-0000-0000-0000-000000000456',
        'x-private-mode-role': 'OWNER', // spoofed
      });

      const access = await getPrivateModeAccess(request); // no deps

      expect(access.hasAccess).toBe(false);
      expect(access.role).toBeNull();
      expect(access.userId).toBe('user-123');
      expect(access.workspaceId).toBe('00000000-0000-0000-0000-000000000456');
    });

    it('IGNORES a spoofed header even with a resolver when the DB has no grant', async () => {
      const request = createRequest({
        'x-user-id': 'user-123',
        'x-workspace-id': '00000000-0000-0000-0000-000000000456',
        'x-private-mode-role': 'OWNER', // spoofed
      });

      const access = await getPrivateModeAccess(request, stubDeps({})); // DB has nothing

      expect(access.hasAccess).toBe(false);
      expect(access.role).toBeNull();
    });

    it('grants the DB role for an authorized user', async () => {
      const request = createRequest({
        'x-user-id': 'user-123',
        'x-workspace-id': '00000000-0000-0000-0000-000000000456',
      });

      const access = await getPrivateModeAccess(
        request,
        stubDeps({ '00000000-0000-0000-0000-000000000456:user-123': 'OWNER' }),
      );

      expect(access.hasAccess).toBe(true);
      expect(access.role).toBe('OWNER');
    });

    it('fails closed on missing identity headers', async () => {
      const request = createRequest({});

      const access = await getPrivateModeAccess(request, stubDeps({ 'ws:u': 'OWNER' }));

      expect(access.userId).toBeNull();
      expect(access.workspaceId).toBeNull();
      expect(access.role).toBeNull();
      expect(access.hasAccess).toBe(false);
    });
  });

  describe('enforcePrivateModeGate', () => {
    const identity = { 'x-user-id': 'user-1', 'x-workspace-id': '00000000-0000-0000-0000-000000000001' };

    it('should allow access when private mode not required', async () => {
      const request = createRequest({});
      const result = await enforcePrivateModeGate(request, { required: false });

      expect(result).toBeNull(); // null = continue
    });

    it('should deny access when private mode required but not granted', async () => {
      const request = createRequest(identity);
      const result = await enforcePrivateModeGate(request, { required: true }, stubDeps({}));

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('DENIES a spoofed role header when DB has no grant (core vulnerability fix)', async () => {
      const request = createRequest({ ...identity, 'x-private-mode-role': 'CONSULTANT' });
      const result = await enforcePrivateModeGate(request, { required: true }, stubDeps({}));

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('should allow access when private mode granted in the DB', async () => {
      const request = createRequest(identity);
      const result = await enforcePrivateModeGate(
        request,
        { required: true },
        stubDeps({ '00000000-0000-0000-0000-000000000001:user-1': 'CONSULTANT' }),
      );

      expect(result).toBeNull(); // null = continue
    });

    it('should enforce role requirement using the DB role, not the header', async () => {
      // DB says CONSULTANT; header claims OWNER; gate requires OWNER -> denied.
      const request = createRequest({ ...identity, 'x-private-mode-role': 'OWNER' });
      const result = await enforcePrivateModeGate(
        request,
        { required: true, requiredRole: 'OWNER' },
        stubDeps({ '00000000-0000-0000-0000-000000000001:user-1': 'CONSULTANT' }),
      );

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('should allow access when required role is granted in the DB', async () => {
      const request = createRequest(identity);
      const result = await enforcePrivateModeGate(
        request,
        { required: true, requiredRole: 'OWNER' },
        stubDeps({ '00000000-0000-0000-0000-000000000001:user-1': 'OWNER' }),
      );

      expect(result).toBeNull();
    });

    it('should bypass private mode when requested', async () => {
      const request = createRequest({}); // No private mode access
      const result = await enforcePrivateModeGate(request, {
        required: true,
        bypassPrivateMode: true, // Should bypass the requirement
      });

      expect(result).toBeNull();
    });

    it('should accept feature requirements when an approved DB role exists', async () => {
      const request = createRequest(identity);
      const result = await enforcePrivateModeGate(
        request,
        { required: true, requiredFeatures: ['caseSimulationRunner'] },
        stubDeps({ '00000000-0000-0000-0000-000000000001:user-1': 'CONSULTANT' }),
      );

      expect(result).toBeNull();
    });
  });

  describe('Workspace / tenant isolation', () => {
    it('does not grant access using a grant from a different workspace', async () => {
      // DB grant exists for ws-A, but request is scoped to ws-B.
      const request = createRequest({ 'x-user-id': 'user-1', 'x-workspace-id': '0000000b-0000-0000-0000-000000000000' });
      const result = await enforcePrivateModeGate(
        request,
        { required: true },
        stubDeps({ '0000000a-0000-0000-0000-000000000000:user-1': 'OWNER' }),
      );

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });
  });

  describe('addPrivateModeContext', () => {
    it('should add private mode headers to response', () => {
      const response = new NextResponse('OK');
      const context = { hasAccess: true, role: 'OWNER' as const };

      const updated = addPrivateModeContext(response, context);

      expect(updated.headers.get('x-private-mode-access')).toBe('true');
      expect(updated.headers.get('x-private-mode-role')).toBe('OWNER');
    });

    it('should handle no role in context', () => {
      const response = new NextResponse('OK');
      const context = { hasAccess: false, role: null };

      const updated = addPrivateModeContext(response, context);

      expect(updated.headers.get('x-private-mode-access')).toBe('false');
      expect(updated.headers.get('x-private-mode-role')).toBeNull();
    });
  });

  describe('createPrismaPrivateModeResolver — wires the real DB service', () => {
    it('returns the approved DB role', async () => {
      const fakePrisma = {
        privateModeAccess: {
          findFirst: async (args: { where: Record<string, unknown> }) => {
            if (
              args.where.workspaceId === '00000000-0000-0000-0000-000000000001' &&
              args.where.userId === 'user-1' &&
              args.where.approvalStatus === 'approved' &&
              args.where.revokedAt === null
            ) {
              return { role: 'OWNER' };
            }
            return null;
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolve = createPrismaPrivateModeResolver(fakePrisma as any);

      expect(await resolve('00000000-0000-0000-0000-000000000001', 'user-1')).toBe('OWNER');
      expect(await resolve('00000000-0000-0000-0000-000000000001', 'someone-else')).toBeNull();
    });
  });

  describe('Predefined gate configurations', () => {
    it('OWNER_DASHBOARD_GATE should bypass private mode', () => {
      expect(OWNER_DASHBOARD_GATE.bypassPrivateMode).toBe(true);
      expect(OWNER_DASHBOARD_GATE.required).toBe(false);
    });

    it('PRIVATE_ADMIN_GATE should require OWNER role', () => {
      expect(PRIVATE_ADMIN_GATE.required).toBe(true);
      expect(PRIVATE_ADMIN_GATE.requiredRole).toBe('OWNER');
    });

    it('PRIVATE_CONSULTANT_GATE should require specific features', () => {
      expect(PRIVATE_CONSULTANT_GATE.required).toBe(true);
      expect(PRIVATE_CONSULTANT_GATE.requiredFeatures).toContain('caseSimulationRunner');
      expect(PRIVATE_CONSULTANT_GATE.requiredFeatures).toContain('growthIntelligence');
    });

    it('PRIVATE_ANALYST_GATE should require data upload feature', () => {
      expect(PRIVATE_ANALYST_GATE.required).toBe(true);
      expect(PRIVATE_ANALYST_GATE.requiredFeatures).toContain('fullDataUpload');
    });
  });

  describe('Acceptance Gates (Protocol §34)', () => {
    const identity = { 'x-user-id': 'user-1', 'x-workspace-id': '00000000-0000-0000-0000-000000000001' };

    it('should gate private mode admin features behind OWNER role (DB-sourced)', async () => {
      // DB role is CONSULTANT; admin gate requires OWNER.
      const request = createRequest(identity);
      const result = await enforcePrivateModeGate(
        request,
        PRIVATE_ADMIN_GATE,
        stubDeps({ '00000000-0000-0000-0000-000000000001:user-1': 'CONSULTANT' }),
      );

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('should allow OWNER access to private admin features (DB-sourced)', async () => {
      const request = createRequest(identity);
      const result = await enforcePrivateModeGate(
        request,
        PRIVATE_ADMIN_GATE,
        stubDeps({ '00000000-0000-0000-0000-000000000001:user-1': 'OWNER' }),
      );

      expect(result).toBeNull();
    });

    it('should keep Owner Mode dashboard public (backward compatible)', async () => {
      const request = createRequest({});
      const result = await enforcePrivateModeGate(request, OWNER_DASHBOARD_GATE);

      expect(result).toBeNull();
    });

    it('should provide private mode context in responses', () => {
      const response = new NextResponse('Dashboard data');
      const context = { hasAccess: true, role: 'CONSULTANT' as const };

      const updated = addPrivateModeContext(response, context);

      expect(updated.headers.get('x-private-mode-access')).toBe('true');
      expect(updated.headers.get('x-private-mode-role')).toBe('CONSULTANT');
    });
  });

  describe('Role access isolation (DB-sourced)', () => {
    const identity = { 'x-user-id': 'user-1', 'x-workspace-id': '00000000-0000-0000-0000-000000000001' };

    it('should prevent CONSULTANT from accessing OWNER-only features', async () => {
      const request = createRequest(identity);
      const result = await enforcePrivateModeGate(
        request,
        { required: true, requiredRole: 'OWNER' },
        stubDeps({ '00000000-0000-0000-0000-000000000001:user-1': 'CONSULTANT' }),
      );

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('should prevent ANALYST from accessing OWNER-only features', async () => {
      const request = createRequest(identity);
      const result = await enforcePrivateModeGate(
        request,
        { required: true, requiredRole: 'OWNER' },
        stubDeps({ '00000000-0000-0000-0000-000000000001:user-1': 'ANALYST' }),
      );

      expect(result).not.toBeNull();
    });

    it('should allow multiple roles to access non-OWNER features', async () => {
      for (const role of ['OWNER', 'CONSULTANT', 'ANALYST'] as const) {
        const request = createRequest(identity);
        const result = await enforcePrivateModeGate(
          request,
          { required: true },
          stubDeps({ '00000000-0000-0000-0000-000000000001:user-1': role }),
        );

        expect(result).toBeNull();
      }
    });
  });
});
