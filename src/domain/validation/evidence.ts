import { z } from "zod/v4";

export const createEvidenceItemSchema = z.object({
  engagementId: z.string().uuid(),
  category: z.enum([
    "FINANCIAL",
    "OPERATIONAL",
    "HUMAN",
    "RESILIENCE",
    "CLIENT",
    "COMMERCIAL",
    "LEADERSHIP",
    "EXECUTION",
  ]),
  evidenceType: z.enum([
    "FREE_TEXT",
    "DOCUMENT",
    "INTERVIEW",
    "METRICS",
    "SYSTEM",
    "APPROVAL",
  ]),
  sourceType: z.enum(["PERSON", "DOCUMENT", "SYSTEM", "REPORT"]),
  sourceLabel: z.string().min(1).max(255),
  sourceContactId: z.string().uuid().optional(),
  captureMethod: z.enum(["MANUAL", "UPLOAD", "INTEGRATION", "EXTERNAL"]),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  content: z.string().optional(),
  traceabilityStatus: z.enum(["COMPLETE", "PARTIAL", "MISSING"]),
  visibility: z.enum(["INTERNAL", "CLIENT_VISIBLE", "RESTRICTED"]).default("INTERNAL"),
});

export const uploadFileEvidenceSchema = z.object({
  engagementId: z.string().uuid(),
  category: z.enum([
    "FINANCIAL",
    "OPERATIONAL",
    "HUMAN",
    "RESILIENCE",
    "CLIENT",
    "COMMERCIAL",
    "LEADERSHIP",
    "EXECUTION",
  ]),
  evidenceType: z.enum([
    "FREE_TEXT",
    "DOCUMENT",
    "INTERVIEW",
    "METRICS",
    "SYSTEM",
    "APPROVAL",
  ]),
  sourceType: z.enum(["PERSON", "DOCUMENT", "SYSTEM", "REPORT"]),
  sourceLabel: z.string().min(1).max(255),
  sourceContactId: z.string().uuid().optional(),
  captureMethod: z.enum(["MANUAL", "UPLOAD", "INTEGRATION", "EXTERNAL"]),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  traceabilityStatus: z.enum(["COMPLETE", "PARTIAL", "MISSING"]),
  visibility: z.enum(["INTERNAL", "CLIENT_VISIBLE", "RESTRICTED"]).default("INTERNAL"),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1),
});

export const validateEvidenceSchema = z.object({
  evidenceItemId: z.string().uuid(),
  isValid: z.boolean(),
  version: z.number().int().min(1),
});

export const listEvidenceSchema = z.object({
  engagementId: z.string().uuid(),
  category: z.string().optional(),
  validationStatus: z.string().optional(),
  visibility: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createEvidenceBundleSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
});

export const updateEvidenceBundleSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["active", "archived"]).optional(),
  version: z.number().int().min(1),
});

export const addEvidenceToBundleSchema = z.object({
  bundleId: z.string().uuid(),
  evidenceItemId: z.string().uuid(),
});

export const removeEvidenceFromBundleSchema = z.object({
  bundleId: z.string().uuid(),
  evidenceItemId: z.string().uuid(),
});

export type CreateEvidenceItemInput = z.infer<typeof createEvidenceItemSchema>;
export type UploadFileEvidenceInput = z.infer<typeof uploadFileEvidenceSchema>;
export type ValidateEvidenceInput = z.infer<typeof validateEvidenceSchema>;
export type ListEvidenceParams = z.infer<typeof listEvidenceSchema>;
export type CreateEvidenceBundleInput = z.infer<typeof createEvidenceBundleSchema>;
export type UpdateEvidenceBundleInput = z.infer<typeof updateEvidenceBundleSchema>;
export type AddEvidenceToBundleInput = z.infer<typeof addEvidenceToBundleSchema>;
export type RemoveEvidenceFromBundleInput = z.infer<
  typeof removeEvidenceFromBundleSchema
>;
