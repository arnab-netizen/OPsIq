/**
 * POST /api/owner/startup/sessions/[sessionId]/analysis — action-discriminator route.
 * Supported actions: SCREEN | GENERATE_HYPOTHESES | BUILD_ECONOMIC_MODEL |
 *   ASSESS_READINESS | RECORD_HYPOTHESIS_RESULT | BUILD_SYSTEM_RECOMMENDATION
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ValidationError } from "@/infra/errors";
import {
  screenIdeaRecord,
  generateAndPersistHypotheses,
  buildAndPersistEconomicModel,
  assessAndPersistReadiness,
  recordHypothesisResult,
  createSystemRecommendation,
} from "@/services/owner-strategy/startup-session.service";
import type { EconomicInputs } from "@/domain/owner-strategy/startup-economics";
import type { ReadinessInputs } from "@/domain/owner-strategy/startup-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const baseSchema = z.object({
  action: z.enum([
    "SCREEN",
    "GENERATE_HYPOTHESES",
    "BUILD_ECONOMIC_MODEL",
    "ASSESS_READINESS",
    "RECORD_HYPOTHESIS_RESULT",
    "BUILD_SYSTEM_RECOMMENDATION",
  ]),
  ideaId: z.string().uuid().optional(),
  // SCREEN
  profile: z.record(z.string(), z.unknown()).optional(),
  // GENERATE_HYPOTHESES
  ideaName: z.string().optional(),
  industry: z.string().optional(),
  // BUILD_ECONOMIC_MODEL | ASSESS_READINESS
  inputs: z.record(z.string(), z.unknown()).optional(),
  // BUILD_SYSTEM_RECOMMENDATION
  recommendation: z.string().optional(),
  rationale: z.string().optional(),
  confidence: z.number().optional(),
  inputSnapshot: z.record(z.string(), z.unknown()).optional(),
  // RECORD_HYPOTHESIS_RESULT
  hypothesisId: z.string().uuid().optional(),
  result: z.string().optional(),
  resultSummary: z.string().optional(),
});

const profileSchema = z.object({
  capitalAvailableCents: z.number().nullable().optional(),
  ownerHoursPerWeek: z.number().nullable().optional(),
  riskTolerance: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  location: z.string().nullable().optional(),
  cashRunwayMonthsAvailable: z.number().nullable().optional(),
  minimumMonthlyIncomeNeededCents: z.number().nullable().optional(),
  priorIndustryExperience: z.boolean().nullable().optional(),
  regulatoryExperience: z.boolean().nullable().optional(),
  existingNetworkStrength: z.number().nullable().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const rawBody = await parseRequestBody(ctx.request!, baseSchema.passthrough());
    const { action, ideaId } = rawBody;

    switch (action) {
      case "SCREEN": {
        if (!ideaId) throw new ValidationError("ideaId required for SCREEN");
        const profile = profileSchema.parse(rawBody.profile ?? {});
        const result = await screenIdeaRecord(
          ctx.verifiedWorkspaceId,
          params.sessionId,
          ideaId,
          ctx.verifiedActorId,
          {
            capitalAvailableCents: profile.capitalAvailableCents ?? null,
            ownerHoursPerWeek: profile.ownerHoursPerWeek ?? null,
            riskTolerance: profile.riskTolerance ?? null,
            location: profile.location ?? null,
            cashRunwayMonthsAvailable: profile.cashRunwayMonthsAvailable ?? null,
            minimumMonthlyIncomeNeededCents: profile.minimumMonthlyIncomeNeededCents ?? null,
            priorIndustryExperience: profile.priorIndustryExperience ?? null,
            regulatoryExperience: profile.regulatoryExperience ?? null,
            existingNetworkStrength: profile.existingNetworkStrength ?? null,
          }
        );
        return canonicalJson({ result }, { status: 200 });
      }

      case "GENERATE_HYPOTHESES": {
        if (!ideaId) throw new ValidationError("ideaId required for GENERATE_HYPOTHESES");
        const hypothesisIds = await generateAndPersistHypotheses(
          ctx.verifiedWorkspaceId,
          params.sessionId,
          ideaId,
          ctx.verifiedActorId
        );
        return canonicalJson({ hypothesisIds }, { status: 201 });
      }

      case "BUILD_ECONOMIC_MODEL": {
        if (!ideaId) throw new ValidationError("ideaId required for BUILD_ECONOMIC_MODEL");
        const econSchema = z.object({
          startupCostCents: z.coerce.number().nullable().optional(),
          fixedMonthlyCostCents: z.coerce.number().nullable().optional(),
          variableUnitCostCents: z.coerce.number().nullable().optional(),
          pricePerUnitCents: z.coerce.number().nullable().optional(),
          cacCents: z.coerce.number().nullable().optional(),
          workingCapitalCents: z.coerce.number().nullable().optional(),
          paymentDelayDays: z.coerce.number().nullable().optional(),
          ownerLabourHoursPerWeek: z.coerce.number().nullable().optional(),
          capitalAvailableCents: z.coerce.number().nullable().optional(),
          cashReserveMonths: z.coerce.number().nullable().optional(),
          cashRunwayMonthsAvailable: z.coerce.number().nullable().optional(),
        });
        const econInputRaw = econSchema.parse(rawBody.inputs ?? {});
        const econInputs: EconomicInputs = {
          startupCostCents: econInputRaw.startupCostCents != null ? BigInt(Math.round(econInputRaw.startupCostCents)) : null,
          fixedMonthlyCostCents: econInputRaw.fixedMonthlyCostCents != null ? BigInt(Math.round(econInputRaw.fixedMonthlyCostCents)) : null,
          variableUnitCostCents: econInputRaw.variableUnitCostCents != null ? BigInt(Math.round(econInputRaw.variableUnitCostCents)) : null,
          pricePerUnitCents: econInputRaw.pricePerUnitCents != null ? BigInt(Math.round(econInputRaw.pricePerUnitCents)) : null,
          cacCents: econInputRaw.cacCents != null ? BigInt(Math.round(econInputRaw.cacCents)) : null,
          workingCapitalCents: econInputRaw.workingCapitalCents != null ? BigInt(Math.round(econInputRaw.workingCapitalCents)) : null,
          paymentDelayDays: econInputRaw.paymentDelayDays ?? null,
          ownerLabourHoursPerWeek: econInputRaw.ownerLabourHoursPerWeek ?? null,
          capitalAvailableCents: econInputRaw.capitalAvailableCents != null ? BigInt(Math.round(econInputRaw.capitalAvailableCents)) : null,
          cashRunwayMonthsAvailable: econInputRaw.cashRunwayMonthsAvailable ?? null,
        };
        const modelId = await buildAndPersistEconomicModel(
          ctx.verifiedWorkspaceId,
          params.sessionId,
          ideaId,
          ctx.verifiedActorId,
          econInputs
        );
        return canonicalJson({ modelId }, { status: 201 });
      }

      case "ASSESS_READINESS": {
        if (!ideaId) throw new ValidationError("ideaId required for ASSESS_READINESS");
        const readinessSchema = z.object({
          problemEvidenceCount: z.number().default(0),
          customerEvidenceCount: z.number().default(0),
          wtpEvidenceCount: z.number().default(0),
          deliveryTrialCompleted: z.boolean().default(false),
          acquisitionChannelTested: z.boolean().default(false),
          economicClassification: z.enum(["VIABLE","MARGINAL","UNVIABLE","INSUFFICIENT_DATA"]).nullable().optional(),
          cashRunwayMonths: z.number().nullable().optional(),
          breakEvenMonths: z.number().nullable().optional(),
          supplierQuoteObtained: z.boolean().default(false),
          regulatoryCheckCompleted: z.boolean().default(false),
          licenceRequired: z.boolean().nullable().optional(),
          licenceObtained: z.boolean().nullable().optional(),
          ownerHoursAvailable: z.number().nullable().optional(),
          capitalAvailableCents: z.coerce.number().nullable().optional(),
          startupCostCents: z.coerce.number().nullable().optional(),
          criticalHypothesesPassed: z.coerce.number().default(0),
          criticalHypothesesFailed: z.coerce.number().default(0),
        });
        const readinessInputRaw = readinessSchema.parse(rawBody.inputs ?? {});
        const readinessInputs: ReadinessInputs = {
          ...readinessInputRaw,
          economicClassification: readinessInputRaw.economicClassification ?? null,
          cashRunwayMonths: readinessInputRaw.cashRunwayMonths ?? null,
          breakEvenMonths: readinessInputRaw.breakEvenMonths ?? null,
          licenceRequired: readinessInputRaw.licenceRequired ?? null,
          licenceObtained: readinessInputRaw.licenceObtained ?? null,
          ownerHoursAvailable: readinessInputRaw.ownerHoursAvailable ?? null,
          capitalAvailableCents: readinessInputRaw.capitalAvailableCents != null
            ? BigInt(Math.round(readinessInputRaw.capitalAvailableCents)) : null,
          startupCostCents: readinessInputRaw.startupCostCents != null
            ? BigInt(Math.round(readinessInputRaw.startupCostCents)) : null,
        };
        const result = await assessAndPersistReadiness(
          ctx.verifiedWorkspaceId,
          params.sessionId,
          ideaId,
          ctx.verifiedActorId,
          readinessInputs
        );
        return canonicalJson({ result }, { status: 200 });
      }

      case "RECORD_HYPOTHESIS_RESULT": {
        const hypoSchema = z.object({
          hypothesisId: z.string().uuid(),
          result: z.enum(["CONFIRMED","DISCONFIRMED","PARTIALLY_CONFIRMED","INCONCLUSIVE"]),
          resultSummary: z.string().min(1),
        });
        const h = hypoSchema.parse(rawBody);
        await recordHypothesisResult(
          ctx.verifiedWorkspaceId,
          h.hypothesisId,
          ctx.verifiedActorId,
          h.result,
          h.resultSummary
        );
        return canonicalJson({ success: true }, { status: 200 });
      }

      case "BUILD_SYSTEM_RECOMMENDATION": {
        const recSchema = z.object({
          recommendation: z.enum(["GO","MODIFY","HOLD","REJECT","MORE_VALIDATION_REQUIRED"]),
          rationale: z.string().min(1),
          confidence: z.number().min(0).max(100),
          inputSnapshot: z.record(z.string(), z.unknown()).optional(),
        });
        const rec = recSchema.parse(rawBody);
        const recId = await createSystemRecommendation(
          ctx.verifiedWorkspaceId,
          params.sessionId,
          ctx.verifiedActorId,
          {
            ideaId: ideaId ?? null,
            recommendation: rec.recommendation,
            rationale: rec.rationale,
            confidence: rec.confidence,
            inputSnapshot: rec.inputSnapshot ?? {},
          }
        );
        return canonicalJson({ recId }, { status: 201 });
      }

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
