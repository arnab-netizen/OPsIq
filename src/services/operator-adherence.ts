// Service for tracking operator adherence using observable signals
// Phase 2 Acceptance Criterion #10: "Operator adherence is tracked using observable operational signals only"

import {
  CreateOperatorAdherenceRequest,
  CreateOperatorAdherenceRequestSchema,
  RecordAdherenceSignalRequest,
  RecordAdherenceSignalRequestSchema,
  OperatorAdherenceProfile,
  OperatorAdherenceProfileSchema,
  AdherenceSignalType,
} from '../domain/operator-adherence';

export class OperatorAdherenceService {
  /**
   * Calculate acceptance rate (recommendations accepted / total)
   */
  static calculateAcceptanceRate(profile: OperatorAdherenceProfile): number {
    if (profile.totalRecommendations === 0) return 0;
    const rate = (profile.recommendationsAccepted / profile.totalRecommendations) * 100;
    return Math.round(rate * 10) / 10; // One decimal place
  }

  /**
   * Calculate completion rate (actions completed / started)
   */
  static calculateCompletionRate(profile: OperatorAdherenceProfile): number {
    if (profile.actionsStarted === 0) return 0;
    const rate = (profile.actionsCompleted / profile.actionsStarted) * 100;
    return Math.round(rate * 10) / 10;
  }

  /**
   * Calculate on-time rate (deadlines met / total with deadlines)
   */
  static calculateOnTimeRate(profile: OperatorAdherenceProfile): number {
    const totalWithDeadline = profile.deadlinesMet + profile.deadlinesMissed;
    if (totalWithDeadline === 0) return 0;
    const rate = (profile.deadlinesMet / totalWithDeadline) * 100;
    return Math.round(rate * 10) / 10;
  }

  /**
   * Calculate overall adherence score (0-100)
   * Weighted: acceptance 20%, completion 40%, on-time 30%, verification 10%
   */
  static calculateAdherenceScore(profile: OperatorAdherenceProfile): number {
    const acceptance = this.calculateAcceptanceRate(profile) * 0.2;

    const completion = this.calculateCompletionRate(profile) * 0.4;

    const onTime = this.calculateOnTimeRate(profile) * 0.3;

    let verification = 0;
    if (profile.actionsCompleted > 0) {
      verification = ((profile.actionsVerified / profile.actionsCompleted) * 100) * 0.1;
    }

    const score = acceptance + completion + onTime + verification;
    return Math.round(score * 10) / 10; // One decimal place
  }

  /**
   * Determine adherence status from score
   */
  static getAdherenceStatus(
    score: number
  ): 'excellent' | 'good' | 'fair' | 'poor' | 'new' {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    if (score > 0) return 'poor';
    return 'new';
  }

  /**
   * Record a single adherence signal
   */
  static recordSignal(
    profile: OperatorAdherenceProfile,
    signalType: AdherenceSignalType
  ): Partial<OperatorAdherenceProfile> {
    const updates: Partial<OperatorAdherenceProfile> = {
      lastSignalAt: new Date(),
      lastSignalType: signalType,
    };

    // Update counters based on signal type
    switch (signalType) {
      case 'recommendation_accepted':
        updates.recommendationsAccepted = (profile.recommendationsAccepted || 0) + 1;
        break;
      case 'recommendation_acted_on':
        updates.recommendationsActedOn = (profile.recommendationsActedOn || 0) + 1;
        break;
      case 'action_started':
        updates.actionsStarted = (profile.actionsStarted || 0) + 1;
        break;
      case 'action_completed':
        updates.actionsCompleted = (profile.actionsCompleted || 0) + 1;
        break;
      case 'action_verified':
        updates.actionsVerified = (profile.actionsVerified || 0) + 1;
        break;
      case 'milestone_reached':
        updates.milestonesReached = (profile.milestonesReached || 0) + 1;
        break;
      case 'deadline_met':
        updates.deadlinesMet = (profile.deadlinesMet || 0) + 1;
        break;
      case 'deadline_missed':
        updates.deadlinesMissed = (profile.deadlinesMissed || 0) + 1;
        break;
      // No special counters for meeting_scheduled, documentation_provided
    }

    return updates;
  }

  /**
   * Get adherence summary
   */
  static getAdherenceSummary(profile: OperatorAdherenceProfile): {
    operator: string;
    acceptance: number;
    completion: number;
    onTime: number;
    score: number;
    status: 'excellent' | 'good' | 'fair' | 'poor' | 'new';
    lastSignal: { type: string; at: Date } | null;
  } {
    const score = this.calculateAdherenceScore(profile);
    return {
      operator: profile.operatorId,
      acceptance: this.calculateAcceptanceRate(profile),
      completion: this.calculateCompletionRate(profile),
      onTime: this.calculateOnTimeRate(profile),
      score,
      status: this.getAdherenceStatus(score),
      lastSignal: profile.lastSignalAt
        ? { type: profile.lastSignalType || 'unknown', at: profile.lastSignalAt }
        : null,
    };
  }

  /**
   * Check if operator shows concerning adherence pattern
   * Returns true if score < 50 or no recent signals
   */
  static needsAdherenceReview(
    profile: OperatorAdherenceProfile,
    daysSinceLastSignal: number = 14
  ): boolean {
    const score = this.calculateAdherenceScore(profile);
    if (score < 50 && profile.totalRecommendations > 0) return true;

    if (!profile.lastSignalAt) return false; // No signals yet, not concerning

    const now = new Date();
    const lastSignal = new Date(profile.lastSignalAt);
    const daysSince = Math.ceil(
      (now.getTime() - lastSignal.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSince > daysSinceLastSignal;
  }

  static validateRequest(request: unknown): CreateOperatorAdherenceRequest {
    return CreateOperatorAdherenceRequestSchema.parse(request);
  }

  static validateProfile(profile: unknown): OperatorAdherenceProfile {
    return OperatorAdherenceProfileSchema.parse(profile);
  }

  static validateSignalRequest(request: unknown): RecordAdherenceSignalRequest {
    return RecordAdherenceSignalRequestSchema.parse(request);
  }
}
