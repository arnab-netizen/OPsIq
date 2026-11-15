/**
 * POST /api/owner/compliance/[itemId]/business — assign an obligation recorded with no business to the
 * business it affects (null → business only; see assignComplianceItemBusiness). OWNER_MANAGE required.
 * Workspace isolation and business ownership are enforced server-side.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { assignComplianceItemBusiness } from "@/services/owner-mode/compliance.service";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  businessId: z.string().uuid(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { itemId } = params;
    const input = await parseRequestBody(ctx.request!, schema);
    try {
      const item = await assignComplianceItemBusiness({
        workspaceId: ctx.verifiedWorkspaceId,
        itemId,
        actorId: ctx.verifiedActorId,
        businessId: input.businessId,
      });
      return canonicalJson({ item }, { status: 200 });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return canonicalJson({ error: "Compliance item not found" }, { status: 404 });
      }
      if (err instanceof ValidationError) {
        return canonicalJson({ error: classifyOperatorError(err, { context: "mutation" }).operatorMessage }, { status: 422 });
      }
      if (err instanceof ConflictError) {
        return canonicalJson({ error: classifyOperatorError(err, { context: "mutation" }).operatorMessage }, { status: 409 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
