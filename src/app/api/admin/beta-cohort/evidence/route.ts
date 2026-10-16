/**
 * POST /api/admin/beta-cohort/evidence
 *
 * Append one evidence entry (OBSERVATION | ISSUE | ISSUE_RESOLUTION | FOLLOW_UP_T7) for an assigned cohort owner.
 * Append-only and versioned by construction: nothing is edited or deleted, the latest statement wins when the ledger
 * is read, and the full history stays. Idempotent per (owner, idempotencyKey) with a content fingerprint: a replay of
 * the same entry is a no-op, a different entry under the same key is 409. Audited as beta_cohort.evidence_recorded.
 * Gated on BETA_PROGRAM_MANAGE.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { evidenceInputSchema } from "@/domain/beta-cohort/evidence";
import { recordCohortEvidence } from "@/services/beta-cohort/cohort-evidence.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, evidenceInputSchema);
    const result = await recordCohortEvidence(body, ctx.verifiedActorId);
    return canonicalJson(result, { status: result.replayed ? 200 : 201 });
  },
  { requireCapabilities: [CAPABILITIES.BETA_PROGRAM_MANAGE] },
);
