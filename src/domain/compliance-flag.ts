// Domain model for engagement-level compliance constraints
// Phase 2: Captures regulatory, operational, and contractual compliance requirements

import { z } from 'zod';

export const ComplianceStatus = z.enum(['compliant', 'non_compliant', 'partial', 'at_risk', 'unknown']);
export type ComplianceStatus = z.infer<typeof ComplianceStatus>;

export const ComplianceSeverity = z.enum(['low', 'medium', 'high', 'critical']);
export type ComplianceSeverity = z.infer<typeof ComplianceSeverity>;

export const ComplianceFlagSchema = z.object({
  id: z.string().uuid(),
  engagementId: z.string().uuid(),
  complianceName: z.string().min(1).max(255), // e.g., "GDPR", "SOC2", "PCI-DSS", "HIPAA"
  description: z.string().max(1024).nullable().optional(), // detailed requirement
  status: ComplianceStatus.default('unknown'),
  severity: ComplianceSeverity.default('medium'),
  remediationRequired: z.boolean().default(false),
  remediationDeadline: z.date().nullable().optional(),
  remedialActionsTaken: z.string().nullable().optional(),
  verifiedBy: z.string().uuid().nullable().optional(),
  lastVerifiedAt: z.date().nullable().optional(),
  impactOnOperations: z.string().max(1024).nullable().optional(), // how non-compliance affects business
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ComplianceFlag = z.infer<typeof ComplianceFlagSchema>;

export const CreateComplianceFlagRequestSchema = z.object({
  engagementId: z.string().uuid(),
  complianceName: z.string().min(1).max(255),
  description: z.string().max(1024).optional(),
  status: ComplianceStatus.optional().default('unknown'),
  severity: ComplianceSeverity.optional().default('medium'),
  remediationRequired: z.boolean().optional(),
  remediationDeadline: z.date().optional(),
  remedialActionsTaken: z.string().optional(),
  impactOnOperations: z.string().max(1024).optional(),
});

export type CreateComplianceFlagRequest = z.infer<typeof CreateComplianceFlagRequestSchema>;
