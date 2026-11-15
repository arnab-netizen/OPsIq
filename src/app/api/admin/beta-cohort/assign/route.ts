/**
 * POST /api/admin/beta-cohort/assign
 *
 * Assign an INVITED beta request to a cohort owner code (e.g. CB1-001). Immutable and idempotent (replay of the same
 * assignment is a no-op; a conflicting reassignment is 409). Audited as beta_cohort.owner_assigned. Gated on
 * BETA_PROGRAM_MANAGE. Stores only the beta request id, cohort id, owner code and kind — no email, no name.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { assignmentInputSchema } from "@/domain/beta-cohort/evidence";
import { assignCohortOwner } from "@/services/beta-cohort/cohort-evidence.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, assignmentInputSchema);
    const result = await assignCohortOwner(body, ctx.verifiedActorId);
    return canonicalJson(result, { status: result.replayed ? 200 : 201 });
  },
  { requireCapabilities: [CAPABILITIES.BETA_PROGRAM_MANAGE] },
);
