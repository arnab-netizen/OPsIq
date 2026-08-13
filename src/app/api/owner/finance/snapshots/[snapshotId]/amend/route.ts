/**
 * POST /api/owner/finance/snapshots/[snapshotId]/amend
 *
 * Amends an existing financial snapshot by creating a new version with corrected
 * or added fields. The original row is preserved and marked superseded (immutable).
 * Requires OWNER_MANAGE. amendmentReason is mandatory for provenance.
 *
 * Pattern: same append-only versioning as StartupIdeaRecord (reviseIdea).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { financialSnapshotAmendSchema } from "@/domain/owner-finance/validation";
import { amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.snapshotId);
    const body = await parseRequestBody(ctx.request!, financialSnapshotAmendSchema);
    const { snapshot, previousSnapshotId } = await amendFinancialSnapshot(
      params.snapshotId,
      body,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    return canonicalJson(
      { newSnapshotId: snapshot!.id, previousSnapshotId, version: snapshot!.version },
      { status: 201 }
    );
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
