/**
 * GET  /api/owner/intake/businesses/[businessId]/uploads — list intakes (OWNER_VIEW)
 * POST /api/owner/intake/businesses/[businessId]/uploads — upload + normalize a CSV
 *      into a validated candidate (OWNER_MANAGE). body: { source, targetDomain, csvText, notes? }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { intakeUploadSchema } from "@/domain/owner-intake";
import { createDataIntake, listDataIntakes } from "@/services/owner-intake/intake.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    return listDataIntakes(params.businessId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const input = await parseRequestBody(ctx.request!, intakeUploadSchema);
    const intake = await createDataIntake(params.businessId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(intake, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
