import { PrivateModeRole, getAvailableFeatures } from '@/domain/private-mode/role-config';

/**
 * Owner Dashboard service.
 * Assembles dashboard data with role-conditional feature visibility.
 *
 * The dashboard shows:
 * 1. Core Owner Mode data (always): Diagnosis, Recommendations, Actions, Verification
 * 2. Private mode overlays (role-conditional):
 *    - OWNER: Learning log, rule management, full analytics
 *    - CONSULTANT: Case simulations, growth opportunities
 *    - ANALYST: Data quality insights, trend analysis
 */

export interface DiagnosisData {
  id: string;
  problem: string;
  evidence: string[];
  rootCause: string;
  impact: string;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecommendationData {
  id: string;
  diagnosisId: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: number;
  confidenceScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionData {
  id: string;
  recommendationId?: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  dueAt?: Date;
  completedAt?: Date;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LearningObservationData {
  id: string;
  diagnosisId: string;
  actualOutcome: string;
  verificationMetric: number;
  lessonLearned: string;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SimulationResultData {
  id: string;
  scenarioId: string;
  recommendation: string;
  actualResult: string;
  score: number;
  createdAt: Date;
}

export interface OwnerDashboardData {
  // Core Owner Mode data (always visible)
  diagnosis: DiagnosisData | null;
  recommendations: RecommendationData[];
  actions: ActionData[];
  actionSummary: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    blocked: number;
  };

  // Private mode overlays (role-conditional)
  privateMode: {
    enabled: boolean;
    role: PrivateModeRole | null;
    features: {
      learningLog?: LearningObservationData[];
      simulationResults?: SimulationResultData[];
      confidenceBreakdown?: {
        dataQualityScore: number;
        evidenceStrength: number;
        constraintAlignment: number;
      };
    };
  };

  // Metadata
  lastUpdated: Date;
  readOnly: boolean;
}

export class OwnerDashboardService {
  /**
   * Assemble dashboard data with role-based feature visibility.
   *
   * @param diagnosis - Core diagnosis data
   * @param recommendations - Recommendations list
   * @param actions - Actions list
   * @param privateModeRole - User's private mode role (null = Owner Mode only)
   * @param learningLog - Learning observations (shown only to OWNER)
   * @param simulationResults - Simulation results (shown to CONSULTANT/ANALYST)
   * @returns Dashboard data with role-conditional features
   */
  assembleDashboard(
    diagnosis: DiagnosisData | null,
    recommendations: RecommendationData[],
    actions: ActionData[],
    privateModeRole: PrivateModeRole | null,
    learningLog?: LearningObservationData[],
    simulationResults?: SimulationResultData[],
  ): OwnerDashboardData {
    // Count actions by status
    const actionSummary = {
      total: actions.length,
      completed: actions.filter((a) => a.status === 'completed').length,
      inProgress: actions.filter((a) => a.status === 'in_progress').length,
      pending: actions.filter((a) => a.status === 'pending').length,
      blocked: actions.filter((a) => a.status === 'blocked').length,
    };

    // Assemble private mode features based on role
    const features: OwnerDashboardData['privateMode']['features'] = {};

    if (privateModeRole) {
      const roleFeatures = getAvailableFeatures(privateModeRole);

      // OWNER: Learning log and admin features
      if (roleFeatures.learningLog && learningLog) {
        features.learningLog = learningLog;
      }

      // CONSULTANT/ANALYST: Simulation and analysis features
      if ((roleFeatures.caseSimulationRunner || roleFeatures.fullDataUpload) && simulationResults) {
        features.simulationResults = simulationResults;
      }

      // Show confidence breakdown for ANALYST
      if (roleFeatures.confidenceDashboard && diagnosis) {
        features.confidenceBreakdown = {
          dataQualityScore: diagnosis.confidence, // Would be more detailed in real impl
          evidenceStrength: diagnosis.confidence * 0.9, // Mock calculation
          constraintAlignment: diagnosis.confidence * 0.85, // Mock calculation
        };
      }
    }

    return {
      // Core data
      diagnosis,
      recommendations,
      actions,
      actionSummary,

      // Private mode overlay
      privateMode: {
        enabled: privateModeRole !== null,
        role: privateModeRole,
        features,
      },

      // Metadata
      lastUpdated: new Date(),
      readOnly: false,
    };
  }

  /**
   * Filter sensitive data based on role.
   * Removes fields that shouldn't be visible to certain roles.
   */
  sanitizeForRole(data: OwnerDashboardData, role: PrivateModeRole | null): OwnerDashboardData {
    if (!role) {
      // Owner Mode: return only core data, no private overlays
      return {
        ...data,
        privateMode: {
          enabled: false,
          role: null,
          features: {},
        },
      };
    }

    // For private mode users: filter based on role capabilities
    const filtered = { ...data };

    if (role !== 'OWNER') {
      // Non-owners cannot see learning log (admin feature)
      delete filtered.privateMode.features.learningLog;
    }

    if (role === 'ANALYST') {
      // Analysts see only analysis features, not simulation results
      delete filtered.privateMode.features.simulationResults;
    }

    return filtered;
  }

  /**
   * Get dashboard with read-only flag based on role.
   * Only OWNER can edit dashboard (future: add actions, mark complete, etc.)
   */
  getDashboardWithEditCapability(
    data: OwnerDashboardData,
    role: PrivateModeRole | null,
  ): OwnerDashboardData {
    const withCapability = { ...data };

    // Only OWNER can edit
    withCapability.readOnly = role !== 'OWNER';

    return withCapability;
  }

  /**
   * Validate dashboard data consistency.
   * Ensures no broken references or invalid states.
   */
  validateDashboard(data: OwnerDashboardData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check diagnosis consistency
    if (data.diagnosis && data.recommendations.length === 0) {
      // It's OK to have diagnosis without recommendations, but note it
    }

    // Check action consistency
    if (data.actionSummary.total !== data.actions.length) {
      errors.push('Action count mismatch in summary');
    }

    // Check private mode consistency
    if (data.privateMode.features.learningLog) {
      if (!data.privateMode.role) {
        errors.push('Learning log present without private mode role');
      }
      if (data.privateMode.role && data.privateMode.role !== 'OWNER') {
        errors.push('Learning log visible to non-OWNER role');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a dashboard snapshot for audit/archival.
   * Preserves state at a specific time.
   */
  createSnapshot(data: OwnerDashboardData, snapshotTime: Date) {
    return {
      ...data,
      lastUpdated: snapshotTime,
      snapshot: {
        createdAt: snapshotTime,
        diagnosisId: data.diagnosis?.id,
        actionCount: data.actionSummary.total,
        completedActionCount: data.actionSummary.completed,
        privateModeRole: data.privateMode.role,
      },
    };
  }
}
