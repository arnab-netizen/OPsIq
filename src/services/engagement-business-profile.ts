// Service for managing engagement-level business profiles
// Used by ContextGate to verify recommendations have real business context

import {
  CreateEngagementBusinessProfileRequest,
  CreateEngagementBusinessProfileRequestSchema,
  EngagementBusinessProfile,
  EngagementBusinessProfileSchema,
} from '../domain/engagement-business-profile';

export class EngagementBusinessProfileService {
  // Pure function: check if a business profile has substantive context
  // Returns true if profile has at least one key context field filled
  static hasSubstantiveContext(profile: EngagementBusinessProfile | null): boolean {
    if (!profile) return false;

    const hasContext =
      profile.businessName ||
      profile.industry ||
      profile.businessModelType ||
      profile.annualRevenue ||
      profile.employeeCount ||
      profile.keyContext;

    return Boolean(hasContext);
  }

  // Validate request structure
  static validateRequest(request: unknown): CreateEngagementBusinessProfileRequest {
    return CreateEngagementBusinessProfileRequestSchema.parse(request);
  }

  // Validate response structure
  static validateProfile(profile: unknown): EngagementBusinessProfile {
    return EngagementBusinessProfileSchema.parse(profile);
  }
}
