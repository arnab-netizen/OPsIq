/**
 * GET  /api/owner/budget/authority?businessId=... — list budget authority states (OWNER_VIEW)
 * POST /api/owner/budget/authority — change employee/manager budget authority
 *      (lawful, business-operational actions only). OWNER_MANAGE, validated, enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { budgetAuthorityChangeSchema } from "@/domain/owner-budget/validation";
import { changeBudgetAuthority, getBudgetAuthorities } from "@/services/owner-budget/governance.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    if (!businessId) return { error: "businessId is required" };
    return getBudgetAuthorities(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { businessId, toStatus, reason, reviewInDays, ...signals } = await parseRequestBody(
      ctx.request!,
      budgetAuthorityChangeSchema
    );
    const result = await changeBudgetAuthority(
      businessId,
      {
        subjectUserId: signals.subjectUserId,
        subjectRole: signals.subjectRole,
        scopeCategory: signals.scopeCategory,
        toStatus,
        reason,
        reviewInDays,
        signals: {
          proofComplianceWeak: signals.proofComplianceWeak,
          approvalViolations: signals.approvalViolations,
          selfApprovalDetected: signals.selfApprovalDetected,
          splitSpendDetected: signals.splitSpendDetected,
          repeatedUnverifiedSpend: signals.repeatedUnverifiedSpend,
        },
      },
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
