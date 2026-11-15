/**
 * POST /api/owner/cashflow/snapshots/[snapshotId]/amend — amend the bank balance / cash in hand of a recorded entry (OWNER_MANAGE)
 *   body: { expectedUpdatedAt, confirmReplace?, bankBalance?, cashInHand? }  (strict; at least one figure)
 *   200 { snapshot, changed, changedFields } · 409 { code: CASHFLOW_STALE | CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED, … }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, parseRequestBody, uuidSchema } from "@/lib/validation";
import { cashflowSnapshotAmendSchema } from "@/domain/owner-cashflow/validation";
import { amendCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { CashflowConflictError } from "@/services/owner-cashflow/cashflow-conflict";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.snapshotId);
    const input = await parseRequestBody(ctx.request!, cashflowSnapshotAmendSchema);
    try {
      const result = await amendCashflowSnapshot(params.snapshotId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
      return canonicalJson(result, { status: 200 });
    } catch (error) {
      // The 409s carry machine fields (code, current values, updatedAt) the owner's screen acts on.
      if (error instanceof CashflowConflictError) return canonicalJson(error.responseBody, { status: 409 });
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
