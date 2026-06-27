/**
 * Owner Budget — Zod validation schemas for write paths (Section 35/45).
 * All write routes validate input through these before any mutation.
 */
import { z } from "zod/v4";

export const budgetSpendCreateSchema = z.object({
  businessId: z.string().uuid(),
  periodId: z.string().uuid().nullish(),
  budgetLineId: z.string().uuid().nullish(),
  label: z.string().min(1).max(200),
  category: z.string().min(1).max(64),
  amount: z.number().finite().nonnegative(),
  state: z.enum([
    "planned", "requested", "approved", "rejected", "deferred", "committed",
    "paid", "proof_uploaded", "proof_matched", "operationally_validated",
    "payment_matched", "reconciled", "verified", "disputed", "voided",
  ]).optional(),
  sourceType: z.enum(["MANUAL", "UPLOAD", "SYSTEM", "IMPORT", "RECONCILED", "ESTIMATED"]).optional(),
  obligationKind: z.enum(["payroll", "tax", "rent", "emi", "vendor", "statutory", "other"]).nullish(),
  dueInDays: z.number().int().nonnegative().nullish(),
  requestedByUserId: z.string().uuid(),
  approvedByUserId: z.string().uuid().nullish(),
  isNewVendor: z.boolean().optional(),
  vendorBankChanged: z.boolean().optional(),
  ownerApprovalThreshold: z.number().finite().positive(),
  recentSameCategoryAmounts: z.array(z.number().finite().nonnegative()).optional(),
  emergency: z.boolean().optional(),
});
export type BudgetSpendCreateBody = z.infer<typeof budgetSpendCreateSchema>;

export const ownerOverrideCreateSchema = z.object({
  businessId: z.string().uuid(),
  originalRecommendation: z.string().min(1).max(1000),
  riskWarning: z.string().min(1).max(1000),
  reason: z.string().min(1).max(1000),
  affectedLines: z.array(z.string()).default([]),
  expectedConsequence: z.string().min(1).max(1000),
  reviewInDays: z.number().int().positive().max(365).default(14),
  // Hard-block flags (override is refused if any are true).
  vendorBankUnverified: z.boolean().optional(),
  statutoryReserveViolation: z.boolean().optional(),
  unlawfulEmployeeAction: z.boolean().optional(),
});
export type OwnerOverrideCreateBody = z.infer<typeof ownerOverrideCreateSchema>;

export const budgetAuthorityChangeSchema = z.object({
  businessId: z.string().uuid(),
  subjectUserId: z.string().uuid().nullish(),
  subjectRole: z.string().min(1).max(64).nullish(),
  scopeCategory: z.string().min(1).max(64).nullish(),
  toStatus: z.enum([
    "NORMAL", "WATCH", "RESTRICTED", "OWNER_APPROVAL_REQUIRED", "SUSPENDED_FOR_CATEGORY", "RESTORED",
  ]),
  reason: z.string().min(1).max(1000),
  proofComplianceWeak: z.boolean().optional(),
  approvalViolations: z.number().int().nonnegative().optional(),
  selfApprovalDetected: z.boolean().optional(),
  splitSpendDetected: z.boolean().optional(),
  repeatedUnverifiedSpend: z.boolean().optional(),
  reviewInDays: z.number().int().positive().max(365).default(14),
});
export type BudgetAuthorityChangeBody = z.infer<typeof budgetAuthorityChangeSchema>;

export const budgetActionUpdateSchema = z.object({
  status: z.enum(["proposed", "assigned", "in_progress", "blocked", "completed", "cancelled"]).optional(),
  assignedTo: z.string().uuid().nullish(),
  completionNotes: z.string().min(1).max(2000).nullish(),
  completionEvidence: z.array(z.string().min(1)).nullish(),
});
export type BudgetActionUpdateBody = z.infer<typeof budgetActionUpdateSchema>;

export const workingCapitalItemCreateSchema = z.object({
  businessId: z.string().uuid(),
  kind: z.enum(["receivable", "payable"]),
  counterparty: z.string().min(1).max(200),
  amount: z.number().finite().nonnegative(),
  dueDate: z.string().datetime().nullish(),
  status: z.enum(["open", "outstanding", "partial", "disputed", "collected", "paid", "written_off"]).optional(),
  sourceType: z.enum(["MANUAL", "IMPORT"]).optional(),
  sourceRef: z.string().min(1).max(200).nullish(),
});
export type WorkingCapitalItemCreateBody = z.infer<typeof workingCapitalItemCreateSchema>;
