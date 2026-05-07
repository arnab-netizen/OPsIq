// ContextGate: Fail-closed gate ensuring recommendations have real business context
// Phase 2 Acceptance Criterion #12: "Recommendations require reality context or explicit low-data warning"
// Blocks recommendations without business context unless explicitly acknowledged

import { EngagementBusinessProfile } from '../domain/engagement-business-profile';
import { EngagementBusinessProfileService } from './engagement-business-profile';

export interface ContextGateRequest {
  engagementId: string;
  businessProfile?: EngagementBusinessProfile | null;
  allowLowDataRecommendation?: boolean; // Explicit acknowledgment of low-data risk
}

export interface ContextGateResult {
  isAllowed: boolean;
  reason: string;
  riskLevel: 'low_context' | 'low_data' | 'none';
  warning?: string;
}

export class ContextGate {
  // Pure function: evaluate if recommendation can be created
  // Fail-closed: blocks by default unless context exists or explicitly acknowledged
  static evaluate(request: ContextGateRequest): ContextGateResult {
    // Check if engagement has business context
    const hasContext = EngagementBusinessProfileService.hasSubstantiveContext(
      request.businessProfile || null,
    );

    if (!hasContext) {
      // No context exists - fail-closed
      if (!request.allowLowDataRecommendation) {
        return {
          isAllowed: false,
          reason: 'Engagement lacks business context',
          riskLevel: 'low_data',
          warning: 'Business profile not provided. Recommendations require business context.',
        };
      }

      // Explicitly acknowledged low-data risk - allow but warn
      return {
        isAllowed: true,
        reason: 'Low-data recommendation created with explicit acknowledgment',
        riskLevel: 'low_data',
        warning:
          'This recommendation was created with minimal business context. Confidence may be lower.',
      };
    }

    // Context exists - allow
    return {
      isAllowed: true,
      reason: 'Engagement has business context',
      riskLevel: 'none',
    };
  }

  // Fail-closed gate: returns true if recommendation should be BLOCKED
  static shouldBlockRecommendationCreation(request: ContextGateRequest): boolean {
    const result = ContextGate.evaluate(request);
    return !result.isAllowed;
  }
}
