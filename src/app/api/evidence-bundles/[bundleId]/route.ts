import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  getEvidenceBundleById,
  updateEvidenceBundle,
} from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { updateEvidenceBundleSchema } from "@/domain/validation/evidence";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    try {
      const workspaceId = ctx.verifiedWorkspaceId;
      const { bundleId } = params;
      parseOrThrow(uuidSchema, bundleId);

      const result = await getEvidenceBundleById(bundleId, workspaceId);

      return result;
    } catch (error) {
      logger.error("Error getting evidence bundle", error);
      return errorToResponse(error);
    }
  },
  { requireCapabilities: [CAPABILITIES.EVIDENCE_VIEW], requireWorkspace: true }
);

export const PUT = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    try {
      const workspaceId = ctx.verifiedWorkspaceId;
      const { bundleId } = params;
      parseOrThrow(uuidSchema, bundleId);

      const body = await parseRequestBody(ctx.request!, updateEvidenceBundleSchema);

      await updateEvidenceBundle(bundleId, body, ctx, workspaceId);

      return Response.json({ success: true });
    } catch (error) {
      logger.error("Error updating evidence bundle", error);
      return errorToResponse(error);
    }
  },
  { requireCapabilities: [CAPABILITIES.EVIDENCE_SUBMIT], requireWorkspace: true }
);
