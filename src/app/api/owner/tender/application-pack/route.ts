/**
 * POST /api/owner/tender/application-pack — Bid Application Pack generator (Module A5).
 *
 * Accepts a screened `TenderProcurementCandidate` (owner-supplied or forwarded from
 * the /tender/screen response) and returns a structured `BidApplicationPack` for
 * owner review and sign-off.
 *
 * Governance rules (enforced by the pure domain engine):
 * - NEVER produces a submission-ready document — `submissionAllowed` is always false.
 * - `ownerApprovalRequired` is always true.
 * - All risk factors from the screened candidate are faithfully reproduced.
 * - No bid draft may be submitted without explicit owner approval.
 *
 * Pure analysis — no persistence. workspaceId comes from the canonical session
 * context (never from the body) so tenants cannot cross-read.
 *
 * Auth: OWNER_MANAGE capability (more material than VIEW — generates owner work product),
 * workspace-scoped, canonically enforced.
 * Body: validated via Zod (bidApplicationPackRequestSchema).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { bidApplicationPackRequestSchema } from "@/domain/owner-mode/bid-application-pack.validation";
import { generateBidApplicationPack } from "@/domain/owner-mode/bid-application-pack";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { TenderProcurementCandidate } from "@/domain/owner-mode/external-opportunity-intelligence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, bidApplicationPackRequestSchema);

    // Rebuild the TenderProcurementCandidate from the validated request body,
    // overwriting workspaceId with the canonically-verified workspace so tenants
    // cannot cross-read another workspace's pack.
    const candidate: TenderProcurementCandidate = {
      workspaceId: ctx.verifiedWorkspaceId,
      signalSourceType: body.signalSourceType,
      opportunityTitle: body.opportunityTitle,
      sourceEvidenceSummary: body.sourceEvidenceSummary,
      sourceRefs: body.sourceRefs,
      targetBuyer: body.targetBuyer,
      eligibility: body.eligibility,
      emdExposure: body.emdExposure,
      paymentDelayRisk: body.paymentDelayRisk,
      performancePenaltyRisk: body.performancePenaltyRisk,
      workingCapitalRequirement: body.workingCapitalRequirement,
      compliance: body.compliance,
      documentationBurden: body.documentationBurden,
      capacityFit: body.capacityFit,
      unitEconomics: body.unitEconomics,
      bidDeadlineDays: body.bidDeadlineDays,
      tenderDecision: body.tenderDecision,
      readyToBid: body.readyToBid,
      ownerApprovalRequired: true,
      approvalLevel: body.approvalLevel,
      missingData: body.missingData,
      systemCapabilityRecommendation: body.systemCapabilityRecommendation,
      ownerVisibleExplanation: body.ownerVisibleExplanation,
      evaluatedAt: body.evaluatedAt,
    };

    const generatedAt = new Date().toISOString();
    const pack = generateBidApplicationPack(candidate, generatedAt);

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_TENDER_APPLICATION_PACK_GENERATED,
      actorId: ctx.verifiedActorId,
      workspaceId: ctx.verifiedWorkspaceId,
      entityType: "TenderApplicationPack",
      entityId: `${ctx.verifiedWorkspaceId}:${body.opportunityTitle}:${generatedAt}`,
      payload: {
        opportunityTitle: body.opportunityTitle,
        targetBuyer: body.targetBuyer,
        tenderDecision: body.tenderDecision,
        submissionAllowed: false,
        ownerApprovalRequired: true,
        generatedAt,
      },
    });

    return pack;
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
