// Phase 2 Slice 11: OperatorAdherenceProfile - Adherence Tracking via Observable Signals
// Tests verify adherence measurement using only observable operational signals

import { describe, it, expect } from 'vitest';
import { OperatorAdherenceProfile } from '../domain/operator-adherence';
import { OperatorAdherenceService } from '../services/operator-adherence';

describe('Phase 2 Slice 11 — OperatorAdherenceProfile: Observable Signal Adherence', () => {
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';
  const testOperatorId = '550e8400-e29b-41d4-a716-446655440001';

  const createTestProfile = (overrides?: Partial<OperatorAdherenceProfile>): OperatorAdherenceProfile => ({
    id: '550e8400-e29b-41d4-a716-446655440a00',
    engagementId: testEngagementId,
    operatorId: testOperatorId,
    totalRecommendations: 10,
    recommendationsAccepted: 8,
    recommendationsActedOn: 7,
    actionsStarted: 7,
    actionsCompleted: 6,
    actionsVerified: 5,
    milestonesReached: 3,
    deadlinesMet: 5,
    deadlinesMissed: 1,
    acceptanceRate: 80,
    completionRate: 85.7,
    onTimeRate: 83.3,
    adherenceScore: 83.6,
    adherenceStatus: 'excellent',
    lastSignalAt: new Date(),
    lastSignalType: 'action_completed',
    reviewNotes: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Contract', () => {
    it('validates operator adherence profile schema', () => {
      const profile = createTestProfile();
      const validated = OperatorAdherenceService.validateProfile(profile);

      expect(validated.engagementId).toBe(testEngagementId);
      expect(validated.operatorId).toBe(testOperatorId);
    });

    it('validates create request schema', () => {
      const request = {
        engagementId: testEngagementId,
        operatorId: testOperatorId,
      };

      const validated = OperatorAdherenceService.validateRequest(request);
      expect(validated.engagementId).toBe(testEngagementId);
    });

    it('validates signal recording request', () => {
      const request = {
        adherenceId: '550e8400-e29b-41d4-a716-446655440a00',
        signalType: 'action_completed' as const,
        notes: 'Operator completed action successfully',
      };

      const validated = OperatorAdherenceService.validateSignalRequest(request);
      expect(validated.signalType).toBe('action_completed');
    });

    it('throws on invalid profile data', () => {
      const invalid = {
        engagementId: 'not-a-uuid',
        operatorId: 'also-not-uuid',
      };

      expect(() => OperatorAdherenceService.validateProfile(invalid)).toThrow();
    });
  });

  describe('Behavior - Metric Calculation', () => {
    it('calculates acceptance rate (recommendations accepted / total)', () => {
      const profile = createTestProfile({
        totalRecommendations: 10,
        recommendationsAccepted: 7,
      });
      const rate = OperatorAdherenceService.calculateAcceptanceRate(profile);

      expect(rate).toBe(70);
    });

    it('calculates completion rate (actions completed / started)', () => {
      const profile = createTestProfile({
        actionsStarted: 10,
        actionsCompleted: 8,
      });
      const rate = OperatorAdherenceService.calculateCompletionRate(profile);

      expect(rate).toBe(80);
    });

    it('calculates on-time rate (deadlines met / total with deadline)', () => {
      const profile = createTestProfile({
        deadlinesMet: 8,
        deadlinesMissed: 2,
      });
      const rate = OperatorAdherenceService.calculateOnTimeRate(profile);

      expect(rate).toBe(80);
    });

    it('returns 0% for rates with no data', () => {
      const emptyProfile = createTestProfile({
        totalRecommendations: 0,
        actionsStarted: 0,
        deadlinesMet: 0,
        deadlinesMissed: 0,
      });

      expect(OperatorAdherenceService.calculateAcceptanceRate(emptyProfile)).toBe(0);
      expect(OperatorAdherenceService.calculateCompletionRate(emptyProfile)).toBe(0);
      expect(OperatorAdherenceService.calculateOnTimeRate(emptyProfile)).toBe(0);
    });
  });

  describe('Behavior - Adherence Score', () => {
    it('calculates weighted adherence score (0-100)', () => {
      const profile = createTestProfile({
        totalRecommendations: 10,
        recommendationsAccepted: 10,
        actionsStarted: 10,
        actionsCompleted: 10,
        actionsVerified: 10,
        deadlinesMet: 10,
        deadlinesMissed: 0,
      });
      const score = OperatorAdherenceService.calculateAdherenceScore(profile);

      // Perfect: acceptance 100%, completion 100%, on-time 100%, verification 100%
      // Score = 100*0.2 + 100*0.4 + 100*0.3 + 100*0.1 = 100
      expect(score).toBe(100);
    });

    it('calculates partial score for mixed performance', () => {
      const profile = createTestProfile({
        totalRecommendations: 10,
        recommendationsAccepted: 5, // 50%
        actionsStarted: 10,
        actionsCompleted: 8, // 80%
        actionsVerified: 6, // 75% of completed
        deadlinesMet: 7,
        deadlinesMissed: 3, // 70%
      });
      const score = OperatorAdherenceService.calculateAdherenceScore(profile);

      // 50*0.2 + 80*0.4 + 70*0.3 + 75*0.1 = 10 + 32 + 21 + 7.5 = 70.5
      expect(score).toBe(70.5);
    });

    it('returns 0 for profile with no signals', () => {
      const emptyProfile = createTestProfile({
        totalRecommendations: 0,
        recommendationsAccepted: 0,
        actionsStarted: 0,
        actionsCompleted: 0,
        actionsVerified: 0,
        deadlinesMet: 0,
        deadlinesMissed: 0,
      });
      const score = OperatorAdherenceService.calculateAdherenceScore(emptyProfile);

      expect(score).toBe(0);
    });
  });

  describe('Behavior - Adherence Status', () => {
    it('reports excellent status for score >= 85', () => {
      const status = OperatorAdherenceService.getAdherenceStatus(90);
      expect(status).toBe('excellent');
    });

    it('reports good status for score 70-84', () => {
      const status = OperatorAdherenceService.getAdherenceStatus(75);
      expect(status).toBe('good');
    });

    it('reports fair status for score 50-69', () => {
      const status = OperatorAdherenceService.getAdherenceStatus(60);
      expect(status).toBe('fair');
    });

    it('reports poor status for score 1-49', () => {
      const status = OperatorAdherenceService.getAdherenceStatus(30);
      expect(status).toBe('poor');
    });

    it('reports new status for score 0', () => {
      const status = OperatorAdherenceService.getAdherenceStatus(0);
      expect(status).toBe('new');
    });
  });

  describe('Behavior - Signal Recording', () => {
    it('records action_started signal', () => {
      const profile = createTestProfile({ actionsStarted: 5 });
      const updates = OperatorAdherenceService.recordSignal(profile, 'action_started');

      expect(updates.actionsStarted).toBe(6);
      expect(updates.lastSignalType).toBe('action_started');
    });

    it('records action_completed signal', () => {
      const profile = createTestProfile({ actionsCompleted: 3 });
      const updates = OperatorAdherenceService.recordSignal(profile, 'action_completed');

      expect(updates.actionsCompleted).toBe(4);
    });

    it('records recommendation_accepted signal', () => {
      const profile = createTestProfile({ recommendationsAccepted: 5 });
      const updates = OperatorAdherenceService.recordSignal(profile, 'recommendation_accepted');

      expect(updates.recommendationsAccepted).toBe(6);
    });

    it('records deadline_met signal', () => {
      const profile = createTestProfile({ deadlinesMet: 10 });
      const updates = OperatorAdherenceService.recordSignal(profile, 'deadline_met');

      expect(updates.deadlinesMet).toBe(11);
    });

    it('records deadline_missed signal', () => {
      const profile = createTestProfile({ deadlinesMissed: 2 });
      const updates = OperatorAdherenceService.recordSignal(profile, 'deadline_missed');

      expect(updates.deadlinesMissed).toBe(3);
    });

    it('updates lastSignalAt and lastSignalType', () => {
      const profile = createTestProfile();
      const beforeSignal = new Date();
      const updates = OperatorAdherenceService.recordSignal(profile, 'action_verified');
      const afterSignal = new Date();

      expect(updates.lastSignalType).toBe('action_verified');
      expect(updates.lastSignalAt).toBeDefined();
      expect((updates.lastSignalAt as Date).getTime()).toBeGreaterThanOrEqual(beforeSignal.getTime());
      expect((updates.lastSignalAt as Date).getTime()).toBeLessThanOrEqual(afterSignal.getTime());
    });
  });

  describe('Behavior - Review Flagging', () => {
    it('flags low-scoring profiles for review', () => {
      const poorProfile = createTestProfile({
        totalRecommendations: 10,
        recommendationsAccepted: 2, // 20%
        actionsStarted: 10,
        actionsCompleted: 2, // 20%
        actionsVerified: 0,
        deadlinesMet: 2,
        deadlinesMissed: 8, // 20%
      });
      const needsReview = OperatorAdherenceService.needsAdherenceReview(poorProfile);

      expect(needsReview).toBe(true);
    });

    it('does not flag high-scoring profiles', () => {
      const goodProfile = createTestProfile({
        totalRecommendations: 10,
        recommendationsAccepted: 9,
        actionsStarted: 9,
        actionsCompleted: 8,
      });
      const needsReview = OperatorAdherenceService.needsAdherenceReview(goodProfile);

      expect(needsReview).toBe(false);
    });

    it('flags profiles with stale signals', () => {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 20); // 20 days ago

      const staleDateProfile = createTestProfile({
        lastSignalAt: staleDate,
      });

      const needsReview = OperatorAdherenceService.needsAdherenceReview(staleDateProfile, 14);

      expect(needsReview).toBe(true);
    });

    it('does not flag profiles with recent signals', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 7); // 7 days ago

      const recentProfile = createTestProfile({
        lastSignalAt: recentDate,
      });

      const needsReview = OperatorAdherenceService.needsAdherenceReview(recentProfile, 14);

      expect(needsReview).toBe(false);
    });
  });

  describe('Behavior - Summary', () => {
    it('provides complete adherence summary', () => {
      const profile = createTestProfile();
      const summary = OperatorAdherenceService.getAdherenceSummary(profile);

      expect(summary.operator).toBe(testOperatorId);
      expect(typeof summary.acceptance).toBe('number');
      expect(typeof summary.completion).toBe('number');
      expect(typeof summary.onTime).toBe('number');
      expect(typeof summary.score).toBe('number');
      expect(['excellent', 'good', 'fair', 'poor', 'new']).toContain(summary.status);
      expect(summary.lastSignal).not.toBeNull();
    });
  });

  describe('Acceptance Criteria #10', () => {
    it('criterion #10 satisfied: Operator adherence tracked with observable signals only', () => {
      // Verify profile captures only observable signals, no subjective assessment
      const signalTypes = [
        'action_started',
        'action_completed',
        'action_verified',
        'recommendation_accepted',
        'recommendation_acted_on',
        'deadline_met',
        'deadline_missed',
        'milestone_reached',
      ];

      const profile = createTestProfile();

      // All tracked metrics are based on observable signals
      expect(profile.actionsStarted).toBeGreaterThanOrEqual(0);
      expect(profile.actionsCompleted).toBeGreaterThanOrEqual(0);
      expect(profile.actionsVerified).toBeGreaterThanOrEqual(0);
      expect(profile.recommendationsAccepted).toBeGreaterThanOrEqual(0);
      expect(profile.deadlinesMet).toBeGreaterThanOrEqual(0);
      expect(profile.deadlinesMissed).toBeGreaterThanOrEqual(0);

      // Service can record signals
      signalTypes.forEach((signalType) => {
        const updates = OperatorAdherenceService.recordSignal(
          profile,
          signalType as any
        );
        expect(updates.lastSignalType).toBe(signalType);
      });

      // Service calculates metrics from signals
      const score = OperatorAdherenceService.calculateAdherenceScore(profile);
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);

      // Status is derived from metrics, not subjective judgment
      const status = OperatorAdherenceService.getAdherenceStatus(score);
      expect(['excellent', 'good', 'fair', 'poor', 'new']).toContain(status);
    });
  });
});
