// Phase 2 Slice 12B: OnboardingSession - Quick-start context path
// Tests verify quick-start context generation and freshness management

import { describe, it, expect } from 'vitest';
import { OnboardingSession } from '../domain/onboarding-session';
import { OnboardingSessionService } from '../services/onboarding-session';

describe('Phase 2 Slice 12B — OnboardingSession: Quick-start Context', () => {
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';
  const testOperatorId = '550e8400-e29b-41d4-a716-446655440001';

  const createTestSession = (overrides?: Partial<OnboardingSession>): OnboardingSession => ({
    id: '550e8400-e29b-41d4-a716-446655440c00',
    engagementId: testEngagementId,
    operatorId: testOperatorId,
    contextType: 'full_context',
    status: 'prepared',
    quickStartContext: {
      businessModelSnapshot: {
        primaryModel: 'saas',
        isDiversified: true,
        complexity: 'complex',
        maturityState: 'GROWTH',
      },
      constraintSummary: {
        financialStatus: 'adequate',
        customerHealthStatus: 'healthy',
        capacityStatus: 'adequate',
        complianceGapCount: 0,
        totalConstraintCount: 5,
      },
      keyMetrics: {
        revenueGrowthTrend: 'positive',
        customerChurnRisk: 'normal',
        teamCapacityUtilization: 65,
        budgetUtilizationPercent: 45,
      },
      operatorReadiness: {
        hasRecentHistory: true,
        hasAdherenceData: true,
        contextFreshnessHours: 2,
      },
    },
    keyRecommendationPointers: ['high_priority_recommendations'],
    emergencyItems: [],
    preparedAt: new Date(),
    deliveredAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Contract', () => {
    it('validates onboarding session schema', () => {
      const session = createTestSession();
      const validated = OnboardingSessionService.validateSession(session);

      expect(validated.engagementId).toBe(testEngagementId);
      expect(validated.contextType).toBe('full_context');
      expect(validated.status).toBe('prepared');
    });

    it('throws on invalid session data', () => {
      const invalid = {
        engagementId: 'not-a-uuid',
        contextType: 'invalid_type',
      };

      expect(() => OnboardingSessionService.validateSession(invalid)).toThrow();
    });
  });

  describe('Behavior — Context Generation', () => {
    it('generates full context from complete profiles', () => {
      const inputs = {
        businessModel: {
          primaryModel: 'saas',
          secondaryModels: ['services'],
          revenueMix: { subscription: 60, oneTime: 10, services: 30, other: 0 },
          marginMix: { subscription: 80, oneTime: 40, services: 60 },
          deliveryModes: ['self_service', 'managed_service'],
          operationalComplexityScore: 7,
          maturityState: 'GROWTH',
        } as any,
        financialConstraint: {
          financialHealthStatus: 'adequate',
          monthlyBurnRate: 50000,
          monthlyRecurringRevenue: 150000,
        } as any,
        customerProfile: {
          customerHealthStatus: 'healthy',
          customerChurnRateMonthly: 0.02,
        } as any,
        capacityProfile: {
          overallCapacityStatus: 'adequate',
          projectCapacityUtilization: 65,
        } as any,
        complianceFlags: [],
        operatorAdherenceScore: 0.85,
        latestRecommendations: [
          { id: 'rec1', priority: 'high' },
          { id: 'rec2', priority: 'medium' },
        ],
        cacheHours: 2,
      };

      const context = OnboardingSessionService.generateQuickStartContext(inputs);

      expect(context.businessModelSnapshot.primaryModel).toBe('saas');
      expect(context.businessModelSnapshot.isDiversified).toBe(true);
      expect(context.businessModelSnapshot.complexity).toBe('complex');
      expect(context.constraintSummary.totalConstraintCount).toBeGreaterThan(0);
    });

    it('handles missing profiles gracefully', () => {
      const inputs = {
        businessModel: null,
        financialConstraint: null,
        customerProfile: null,
        capacityProfile: null,
        complianceFlags: [],
        operatorAdherenceScore: null,
        latestRecommendations: [],
        cacheHours: 0,
      };

      const context = OnboardingSessionService.generateQuickStartContext(inputs);

      expect(context.businessModelSnapshot.primaryModel).toBe('unknown');
      expect(context.businessModelSnapshot.isDiversified).toBe(false);
      expect(context.constraintSummary.totalConstraintCount).toBe(0);
    });

    it('identifies financial health status', () => {
      const inputs = {
        businessModel: null,
        financialConstraint: {
          financialHealthStatus: 'critical',
        } as any,
        customerProfile: null,
        capacityProfile: null,
        complianceFlags: [],
        operatorAdherenceScore: null,
        latestRecommendations: [],
        cacheHours: 0,
      };

      const context = OnboardingSessionService.generateQuickStartContext(inputs);
      expect(context.constraintSummary.financialStatus).toBe('critical');
    });
  });

  describe('Behavior — Emergency Items Detection', () => {
    it('detects financial emergencies', () => {
      const inputs = {
        businessModel: null,
        financialConstraint: {
          financialHealthStatus: 'critical',
        } as any,
        customerProfile: null,
        capacityProfile: null,
        complianceFlags: [],
        operatorAdherenceScore: null,
        latestRecommendations: [],
        cacheHours: 0,
      };

      const items = OnboardingSessionService.getEmergencyItems(inputs);
      expect(items).toContain('financial_health_critical');
    });

    it('detects customer emergencies', () => {
      const inputs = {
        businessModel: null,
        financialConstraint: null,
        customerProfile: {
          customerHealthStatus: 'critical',
        } as any,
        capacityProfile: null,
        complianceFlags: [],
        operatorAdherenceScore: null,
        latestRecommendations: [],
        cacheHours: 0,
      };

      const items = OnboardingSessionService.getEmergencyItems(inputs);
      expect(items).toContain('customer_health_at_risk');
    });

    it('detects critical compliance gaps', () => {
      const inputs = {
        businessModel: null,
        financialConstraint: null,
        customerProfile: null,
        capacityProfile: null,
        complianceFlags: [
          { severity: 'critical', status: 'non_compliant' } as any,
        ],
        operatorAdherenceScore: null,
        latestRecommendations: [],
        cacheHours: 0,
      };

      const items = OnboardingSessionService.getEmergencyItems(inputs);
      expect(items).toContain('critical_compliance_gaps');
    });

    it('detects critical recommendations', () => {
      const inputs = {
        businessModel: null,
        financialConstraint: null,
        customerProfile: null,
        capacityProfile: null,
        complianceFlags: [],
        operatorAdherenceScore: null,
        latestRecommendations: [{ id: 'rec1', priority: 'critical' }],
        cacheHours: 0,
      };

      const items = OnboardingSessionService.getEmergencyItems(inputs);
      expect(items).toContain('critical_recommendations_pending');
    });

    it('returns empty array when no emergencies', () => {
      const inputs = {
        businessModel: null,
        financialConstraint: { financialHealthStatus: 'strong' } as any,
        customerProfile: { customerHealthStatus: 'strong' } as any,
        capacityProfile: { overallCapacityStatus: 'adequate' } as any,
        complianceFlags: [{ severity: 'low', status: 'compliant' } as any],
        operatorAdherenceScore: null,
        latestRecommendations: [],
        cacheHours: 0,
      };

      const items = OnboardingSessionService.getEmergencyItems(inputs);
      expect(items.length).toBe(0);
    });
  });

  describe('Behavior — Recommendation Pointers', () => {
    it('returns emergency items as top pointers in full context', () => {
      const inputs = {
        businessModel: null,
        financialConstraint: { financialHealthStatus: 'critical' } as any,
        customerProfile: null,
        capacityProfile: null,
        complianceFlags: [],
        operatorAdherenceScore: null,
        latestRecommendations: [],
        cacheHours: 0,
      };

      const pointers = OnboardingSessionService.getKeyRecommendationPointers(
        inputs,
        'full_context'
      );

      expect(pointers).toContain('financial_health_critical');
    });

    it('includes high-priority recommendations in full context', () => {
      const inputs = {
        businessModel: null,
        financialConstraint: null,
        customerProfile: null,
        capacityProfile: null,
        complianceFlags: [],
        operatorAdherenceScore: null,
        latestRecommendations: [{ id: 'rec1', priority: 'high' }],
        cacheHours: 0,
      };

      const pointers = OnboardingSessionService.getKeyRecommendationPointers(
        inputs,
        'full_context'
      );

      expect(pointers).toContain('high_priority_recommendations');
    });

    it('includes metrics in KPI summary', () => {
      const inputs = {
        businessModel: null,
        financialConstraint: { cashRunwayMonths: 12 } as any,
        customerProfile: { customerChurnRateMonthly: 0.05 } as any,
        capacityProfile: null,
        complianceFlags: [],
        operatorAdherenceScore: null,
        latestRecommendations: [],
        cacheHours: 0,
      };

      const pointers = OnboardingSessionService.getKeyRecommendationPointers(inputs, 'kpi_summary');

      expect(pointers).toContain('cash_runway_assessment');
      expect(pointers).toContain('customer_churn_analysis');
    });

    it('includes health overview in health digest', () => {
      const inputs = {
        businessModel: null,
        financialConstraint: null,
        customerProfile: null,
        capacityProfile: null,
        complianceFlags: [],
        operatorAdherenceScore: null,
        latestRecommendations: [],
        cacheHours: 0,
      };

      const pointers = OnboardingSessionService.getKeyRecommendationPointers(
        inputs,
        'health_digest'
      );

      expect(pointers).toContain('health_overview');
      expect(pointers).toContain('risk_assessment');
    });
  });

  describe('Behavior — Context Expiration', () => {
    it('calculates 24-hour expiration for full context', () => {
      const now = new Date();
      const expiration = OnboardingSessionService.calculateContextExpirationDate(
        now,
        'full_context'
      );

      const diffHours = (expiration.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 0);
    });

    it('calculates 12-hour expiration for constraint snapshot', () => {
      const now = new Date();
      const expiration = OnboardingSessionService.calculateContextExpirationDate(
        now,
        'constraint_snapshot'
      );

      const diffHours = (expiration.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(12, 0);
    });

    it('calculates 6-hour expiration for KPI summary', () => {
      const now = new Date();
      const expiration = OnboardingSessionService.calculateContextExpirationDate(
        now,
        'kpi_summary'
      );

      const diffHours = (expiration.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(6, 0);
    });

    it('calculates 48-hour expiration for health digest', () => {
      const now = new Date();
      const expiration = OnboardingSessionService.calculateContextExpirationDate(
        now,
        'health_digest'
      );

      const diffHours = (expiration.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(48, 0);
    });
  });

  describe('Behavior — Freshness Assessment', () => {
    it('identifies fresh context', () => {
      const now = new Date();
      const isFresh = OnboardingSessionService.isContextFresh(now, 'full_context');

      expect(isFresh).toBe(true);
    });

    it('identifies expired context', () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 25); // 25 hours ago
      const isFresh = OnboardingSessionService.isContextFresh(pastDate, 'full_context');

      expect(isFresh).toBe(false);
    });

    it('calculates staleness score (0-1)', () => {
      const now = new Date();
      const score = OnboardingSessionService.getContextStalenessScore(now, 'full_context');

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('returns 0 staleness for newly prepared context', () => {
      const now = new Date();
      const score = OnboardingSessionService.getContextStalenessScore(now, 'full_context');

      expect(score).toBeLessThan(0.1);
    });

    it('returns 1 staleness for fully expired context', () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 50); // 50 hours ago, well past 24-hour expiration
      const score = OnboardingSessionService.getContextStalenessScore(pastDate, 'full_context');

      expect(score).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Behavior — Refresh Decision', () => {
    it('does not refresh if never viewed', () => {
      const preparedAt = new Date();
      const needsRefresh = OnboardingSessionService.needsRefresh(
        'full_context',
        preparedAt,
        null
      );

      expect(needsRefresh).toBe(false);
    });

    it('refreshes if context is expired', () => {
      const preparedAt = new Date();
      preparedAt.setHours(preparedAt.getHours() - 25);
      const lastViewed = new Date();
      const needsRefresh = OnboardingSessionService.needsRefresh(
        'full_context',
        preparedAt,
        lastViewed
      );

      expect(needsRefresh).toBe(true);
    });

    it('refreshes if viewed more than 2 hours ago and context is stale', () => {
      const preparedAt = new Date();
      preparedAt.setHours(preparedAt.getHours() - 15); // 15 hours ago
      const lastViewed = new Date();
      lastViewed.setHours(lastViewed.getHours() - 3); // Viewed 3 hours ago
      const needsRefresh = OnboardingSessionService.needsRefresh(
        'full_context',
        preparedAt,
        lastViewed
      );

      expect(needsRefresh).toBe(true);
    });

    it('does not refresh if viewed recently', () => {
      const preparedAt = new Date();
      preparedAt.setHours(preparedAt.getHours() - 2); // 2 hours ago
      const lastViewed = new Date();
      lastViewed.setMinutes(lastViewed.getMinutes() - 30); // Viewed 30 mins ago
      const needsRefresh = OnboardingSessionService.needsRefresh(
        'full_context',
        preparedAt,
        lastViewed
      );

      expect(needsRefresh).toBe(false);
    });
  });

  describe('Acceptance Criteria #11', () => {
    it('criterion #11 satisfied: Quick-start context path exists', () => {
      // Quick-start context generation is available
      const inputs = {
        businessModel: null,
        financialConstraint: null,
        customerProfile: null,
        capacityProfile: null,
        complianceFlags: [],
        operatorAdherenceScore: null,
        latestRecommendations: [],
        cacheHours: 0,
      };

      const context = OnboardingSessionService.generateQuickStartContext(inputs);
      expect(context).toBeDefined();
      expect(context.businessModelSnapshot).toBeDefined();
      expect(context.constraintSummary).toBeDefined();

      // Emergency items detection is available
      const emergencies = OnboardingSessionService.getEmergencyItems(inputs);
      expect(Array.isArray(emergencies)).toBe(true);

      // Recommendation pointers are available
      const pointers = OnboardingSessionService.getKeyRecommendationPointers(inputs, 'full_context');
      expect(Array.isArray(pointers)).toBe(true);

      // Context freshness tracking is available
      const now = new Date();
      const isFresh = OnboardingSessionService.isContextFresh(now, 'full_context');
      expect(typeof isFresh).toBe('boolean');

      // Refresh decisions are available
      const needsRefresh = OnboardingSessionService.needsRefresh(
        'full_context',
        now,
        new Date()
      );
      expect(typeof needsRefresh).toBe('boolean');

      // Schema validation is available
      const session = createTestSession();
      const validated = OnboardingSessionService.validateSession(session);
      expect(validated).toBeDefined();
    });
  });
});
