import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getEvidenceById } from "@/services/evidence";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";

export const GET = withRequestContext(async (_request, context) => {
  try {
    const { evidenceId } = await context.params;
    parseOrThrow(uuidSchema, evidenceId);

    await withAuth({
      capability: CAPABILITIES.EVIDENCE_VIEW,
    });

    const result = await getEvidenceById(evidenceId);

    return Response.json(result);
  } catch (error) {
    logger.error("Error getting evidence", { error });
    return errorToResponse(error);
  }
});
