import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getInterventionState, transitionPhase } from "@/services/intervention-state";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { INTERVENTION_PHASES } from "@/domain/constants/statuses";

const transitionPhaseSchema = z.object({
  targetPhase: z.enum(INTERVENTION_PHASES),
});

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  await withAuth({ capability: CAPABILITIES.INTERVENTION_VIEW });

  const state = await getInterventionState(engagementId);
  return Response.json(state);
});

export const PUT = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, transitionPhaseSchema);
  const result = await transitionPhase(engagementId, body.targetPhase, session.user.id);

  return Response.json(result);
});
