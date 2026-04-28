import { z } from "zod/v4";
import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { runEnterpriseDiagnosisV2 } from "@/services/diagnosis-v2/enterprise-orchestrator";
import { buildDiagnosisInputFromEngagement, persistDiagnosisV2AsExistingEntities } from "@/services/diagnosis-v2/persistence-adapter";

const serviceLineSchema = z.object({
  name: z.string().min(1),
  share: z.number().min(0).max(1).optional(),
  revenue: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  orderCount: z.number().int().nonnegative().optional(),
  customerCount: z.number().int().nonnegative().optional(),
}).strict();

const diagnosisV2RequestSchema = z.object({
  runId: z.string().uuid().optional(),
  nowIso: z.string().datetime().optional(),
  businessName: z.string().min(1).optional(),
  businessType: z.string().min(1).optional(),
  problemStatement: z.string().min(1).optional(),
  mainIssue: z.string().min(1).optional(),
  monthlyRevenue: z.number().nonnegative().optional(),
  monthlyCosts: z.number().nonnegative().optional(),
  customerCount: z.number().int().nonnegative().optional(),
  orderCount: z.number().int().nonnegative().optional(),
  cashOnHand: z.number().nonnegative().optional(),
  overduePayables: z.number().nonnegative().optional(),
  grossMarginPct: z.number().min(-100).max(100).optional(),
  repeatCustomerPct: z.number().min(0).max(100).optional(),
  leadCount: z.number().int().nonnegative().optional(),
  conversionRatePct: z.number().min(0).max(100).optional(),
  complaintCount: z.number().int().nonnegative().optional(),
  staffCount: z.number().int().nonnegative().optional(),
  serviceLines: z.array(serviceLineSchema).optional(),
  additionalInputs: z.record(z.string(), z.unknown()).optional(),
  persist: z.boolean().default(false),
}).strict();

export const POST = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({ capability: CAPABILITIES.CONDITION_ASSESS, internalOnly: true });
  await assertEngagementAccess(session.user.id, engagementId);
  const body = await parseRequestBody(request, diagnosisV2RequestSchema);
  const input = await buildDiagnosisInputFromEngagement(engagementId, body);
  const result = runEnterpriseDiagnosisV2(input);
  const persistence = body.persist ? await persistDiagnosisV2AsExistingEntities(result, session.user.id) : undefined;
  return Response.json({ ...result, persistence }, { status: result.needsInput ? 202 : 200 });
});
