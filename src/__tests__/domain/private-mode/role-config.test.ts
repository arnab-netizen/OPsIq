import { describe, it, expect } from 'vitest';
import {
  PrivateModeRole,
  PrivateModeFeatures,
  RoleFeatureSets,
  hasFeatureAccess,
  getAvailableFeatures,
  hasRequiredFeatures,
  PrivateModeConfig,
  validatePrivateModeConfig,
  getLoggableConfig,
} from '@/domain/private-mode/role-config';

describe('PrivateModeRoleConfig', () => {
  describe('Role definitions', () => {
    it('should define three roles: OWNER, CONSULTANT, ANALYST', () => {
      const roles: PrivateModeRole[] = ['OWNER', 'CONSULTANT', 'ANALYST'];
      expect(roles).toHaveLength(3);
    });

    it('should have role feature sets for all roles', () => {
      expect(RoleFeatureSets).toHaveProperty('OWNER');
      expect(RoleFeatureSets).toHaveProperty('CONSULTANT');
      expect(RoleFeatureSets).toHaveProperty('ANALYST');
    });
  });

  describe('OWNER role (full access)', () => {
    it('should have access to all features', () => {
      const features = getAvailableFeatures('OWNER');
      expect(features.fullDataUpload).toBe(true);
      expect(features.ownerDashboard).toBe(true);
      expect(features.manualOverride).toBe(true);
      expect(features.caseSimulationRunner).toBe(true);
      expect(features.growthIntelligence).toBe(true);
      expect(features.actionTracker).toBe(true);
      expect(features.learningLog).toBe(true);
      expect(features.adminReview).toBe(true);
      expect(features.confidenceDashboard).toBe(true);
    });

    it('should have feature access for any feature', () => {
      const allFeatures: (keyof PrivateModeFeatures)[] = [
        'fullDataUpload',
        'ownerDashboard',
        'manualOverride',
        'caseSimulationRunner',
        'growthIntelligence',
        'actionTracker',
        'learningLog',
        'adminReview',
        'confidenceDashboard',
      ];
      allFeatures.forEach((feature) => {
        expect(hasFeatureAccess('OWNER', feature)).toBe(true);
      });
    });
  });

  describe('CONSULTANT role (limited access)', () => {
    it('should not have access to fullDataUpload, manualOverride, learningLog, adminReview', () => {
      expect(hasFeatureAccess('CONSULTANT', 'fullDataUpload')).toBe(false);
      expect(hasFeatureAccess('CONSULTANT', 'manualOverride')).toBe(false);
      expect(hasFeatureAccess('CONSULTANT', 'learningLog')).toBe(false);
      expect(hasFeatureAccess('CONSULTANT', 'adminReview')).toBe(false);
    });

    it('should have access to dashboard, simulation, growth, tracker, confidence', () => {
      expect(hasFeatureAccess('CONSULTANT', 'ownerDashboard')).toBe(true);
      expect(hasFeatureAccess('CONSULTANT', 'caseSimulationRunner')).toBe(true);
      expect(hasFeatureAccess('CONSULTANT', 'growthIntelligence')).toBe(true);
      expect(hasFeatureAccess('CONSULTANT', 'actionTracker')).toBe(true);
      expect(hasFeatureAccess('CONSULTANT', 'confidenceDashboard')).toBe(true);
    });
  });

  describe('ANALYST role (data focus, no admin)', () => {
    it('should have access to data upload and analysis features', () => {
      expect(hasFeatureAccess('ANALYST', 'fullDataUpload')).toBe(true);
      expect(hasFeatureAccess('ANALYST', 'caseSimulationRunner')).toBe(true);
      expect(hasFeatureAccess('ANALYST', 'growthIntelligence')).toBe(true);
      expect(hasFeatureAccess('ANALYST', 'actionTracker')).toBe(true);
      expect(hasFeatureAccess('ANALYST', 'confidenceDashboard')).toBe(true);
    });

    it('should not have access to ownerDashboard, manualOverride, learningLog, adminReview', () => {
      expect(hasFeatureAccess('ANALYST', 'ownerDashboard')).toBe(false);
      expect(hasFeatureAccess('ANALYST', 'manualOverride')).toBe(false);
      expect(hasFeatureAccess('ANALYST', 'learningLog')).toBe(false);
      expect(hasFeatureAccess('ANALYST', 'adminReview')).toBe(false);
    });
  });

  describe('Feature access function', () => {
    it('should return true for allowed features', () => {
      expect(hasFeatureAccess('OWNER', 'manualOverride')).toBe(true);
      expect(hasFeatureAccess('CONSULTANT', 'ownerDashboard')).toBe(true);
      expect(hasFeatureAccess('ANALYST', 'fullDataUpload')).toBe(true);
    });

    it('should return false for denied features', () => {
      expect(hasFeatureAccess('CONSULTANT', 'adminReview')).toBe(false);
      expect(hasFeatureAccess('ANALYST', 'ownerDashboard')).toBe(false);
    });
  });

  describe('hasRequiredFeatures', () => {
    it('should return true if role has all required features', () => {
      expect(hasRequiredFeatures('OWNER', ['fullDataUpload', 'manualOverride', 'adminReview'])).toBe(true);
      expect(hasRequiredFeatures('CONSULTANT', ['ownerDashboard', 'caseSimulationRunner'])).toBe(true);
      expect(hasRequiredFeatures('ANALYST', ['fullDataUpload', 'growthIntelligence'])).toBe(true);
    });

    it('should return false if role lacks any required feature', () => {
      expect(hasRequiredFeatures('CONSULTANT', ['fullDataUpload', 'ownerDashboard'])).toBe(false);
      expect(hasRequiredFeatures('ANALYST', ['manualOverride', 'actionTracker'])).toBe(false);
    });

    it('should return true for empty required features list', () => {
      expect(hasRequiredFeatures('ANALYST', [])).toBe(true);
    });
  });

  describe('Config validation', () => {
    it('should parse valid config', () => {
      const config = {
        enabled: true,
        maxConsultantsPerWorkspace: 5,
        maxAnalystsPerWorkspace: 10,
        requireOwnerApprovalForRole: true,
        allowRoleRevocation: true,
        auditAllActions: true,
        leakPreviousAccessOnRevoke: false,
      };
      const parsed = validatePrivateModeConfig(config);
      expect(parsed.enabled).toBe(true);
      expect(parsed.maxConsultantsPerWorkspace).toBe(5);
    });

    it('should use default values for missing fields', () => {
      const config = { enabled: true };
      const parsed = validatePrivateModeConfig(config);
      expect(parsed.enabled).toBe(true);
      expect(parsed.maxConsultantsPerWorkspace).toBe(5);
      expect(parsed.maxAnalystsPerWorkspace).toBe(10);
      expect(parsed.requireOwnerApprovalForRole).toBe(true);
      expect(parsed.allowRoleRevocation).toBe(true);
      expect(parsed.auditAllActions).toBe(true);
      expect(parsed.leakPreviousAccessOnRevoke).toBe(false);
    });

    it('should throw for invalid config values', () => {
      expect(() => {
        validatePrivateModeConfig({
          enabled: true,
          maxConsultantsPerWorkspace: -1, // negative not allowed
        });
      }).toThrow();

      expect(() => {
        validatePrivateModeConfig({
          enabled: 'yes', // should be boolean
        });
      }).toThrow();
    });
  });

  describe('Config logging', () => {
    it('should return loggable config without sensitive fields', () => {
      const config = {
        enabled: true,
        maxConsultantsPerWorkspace: 5,
        maxAnalystsPerWorkspace: 10,
        requireOwnerApprovalForRole: true,
        allowRoleRevocation: true,
        auditAllActions: true,
        leakPreviousAccessOnRevoke: false,
      };
      const parsed = validatePrivateModeConfig(config);
      const loggable = getLoggableConfig(parsed);

      expect(loggable).toHaveProperty('enabled');
      expect(loggable).toHaveProperty('maxConsultantsPerWorkspace');
      expect(loggable).not.toHaveProperty('secretToken');
    });
  });
});
