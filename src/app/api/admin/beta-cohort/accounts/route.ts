/**
 * GET /api/admin/beta-cohort/accounts?limit=&cursor=
 *
 * Operator-only, read-only, paginated PER-ACCOUNT activation view: of the same signupSource-tagged admitted
 * accounts GET /api/admin/beta-cohort's accountOverview counts in aggregate, this lists them one row per
 * workspaceId -- whether each is classified and which of the 4 product milestones it personally reached. Gated on
 * the same BETA_PROGRAM_MANAGE capability as the rest of the beta control plane. Returns no email, name, user id
 * or beta-request id anywhere -- workspaceId is the only identifier. No writes.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { listAccountActivationForAdmin } from "@/services/beta-cohort/cohort-evidence.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const limitParam = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor");
    const result = await listAccountActivationForAdmin({
      limit: limitParam !== null ? parseInt(limitParam, 10) : undefined,
      cursor,
    });
    return canonicalJson(result, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.BETA_PROGRAM_MANAGE] },
);
