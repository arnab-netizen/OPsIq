/**
 * GET  /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/economics — latest economic model.
 * POST /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/economics — build/update economic model.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { buildAndPersistEconomicModel } from "@/services/owner-strategy/startup-session.service";
import type { EconomicInputs } from "@/domain/owner-strategy/startup-economics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const model = await db.startupEconomicModel.findFirst({
      where: { ideaId: params.ideaId, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { versionNumber: "desc" },
    });
    if (!model) throw new NotFoundError("StartupEconomicModel", params.ideaId);
    return canonicalJson({ ...model }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const postSchema = z.object({
  startupCostCents: z.coerce.number().nullable().optional(),
  fixedMonthlyCostCents: z.coerce.number().nullable().optional(),
  variableUnitCostCents: z.coerce.number().nullable().optional(),
  pricePerUnitCents: z.coerce.number().nullable().optional(),
  cacCents: z.coerce.number().nullable().optional(),
  workingCapitalCents: z.coerce.number().nullable().optional(),
  paymentDelayDays: z.coerce.number().nullable().optional(),
  ownerLabourHoursPerWeek: z.coerce.number().nullable().optional(),
  capitalAvailableCents: z.coerce.number().nullable().optional(),
  cashRunwayMonthsAvailable: z.coerce.number().nullable().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, postSchema);

    const inputs: EconomicInputs = {
      startupCostCents: body.startupCostCents != null ? BigInt(Math.round(body.startupCostCents)) : null,
      fixedMonthlyCostCents: body.fixedMonthlyCostCents != null ? BigInt(Math.round(body.fixedMonthlyCostCents)) : null,
      variableUnitCostCents: body.variableUnitCostCents != null ? BigInt(Math.round(body.variableUnitCostCents)) : null,
      pricePerUnitCents: body.pricePerUnitCents != null ? BigInt(Math.round(body.pricePerUnitCents)) : null,
      cacCents: body.cacCents != null ? BigInt(Math.round(body.cacCents)) : null,
      workingCapitalCents: body.workingCapitalCents != null ? BigInt(Math.round(body.workingCapitalCents)) : null,
      paymentDelayDays: body.paymentDelayDays ?? null,
      ownerLabourHoursPerWeek: body.ownerLabourHoursPerWeek ?? null,
      capitalAvailableCents: body.capitalAvailableCents != null ? BigInt(Math.round(body.capitalAvailableCents)) : null,
      cashRunwayMonthsAvailable: body.cashRunwayMonthsAvailable ?? null,
    };

    const modelId = await buildAndPersistEconomicModel(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      params.ideaId,
      ctx.verifiedActorId,
      inputs
    );

    return canonicalJson({ modelId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
