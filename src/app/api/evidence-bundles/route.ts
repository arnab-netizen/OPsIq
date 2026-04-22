import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  createEvidenceBundle,
  listEvidenceBundles,
} from "@/services/evidence";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { createEvidenceBundleSchema } from "@/domain/validation/evidence";
import { z } from "zod/v4";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";

const listBundlesSchema = z.object({
  engagementId: z.string().uuid(),
});

export const POST = withRequestContext(async (request) => {
  try {
    const { session } = await withAuth({
      capability: CAPABILITIES.EVIDENCE_SUBMIT,
    });

    const body = await parseRequestBody(request, createEvidenceBundleSchema);
    const result = await createEvidenceBundle(body, session.user.id);

    return Response.json(result, { status: 201 });
  } catch (error) {
    logger.error("Error creating evidence bundle", { error });
    return errorToResponse(error);
  }
});

export const GET = withRequestContext(async (request) => {
  try {
    await withAuth({
      capability: CAPABILITIES.EVIDENCE_VIEW,
    });

    const params = parseSearchParams(request.url, listBundlesSchema);
    const result = await listEvidenceBundles(params.engagementId);

    return Response.json({ bundles: result });
  } catch (error) {
    logger.error("Error listing evidence bundles", { error });
    return errorToResponse(error);
  }
});
