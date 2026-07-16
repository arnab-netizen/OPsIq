/**
 * POST /api/owner/waste-leakage — record a new waste/leakage detection event.
 * GET  /api/owner/waste-leakage — list active events + summary for this workspace.
 * OWNER_MANAGE (write) / OWNER_VIEW (read), workspace-scoped.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  recordLeakageEvent,
  listLeakageEvents,
  getLeakageSummary,
} from "@/services/owner-mode/waste-leakage.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const recordLeakageSchema = z.object({
  category: z.enum(["DISCOUNT_LEAK", "REWORK", "OVERDUE_PAYMENT", "UNDERPRICING", "IDLE_CAPACITY", "SUPPLIER_OVERCHARGE", "OTHER"]),
  source: z.enum(["finance", "operations", "quality", "supplier", "sales"]),
  amount: z.number().positive().nullable().optional(),
  currency: z.string().length(3).optional(),
  evidenceId: z.string().uuid().nullable().optional(),
  detectedAt: z.string().datetime(),
  materialityThreshold: z.number().positive().nullable().optional(),
  confidenceLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  description: z.string().max(1000).nullable().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, recordLeakageSchema);
    const eventId = await recordLeakageEvent({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      category: body.category,
      source: body.source,
      amount: body.amount ?? null,
      currency: body.currency,
      evidenceId: body.evidenceId ?? null,
      detectedAt: new Date(body.detectedAt),
      materialityThreshold: body.materialityThreshold ?? null,
      confidenceLevel: body.confidenceLevel,
      description: body.description ?? null,
    });
    return canonicalJson({ eventId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const [events, summary] = await Promise.all([
      listLeakageEvents(ctx.verifiedWorkspaceId),
      getLeakageSummary(ctx.verifiedWorkspaceId),
    ]);
    return canonicalJson({ events, summary }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
