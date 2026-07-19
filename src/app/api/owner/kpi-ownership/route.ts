/**
 * Phase 4 — KPI Ownership routes.
 *
 * GET  /api/owner/kpi-ownership — list KPI ownership records for the workspace
 * POST /api/owner/kpi-ownership — create or update a KPI ownership record
 *
 * Workspace isolation enforced via canonical auth. OWNER_MANAGE required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { createKPIOwnership, updateKPIOwnership, listKPIOwnership } from "@/services/owner-mode/kpi-ownership.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["UPSERT", "UPDATE", "RECORD_REVIEW"]).default("UPSERT"),
  recordId: z.string().trim().uuid().nullish(),
  metricName: z.string().trim().min(1).max(200).optional(),
  metricLabel: z.string().trim().min(1).max(500).optional(),
  ownerUserId: z.string().trim().uuid().optional(),
  reviewCadence: z.enum(["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY", "QUARTERLY"]).optional(),
  targetValue: z.number().nullish(),
  currentValue: z.number().nullish(),
  unit: z.string().trim().max(50).nullish(),
  linkedObjectiveId: z.string().trim().uuid().nullish(),
  lastReviewedAt: z.string().datetime().nullish(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const kpis = await listKPIOwnership(ctx.verifiedWorkspaceId);
    return canonicalJson({ kpis }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    if (input.action === "UPDATE" || input.action === "RECORD_REVIEW") {
      if (!input.recordId) {
        return canonicalJson({ error: "recordId required for UPDATE/RECORD_REVIEW" }, { status: 400 });
      }
      const updated = await updateKPIOwnership({
        workspaceId,
        recordId: input.recordId,
        actorId,
        metricLabel: input.metricLabel,
        ownerUserId: input.ownerUserId,
        reviewCadence: input.reviewCadence,
        targetValue: input.targetValue,
        currentValue: input.currentValue,
        unit: input.unit,
        linkedObjectiveId: input.linkedObjectiveId,
        lastReviewedAt: input.action === "RECORD_REVIEW" && input.lastReviewedAt
          ? new Date(input.lastReviewedAt)
          : undefined,
      });
      return canonicalJson({ record: updated }, { status: 200 });
    }

    // UPSERT (create or update by metricName)
    if (!input.metricName || !input.metricLabel || !input.ownerUserId || !input.reviewCadence) {
      return canonicalJson({ error: "metricName, metricLabel, ownerUserId, and reviewCadence required" }, { status: 400 });
    }
    const record = await createKPIOwnership({
      workspaceId,
      actorId,
      metricName: input.metricName,
      metricLabel: input.metricLabel,
      ownerUserId: input.ownerUserId,
      reviewCadence: input.reviewCadence,
      targetValue: input.targetValue,
      currentValue: input.currentValue,
      unit: input.unit,
      linkedObjectiveId: input.linkedObjectiveId,
    });
    return canonicalJson({ record }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
