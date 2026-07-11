/**
 * POST /api/owner/tender/screen — Tender / Application Assistance (Module A5).
 *
 * Accepts a structured tender signal and returns a bid-decision analysis:
 * - bid/no-bid gate (COLLECT_ELIGIBILITY_DATA, DO_NOT_BID, OWNER_REVIEW_REQUIRED,
 *   PARK, REJECT_UNFIT, PREPARE_BID_DRAFT, COLLECT_COST_DATA, NEEDS_CAPABILITY)
 * - readiness check (never true unless all five axes are known and safe)
 * - cash-exposure and compliance gap detection
 * - owner-visible explanation with missing-data list
 *
 * Hard governance rules (enforced by the pure domain engine):
 * - NEVER auto-submits a bid
 * - readyToBid is only true when eligibility, cost, compliance, capacity
 *   and cash exposure are ALL known and safe
 * - ownerApprovalRequired is always true before any submission
 *
 * Pure analysis — no persistence. workspaceId comes from the canonical
 * session context (never from the body) so tenants cannot cross-read.
 *
 * Auth: OWNER_VIEW capability, workspace-scoped, canonically enforced.
 * Body: validated via Zod (tenderScreenRequestSchema).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { tenderScreenRequestSchema } from "@/domain/owner-mode/tender-screen.validation";
import {
  screenTenderProcurementSignal,
  type NormalizedSignal,
} from "@/domain/owner-mode/external-opportunity-intelligence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, tenderScreenRequestSchema);

    // Build a synthetic NormalizedSignal from the request body so the pure
    // domain engine can run without requiring a full opportunity pipeline pass.
    const sig: NormalizedSignal = {
      signalId: "screen-request",
      dedupeKey: "screen-request",
      signalSourceType: body.signalSourceType,
      opportunityType: "TENDER_BID",
      sourceEvidenceSummary: body.sourceEvidenceSummary,
      sourceRefs: body.sourceRefs,
      customerPainPoint: "",
      targetCustomerSegment: body.targetBuyer,
      expectedValueHypothesis: body.opportunityTitle,
      relevanceToBusiness: body.relevanceToBusiness,
      rawConfidence: "MEDIUM",
      cashRisk: "UNKNOWN",
      ownerWorkloadRisk: "UNKNOWN",
      operationalFit: "UNKNOWN",
      capabilityFit: "UNKNOWN",
      localFeasibility: "UNKNOWN",
      legalOrComplianceRisk: "UNKNOWN",
      hasUnitEconomics: body.tender?.unitEconomics === "KNOWN",
      validationCostEstimate: null,
      missingData: body.missingData ?? [],
      relatedCashProfitSignal: null,
      relatedCapabilityGap: null,
      relatedConstraint: null,
      relatedSLO: null,
      tender: body.tender,
      isTender: true,
      evidenceComplete:
        body.sourceEvidenceSummary.trim().length > 0 && body.sourceRefs.length > 0,
      promotionReady: false,
      missingFields: [],
    };

    const tenderCandidate = screenTenderProcurementSignal(
      sig,
      body.context,
      ctx.verifiedWorkspaceId,
      body.evaluatedAt,
    );

    return tenderCandidate;
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
