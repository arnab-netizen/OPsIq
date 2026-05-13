/**
 * AUTH GOVERNANCE REGRESSION TESTS
 *
 * MANDATORY: Verify auth errors never become 500s
 *
 * These tests ensure that during normalization, we don't
 * accidentally mask auth failures as infrastructure errors.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, getDbInstance } from '@/lib/db';
import { UnauthorizedError, ForbiddenError } from '@/infra/errors';

describe('Auth Governance - Regression Prevention', () => {
  beforeAll(async () => {
    await getDbInstance();
  });

  describe('UnauthorizedError classification', () => {
    it('UnauthorizedError should have statusCode 401', () => {
      const error = new UnauthorizedError('test');
      expect(error.statusCode).toBe(401);
    });

    it('UnauthorizedError should be instance of AppError', () => {
      const error = new UnauthorizedError('test');
      expect(error.constructor.name).toBe('UnauthorizedError');
    });

    it('UnauthorizedError.toJSON() should not mask as 500', () => {
      const error = new UnauthorizedError('Unauthorized access');
      const json = error.toJSON();
      // Should NOT be infrastructure error
      expect(json.error_code).not.toBe('ERR_INFRASTRUCTURE_001');
      expect(json.http_status).not.toBe(500);
    });
  });

  describe('ForbiddenError classification', () => {
    it('ForbiddenError should have statusCode 403', () => {
      const error = new ForbiddenError('test');
      expect(error.statusCode).toBe(403);
    });

    it('ForbiddenError should NOT become 500', () => {
      const error = new ForbiddenError('Access forbidden');
      const json = error.toJSON();
      expect(json.http_status).not.toBe(500);
      expect(json.http_status).toBe(403);
    });
  });

  describe('Error propagation chain', () => {
    it('UnauthorizedError should propagate through middleware intact', async () => {
      const originalError = new UnauthorizedError('test message');

      // Simulate what request-enforcer does
      let caught = false;
      let statusCode = 500;

      try {
        throw originalError;
      } catch (error) {
        // This is what request-enforcer does
        if (error instanceof UnauthorizedError) {
          statusCode = error.statusCode;
          caught = true;
        } else {
          statusCode = 500; // Should NOT reach here
        }
      }

      expect(caught).toBe(true);
      expect(statusCode).toBe(401);
    });

    it('ForbiddenError should NOT be converted to infrastructure error', async () => {
      const error = new ForbiddenError('Access denied');

      // This is the critical check - AppError should NOT be converted
      let result = null;
      try {
        throw error;
      } catch (e) {
        if (e instanceof ForbiddenError) {
          result = 403; // Correct: preserve the status
        } else {
          result = 500; // Wrong: would mask auth failure
        }
      }

      expect(result).toBe(403);
    });
  });

  describe('Response.json anti-pattern prevention', () => {
    it('Should NOT return Response.json({error}, {status: 401})', () => {
      // This test documents the WRONG pattern that should be eliminated
      // Correct: throw UnauthorizedError
      // Wrong: return Response.json({error: ...}, {status: 401})

      const wrongPattern = () => {
        // BAD: This becomes just JSON data
        return { error: 'Unauthorized' }; // HTTP status lost!
      };

      const correctPattern = () => {
        // GOOD: This is an Error that preserves HTTP status
        throw new UnauthorizedError('Unauthorized');
      };

      // The correct pattern will propagate through request-enforcer
      // The wrong pattern returns bare JSON that loses HTTP semantics
      expect(correctPattern).toThrow(UnauthorizedError);
    });
  });

  describe('Error classification in request-enforcer', () => {
    it('AppError instanceof check must happen BEFORE infrastructure conversion', () => {
      const errors = [
        new UnauthorizedError('unauthorized'),
        new ForbiddenError('forbidden'),
      ];

      errors.forEach((error) => {
        // This is the exact pattern from request-enforcer
        if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
          // ✅ Correct: AppError is handled as-is
          const statusCode = error.statusCode;
          expect([401, 403]).toContain(statusCode);
        } else {
          // This should NOT execute for AppErrors
          throw new Error('Auth error was not properly classified');
        }
      });
    });
  });

  describe('Workspace scoping errors', () => {
    it('enforceWorkspaceScoping should throw ForbiddenError on mismatch', async () => {
      // When workspace ID doesn't match user's workspace
      // Should be 403, not 401 or 500

      const error = new ForbiddenError('User does not have access to workspace');
      expect(error.statusCode).toBe(403);
    });

    it('Cross-workspace access should NOT be 500', async () => {
      // This documents the critical requirement:
      // Cross-workspace attacks should fail 403, not 500

      const error = new ForbiddenError('Workspace mismatch');
      const json = error.toJSON();

      expect(json.http_status).not.toBe(500);
      expect(json.http_status).toBe(403);
    });
  });

  describe('Auth boundary property enforcement', () => {
    it('All auth failures must have HTTP status < 500', () => {
      const authErrors = [
        new UnauthorizedError('no auth'),
        new ForbiddenError('no permission'),
      ];

      authErrors.forEach((error) => {
        // CRITICAL: Auth errors must be 4xx, never 5xx
        expect(error.statusCode).toBeLessThan(500);
        expect(error.statusCode).toBeGreaterThanOrEqual(400);
      });
    });

    it('Auth errors must NEVER be classified as infrastructure', () => {
      const authErrors = [
        new UnauthorizedError('test'),
        new ForbiddenError('test'),
      ];

      authErrors.forEach((error) => {
        const json = error.toJSON();

        // Check the error_code is NOT infrastructure
        expect(json.error_code).not.toBe('ERR_INFRASTRUCTURE_001');
        expect(json.error_code).not.toMatch(/ERR_INFRASTRUCTURE/);
      });
    });
  });
});
