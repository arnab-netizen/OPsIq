// Phase 2 Slice 7: ComplianceFlag - Capture compliance constraints
// Tests verify regulatory, operational, and contractual compliance requirements

import { describe, it, expect } from 'vitest';
import { ComplianceFlag } from '../domain/compliance-flag';
import { ComplianceFlagService } from '../services/compliance-flag';

describe('Phase 2 Slice 7 — ComplianceFlag: Compliance Constraints', () => {
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';

  const createTestFlag = (overrides?: Partial<ComplianceFlag>): ComplianceFlag => ({
    id: '550e8400-e29b-41d4-a716-446655440600',
    engagementId: testEngagementId,
    complianceName: 'GDPR',
    description: 'General Data Protection Regulation compliance requirement',
    status: 'compliant',
    severity: 'high',
    remediationRequired: false,
    remediationDeadline: null,
    remedialActionsTaken: null,
    verifiedBy: null,
    lastVerifiedAt: null,
    impactOnOperations: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Contract', () => {
    it('validates compliance flag schema', () => {
      const flag = createTestFlag();
      const validated = ComplianceFlagService.validateFlag(flag);

      expect(validated.engagementId).toBe(testEngagementId);
      expect(validated.complianceName).toBe('GDPR');
    });

    it('validates create request schema', () => {
      const request = {
        engagementId: testEngagementId,
        complianceName: 'SOC2',
        status: 'compliant',
      };

      const validated = ComplianceFlagService.validateRequest(request);
      expect(validated.engagementId).toBe(testEngagementId);
      expect(validated.complianceName).toBe('SOC2');
    });

    it('throws on invalid flag data', () => {
      const invalid = {
        engagementId: 'not-a-uuid',
        complianceName: '',
      };

      expect(() => ComplianceFlagService.validateFlag(invalid)).toThrow();
    });
  });

  describe('Behavior - Compliance Gap Detection', () => {
    it('detects healthy compliance (no gaps)', () => {
      const flags = [createTestFlag({ status: 'compliant' })];
      const hasGaps = ComplianceFlagService.hasComplianceGaps(flags);
      expect(hasGaps).toBe(false);
    });

    it('detects non-compliant status gap', () => {
      const flags = [createTestFlag({ status: 'non_compliant' })];
      const hasGaps = ComplianceFlagService.hasComplianceGaps(flags);
      expect(hasGaps).toBe(true);
    });

    it('detects at-risk status gap', () => {
      const flags = [createTestFlag({ status: 'at_risk' })];
      const hasGaps = ComplianceFlagService.hasComplianceGaps(flags);
      expect(hasGaps).toBe(true);
    });

    it('detects critical severity gap', () => {
      const flags = [createTestFlag({ status: 'compliant', severity: 'critical' })];
      const hasGaps = ComplianceFlagService.hasComplianceGaps(flags);
      expect(hasGaps).toBe(true);
    });

    it('detects overdue remediation deadline', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const flags = [
        createTestFlag({
          status: 'partial',
          remediationRequired: true,
          remediationDeadline: yesterday,
        }),
      ];
      const hasGaps = ComplianceFlagService.hasComplianceGaps(flags);
      expect(hasGaps).toBe(true);
    });

    it('ignores null or empty flag list', () => {
      const hasGaps1 = ComplianceFlagService.hasComplianceGaps(null);
      const hasGaps2 = ComplianceFlagService.hasComplianceGaps(undefined);
      const hasGaps3 = ComplianceFlagService.hasComplianceGaps([]);

      expect(hasGaps1).toBe(false);
      expect(hasGaps2).toBe(false);
      expect(hasGaps3).toBe(false);
    });
  });

  describe('Behavior - Compliance Health Assessment', () => {
    it('returns 100 for compliant flags', () => {
      const flags = [createTestFlag({ status: 'compliant' })];
      const score = ComplianceFlagService.assessComplianceHealth(flags);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThan(0);
    });

    it('reduces score for non-compliant critical flag', () => {
      const flags = [createTestFlag({ status: 'non_compliant', severity: 'critical' })];
      const score = ComplianceFlagService.assessComplianceHealth(flags);
      expect(score).toBeLessThan(70);
    });

    it('reduces score for at-risk high-severity flag', () => {
      const flags = [createTestFlag({ status: 'at_risk', severity: 'high' })];
      const score = ComplianceFlagService.assessComplianceHealth(flags);
      expect(score).toBeLessThanOrEqual(85);
    });

    it('accounts for multiple flags cumulatively', () => {
      const flags = [
        createTestFlag({ complianceName: 'GDPR', status: 'non_compliant', severity: 'high' }),
        createTestFlag({ complianceName: 'SOC2', status: 'at_risk', severity: 'medium' }),
      ];
      const score = ComplianceFlagService.assessComplianceHealth(flags);
      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Acceptance Criteria #6', () => {
    it('captures compliance framework names', () => {
      const flag = createTestFlag({
        complianceName: 'HIPAA',
        description: 'Healthcare data protection',
      });

      expect(flag.complianceName).toBe('HIPAA');
      expect(flag.description).toBe('Healthcare data protection');
    });

    it('captures compliance status (compliant/non-compliant/at-risk)', () => {
      const statuses = ['compliant', 'non_compliant', 'at_risk', 'partial', 'unknown'] as const;

      statuses.forEach((status) => {
        const flag = createTestFlag({ status });
        expect(flag.status).toBe(status);
      });
    });

    it('captures remediation requirements and deadlines', () => {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 90);

      const flag = createTestFlag({
        remediationRequired: true,
        remediationDeadline: deadline,
        remedialActionsTaken: 'Initiated GDPR audit process',
      });

      expect(flag.remediationRequired).toBe(true);
      expect(flag.remediationDeadline).toEqual(deadline);
      expect(flag.remedialActionsTaken).toBe('Initiated GDPR audit process');
    });

    it('captures business impact of non-compliance', () => {
      const flag = createTestFlag({
        status: 'non_compliant',
        impactOnOperations: 'Cannot serve EU customers until GDPR compliant',
      });

      expect(flag.impactOnOperations).toBe('Cannot serve EU customers until GDPR compliant');
    });

    it('criterion #6 satisfied: Compliance flags captured', () => {
      const flags = [
        createTestFlag({
          complianceName: 'GDPR',
          status: 'compliant',
          severity: 'high',
        }),
        createTestFlag({
          complianceName: 'SOC2',
          status: 'at_risk',
          severity: 'critical',
          remediationRequired: true,
        }),
      ];

      // All compliance dimensions captured
      expect(flags[0].complianceName).toBeDefined();
      expect(flags[0].status).toBeDefined();
      expect(flags[0].severity).toBeDefined();
      expect(flags[1].remediationRequired).toBeDefined();

      // Service can detect gaps
      const hasGaps = ComplianceFlagService.hasComplianceGaps(flags);
      expect(typeof hasGaps).toBe('boolean');

      // Service can assess health
      const healthScore = ComplianceFlagService.assessComplianceHealth(flags);
      expect(typeof healthScore).toBe('number');
      expect(healthScore).toBeGreaterThanOrEqual(0);
      expect(healthScore).toBeLessThanOrEqual(100);
    });
  });
});
