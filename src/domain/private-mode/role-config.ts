import { z } from 'zod';

/**
 * Private Owner Command Mode role definitions.
 * Roles control access to high-power features before public SaaS.
 */

export const PrivateModeRole = z.enum([
  'OWNER',           // Business owner with full access
  'CONSULTANT',      // Advisor/consultant invited by owner
  'ANALYST',         // Data analyst invited by owner
]);

export type PrivateModeRole = z.infer<typeof PrivateModeRole>;

/**
 * Private mode feature flags.
 * Determines which features are available to a role.
 */
export const PrivateModeFeatures = z.object({
  fullDataUpload: z.boolean().describe('Upload full raw business data'),
  ownerDashboard: z.boolean().describe('Access to owner command dashboard'),
  manualOverride: z.boolean().describe('Override diagnosis/recommendations'),
  caseSimulationRunner: z.boolean().describe('Run business scenario simulations'),
  growthIntelligence: z.boolean().describe('Access to online growth opportunities'),
  actionTracker: z.boolean().describe('Track action execution and outcomes'),
  learningLog: z.boolean().describe('View and manage learning observations'),
  adminReview: z.boolean().describe('Approve rule changes and learning promotions'),
  confidenceDashboard: z.boolean().describe('View confidence scoring details'),
});

export type PrivateModeFeatures = z.infer<typeof PrivateModeFeatures>;

/**
 * Feature sets per role.
 * Defines which features each role can access.
 */
export const RoleFeatureSets: Record<PrivateModeRole, PrivateModeFeatures> = {
  OWNER: {
    fullDataUpload: true,
    ownerDashboard: true,
    manualOverride: true,
    caseSimulationRunner: true,
    growthIntelligence: true,
    actionTracker: true,
    learningLog: true,
    adminReview: true,
    confidenceDashboard: true,
  },
  CONSULTANT: {
    fullDataUpload: false,
    ownerDashboard: true,
    manualOverride: false,
    caseSimulationRunner: true,
    growthIntelligence: true,
    actionTracker: true,
    learningLog: false,
    adminReview: false,
    confidenceDashboard: true,
  },
  ANALYST: {
    fullDataUpload: true,
    ownerDashboard: false,
    manualOverride: false,
    caseSimulationRunner: true,
    growthIntelligence: true,
    actionTracker: true,
    learningLog: false,
    adminReview: false,
    confidenceDashboard: true,
  },
};

/**
 * Check if a user has access to a feature.
 *
 * @param role - User's private mode role
 * @param feature - Feature to check access for
 * @returns true if role has access to feature
 */
export function hasFeatureAccess(
  role: PrivateModeRole,
  feature: keyof PrivateModeFeatures,
): boolean {
  const features = RoleFeatureSets[role];
  return features[feature];
}

/**
 * Get available features for a role.
 *
 * @param role - User's private mode role
 * @returns Set of features available to role
 */
export function getAvailableFeatures(role: PrivateModeRole): PrivateModeFeatures {
  return RoleFeatureSets[role];
}

/**
 * Validate that a role has required features.
 *
 * @param role - User's private mode role
 * @param requiredFeatures - Features that must be available
 * @returns true if role has all required features
 */
export function hasRequiredFeatures(
  role: PrivateModeRole,
  requiredFeatures: (keyof PrivateModeFeatures)[],
): boolean {
  return requiredFeatures.every((feature) => hasFeatureAccess(role, feature));
}

/**
 * Configuration for private mode access control.
 * Determines if private mode is enabled globally and per-workspace.
 */
export const PrivateModeConfig = z.object({
  enabled: z.boolean().default(false).describe('Global private mode enabled'),
  maxConsultantsPerWorkspace: z.number().int().positive().default(5).describe('Max invited consultants'),
  maxAnalystsPerWorkspace: z.number().int().positive().default(10).describe('Max invited analysts'),
  requireOwnerApprovalForRole: z.boolean().default(true).describe('Owner must approve new roles'),
  allowRoleRevocation: z.boolean().default(true).describe('Owner can remove roles'),
  auditAllActions: z.boolean().default(true).describe('Audit all private mode actions'),
  leakPreviousAccessOnRevoke: z.boolean().default(false).describe('Revoke previous data access on role removal'),
});

export type PrivateModeConfig = z.infer<typeof PrivateModeConfig>;

/**
 * Validate private mode config.
 */
export function validatePrivateModeConfig(config: unknown): PrivateModeConfig {
  return PrivateModeConfig.parse(config);
}

/**
 * Get safe config for logging (redacts sensitive fields).
 */
export function getLoggableConfig(config: PrivateModeConfig): Record<string, unknown> {
  return {
    enabled: config.enabled,
    maxConsultantsPerWorkspace: config.maxConsultantsPerWorkspace,
    maxAnalystsPerWorkspace: config.maxAnalystsPerWorkspace,
    requireOwnerApprovalForRole: config.requireOwnerApprovalForRole,
    allowRoleRevocation: config.allowRoleRevocation,
    auditAllActions: config.auditAllActions,
  };
}
