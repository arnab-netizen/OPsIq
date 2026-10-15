/**
 * GET /api/admin/beta-cohort?cohortId=CB1
 *
 * Operator-only, read-only Controlled Beta Cohort view: per-owner automatic milestones (derived live), operator-entered
 * evidence, T+7 status, next operator step and the expansion gate. Gated on BETA_PROGRAM_MANAGE — the same capability
 * that guards the rest of the beta control plane. Returns no financial values, no free text from the owner's business,
 * and only a masked email hint for not-yet-assigned invitations.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow } from "@/lib/validation";
import { cohortIdSchema } from "@/domain/beta-cohort/evidence";
import { getCohortView } from "@/services/beta-cohort/cohort-evidence.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const cohortId = parseOrThrow(cohortIdSchema, url.searchParams.get("cohortId") ?? "CB1");
    return canonicalJson(await getCohortView(cohortId), { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.BETA_PROGRAM_MANAGE] },
);
