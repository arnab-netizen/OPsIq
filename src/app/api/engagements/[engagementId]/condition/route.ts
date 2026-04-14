import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  assessCondition,
  getConditionHistory,
} from "@/services/business-condition";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import {
  BUSINESS_CONDITION_RATINGS,
  PRESSURE_LEVELS,
  MATURITY_LEVELS,
} from "@/domain/constants/statuses";

const assessConditionSchema = z.object({
  businessStatus: z.enum(BUSINESS_CONDITION_RATINGS),
  severityScore: z.number().int().min(1).max(10),
  urgencyLevel: z.enum(PRESSURE_LEVELS),
  cashPressureLevel: z.enum(PRESSURE_LEVELS),
  marginPressureLevel: z.enum(PRESSURE_LEVELS),
  clientConcentrationRisk: z.enum(PRESSURE_LEVELS),
  ownerDependencyRisk: z.enum(PRESSURE_LEVELS),
  keyPersonDependencyRisk: z.enum(PRESSURE_LEVELS),
  processMaturityLevel: z.enum(MATURITY_LEVELS),
  managementMaturityLevel: z.enum(MATURITY_LEVELS),
  executionCapacityLevel: z.enum(MATURITY_LEVELS),
  moraleFragilityLevel: z.enum(MATURITY_LEVELS),
  resilienceLevel: z.enum(MATURITY_LEVELS),
  growthReadinessLevel: z.enum(MATURITY_LEVELS),
  notes: z.string().optional(),
});

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  await withAuth({ capability: CAPABILITIES.CONDITION_VIEW });

  const history = await getConditionHistory(engagementId);
  return Response.json({ profiles: history });
});

export const POST = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({
    capability: CAPABILITIES.CONDITION_ASSESS,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, assessConditionSchema);
  const result = await assessCondition(
    { ...body, engagementId },
    session.user.id
  );

  return Response.json(result, { status: 201 });
});
