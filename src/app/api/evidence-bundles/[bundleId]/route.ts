import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  getEvidenceBundleById,
  updateEvidenceBundle,
} from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { updateEvidenceBundleSchema } from "@/domain/validation/evidence";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";

export const GET = withRequestContext(async (_request, context) => {
  try {
    const { bundleId } = await context.params;
    parseOrThrow(uuidSchema, bundleId);

    await withAuth({
      capability: CAPABILITIES.EVIDENCE_VIEW,
    });

    const result = await getEvidenceBundleById(bundleId);

    return Response.json(result);
  } catch (error) {
    logger.error("Error getting evidence bundle", { error });
    return errorToResponse(error);
  }
});

export const PUT = withRequestContext(async (request, context) => {
  try {
    const { bundleId } = await context.params;
    parseOrThrow(uuidSchema, bundleId);

    const { session } = await withAuth({
      capability: CAPABILITIES.EVIDENCE_SUBMIT,
    });

    const body = await parseRequestBody(request, updateEvidenceBundleSchema);

    await updateEvidenceBundle(bundleId, body, session.user.id);

    return Response.json({ success: true });
  } catch (error) {
    logger.error("Error updating evidence bundle", { error });
    return errorToResponse(error);
  }
});
