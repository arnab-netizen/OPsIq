import { z } from "zod";

// ─── Request Schemas ──────────────────────────────────────────────────────────

// Engagement Update Request
export const engagementUpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  serviceTier: z.string().optional(),
  engagementMode: z.string().optional(),
  startDate: z.string().datetime().optional(),
  targetEndDate: z.string().datetime().optional(),
  ownerId: z.string().uuid().optional(),
  assignedConsultantId: z.string().uuid().optional(),
  healthStatus: z.string().optional(),
  status: z.string().optional(),
  interventionMode: z.string().optional(),
  version: z.number().int().positive(),
});

// Action Status Update Request
export const actionStatusUpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
  completedAt: z.string().datetime().optional(),
  verifiedAt: z.string().datetime().optional(),
  blockageReason: z.string().max(500).optional(),
  blockerReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  version: z.number().int().positive(),
});

// Finding Create Request
export const findingCreateSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(1).max(500),
  severity: z.enum(["critical", "high", "medium", "low"]),
  summary: z.string().max(2000).optional(),
  findingType: z.string().optional(),
  description: z.string().max(5000).optional(),
});

// Finding Update Request
export const findingUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  summary: z.string().max(2000).optional(),
  findingType: z.string().optional(),
  description: z.string().max(5000).optional(),
  status: z.string().optional(),
  version: z.number().int().positive(),
});

// Recommendation Update Request
export const recommendationUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  status: z.string().optional(),
  description: z.string().max(5000).optional(),
  estimatedEffort: z.number().positive().optional(),
  version: z.number().int().positive(),
});

// Recommendation Rerank Request
export const recommendationRerankSchema = z.object({
  recommendations: z.array(
    z.object({
      id: z.string().uuid(),
      priority: z.enum(["critical", "high", "medium", "low"]),
    })
  ),
  version: z.number().int().positive(),
});

// ─── Response Schemas ─────────────────────────────────────────────────────────

// Engagement Report Response
export const engagementReportResponseSchema = z.object({
  summary: z.object({
    engagementId: z.string().uuid(),
    engagementCode: z.string(),
    engagementTitle: z.string(),
    status: z.string(),
    healthStatus: z.string(),
    interventionMode: z.string(),
    currentCondition: z.object({
      businessStatus: z.string(),
      severityScore: z.number(),
      assessedAt: z.string().datetime(),
    }).optional(),
  }),
  executiveSummary: z.object({
    totalFindings: z.number().nonnegative(),
    criticalFindings: z.number().nonnegative(),
    highPriorityActions: z.number().nonnegative(),
    overallRiskLevel: z.enum(["high", "medium", "low"]),
    immediateActionRequired: z.boolean(),
    riskReasoning: z.string(),
  }),
  findings: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    severity: z.string(),
    category: z.string().optional(),
  })),
  recommendations: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    priority: z.string(),
    status: z.string(),
  })),
  actions: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    priority: z.string(),
    status: z.string(),
    dueDate: z.string().datetime().optional(),
    urgency: z.enum(["overdue", "due-soon", "on-track"]).optional(),
  })),
  kpis: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    current: z.number().optional(),
    target: z.number().optional(),
    direction: z.string().optional(),
  })),
  reviewStatus: z.object({
    trend: z.enum(["improving", "stagnant", "worsening"]),
    reasoning: z.string(),
    findingCount: z.number().nonnegative(),
    criticalFindingCount: z.number().nonnegative(),
    openActionCount: z.number().nonnegative(),
    completedActionCount: z.number().nonnegative(),
  }),
  metadata: z.object({
    generatedAt: z.string().datetime(),
    version: z.string(),
    dataCompleteness: z.object({
      hasFindings: z.boolean(),
      hasRecommendations: z.boolean(),
      hasActions: z.boolean(),
      hasKPIs: z.boolean(),
      hasConditionProfile: z.boolean(),
    }),
  }),
});

// ─── Validation Error Format ───────────────────────────────────────────────────

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
}

export interface ValidationErrorResponse {
  error: "VALIDATION_ERROR";
  details: ValidationErrorDetail[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: ValidationErrorDetail[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: ValidationErrorDetail[] = result.error.issues.map((err) => ({
    field: err.path.join(".") || "root",
    message: err.message,
    code: err.code,
  }));

  return { success: false, errors };
}

export function formatValidationError(errors: ValidationErrorDetail[]): ValidationErrorResponse {
  return {
    error: "VALIDATION_ERROR",
    details: errors,
  };
}

export function createValidationErrorResponse(
  errors: ValidationErrorDetail[]
): Response {
  return Response.json(formatValidationError(errors), { status: 400 });
}
