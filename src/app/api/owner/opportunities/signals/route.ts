/**
 * POST /api/owner/opportunities/signals — submit a structured external opportunity signal.
 *
 * Server-authoritative: workspace + actor come from the verified session; OWNER_MANAGE is required; the
 * submission is validated + normalised in the pure domain layer, persisted with an atomic audit, idempotent
 * on (workspace, idempotencyKey), then run through the opportunity operating layer. OpsIQ never scrapes,
 * contacts anyone, spends, or auto-submits a tender — this only records a structured lead for governed
 * classification / dedupe / tender-screen / promotion.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { INTAKE_TYPES, SOURCE_QUALITIES } from "@/domain/owner-mode/external-opportunity-intake";
import { submitExternalOpportunitySignal } from "@/services/owner-mode/external-opportunity-intake.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const band = z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]);
const fit = z.enum(["STRONG", "MODERATE", "WEAK", "UNKNOWN"]);

const schema = z.object({
  rawSignalType: z.enum(INTAKE_TYPES as unknown as [string, ...string[]]),
  sourceName: z.string().trim().max(200).nullish(),
  sourceChannel: z.string().trim().max(120).nullish(),
  sourceRef: z.string().trim().max(2000).nullish(),
  rawDescription: z.string().trim().min(3).max(4000),
  extractedBusinessNeed: z.string().trim().max(2000).nullish(),
  targetCustomerSegment: z.string().trim().max(200).nullish(),
  locationContext: z.string().trim().max(200).nullish(),
  deadlineAt: z.string().datetime().nullish(),
  tenderOrProcurementValue: z.number().finite().nonnegative().nullish(),
  eligibilityRequirements: z.string().trim().max(2000).nullish(),
  complianceRequirements: z.string().trim().max(2000).nullish(),
  estimatedCashExposure: z.number().finite().nonnegative().nullish(),
  cashExposureBand: band.optional(),
  relevanceBand: fit.optional(),
  ownerWorkloadBand: band.optional(),
  ownerWorkloadNotes: z.string().trim().max(2000).nullish(),
  hasUnitEconomics: z.boolean().optional(),
  sourceQuality: z.enum(SOURCE_QUALITIES as unknown as [string, ...string[]]).optional(),
  requiredDocuments: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  missingDocuments: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  discoveredAt: z.string().datetime().nullish(),
  lastVerifiedAt: z.string().datetime().nullish(),
  staleAfterDays: z.number().int().positive().max(3650).nullish(),
  evidenceRefs: z.array(z.string().trim().min(1).max(2000)).max(20).optional(),
  missingData: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).nullish(),
});

function statusForReason(reason: string): number {
  if (/not in this workspace|not found/i.test(reason)) return 404;
  return 400;
}

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const actorRole = (ctx.verifiedSessionSnapshot as { role?: string } | undefined)?.role ?? null;
    const r = await submitExternalOpportunitySignal({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      actorRole,
      submission: input as Parameters<typeof submitExternalOpportunitySignal>[0]["submission"],
    });
    if (!r.ok) return canonicalJson({ error: r.reason }, { status: statusForReason(r.reason) });
    return canonicalJson(
      { signalId: r.signalId, classification: r.classification, initialStatus: r.initialStatus, deduped: r.deduped, topOpportunity: r.topOpportunity },
      { status: 200 },
    );
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
