/**
 * POST /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/economics — build model.
 * GET  — retrieve latest economic model.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { buildAndPersistEconomicModel } from "@/services/owner-strategy/startup-session.service";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const economicsSchema = z.object({
  startupCostCents: z.number().int().nullable(),
  fixedMonthlyCostCents: z.number().int().nullable(),
  variableUnitCostCents: z.number().int().nullable(),
  pricePerUnitCents: z.number().int().nullable(),
  cacCents: z.number().int().nullable().optional(),
  deliveryCostCents: z.number().int().nullable().optional(),
  workingCapitalCents: z.number().int().nullable().optional(),
  capitalAvailableCents: z.number().int().nullable(),
  ownerLabourHoursPerWeek: z.number().nullable().optional(),
  minViableCapacity: z.number().int().nullable().optional(),
  maxCurrentCapacity: z.number().int().nullable().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, economicsSchema);
    const inputs = {
      startupCostCents: body.startupCostCents !== null ? BigInt(body.startupCostCents) : null,
      fixedMonthlyCostCents: body.fixedMonthlyCostCents !== null ? BigInt(body.fixedMonthlyCostCents) : null,
      variableUnitCostCents: body.variableUnitCostCents !== null ? BigInt(body.variableUnitCostCents) : null,
      pricePerUnitCents: body.pricePerUnitCents !== null ? BigInt(body.pricePerUnitCents) : null,
      cacCents: body.cacCents != null ? BigInt(body.cacCents) : null,
      deliveryCostCents: body.deliveryCostCents != null ? BigInt(body.deliveryCostCents) : null,
      workingCapitalCents: body.workingCapitalCents != null ? BigInt(body.workingCapitalCents) : null,
      capitalAvailableCents: body.capitalAvailableCents !== null ? BigInt(body.capitalAvailableCents) : null,
      ownerLabourHoursPerWeek: body.ownerLabourHoursPerWeek ?? null,
      minViableCapacity: body.minViableCapacity ?? null,
      maxCurrentCapacity: body.maxCurrentCapacity ?? null,
    };
    const modelId = await buildAndPersistEconomicModel(ctx.verifiedWorkspaceId, params.sessionId, params.ideaId, ctx.verifiedActorId, inputs);
    return canonicalJson({ modelId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const model = await db.startupEconomicModel.findFirst({
      where: { ideaId: params.ideaId, workspaceId: ctx.verifiedWorkspaceId, supersededById: null },
      orderBy: { createdAt: "desc" },
    });
    return canonicalJson({ model }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
