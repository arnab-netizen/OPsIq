/**
 * GET  /api/owner/businesses/[businessId]/outcomes — list outcomes (OWNER_VIEW)
 * POST /api/owner/businesses/[businessId]/outcomes — record outcome (OWNER_MANAGE)
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import {
  recordOwnerActionOutcome,
  listOwnerActionOutcomes,
} from "@/services/owner-mode/owner-action-outcome.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OUTCOME_STATUSES = [
  "worked",
  "partially_worked",
  "did_not_work",
  "made_worse",
  "not_measurable",
  "too_early_to_judge",
  "invalid_test",
  "executed_differently",
  "external_event_interference",
] as const;

const EVIDENCE_QUALITIES = ["strong", "moderate", "weak", "anecdotal", "none"] as const;

const recordOutcomeSchema = z.object({
  outcomeStatus: z.enum(OUTCOME_STATUSES),
  recommendationId: z.string().uuid().optional(),
  actionId: z.string().uuid().optional(),
  ownerReportedResult: z.string().max(2000).optional(),
  actualMetricName: z.string().max(200).optional(),
  beforeValue: z.number().optional(),
  afterValue: z.number().optional(),
  measurementPeriodStart: z.iso.datetime().transform((s) => new Date(s)).optional(),
  measurementPeriodEnd: z.iso.datetime().transform((s) => new Date(s)).optional(),
  evidenceQuality: z.enum(EVIDENCE_QUALITIES).optional(),
  externalEventFlag: z.boolean().optional(),
  externalEventDescription: z.string().max(2000).optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    return listOwnerActionOutcomes(ctx.verifiedWorkspaceId, params.businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const body = await parseRequestBody(ctx.request!, recordOutcomeSchema);
    const outcome = await recordOwnerActionOutcome(
      ctx.verifiedWorkspaceId,
      ctx.verifiedActorId,
      { ...body, businessId: params.businessId }
    );
    return canonicalJson(outcome, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
