// Service for managing compliance constraints
// Phase 2 Acceptance Criterion #6: "Compliance flags are captured"

import {
  CreateComplianceFlagRequest,
  CreateComplianceFlagRequestSchema,
  ComplianceFlag,
  ComplianceFlagSchema,
} from '../domain/compliance-flag';

export class ComplianceFlagService {
  static hasComplianceGaps(flags: ComplianceFlag[] | null | undefined): boolean {
    if (!flags || flags.length === 0) return false;

    const hasNonCompliant =
      flags.some((f) => f.status === 'non_compliant' || f.status === 'at_risk');

    const hasCriticalSeverity = flags.some((f) => f.severity === 'critical');

    const hasUnresolvedDeadline =
      flags.some((f) => {
        if (!f.remediationRequired || !f.remediationDeadline) return false;
        return new Date(f.remediationDeadline) <= new Date();
      });

    return hasNonCompliant || hasCriticalSeverity || hasUnresolvedDeadline;
  }

  static assessComplianceHealth(flags: ComplianceFlag[] | null | undefined): number {
    if (!flags || flags.length === 0) return 100; // No flags = fully compliant

    let healthScore = 100;

    flags.forEach((flag) => {
      // Deduct points based on status
      if (flag.status === 'non_compliant') {
        healthScore -= flag.severity === 'critical' ? 30 : flag.severity === 'high' ? 20 : 10;
      } else if (flag.status === 'at_risk') {
        healthScore -= flag.severity === 'critical' ? 20 : flag.severity === 'high' ? 15 : 5;
      } else if (flag.status === 'partial') {
        healthScore -= flag.severity === 'critical' ? 15 : flag.severity === 'high' ? 10 : 3;
      }

      // Additional deduction for critical severity regardless of status
      if (flag.severity === 'critical' && flag.status !== 'compliant') {
        healthScore -= 10;
      }

      // Deduct if remediation deadline is imminent or passed
      if (flag.remediationRequired && flag.remediationDeadline) {
        const daysUntilDeadline =
          (new Date(flag.remediationDeadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
        if (daysUntilDeadline < 0) {
          healthScore -= 20; // Deadline passed
        } else if (daysUntilDeadline < 30) {
          healthScore -= 15; // Deadline imminent
        }
      }
    });

    return Math.max(0, Math.min(100, healthScore));
  }

  static validateRequest(request: unknown): CreateComplianceFlagRequest {
    return CreateComplianceFlagRequestSchema.parse(request);
  }

  static validateFlag(flag: unknown): ComplianceFlag {
    return ComplianceFlagSchema.parse(flag);
  }
}
