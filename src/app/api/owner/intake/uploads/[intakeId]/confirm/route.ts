/**
 * POST /api/owner/intake/uploads/[intakeId]/confirm — owner-confirm a validated
 *      intake candidate (OWNER_MANAGE). An invalid intake cannot be confirmed.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { confirmDataIntake } from "@/services/owner-intake/intake.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.intakeId);
    const updated = await confirmDataIntake(params.intakeId, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(updated, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
