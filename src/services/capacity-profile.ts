// Service for managing capacity constraints
// Phase 2 Acceptance Criterion #5: "Capacity constraints are captured"

import {
  CreateCapacityProfileRequest,
  CreateCapacityProfileRequestSchema,
  CapacityProfile,
  CapacityProfileSchema,
} from '../domain/capacity-profile';

export class CapacityProfileService {
  static hasCapacityConstraints(profile: CapacityProfile | null): boolean {
    if (!profile) return false;

    const lowTeamSize =
      profile.totalTeamSize !== null &&
      profile.totalTeamSize !== undefined &&
      profile.totalTeamSize < 5;

    const highKeyPersonDependency =
      profile.keyPersonCount !== null &&
      profile.totalTeamSize !== null &&
      profile.keyPersonCount > profile.totalTeamSize * 0.3;

    const highTurnover =
      profile.turnoverRateAnnual !== null &&
      profile.turnoverRateAnnual !== undefined &&
      profile.turnoverRateAnnual > 0.25;

    const fullCapacity =
      profile.projectCapacityUtilization !== null &&
      profile.projectCapacityUtilization !== undefined &&
      profile.projectCapacityUtilization > 90;

    const lowSystemCapacity =
      profile.systemsAvailableCapacity !== null &&
      profile.systemsAvailableCapacity !== undefined &&
      profile.systemsAvailableCapacity < 20;

    return lowTeamSize || highKeyPersonDependency || highTurnover || fullCapacity || lowSystemCapacity;
  }

  static validateRequest(request: unknown): CreateCapacityProfileRequest {
    return CreateCapacityProfileRequestSchema.parse(request);
  }

  static validateProfile(profile: unknown): CapacityProfile {
    return CapacityProfileSchema.parse(profile);
  }
}
