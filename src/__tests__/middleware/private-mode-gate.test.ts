import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  getPrivateModeAccess,
  enforcePrivateModeGate,
  addPrivateModeContext,
  OWNER_DASHBOARD_GATE,
  PRIVATE_ADMIN_GATE,
  PRIVATE_CONSULTANT_GATE,
  PRIVATE_ANALYST_GATE,
} from '@/middleware/private-mode-gate';

describe('B25-S1: Private Mode Gate Middleware', () => {
  function createRequest(headers: Record<string, string>): NextRequest {
    const url = new URL('http://localhost:3000/api/test');
    const request = new NextRequest(url);

    // Mock headers by returning them from .get()
    const originalGet = request.headers.get.bind(request.headers);
    request.headers.get = (name: string) => headers[name.toLowerCase()] || null;

    return request;
  }

  describe('getPrivateModeAccess', () => {
    it('should extract private mode access from request headers', async () => {
      const request = createRequest({
        'x-user-id': 'user-123',
        'x-workspace-id': 'ws-456',
        'x-private-mode-role': 'OWNER',
      });

      const access = await getPrivateModeAccess(request);

      expect(access.hasAccess).toBe(true);
      expect(access.role).toBe('OWNER');
      expect(access.userId).toBe('user-123');
      expect(access.workspaceId).toBe('ws-456');
    });

    it('should return null role when not in private mode', async () => {
      const request = createRequest({
        'x-user-id': 'user-123',
        'x-workspace-id': 'ws-456',
      });

      const access = await getPrivateModeAccess(request);

      expect(access.hasAccess).toBe(false);
      expect(access.role).toBeNull();
    });

    it('should handle missing headers', async () => {
      const request = createRequest({});

      const access = await getPrivateModeAccess(request);

      expect(access.userId).toBeNull();
      expect(access.workspaceId).toBeNull();
      expect(access.role).toBeNull();
      expect(access.hasAccess).toBe(false);
    });
  });

  describe('enforcePrivateModeGate', () => {
    it('should allow access when private mode not required', async () => {
      const request = createRequest({});
      const result = await enforcePrivateModeGate(request, { required: false });

      expect(result).toBeNull(); // null = continue
    });

    it('should deny access when private mode required but not granted', async () => {
      const request = createRequest({});
      const result = await enforcePrivateModeGate(request, { required: true });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('should allow access when private mode granted', async () => {
      const request = createRequest({
        'x-user-id': 'user-123',
        'x-workspace-id': 'ws-456',
        'x-private-mode-role': 'CONSULTANT',
      });

      const result = await enforcePrivateModeGate(request, { required: true });

      expect(result).toBeNull(); // null = continue
    });

    it('should check role requirement', async () => {
      const request = createRequest({
        'x-private-mode-role': 'CONSULTANT',
      });

      const result = await enforcePrivateModeGate(request, {
        required: true,
        requiredRole: 'OWNER',
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('should allow access when required role is granted', async () => {
      const request = createRequest({
        'x-private-mode-role': 'OWNER',
      });

      const result = await enforcePrivateModeGate(request, {
        required: true,
        requiredRole: 'OWNER',
      });

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

    it('should accept feature requirements when private mode enabled', async () => {
      const request = createRequest({
        'x-private-mode-role': 'CONSULTANT',
      });

      const result = await enforcePrivateModeGate(request, {
        required: true,
        requiredFeatures: ['caseSimulationRunner'], // CONSULTANT has this
      });

      // Current implementation allows any approved role for feature checks
      // Production implementation will verify against role feature sets
      expect(result).toBeNull();
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
    it('should gate private mode admin features behind OWNER role', async () => {
      // User with CONSULTANT role tries to access admin features
      const request = createRequest({
        'x-private-mode-role': 'CONSULTANT',
      });

      const result = await enforcePrivateModeGate(request, PRIVATE_ADMIN_GATE);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('should allow OWNER access to private admin features', async () => {
      const request = createRequest({
        'x-private-mode-role': 'OWNER',
      });

      const result = await enforcePrivateModeGate(request, PRIVATE_ADMIN_GATE);

      expect(result).toBeNull();
    });

    it('should keep Owner Mode dashboard public (backward compatible)', async () => {
      // User without private mode access should still access dashboard
      const request = createRequest({});

      const result = await enforcePrivateModeGate(request, OWNER_DASHBOARD_GATE);

      expect(result).toBeNull();
    });

    it('should provide private mode context in responses', () => {
      const response = new NextResponse('Dashboard data');
      const context = { hasAccess: true, role: 'CONSULTANT' as const };

      const updated = addPrivateModeContext(response, context);

      // Handlers can check these headers to conditionally render features
      expect(updated.headers.get('x-private-mode-access')).toBe('true');
      expect(updated.headers.get('x-private-mode-role')).toBe('CONSULTANT');
    });
  });

  describe('Role access isolation', () => {
    it('should prevent CONSULTANT from accessing OWNER-only features', async () => {
      const request = createRequest({
        'x-private-mode-role': 'CONSULTANT',
      });

      const result = await enforcePrivateModeGate(request, {
        required: true,
        requiredRole: 'OWNER',
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('should prevent ANALYST from accessing OWNER-only features', async () => {
      const request = createRequest({
        'x-private-mode-role': 'ANALYST',
      });

      const result = await enforcePrivateModeGate(request, {
        required: true,
        requiredRole: 'OWNER',
      });

      expect(result).not.toBeNull();
    });

    it('should allow multiple roles to access non-OWNER features', async () => {
      for (const role of ['OWNER', 'CONSULTANT', 'ANALYST'] as const) {
        const request = createRequest({
          'x-private-mode-role': role,
        });

        // Gate that doesn't require specific role
        const result = await enforcePrivateModeGate(request, { required: true });

        expect(result).toBeNull();
      }
    });
  });
});
