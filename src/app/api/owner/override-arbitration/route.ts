/**
 * Phase 4 — Owner Arbitration Override routes.
 *
 * POST /api/owner/override-arbitration — persist an owner override on a system arbitration
 * GET  /api/owner/override-arbitration?recordId=<id> — get latest override for a record
 *
 * The override is stored separately from the GoalArbitrationRecord and is always
 * displayed alongside (not instead of) the system recommendation.
 *
 * Workspace isolation enforced via canonical auth. OWNER_MANAGE required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  createArbitrationOverride,
  getLatestOverride,
  listOverrides,
} from "@/services/owner-mode/owner-override.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  overriddenRecordId: z.string().trim().uuid(),
  overrideObjectiveId: z.string().trim().uuid().nullish(),
  overrideRationale: z.string().trim().min(10).max(2000),
  decision: z.enum(["EXECUTE_NOW", "DELAY", "CANCEL", "MERGE", "SPLIT", "ESCALATE"]),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, createSchema);

    const override = await createArbitrationOverride({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      overriddenRecordId: input.overriddenRecordId,
      overrideObjectiveId: input.overrideObjectiveId ?? null,
      overrideRationale: input.overrideRationale,
      decision: input.decision,
    });

    return canonicalJson({ override }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const recordId = url.searchParams.get("recordId");

    if (recordId) {
      const override = await getLatestOverride(ctx.verifiedWorkspaceId, recordId);
      return canonicalJson({ override }, { status: 200 });
    }

    const overrides = await listOverrides(ctx.verifiedWorkspaceId);
    return canonicalJson({ overrides }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
