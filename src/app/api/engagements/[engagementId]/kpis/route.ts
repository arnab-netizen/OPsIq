import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createKPI, listKPIs } from "@/services/kpi";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";

const createKPISchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  baselineValue: z.number(),
  currentValue: z.number(),
  targetValue: z.number().optional(),
});

export const POST = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createKPISchema);
  await createKPI(
    {
      engagementId,
      ...body,
    },
    session.user.id
  );

  return Response.json({ success: true }, { status: 201 });
});

export const GET = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_VIEW,
    internalOnly: true,
  });

  const kpis = await listKPIs(engagementId);

  return Response.json({ kpis });
});
