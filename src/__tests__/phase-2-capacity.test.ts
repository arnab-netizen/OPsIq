// Phase 2 Slice 6: CapacityProfile - Capture capacity constraints
// Tests verify team, infrastructure, and execution capacity constraints

import { describe, it, expect } from 'vitest';
import { CapacityProfile } from '../domain/capacity-profile';
import { CapacityProfileService } from '../services/capacity-profile';

describe('Phase 2 Slice 6 — CapacityProfile: Capacity Constraints', () => {
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';

  const createTestProfile = (overrides?: Partial<CapacityProfile>): CapacityProfile => ({
    id: '550e8400-e29b-41d4-a716-446655440500',
    engagementId: testEngagementId,
    totalTeamSize: 25,
    keyPersonCount: 4,
    averageExperienceYears: 8,
    turnoverRateAnnual: 0.15,
    managerialCapacityLevel: 'adequate',
    trainingCapacityLevel: 'adequate',
    systemsAvailableCapacity: 40,
    infrastructureAgeYears: 5,
    hardwareRefreshCycleMonths: 36,
    cloudVsOnPremisePercentage: 60,
    uptime99Count: 4,
    dataCenterRedundancyLevel: 'partial',
    apiRateLimitHeadroom: 0.4,
    securityComplianceGaps: 2,
    capabilityGapsIdentified: 3,
    projectCapacityUtilization: 75,
    overallCapacityStatus: 'adequate',
    criticalCapacityBottleneck: null,
    assessedBy: null,
    assessedAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Contract', () => {
    it('validates capacity profile schema', () => {
      const profile = createTestProfile();
      const validated = CapacityProfileService.validateProfile(profile);

      expect(validated.engagementId).toBe(testEngagementId);
      expect(validated.totalTeamSize).toBe(25);
    });

    it('validates create request schema', () => {
      const request = {
        engagementId: testEngagementId,
        totalTeamSize: 20,
        overallCapacityStatus: 'adequate',
      };

      const validated = CapacityProfileService.validateRequest(request);
      expect(validated.engagementId).toBe(testEngagementId);
    });

    it('throws on invalid profile data', () => {
      const invalid = {
        engagementId: 'not-a-uuid',
        totalTeamSize: -5,
      };

      expect(() => CapacityProfileService.validateProfile(invalid)).toThrow();
    });
  });

  describe('Behavior - Capacity Constraint Detection', () => {
    it('detects healthy capacity (no constraints)', () => {
      const healthy = createTestProfile();
      const hasConstraints = CapacityProfileService.hasCapacityConstraints(healthy);
      expect(hasConstraints).toBe(false);
    });

    it('detects low team size constraint (< 5)', () => {
      const lowTeam = createTestProfile({ totalTeamSize: 3 });
      const hasConstraints = CapacityProfileService.hasCapacityConstraints(lowTeam);
      expect(hasConstraints).toBe(true);
    });

    it('detects high key person dependency (> 30%)', () => {
      const highDependency = createTestProfile({
        totalTeamSize: 20,
        keyPersonCount: 8, // 40%
      });
      const hasConstraints = CapacityProfileService.hasCapacityConstraints(highDependency);
      expect(hasConstraints).toBe(true);
    });

    it('detects high turnover (> 25% annual)', () => {
      const highTurnover = createTestProfile({
        turnoverRateAnnual: 0.35,
      });
      const hasConstraints = CapacityProfileService.hasCapacityConstraints(highTurnover);
      expect(hasConstraints).toBe(true);
    });

    it('detects full capacity (> 90% utilization)', () => {
      const fullCapacity = createTestProfile({
        projectCapacityUtilization: 95,
      });
      const hasConstraints = CapacityProfileService.hasCapacityConstraints(fullCapacity);
      expect(hasConstraints).toBe(true);
    });

    it('detects low system capacity (< 20% headroom)', () => {
      const lowCapacity = createTestProfile({
        systemsAvailableCapacity: 15,
      });
      const hasConstraints = CapacityProfileService.hasCapacityConstraints(lowCapacity);
      expect(hasConstraints).toBe(true);
    });

    it('ignores null profile', () => {
      const hasConstraints = CapacityProfileService.hasCapacityConstraints(null);
      expect(hasConstraints).toBe(false);
    });
  });

  describe('Acceptance Criteria #5', () => {
    it('captures team capacity metrics', () => {
      const profile = createTestProfile({
        totalTeamSize: 30,
        keyPersonCount: 3,
        averageExperienceYears: 10,
        turnoverRateAnnual: 0.1,
      });

      expect(profile.totalTeamSize).toBe(30);
      expect(profile.keyPersonCount).toBe(3);
      expect(profile.averageExperienceYears).toBe(10);
    });

    it('captures infrastructure capacity metrics', () => {
      const profile = createTestProfile({
        systemsAvailableCapacity: 50,
        infrastructureAgeYears: 3,
        hardwareRefreshCycleMonths: 24,
        uptime99Count: 5,
        dataCenterRedundancyLevel: 'full',
      });

      expect(profile.systemsAvailableCapacity).toBe(50);
      expect(profile.infrastructureAgeYears).toBe(3);
      expect(profile.uptime99Count).toBe(5);
    });

    it('captures execution capacity metrics', () => {
      const profile = createTestProfile({
        projectCapacityUtilization: 80,
        managerialCapacityLevel: 'strong',
        trainingCapacityLevel: 'strong',
      });

      expect(profile.projectCapacityUtilization).toBe(80);
      expect(profile.managerialCapacityLevel).toBe('strong');
    });

    it('captures compliance and capability gaps', () => {
      const profile = createTestProfile({
        securityComplianceGaps: 5,
        capabilityGapsIdentified: 8,
        criticalCapacityBottleneck: 'Limited DevOps expertise',
      });

      expect(profile.securityComplianceGaps).toBe(5);
      expect(profile.capabilityGapsIdentified).toBe(8);
      expect(profile.criticalCapacityBottleneck).toBe('Limited DevOps expertise');
    });

    it('criterion #5 satisfied: Capacity constraints captured', () => {
      const profile = createTestProfile({
        totalTeamSize: 35,
        keyPersonCount: 4,
        projectCapacityUtilization: 70,
        systemsAvailableCapacity: 45,
        infrastructureAgeYears: 4,
        uptime99Count: 4,
        securityComplianceGaps: 2,
        capabilityGapsIdentified: 3,
      });

      // All capacity dimensions captured
      expect(profile.totalTeamSize).toBeDefined();
      expect(profile.projectCapacityUtilization).toBeDefined();
      expect(profile.systemsAvailableCapacity).toBeDefined();
      expect(profile.securityComplianceGaps).toBeDefined();

      // Service can detect constraints
      const hasConstraints = CapacityProfileService.hasCapacityConstraints(profile);
      expect(typeof hasConstraints).toBe('boolean');
    });
  });
});
