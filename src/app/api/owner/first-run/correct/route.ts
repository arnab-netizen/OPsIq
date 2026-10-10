/**
 * POST /api/owner/first-run/correct — "Something here is wrong" (OWNER_MANAGE).
 * Amends the evidence through the canonical snapshot versioning (the old version is kept, never overwritten),
 * re-runs the canonical diagnosis, and returns what changed. body: { businessId, snapshotId, ...amend fields }.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { financialSnapshotAmendSchema } from "@/domain/owner-finance/validation";
import { correctFirstResultEvidence } from "@/services/owner-first-run/first-run-actions.service";

// Validated in two parts below (identity here, evidence fields by the canonical amend schema).
const bodySchema = z.record(z.string(), z.unknown());

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const raw = await parseRequestBody(ctx.request!, bodySchema);
    const { businessId, snapshotId, ...rest } = raw as Record<string, unknown>;
    const amend = parseOrThrow(financialSnapshotAmendSchema, rest);
    const result = await correctFirstResultEvidence(
      ctx.verifiedWorkspaceId, ctx.verifiedActorId, parseOrThrow(uuidSchema, businessId), parseOrThrow(uuidSchema, snapshotId), amend,
    );
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
